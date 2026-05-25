/**
 * @NApiVersion 2.x
 * @module 2win_dao_search_type_dte
 * @NModuleScope Public
 */

define(['N/search', 'N/log', '../2win_dao'], function(search, log, libGetDataSearch) {
    
    function searchTypeDTE(tipoDTE) {
        try {
            log.debug('searchTypeDTE - tipoDTE', tipoDTE);
            var typeDteSearch = {
                type: "customrecord_2w_dte_tipo",
                filters:
                [
                    ["custrecord_2w_codigo_dte_2","is", tipoDTE]
                ],
                columns:
                [
                    search.createColumn({name: "internalid", label: "internal_id"})
                ]
            }

            var searchResult = libGetDataSearch.obtenerResultados(typeDteSearch);

            return { success: true, result: searchResult[0].internal_id };

        } catch (e) {
            log.error({
                title: 'Error en searchTypeDTE',
                details: e
            });

           return { success: false, error: e.message || e  };
        }
    }

    return {
        searchTypeDTE: searchTypeDTE
    };
});