/**
 * @NApiVersion 2.1
 * @NModuleScope SameAccount
 *
 * @name        InventarioRepository.js
 * @description Repositorio de acceso a datos de inventario.
 *              Responsabilidad exclusiva: consultas SuiteQL sobre
 *              itemlocationconfiguration, inventorybalance y transfer orders pendientes.
 */
define(['N/query', 'N/search'], (query, search) => {

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
     *   safetystocklevel: string,
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
                    ilc.safetystocklevel,
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
     * Si la consulta falla (ubicación sin movimientos), retorna map vacío (asume qty = 0).
     *
     * @param   {string|number} locationTo  Internal ID de la ubicación
     * @param   {string}        itemIds     IDs de artículo separados por coma
     * @returns {Object} Map { [itemInternalId]: quantityAvailable }
     */
    const getAvailableStock = (locationTo, itemIds) => {
        const stockMap = {};
        try {
            query.runSuiteQL({
                query: `
                    SELECT
                        item,
                        SUM(COALESCE(quantityavailable, 0)) AS qty_available
                    FROM inventorybalance
                    WHERE location = ${locationTo}
                      AND item     IN (${itemIds})
                    GROUP BY item
                `
            }).asMappedResults().forEach(r => {
                stockMap[r.item] = parseFloat(r.qty_available) || 0;
            });
        } catch (e) {
            log.error('InventarioRepository.getAvailableStock',
                `locationTo ${locationTo}: ${e.message}. Se asume stock 0 para todos.`
            );
        }
        return stockMap;
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
                    ["formulanumeric: NVL({quantity},0) - NVL({quantityshiprecv},0)","greaterthan","0"]
                ],
                columns:[
                    search.createColumn({ name: "item", summary: "GROUP"}),
                    search.createColumn({ name: "formulanumeric", summary: "SUM", formula: "NVL({quantity},0) - NVL({quantityshiprecv},0)" })
                ]
            });
            newSearch.title = 'search testsss';
            let id = newSearch.save();
            log.error('id', id);
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

    return { getItemLocationConfig, getAvailableStock, getPendingInTransitQty };
});
