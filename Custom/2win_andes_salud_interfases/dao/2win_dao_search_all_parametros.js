/**
 * @NApiVersion 2.x
 * @NModuleScope Public
 * @module 2win_dao_search_all_parametros
 */

define(['N/search', 'N/log'], function (search, log) {
    function obtenerParametros() {
            try {
                log.debug("obtenerParametros - inicio", "Iniciando búsqueda de todos los parámetros de operación")

                var searchResult = {
                    type: 'customrecord_2w_parametros_operacion',
                    filters: [],
                    columns: [
                        search.createColumn({ name: 'internalid', sort: search.Sort.ASC, label: 'internal_id' }),
                        search.createColumn({ name: 'name', label: 'name' }),
                        search.createColumn({ name: 'custrecord_2w_parametro_numerico', label: 'number' }),
                        search.createColumn({ name: 'custrecord_2w_parametro_texto', label: 'text' }),
                        search.createColumn({ name: 'custrecord_2w_parametro_fecha', label: 'date' })
                    ]
                };

                var resultados = [];
                var saveSearch = search.create(searchResult);
                var searchResultCount = saveSearch.runPaged().count;

                if (searchResultCount == 0) {
                    log.debug("obtenerParametros - sin resultados", "La búsqueda no retornó resultados")
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

                log.debug("obtenerParametros - completada", "Búsqueda de parámetros completada con " + resultados.length + " resultados")

                return {
                    success: true,
                    result: resultados
                };
            } catch (error) {
                log.error("obtenerParametros - error", error)
                return {
                    success: false,
                    error: error.message
                }
            }
        };

    return {
        obtenerParametros: obtenerParametros
    };
});
