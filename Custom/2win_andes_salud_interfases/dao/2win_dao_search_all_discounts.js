/**
 * @NApiVersion 2.x
 * @NModuleScope Public
 * @module 2win_dao_search_all_discounts
 */

define(['N/search', 'N/log'], function (search, log) {
    function obtenerDiscounts() {
            try {
                log.debug("obtenerDiscounts - inicio", "Iniciando búsqueda de todos los descuentos")

                var searchResult = {
                    type: 'discountitem',
                    filters: [
                        ["type", "anyof", "Discount"]
                    ],
                    columns: [
                        search.createColumn({ name: 'internalid', label: 'internal_id' }),
                        search.createColumn({ name: 'itemid', label: 'name' }),
                        search.createColumn({ name: 'baseprice', label: 'discount_rate' })
                    ]
                };

                var resultados = [];
                var saveSearch = search.create(searchResult);
                var searchResultCount = saveSearch.runPaged().count;

                if (searchResultCount == 0) {
                    log.debug("obtenerDiscounts - sin resultados", "La búsqueda no retornó resultados")
                    return {
                        success: true,
                        result: resultados
                    };
                }

                saveSearch.run().each(function (item) {
                    var objetoCompilado = {};
                    for (var i = 0; i < item.columns.length; i++) {
                        objetoCompilado[item.columns[i].label] = item.getValue(item.columns[i]);
                    }
                    resultados.push(objetoCompilado);
                    return true;
                });

                log.debug("obtenerDiscounts - completada", "Búsqueda de descuentos completada con " + resultados.length + " resultados")

                return {
                    success: true,
                    result: resultados
                };
            } catch (error) {
                log.error("obtenerDiscounts - error", error)
                return {
                    success: false,
                    error: error.message
                }
            }
        };

    return {
        obtenerDiscounts: obtenerDiscounts
    };
});
