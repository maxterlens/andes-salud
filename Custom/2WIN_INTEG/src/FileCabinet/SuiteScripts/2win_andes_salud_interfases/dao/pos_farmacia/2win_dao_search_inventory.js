/**
 * @NApiVersion 2.x
 * @module ./2win_dao_search_inventory
 * @NModuleScope Public
 */

define(['N/search', 'N/log', '../2win_dao'], function(search, log, getData) {
    /**
     * @description Se obtiene el status del detalle de un artículo del inventario.
     * @param {*} itemId 
     * @param {*} locationId 
     * @returns 
     */
    function searchInventory(itemId, locationId) {
        try {
            log.debug({
                title: 'parámetro Item',
                details: itemId
            });
            log.debug({
                title: 'parámetro Location',
                details: locationId
            });

            if(!itemId || !locationId){
                return { success: false, error: 'Faltan parámetros obligatorios: itemId o locationId' };
            }

            var searchResult = {
                type: 'inventorybalance',
                filters: [
                    ['externalid','anyof', itemId],
                    'AND',
                    ['location','anyof', locationId]
                ],
                columns: [
                    search.createColumn({name: "status", label: "status"})

                ]
            };

            var result = getData.obtenerResultados(searchResult);

            log.debug({
                title: 'Resultado búsqueda Item',
                details: JSON.stringify(result)
            });

            return { success: true, result: result };

        } catch (error) {
            log.error({
                title: 'Error en búsqueda de Item',
                details: error
            });

            return { success: false, error: error.message };
        }

    }
    return {
        searchInventory: searchInventory
    };
});