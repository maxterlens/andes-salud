/**
 * @NApiVersion 2.1
 * @module ./2win_dao_estado_solicitud_consumo.js
 * @NModuleScope Public
 */
define([
    "N/log",  
    "N/search",
    "N/record",
    "N/runtime",
    "./2win_dao"
], function (
    nLog,  
    search,
    record,
    runtime,
    dao
) {

    /* =========================
    * BUSQUEDAS
    * ========================= */

    /**
     * @function busquedaEstadosSolicitudConsumo - Función para realizar una busqueda en una tabla de netsuite.
     * @return {array} - Resultados de la busqueda.
     */
    function busquedaEstadosSolicitudConsumo() {
        try {
            // Tipo, filtros y columnas para la busqueda
            let objSearch = {
                type: "customlist_estado_solicitud",
                filters: [
                    ["isinactive", "is", "F"]
                ],
                columns: [
                    search.createColumn({ name: "internalid", label: "internalid" }),
                    search.createColumn({ name: "name", label: "name" }),
                ]
            };
            let filtros = `tipo: ${objSearch.type}, filtros: ${objSearch.filters}`;

            // Ejecuta busqueda paginada
            let resultado = dao.obtenerResultados(objSearch);

            if (resultado.length > 0) {
                // Ejecutar busqueda
                nLog.audit("busquedaEstadosSolicitudConsumo - resultados", {
                    extension: resultado.length,
                    resultado: resultado
                });
                return resultado;
            } else {
                throw new Error("No se recuperaron estados para la solicitud de consumo");
            };

            return resultado;
        } catch (error) {
            nLog.error("busquedaEstadosSolicitudConsumo - error", error);
            throw error;
        }
    }

    return {
        busquedaEstadosSolicitudConsumo: busquedaEstadosSolicitudConsumo
    };
});
