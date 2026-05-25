/**
 * @NApiVersion 2.1
 * @NScriptType Restlet
 * @description Script para recepcion de datos Andes Salud.
 */
define(["N/log", "N/error", "../domain/2win_dom_operaciones_masivas"], function (nLog, error, { OperacionMasiva }) {
    /**
     * @function _post - Ejecuta operacion en base a datos recibidos de peticion.
     * @param {object} context - Datos de la peticion recibida.
     * @returns {JSON} - Respuesta a peticion.
     */
    function _put(context) {
        try {
            nLog.debug("_post - context", context);
            const operacion = new OperacionMasiva({
                nombre: "Conceptos",
                tipoMensaje: "MODIFICACION^CONCEPTO",
                scriptIdMapReduce: "customscript_2win_mr_andessalud_items_se",
                deploymentIdMapReduce: "customdeploy_2win_mr_andessalud_items_se",
                folderId: "",
                mapReduceParameter: "custscript_mr_as_items_servicio_datos"
            });
            context.tipoOperacion = "editar";
            const respuesta = operacion.procesar(context);
            nLog.debug("_post - respuesta", respuesta);
            return respuesta || {};
        } catch (err) {
            nLog.error("_post - error", err);
            throw {
                name: err.name || "CUSTOM_VALIDATION_ERROR",
                message: err.message,
                notifyOff: true
            };
        }
    }

    return {
        put: _put
    };
});
