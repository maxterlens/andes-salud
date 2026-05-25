/**
 * @NApiVersion 2.1
 * @module ./2win_dao_tipo_dte.js
 * @NModuleScope Public
 */
define(["./2win_dao", "N/search", "N/log", "N/record"], function (dao, search, nLog, record) {
    /**
     * @function busquedaRegistroPorId - Función para realizar una busqueda en una tabla de netsuite.
     * @param {string} parametro - Parametros a usar en los filtros de la busqueda.
     * @return {Array} - Resultados de la busqueda.
     */
    function busquedaRegistroPorId(parametro) {
        try {
            nLog.debug("busquedaRegistroPorId - parametro", {
                parametro: parametro,
                tipoDato: typeof parametro
            });

            // Tipo, filtros y columnas para la busqueda
            let objSearch = {
                type: "customrecord_2w_dte_tipo",
                filters: [["internalid", "is", parametro]],
                columns: [
                    // Campos cuerpo registro
                    search.createColumn({ name: "internalid", label: "internalid" }),
                    search.createColumn({ name: "name", label: "name" }),
                    search.createColumn({ name: "custrecord_2w_codigo_dte_2", label: "custrecord_2w_codigo_dte_2" })
                ]
            };
            let filtros = `tipo: ${objSearch.type}, filtros: ${objSearch.filters}`;

            // Ejecutar busqueda
            let result = dao.obtenerResultados(objSearch);
            nLog.audit("busquedaRegistroPorId - resultados", {
                extension: result.length,
                resultado: result
            });

            // Valida que la busqueda retorne resultados
            if (result.length > 0) {
                return result;
            } else {
                throw new Error(`No se encontro tipo dte para id: ${parametro}`);
            }
        } catch (error) {
            nLog.error("busquedaRegistroPorId - error", error);
            throw error;
        }
    }

    return {
        busquedaRegistroPorId: busquedaRegistroPorId
    };
});
