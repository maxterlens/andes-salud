/**
 * @NApiVersion 2.x
 * @NModuleScope Public
 * @module 2win_dao_search_all_subsidiarias
 */

define(['N/search', 'N/log'], function (search, log) {
    function obtenerSubsidiarias() {
            try {
                log.debug("obtenerSubsidiarias - inicio", "Iniciando búsqueda de todas las subsidiarias")
                
                var searchResult = {
                    type: 'subsidiary',
                    filters: [],
                    columns: [
                        search.createColumn({ name: 'internalid', label: 'internal_id' }),
                        search.createColumn({ name: 'name', label: 'name' }),
                        search.createColumn({ name: 'custrecord_2winrutsubsiudiaria', label: 'rut_subsidiaria' })
                    ]
                };

                var resultados = [];
                var saveSearch = search.create(searchResult);
                var searchResultCount = saveSearch.runPaged().count;

                if (searchResultCount == 0) {
                    log.debug("obtenerSubsidiarias - sin resultados", "La búsqueda no retornó resultados")
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

                log.debug("obtenerSubsidiarias - completada", "Búsqueda de subsidiarias completada con " + resultados.length + " resultados")

                return {
                    success: true,
                    result: resultados
                };
            } catch (error) {
                log.error("obtenerSubsidiarias - error", error)
                return {
                    success: false,
                    error: error.message
                }
            }
        };

    return {
        obtenerSubsidiarias: obtenerSubsidiarias
    };
});