/**
 * @NApiVersion 2.x
 * @module ./2win_dao.js
 * @NModuleScope Public
 */
define(["N/search", "N/log"], function (search, nLog) {
    /**
     * @function obtenerResultados
     * @param {{"type": String,"filters": Array,"columns": Array}} createSearch - Objeto con parametros para la busqueda
     * @returns {Array} - Resultados de la busqueda
     */
    function obtenerResultados(createSearch) {
        try {
            nLog.audit("obtenerResultados - parametro", {
                type: createSearch.type,
                filters: createSearch.filters,
                tipoDato: typeof createSearch
            });

            // Array que almacenara resultados
            var searchResults = [];

            var saveSearch = search.create(createSearch);
            var searchResultCount;

            // Ejecutar busqueda estandar
            searchResultCount = saveSearch.runPaged().count;
            if (searchResultCount === 0) {
                nLog.debug("obtenerResultados - searchResultCount", "la busqueda no retorno resultados");
                return searchResultCount;
            }
            saveSearch.run().each(function (item) {
                var objectCompiled = {};
                for (var i = 0; i < item.columns.length; i++) {
                    objectCompiled[item.columns[i].label] = item.getValue(item.columns[i]);
                }
                searchResults.push(objectCompiled);
                return true;
            });
            nLog.debug("obtenerResultados - ejecutada", "Obtuvo resultados");

            return searchResults;
        } catch (error) {
            nLog.error("obtenerResultados - error", error);
            throw error;
        }
    }

    return {
        obtenerResultados: obtenerResultados
    };
});
