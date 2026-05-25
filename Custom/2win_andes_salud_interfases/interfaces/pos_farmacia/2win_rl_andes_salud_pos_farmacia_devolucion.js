/**
 * @NApiVersion 2.x
 * @NScriptType Restlet
 */

define(['N/log', '../../domain/2win_dom_devolucion'], function(log, domDevolucion) {

    function _post(context) {
        try {

            log.debug('_post- context', context);
            var result = domDevolucion.procesoDevolucion(context);
            log.debug('_post- result', JSON.stringify(result));
            
            return result;
        } catch (e) {
            log.error("_post - error", e);

            if (e.hasOwnProperty('tipoMensaje') && e.hasOwnProperty('estado')) {
                throw JSON.stringify(e);
            } else {
                throw {
                    name: e.name || "CUSTOM_VALIDATION_ERROR",
                    message: e.message,
                    notifyOff: true
                };
            }
        }
    }

    return {
        post: _post
    };
});