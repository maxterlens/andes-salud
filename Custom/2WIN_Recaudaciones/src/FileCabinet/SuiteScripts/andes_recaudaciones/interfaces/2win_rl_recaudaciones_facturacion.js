/**
 *@NApiVersion 2.1
 *@NScriptType Restlet
 */
define(["N/log", "../domain/2win_dom_cola_recaudaciones_fact_lotes"], function (nLog, domCola) {
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
            
            const respuesta = domCola.recibir(context);
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
