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
            // OPTIMIZACIÓN: Eliminar logs redundantes para reducir consumo de governancia
            // Los logs se mantienen solo en caso de error para debugging

            // Array que almacenara resultados
            const searchResults = [];

            const saveSearch = search.create(createSearch);
            
            // OPTIMIZACIÓN: Usar run() directamente en lugar de runPaged() + run()
            // Esto reduce de 2 queries a 1 por búsqueda
            saveSearch.run().each(function (item) {
                const objectCompiled = {};
                for (var i = 0; i < item.columns.length; i++) {
                    objectCompiled[item.columns[i].label] = item.getValue(item.columns[i]);
                }
                searchResults.push(objectCompiled);
                return true;
            });

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
