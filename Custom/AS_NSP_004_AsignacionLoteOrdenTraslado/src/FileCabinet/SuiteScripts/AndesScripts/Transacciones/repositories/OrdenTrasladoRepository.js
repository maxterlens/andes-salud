/**
 * @NApiVersion 2.1
 * @NModuleScope SameAccount
 * @file OrdenTrasladoRepository.js
 * @description Acceso a datos de stock para la Orden de Traslado.
 *              Consulta inventoryBalance via SuiteQL para obtener
 *              el stock disponible por ítem y ubicación.
 */
define(['N/query'], (query) => {

    /**
     * Retorna el stock disponible de múltiples ítems en una ubicación via SuiteQL.
     * Una sola query con GROUP BY — nunca llamar dentro de un bucle.
     *
     * @param {Array<string|number>} itemIds
     * @param {string|number}        locationId
     * @returns {Object} Mapa { [itemId]: stockDisponible }. Ítems sin stock retornan 0.
     */
    const obtenerStockDisponibleEnLote = (itemIds, locationId) => {
        const stockMap = {};
        if (!itemIds || itemIds.length === 0) return stockMap;

        // Inicializar todos en 0 para garantizar entrada por cada itemId
        itemIds.forEach(id => { stockMap[id] = 0; });

        const placeholders = itemIds.map(() => '?').join(', ');
        const params = [
            ...itemIds.map(id => Number(id)),
            Number(locationId)
        ];

        const resultSet = query.runSuiteQL({
            query : `
                SELECT
                    ib.item,
                    SUM(inl.quantityavailable) AS stockdisponible
                FROM
                    inventoryBalance ib
                    JOIN inventoryNumber invn ON ib.inventorynumber = invn.id
                    JOIN InventoryNumberLocation inl ON invn.id = inl.inventorynumber AND inl.location = ib.location
                WHERE
                    ib.item IN (${placeholders})
                    AND ib.location = ?
                    AND inl.quantityavailable > 0                    
                GROUP BY ib.item`,
            params
        });

        resultSet.asMappedResults().forEach(row => {
            stockMap[row.item] = Number(row.stockdisponible) || 0;
        });

        return stockMap;
    };

    return { obtenerStockDisponibleEnLote };
});
