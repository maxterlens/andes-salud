/**
 * @NApiVersion 2.1
 * @NModuleScope SameAccount
 *
 * @name        InventarioRepository.js
 * @description Repositorio de acceso a datos de inventario.
 *              Responsabilidad exclusiva: consultas SuiteQL sobre
 *              itemlocationconfiguration, inventorybalance y transfer orders pendientes.
 */
define(['N/query', 'N/log'], (query, log) => {

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
     *   reorderpoint: string,
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
                    ilc.reorderpoint,
                    ilc.safetystocklevel
                FROM itemlocationconfiguration ilc
                INNER JOIN item i ON i.id = ilc.item
                WHERE ilc.location     = ${locationTo}
                  AND ilc.reorderpoint > 0
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
                        COALESCE(quantityavailable, 0) AS qty_available
                    FROM inventorybalance
                    WHERE location = ${locationTo}
                      AND item     IN (${itemIds})
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
        try {
            query.runSuiteQL({
                query: `
                    SELECT
                        tl.item,
                        SUM(tl.quantity - COALESCE(tl.quantityreceived, 0)) AS qty_pending
                    FROM transaction     t
                    JOIN transactionline tl ON tl.transaction = t.id
                    WHERE t.type             = 'TrnsfOrd'
                      AND t.status           IN (
                              'pendingFulfillment',
                              'partiallyFulfilled',
                              'pendingReceival',
                              'partiallyReceived'
                          )
                      AND t.transferlocation = ${locationTo}
                      AND tl.mainline        = 'F'
                      AND tl.isclosed        = 'F'
                      AND tl.item            IN (${itemIds})
                    GROUP BY tl.item
                `
            }).asMappedResults().forEach(r => {
                inTransitMap[r.item] = parseFloat(r.qty_pending) || 0;
            });
        } catch (e) {
            log.error('InventarioRepository.getPendingInTransitQty',
                `locationTo ${locationTo}: ${e.message}. Se asume 0 en tránsito.`
            );
        }
        return inTransitMap;
    };

    return { getItemLocationConfig, getAvailableStock, getPendingInTransitQty };
});
