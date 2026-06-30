/**
 * @NApiVersion 2.1
 * @module ./2win_dao_impuesto.js
 * @NModuleScope Public
 */
define(["N/log", "N/record", "N/search", "./2win_dao"], function (nLog, record, search, dao) {
    /**
     * @function busquedaRegistroPorCodigo - Función para realizar una busqueda en una tabla de netsuite.
     * @param {string} parametro - Parametros a usar en los filtros de la busqueda.
     * @return {Array} - Resultados de la busqueda.
     */
    function busquedaRegistroPorCodigo(parametro) {
        try {
            nLog.debug("busquedaRegistroPorCodigo - parametro", {
                parametro: parametro,
                tipoDato: typeof parametro
            });

            // Tipo, filtros y columnas para la busqueda
            let objSearch = {
                type: "salestaxitem",
                filters: [["itemid", "is", parametro]],
                columns: [
                    // Campos cuerpo registro
                    search.createColumn({ name: "internalid", label: "internalid" })
                ]
            };
            let filtros = `tipo: ${objSearch.type}, filtros: ${objSearch.filters}`;

            // Ejecutar busqueda
            let result = dao.obtenerResultados(objSearch);
            nLog.audit("busquedaRegistroPorCodigo - resultados", {
                extension: result.length,
                resultado: result
            });

            // Valida que la busqueda retorne resultados
            if (result.length > 0) {
                return result;
            } else {
                throw new Error(`No se encontro codigo de impuesto: ${parametro}`);
            }
        } catch (error) {
            nLog.error("busquedaRegistroPorCodigo - error", error);
            throw error;
        }
    }

    return {
        busquedaRegistroPorCodigo: busquedaRegistroPorCodigo
    };
});
