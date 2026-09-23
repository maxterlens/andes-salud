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

    return { getItemLocationConfig, getAvailableStock, getSafetyStockByLocation, getPendingInTransitQty };
});
