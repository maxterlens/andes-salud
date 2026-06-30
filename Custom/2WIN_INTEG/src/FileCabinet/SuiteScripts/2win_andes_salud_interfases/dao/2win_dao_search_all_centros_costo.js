/**
 * @NApiVersion 2.x
 * @NModuleScope Public
 * @module 2win_dao_search_all_centros_costo
 */

define(['N/search', 'N/log'], function (search, log) {
    function obtenerCentrosCosto() {
            try {
                log.debug("obtenerCentrosCosto - inicio", "Iniciando búsqueda de todos los centros de costo")

                var searchResult = {
                    type: 'department',
                    filters: [],
                    columns: [
                        search.createColumn({ name: 'internalid', label: 'internal_id' }),
                        search.createColumn({ name: 'name', label: 'name' })
                    ]
                };

                var resultados = [];
                var saveSearch = search.create(searchResult);
                var searchResultCount = saveSearch.runPaged().count;

                if (searchResultCount == 0) {
                    log.debug("obtenerCentrosCosto - sin resultados", "La búsqueda no retornó resultados")
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

                log.debug("obtenerCentrosCosto - completada", "Búsqueda de centros de costo completada con " + resultados.length + " resultados")

                return {
                    success: true,
                    result: resultados
                };
            } catch (error) {
                log.error("obtenerCentrosCosto - error", error)
                return {
                    success: false,
                    error: error.message
                }
            }
        };

    return {
        obtenerCentrosCosto: obtenerCentrosCosto
    };
});
