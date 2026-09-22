/**
 *@NApiVersion 2.1
 *@NScriptType Restlet
 */
define(["N/log", "../domain/2win_dom_operaciones_masivas"], function (nLog, { OperacionMasiva }) {
    /**
     * Procesa request POST para crear nuevas recaudaciones
     * @param {Object} request - Objeto de request HTTP
     * @returns {Object} - Respuesta HTTP
     */
    function post(context) {
        try {
            nLog.debug("_post - context", context);
            
            // Validar que haya datos para procesar
            const facturasVacias = !context.facturasEmitidas || context.facturasEmitidas.length === 0;
            const ncVacias = !context.ncEmitidas || context.ncEmitidas.length === 0;
            const ndVacias = !context.ndEmitidas || context.ndEmitidas.length === 0;
            
            if (facturasVacias && ncVacias && ndVacias) {
                nLog.audit("POST request - Arrays de facturación vacíos", "No hay datos para procesar, retornando respuesta exitosa");
                return {
                    tipoMensaje: "SEND^RECAUDACION^FACTURACION",
                    estado: "success",
                    codigo: 200,
                    mensaje: "No hay datos para procesar - Arrays vacíos (facturasEmitidas, ncEmitidas, ndEmitidas)",
                    data: {}
                };
            }
            
            const operacion = new OperacionMasiva({
                nombre: "Recaudaciones Flujo Facturacion",
                tipoMensaje: "SEND^RECAUDACION^FACTURACION",
                scriptIdMapReduce: "customscript_2win_mr_recaudaciones_fac",
                deploymentIdMapReduce: "customdeploy_2win_mr_recaudaciones_fac",
                folderId: "./Recaudaciones Facturacion",
                mapReduceParameter: "custscript_2w_as_datos_recaudaciones_fac",
                tipoFlujo: "FACTURACION"
            });
            context.tipoOperacion = "crear";
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
        post: post
    };
});
