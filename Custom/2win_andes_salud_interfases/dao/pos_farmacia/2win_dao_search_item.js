/**
 * @NApiVersion 2.x
 * @module 2win_dao_search_item
 * @NModuleScope Public
 */

define(['N/search', 'N/log', '../2win_dao'], function(search, log, libGetDataSearch) {

    function searchTypeItemByIntId(internalid, locationId) {
        try {
            log.debug('searchTypeItemByIntId - internalid', internalid);
            log.debug('searchTypeItemByIntId - locationId', locationId);

            var invStatusItem = {
                type: "inventorybalance",
                filters:
                [
                    ["item.internalid","anyof", internalid],
                    "AND", 
                    ["location","anyof", locationId]
                ],
                columns:
                [
                    search.createColumn({name: "status", label: "status"})
                ]
            }

            var searchResult = libGetDataSearch.obtenerResultados(invStatusItem);

            return { success: true, result: searchResult };

        } catch (e) {
            log.error({
                title: 'Error en searchTypeItemByIntId',
                details: e
            });

           return { success: false, error: e.message || e  };

        }
    }

    return {
        searchTypeItemByIntId: searchTypeItemByIntId
    };
});