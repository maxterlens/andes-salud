/**
 * @NApiVersion 2.x
 * @NModuleScope Public
 * @module 2win_dao_search_all_tipos_dte
 */

define(['N/search', 'N/log'], function (search, log) {
    function obtenerTiposDTE() {
            try {
                log.debug("obtenerTiposDTE - inicio", "Iniciando búsqueda de todos los tipos DTE")

                var searchResult = {
                    type: 'customrecord_2w_dte_tipo',
                    filters: [],
                    columns: [
                        search.createColumn({ name: 'internalid', label: 'internal_id' }),
                        search.createColumn({ name: 'name', label: 'name' }),
                        search.createColumn({ name: 'custrecord_2w_codigo_dte_2', label: 'codigo_dte' })
                    ]
                };

                var resultados = [];
                var saveSearch = search.create(searchResult);
                var searchResultCount = saveSearch.runPaged().count;

                if (searchResultCount == 0) {
                    log.debug("obtenerTiposDTE - sin resultados", "La búsqueda no retornó resultados")
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

                log.debug("obtenerTiposDTE - completada", "Búsqueda de tipos DTE completada con " + resultados.length + " resultados")

                return {
                    success: true,
                    result: resultados
                };
            } catch (error) {
                log.error("obtenerTiposDTE - error", error)
                return {
                    success: false,
                    error: error.message
                }
            }
        };

    return {
        obtenerTiposDTE: obtenerTiposDTE
    };
});
