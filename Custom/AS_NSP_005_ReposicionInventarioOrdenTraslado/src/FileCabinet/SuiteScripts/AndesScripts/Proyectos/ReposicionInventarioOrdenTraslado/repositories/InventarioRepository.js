/**
 * @NApiVersion 2.1
 * @NModuleScope SameAccount
 *
 * @name        InventarioRepository.js
 * @description Repositorio de acceso a datos de inventario.
 *              Responsabilidad exclusiva: consultas SuiteQL sobre
 *              itemlocationconfiguration, inventorybalance y transfer orders pendientes.
 */
define(['N/query', 'N/search', 'N/log'], (query, search, log) => {

    /**
     * Obtiene la configuración de ubicación de artículo para una ubicación destino.
     * Solo retorna artículos activos, no serializados, con punto de reorden > 0.
     *
     * @param   {string|number} locationTo  Internal ID de la ubicación destino
     * @returns {Array<{
     *   item_internal_id: string,
     *   item_code: string,
     *   item_display_name: string,
     *   preferredstocklevel: string,
     *   safetystocklevel: string
     * }>}
     */
    const getItemLocationConfig = (locationTo) => {
        return query.runSuiteQL({
            query: `
                SELECT
                    ilc.item              AS item_internal_id,
                    i.itemid              AS item_code,
                    i.displayname         AS item_display_name,
                    ilc.preferredstocklevel,
                    ilc.safetystocklevel
                FROM itemlocationconfiguration ilc
                INNER JOIN item i ON i.id = ilc.item
                WHERE ilc.location     = ${locationTo}
                  AND ilc.safetystocklevel > 0
                  AND i.isinactive     = 'F'
                  AND i.isserialitem   = 'F'
            `
        }).asMappedResults();
    };

    /**
     * Obtiene el stock disponible por artículo en una ubicación.
     * Sirve tanto para destino (stock actual) como para origen (stock a repartir).
     * Si la consulta falla (ubicación sin movimientos), retorna map vacío (asume qty = 0).
     *
     * @param   {string|number} location  Internal ID de la ubicación
     * @param   {string}        itemIds   IDs de artículo separados por coma
     * @returns {Object} Map { [itemInternalId]: quantityAvailable }
     */
    const getAvailableStock = (location, itemIds) => {
        const stockMap = {};
        if (!itemIds) return stockMap;
        try {
            query.runSuiteQL({
                query: `
                    SELECT
                        item,
                        SUM(COALESCE(quantityavailable, 0)) AS qty_available
                    FROM inventorybalance
                    WHERE location = ${location}
                      AND item     IN (${itemIds})
                    GROUP BY item
                `
            }).asMappedResults().forEach(r => {
                stockMap[r.item] = parseFloat(r.qty_available) || 0;
            });
        } catch (e) {
            log.error('InventarioRepository.getAvailableStock',
                `location ${location}: ${e.message}. Se asume stock 0 para todos.`
            );
        }
        return stockMap;
    };

    /**
     * Obtiene el stock mínimo (safety stock) configurado por artículo en una ubicación.
     * Pensado para leer el mínimo a proteger en la ubicación ORIGEN antes de despachar
     * una reposición hacia otra ubicación.
     *
     * A diferencia de getItemLocationConfig, NO filtra por safetystocklevel > 0:
     * un mínimo de 0 (o sin configuración) es válido en origen y significa
     * "sin piso protegido para este artículo en esta ubicación".
     *
     * @param   {string|number} location  Internal ID de la ubicación
     * @param   {string}        itemIds   IDs de artículo separados por coma
     * @returns {Object} Map { [itemInternalId]: safetyStockLevel }  (0 si no hay configuración)
     */
    const getSafetyStockByLocation = (location, itemIds) => {
        const safetyMap = {};
        if (!itemIds) return safetyMap;
        try {
            query.runSuiteQL({
                query: `
                    SELECT
                        item,
                        safetystocklevel
                    FROM itemlocationconfiguration
                    WHERE location = ${location}
                      AND item     IN (${itemIds})
                `
            }).asMappedResults().forEach(r => {
                safetyMap[r.item] = parseFloat(r.safetystocklevel) || 0;
            });
        } catch (e) {
            log.error('InventarioRepository.getSafetyStockByLocation',
                `location ${location}: ${e.message}. Se asume mínimo 0 para todos.`
            );
        }
        return safetyMap;
    };

    /**
     * Obtiene la cantidad pendiente de recepción en una ubicación destino
     * proveniente de Órdenes de Traslado aún no completadas.
     *
     * Estados considerados: pendingFulfillment, partiallyFulfilled,
     *                       pendingReceival, partiallyReceived.
     * Cantidad = quantity - quantityreceived (lo que falta recibir).
     *
     * @param   {string|number} locationTo  Internal ID de la ubicación destino
     * @param   {string}        itemIds     IDs de artículo separados por coma
     * @returns {Object} Map { [itemInternalId]: pendingQty }
     */
    const getPendingInTransitQty = (locationTo, itemIds) => {
        const inTransitMap = {};
        log.error('getPendingInTransitQty', { locationTo, itemIds });
        if (!itemIds.length) return inTransitMap;
        try {
            const newSearch = search.create({
                type: "transferorder",
                settings:[{"name":"consolidationtype","value":"NONE"},{"name":"includeperiodendtransactions","value":"F"}],
                filters:[
                    ["type","anyof","TrnfrOrd"],
                    "AND",
                    ["mainline","is","F"],
                    "AND",
                    ["voided","is","F"],
                    "AND",
                    ["item","anyof", itemIds.split(',')],
                    "AND",
                    ["location","anyof", locationTo],
                    "AND",
                    ["closed","is","F"],
                    "AND",
                    ["transactionlinetype","anyof","RECEIVING"],
                    "AND",
                    ["formulanumeric: NVL({quantity},0) - NVL({quantityshiprecv},0)","greaterthan","0"],
                    "AND",
                    ["status","noneof","TrnfrOrd:H"]
                ],
                columns:[
                    search.createColumn({ name: "item", summary: "GROUP"}),
                    search.createColumn({ name: "formulanumeric", summary: "SUM", formula: "NVL({quantity},0) - NVL({quantityshiprecv},0)" })
                ]
            });
            let pageData = newSearch.runPaged({ pageSize: 1000 });
            pageData.pageRanges.forEach(function (pageRange) {
                let page = pageData.fetch({ index: pageRange.index });
                let results = page.data;
                    for (let i = 0; i < results.length; i++) {
                        let columns = results[i].columns;
                        let item = (results[i].getValue(columns[0]));
                        let qty_pending = Number(results[i].getValue(columns[1]));
                        inTransitMap[item] = qty_pending;
                    }
                });
        } catch (e) {
            log.error('error', e);
            log.error('InventarioRepository.getPendingInTransitQty',
                `locationTo ${locationTo}: ${e.message}. Se asume 0 en tránsito.`
            );
        }
        return inTransitMap;
    };

    /**
     * Obtiene la cantidad ya comprometida en Órdenes de Traslado PENDIENTES DE DESPACHO
     * (aún no fulfillment/shipped) desde una ubicación ORIGEN.
     *
     * Motivo: en NetSuite, una Orden de Traslado recién creada (estado "Pending Fulfillment")
     * NO reduce por sí sola el "Quantity Available" del origen — ese campo nativo solo baja
     * cuando la OT efectivamente se despacha (Item Fulfillment). Por lo tanto, si no restamos
     * manualmente lo que ya está comprometido en OTs pendientes de despacho, dos evaluaciones
     * sucesivas (por ejemplo, dos búsquedas seguidas en el Suitelet, o dos corridas del
     * proceso automático) verían el mismo stock "disponible" y podrían comprometerlo dos veces.
     *
     * NOTA (ajuste verificado en el ambiente real): en la línea de despacho (SHIPPING) de una
     * Orden de Traslado, tanto "quantity" como "quantityshiprecv" vienen en NEGATIVO (representan
     * salida de la ubicación), a diferencia de la línea de recepción (RECEIVING) que usa
     * getPendingInTransitQty, donde ambos campos son positivos. Por eso acá la resta correcta
     * para obtener el remanente por despachar es "quantity + quantityshiprecv" (no "quantity -
     * quantityshiprecv"), y el resultado da negativo cuando aún queda cantidad por despachar —
     * se filtra "< 0" y se invierte el signo (* -1) para dejarlo como cantidad comprometida positiva.
     *
     * Estados considerados: cualquier OT no cerrada, no anulada y no en espera ("On Hold").
     *
     * @param   {string|number} locationFrom  Internal ID de la ubicación origen
     * @param   {string}        itemIds       IDs de artículo separados por coma
     * @returns {Object} Map { [itemInternalId]: qtyComprometidaPendienteDeDespacho }
     */
    const getCommittedInTransitFromLocation = (locationFrom, itemIds) => {
        const committedMap = {};
        if (!itemIds) return committedMap;
        try {
            const newSearch = search.create({
                type: "transferorder",
                settings:[{"name":"consolidationtype","value":"NONE"},{"name":"includeperiodendtransactions","value":"F"}],
                filters:[
                    ["type","anyof","TrnfrOrd"],
                    "AND",
                    ["mainline","is","F"],
                    "AND",
                    ["voided","is","F"],
                    "AND",
                    ["item","anyof", itemIds.split(',')],
                    "AND",
                    ["location","anyof", locationFrom],
                    "AND",
                    ["closed","is","F"],
                    "AND",
                    ["transactionlinetype","anyof","SHIPPING"],
                    "AND",
                    ["formulanumeric: NVL({quantity},0) + NVL({quantityshiprecv},0)","lessthan","0"],
                    "AND",
                    ["status","noneof","TrnfrOrd:H"]
                ],
                columns:[
                    search.createColumn({ name: "item", summary: "GROUP"}),
                    search.createColumn({ name: "formulanumeric", summary: "SUM", formula: "NVL({quantity},0) + NVL({quantityshiprecv},0)" })
                ]
            });
            let pageData = newSearch.runPaged({ pageSize: 1000 });
            pageData.pageRanges.forEach(function (pageRange) {
                let page = pageData.fetch({ index: pageRange.index });
                let results = page.data;
                for (let i = 0; i < results.length; i++) {
                    let columns = results[i].columns;
                    let item = (results[i].getValue(columns[0]));
                    let qty_comprometida = Number(results[i].getValue(columns[1])) * -1;
                    committedMap[item] = qty_comprometida;
                }
            });
        } catch (e) {
            log.error('InventarioRepository.getCommittedInTransitFromLocation',
                `locationFrom ${locationFrom}: ${e.message}. Se asume 0 comprometido en OT pendientes de despacho.`
            );
        }
        return committedMap;
    };

    /* ═══════════════════════════════════════════════════════════════════
     * Variantes "bulk": resuelven la misma información que las funciones
     * de arriba, pero para VARIAS ubicaciones en una sola consulta en vez
     * de una consulta por ubicación.
     *
     * Motivo: el Suitelet de Resolución de Stock Limitado evalúa, en una
     * sola ejecución, TODAS las ubicaciones origen/destino configuradas
     * para una subsidiaria (hasta ~130 en algunas subsidiarias). Consultar
     * de a una ubicación multiplica la cantidad de consultas por la
     * cantidad de ubicaciones y arriesga superar el límite de unidades de
     * gobernancia de un Suitelet, o su tiempo máximo de ejecución. Estas
     * variantes agrupan el resultado por ubicación para que el llamador
     * pueda seguir operando "por ubicación" en memoria, sin más consultas.
     *
     * El proceso automático (MapReduce) NO usa estas variantes: cada
     * reduce() ya procesa un solo origen con su propia asignación de
     * gobernancia, así que no tiene el mismo riesgo.
     * ═══════════════════════════════════════════════════════════════════ */

    /**
     * Igual que getItemLocationConfig, pero para varias ubicaciones a la vez.
     *
     * @param   {Array<string|number>} locationIds
     * @returns {Object} Map { [locationId]: Array<{ item_internal_id, item_code, item_display_name, preferredstocklevel, safetystocklevel }> }
     */
    const getItemLocationConfigBulk = (locationIds) => {
        const map = {};
        if (!locationIds || !locationIds.length) return map;
        try {
            query.runSuiteQL({
                query: `
                    SELECT
                        ilc.location          AS location_id,
                        ilc.item              AS item_internal_id,
                        i.itemid              AS item_code,
                        i.displayname         AS item_display_name,
                        ilc.preferredstocklevel,
                        ilc.safetystocklevel
                    FROM itemlocationconfiguration ilc
                    INNER JOIN item i ON i.id = ilc.item
                    WHERE ilc.location     IN (${locationIds.join(',')})
                      AND ilc.safetystocklevel > 0
                      AND i.isinactive     = 'F'
                      AND i.isserialitem   = 'F'
                `
            }).asMappedResults().forEach(r => {
                const locId = r.location_id;
                if (!map[locId]) map[locId] = [];
                map[locId].push(r);
            });
        } catch (e) {
            log.error('InventarioRepository.getItemLocationConfigBulk',
                `locations [${locationIds.join(',')}]: ${e.message}`
            );
        }
        return map;
    };

    /**
     * Igual que getAvailableStock, pero para varias ubicaciones a la vez.
     *
     * @param   {Array<string|number>} locationIds
     * @param   {string}               itemIds  IDs de artículo separados por coma
     * @returns {Object} Map { [locationId]: { [itemInternalId]: quantityAvailable } }
     */
    const getAvailableStockBulk = (locationIds, itemIds) => {
        const map = {};
        if (!locationIds || !locationIds.length || !itemIds) return map;
        try {
            query.runSuiteQL({
                query: `
                    SELECT
                        location,
                        item,
                        SUM(COALESCE(quantityavailable, 0)) AS qty_available
                    FROM inventorybalance
                    WHERE location IN (${locationIds.join(',')})
                      AND item     IN (${itemIds})
                    GROUP BY location, item
                `
            }).asMappedResults().forEach(r => {
                if (!map[r.location]) map[r.location] = {};
                map[r.location][r.item] = parseFloat(r.qty_available) || 0;
            });
        } catch (e) {
            log.error('InventarioRepository.getAvailableStockBulk',
                `locations [${locationIds.join(',')}]: ${e.message}. Se asume stock 0 para todos.`
            );
        }
        return map;
    };

    /**
     * Igual que getSafetyStockByLocation, pero para varias ubicaciones a la vez.
     *
     * @param   {Array<string|number>} locationIds
     * @param   {string}               itemIds  IDs de artículo separados por coma
     * @returns {Object} Map { [locationId]: { [itemInternalId]: safetyStockLevel } }
     */
    const getSafetyStockByLocationBulk = (locationIds, itemIds) => {
        const map = {};
        if (!locationIds || !locationIds.length || !itemIds) return map;
        try {
            query.runSuiteQL({
                query: `
                    SELECT
                        location,
                        item,
                        safetystocklevel
                    FROM itemlocationconfiguration
                    WHERE location IN (${locationIds.join(',')})
                      AND item     IN (${itemIds})
                `
            }).asMappedResults().forEach(r => {
                if (!map[r.location]) map[r.location] = {};
                map[r.location][r.item] = parseFloat(r.safetystocklevel) || 0;
            });
        } catch (e) {
            log.error('InventarioRepository.getSafetyStockByLocationBulk',
                `locations [${locationIds.join(',')}]: ${e.message}. Se asume mínimo 0 para todos.`
            );
        }
        return map;
    };

    /**
     * Igual que getPendingInTransitQty, pero para varias ubicaciones destino a la vez.
     *
     * @param   {Array<string|number>} locationIds
     * @param   {string}               itemIds  IDs de artículo separados por coma
     * @returns {Object} Map { [locationId]: { [itemInternalId]: pendingQty } }
     */
    const getPendingInTransitQtyBulk = (locationIds, itemIds) => {
        const map = {};
        if (!locationIds || !locationIds.length || !itemIds) return map;
        try {
            const newSearch = search.create({
                type: "transferorder",
                settings:[{"name":"consolidationtype","value":"NONE"},{"name":"includeperiodendtransactions","value":"F"}],
                filters:[
                    ["type","anyof","TrnfrOrd"],
                    "AND",
                    ["mainline","is","F"],
                    "AND",
                    ["voided","is","F"],
                    "AND",
                    ["item","anyof", itemIds.split(',')],
                    "AND",
                    ["location","anyof", locationIds],
                    "AND",
                    ["closed","is","F"],
                    "AND",
                    ["transactionlinetype","anyof","RECEIVING"],
                    "AND",
                    ["formulanumeric: NVL({quantity},0) - NVL({quantityshiprecv},0)","greaterthan","0"],
                    "AND",
                    ["status","noneof","TrnfrOrd:H"]
                ],
                columns:[
                    search.createColumn({ name: "location", summary: "GROUP"}),
                    search.createColumn({ name: "item", summary: "GROUP"}),
                    search.createColumn({ name: "formulanumeric", summary: "SUM", formula: "NVL({quantity},0) - NVL({quantityshiprecv},0)" })
                ]
            });
            let pageData = newSearch.runPaged({ pageSize: 1000 });
            pageData.pageRanges.forEach(function (pageRange) {
                let page = pageData.fetch({ index: pageRange.index });
                let results = page.data;
                for (let i = 0; i < results.length; i++) {
                    let columns  = results[i].columns;
                    let location = results[i].getValue(columns[0]);
                    let item     = results[i].getValue(columns[1]);
                    let qty_pending = Number(results[i].getValue(columns[2]));
                    if (!map[location]) map[location] = {};
                    map[location][item] = qty_pending;
                }
            });
        } catch (e) {
            log.error('InventarioRepository.getPendingInTransitQtyBulk',
                `locations [${locationIds.join(',')}]: ${e.message}. Se asume 0 en tránsito.`
            );
        }
        return map;
    };

    /**
     * Igual que getCommittedInTransitFromLocation, pero para varias ubicaciones
     * origen a la vez. Conserva exactamente la misma fórmula/convención de signo
     * verificada en el ambiente real para la línea SHIPPING (ver nota en
     * getCommittedInTransitFromLocation) — acá solo se agrega "location" como
     * columna de agrupación adicional para poder separar el resultado por ubicación.
     *
     * @param   {Array<string|number>} locationIds
     * @param   {string}               itemIds  IDs de artículo separados por coma
     * @returns {Object} Map { [locationId]: { [itemInternalId]: qtyComprometidaPendienteDeDespacho } }
     */
    const getCommittedInTransitFromLocationBulk = (locationIds, itemIds) => {
        const map = {};
        if (!locationIds || !locationIds.length || !itemIds) return map;
        try {
            const newSearch = search.create({
                type: "transferorder",
                settings:[{"name":"consolidationtype","value":"NONE"},{"name":"includeperiodendtransactions","value":"F"}],
                filters:[
                    ["type","anyof","TrnfrOrd"],
                    "AND",
                    ["mainline","is","F"],
                    "AND",
                    ["voided","is","F"],
                    "AND",
                    ["item","anyof", itemIds.split(',')],
                    "AND",
                    ["location","anyof", locationIds],
                    "AND",
                    ["closed","is","F"],
                    "AND",
                    ["transactionlinetype","anyof","SHIPPING"],
                    "AND",
                    ["formulanumeric: NVL({quantity},0) + NVL({quantityshiprecv},0)","lessthan","0"],
                    "AND",
                    ["status","noneof","TrnfrOrd:H"]
                ],
                columns:[
                    search.createColumn({ name: "location", summary: "GROUP"}),
                    search.createColumn({ name: "item", summary: "GROUP"}),
                    search.createColumn({ name: "formulanumeric", summary: "SUM", formula: "NVL({quantity},0) + NVL({quantityshiprecv},0)" })
                ]
            });
            let pageData = newSearch.runPaged({ pageSize: 1000 });
            pageData.pageRanges.forEach(function (pageRange) {
                let page = pageData.fetch({ index: pageRange.index });
                let results = page.data;
                for (let i = 0; i < results.length; i++) {
                    let columns  = results[i].columns;
                    let location = results[i].getValue(columns[0]);
                    let item     = results[i].getValue(columns[1]);
                    let qty_comprometida = Number(results[i].getValue(columns[2])) * -1;
                    if (!map[location]) map[location] = {};
                    map[location][item] = qty_comprometida;
                }
            });
        } catch (e) {
            log.error('InventarioRepository.getCommittedInTransitFromLocationBulk',
                `locations [${locationIds.join(',')}]: ${e.message}. Se asume 0 comprometido en OT pendientes de despacho.`
            );
        }
        return map;
    };

    return {
        getItemLocationConfig,
        getAvailableStock,
        getSafetyStockByLocation,
        getPendingInTransitQty,
        getCommittedInTransitFromLocation,
        getItemLocationConfigBulk,
        getAvailableStockBulk,
        getSafetyStockByLocationBulk,
        getPendingInTransitQtyBulk,
        getCommittedInTransitFromLocationBulk
    };
});
