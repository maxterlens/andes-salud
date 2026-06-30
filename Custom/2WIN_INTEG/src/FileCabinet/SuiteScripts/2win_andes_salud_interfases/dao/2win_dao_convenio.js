/**
 * @NApiVersion 2.1
 * @module ./2win_dao_convenio.js
 * @NModuleScope Public
 */
define(["./2win_dao", "N/search", "N/log"], function (dao, search, nLog) {
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
                type: "customlist_2win_prevision_convenio",
                filters: [["scriptid", "is", parametro.toLocaleLowerCase()]],
                columns: [
                    // Campos cuerpo registro
                    search.createColumn({ name: "internalid", label: "internalid" })
                ]
            };
            let filtros = `tipo: ${objSearch.type}, filtros: ${objSearch.filters}`;

            // Ejecutar busqueda
            let result = dao.obtenerResultados(objSearch);
            nLog.audit("busquedaRegistroPorScriptid - resultados", {
                extension: result.length,
                resultado: result
            });

            // Valida que la busqueda retorne resultados
            if (result.length > 0) {
                return result;
            } else {
                throw new Error(`No se encontro convenio para codigo: ${parametro}`);
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
