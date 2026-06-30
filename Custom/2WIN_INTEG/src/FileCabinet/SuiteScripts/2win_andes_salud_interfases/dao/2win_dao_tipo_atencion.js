/**
 * @NApiVersion 2.1
 * @module ./2win_dao_tipo_atencion.js
 * @NModuleScope Public
 */
define(["./2win_dao", "N/search", "N/log"], function (dao, search, nLog) {
    const RegistroPorScriptidCache = new Map(); // Cache para resultados de búsqueda por scriptid
    /**
     * @function busquedaRegistroPorScriptid - Función para realizar una busqueda en una lista de netsuite.
     * @param {string} parametro - Parametros a usar en los filtros de la busqueda.
     * @return {Array} - Resultados de la busqueda.
     */
    function busquedaRegistroPorScriptid(parametro) {
        try {
            nLog.debug("busquedaRegistroPorScriptid - parametro", {
                parametro: parametro,
                tipoDato: typeof parametro
            });

            // Tipo, filtros y columnas para la busqueda
            let objSearch = {
                type: "customlist_2win_tipo_atencion",
                filters: [["scriptid", "is", parametro.toLocaleLowerCase()]],
                columns: [
                    // Campos cuerpo registro
                    search.createColumn({ name: "internalid", label: "internalid" })
                ]
            };
            let filtros = `tipo: ${objSearch.type}, filtros: ${objSearch.filters}`;

            if (RegistroPorScriptidCache.has(parametro)) {
                return RegistroPorScriptidCache.get(parametro);
            }
            // Ejecutar busqueda
            let result = dao.obtenerResultados(objSearch);
            nLog.audit("busquedaRegistroPorScriptid - resultados", {
                extension: result.length,
                resultado: result
            });

            // Valida que la busqueda retorne resultados
            if (result.length > 0) {
                RegistroPorScriptidCache.set(parametro, result);
                return result;
            } else {
                throw new Error(`No se encontro atencion para: ${parametro}`);
            }
        } catch (error) {
            nLog.error("busquedaRegistroPorScriptid - error", error);
            throw error;
        }
    }

    return {
        busquedaRegistroPorScriptid: busquedaRegistroPorScriptid
    };
});
