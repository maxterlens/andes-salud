/**
 * @NApiVersion 2.x
 * @NModuleScope Public
 * @module 2win_dao_search_all_ubicaciones
 */

define(['N/search', 'N/log'], function (search, log) {
    function obtenerUbicaciones() {
            try {
                log.debug("obtenerUbicaciones - inicio", "Iniciando búsqueda de todas las ubicaciones")

                var searchResult = {
                    type: 'location',
                    filters: [],
                    columns: [
                        search.createColumn({ name: 'internalid', label: 'internal_id' }),
                        search.createColumn({ name: 'name', label: 'name' }),
                        search.createColumn({ name: 'custrecord_2w_codigo_ubicacion', label: 'codigo_ubicacion' }),
                        search.createColumn({ name: 'custrecord_2win_ubi_as_codigo_centro_cos', label: 'centro_costo' })
                    ]
                };

                var resultados = [];
                var saveSearch = search.create(searchResult);
                var searchResultCount = saveSearch.runPaged().count;

                if (searchResultCount == 0) {
                    log.debug("obtenerUbicaciones - sin resultados", "La búsqueda no retornó resultados")
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

                log.debug("obtenerUbicaciones - completada", "Búsqueda de ubicaciones completada con " + resultados.length + " resultados")

                return {
                    success: true,
                    result: resultados
                };
            } catch (error) {
                log.error("obtenerUbicaciones - error", error)
                return {
                    success: false,
                    error: error.message
                }
            }
        };

    return {
        obtenerUbicaciones: obtenerUbicaciones
    };
});
