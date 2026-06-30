/**
 * @NApiVersion 2.x
 * @NModuleScope Public
 * @module 2win_dao_search_all_tax_codes
 */

define(['N/search', 'N/log'], function (search, log) {
    function obtenerTaxCodes() {
            try {
                log.debug("obtenerTaxCodes - inicio", "Iniciando búsqueda de todos los tax codes")

                var searchResult = {
                    type: 'salestaxitem',
                    filters: [
                        [
                            ["name", "is", "IVA Afecto"],
                            "OR",
                            ["name", "is", "IVA Exento"]
                        ]
                    ],
                    columns: [
                        search.createColumn({ name: 'internalid', label: 'internal_id' }),
                        search.createColumn({ name: 'name', label: 'name' })
                    ]
                };

                var resultados = [];
                var saveSearch = search.create(searchResult);
                var searchResultCount = saveSearch.runPaged().count;

                if (searchResultCount == 0) {
                    log.debug("obtenerTaxCodes - sin resultados", "La búsqueda no retornó resultados")
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

                log.debug("obtenerTaxCodes - completada", "Búsqueda de tax codes completada con " + resultados.length + " resultados")

                return {
                    success: true,
                    result: resultados
                };
            } catch (error) {
                log.error("obtenerTaxCodes - error", error)
                return {
                    success: false,
                    error: error.message
                }
            }
        };

    return {
        obtenerTaxCodes: obtenerTaxCodes
    };
});
