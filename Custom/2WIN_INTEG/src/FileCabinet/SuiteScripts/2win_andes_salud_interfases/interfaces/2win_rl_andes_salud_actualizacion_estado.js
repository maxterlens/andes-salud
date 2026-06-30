/**
 *@NApiVersion 2.1
 *@NScriptType Restlet
 */
define(["../domain/2win_dom_orden_venta", "N/log"], function (domOrdenVenta, nLog) {
    function _put(context) {
        try {
            nLog.debug("_put - context", context);
            const respuesta = domOrdenVenta.actualizacionMasivaRegistros(context);
            return respuesta;
        } catch (err) {
            nLog.error("_put - error", err);
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
