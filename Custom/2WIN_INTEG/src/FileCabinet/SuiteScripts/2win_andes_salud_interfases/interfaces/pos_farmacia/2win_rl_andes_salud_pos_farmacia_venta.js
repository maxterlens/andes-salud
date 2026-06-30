/**
 * @NApiVersion 2.x
 * @NScriptType Restlet
 */

define(['N/log', '../../domain/2win_dom_venta'], function(log, domVenta) {

    function _post(context) {
        try{
            log.debug('_post- context', JSON.stringify(context));
            var result = domVenta.procesoVenta(context);

            return result;

        } catch(e){
            log.error({
                title: 'Error en _post',
                details: e
            });

            log.error({
                title: 'error en _post - tipoMensaje',
                details: e
            });
            if(typeof e === 'object' && e.tipoMensaje){
                throw {
                name: e.name || "CUSTOM_VALIDATION_ERROR",
                message: e.message,
                notifyOff: true
            };
            }else{
                throw {
                    name:  "CUSTOM_VALIDATION_ERROR",
                    message: e,
                    notifyOff: true
                };
            }
        }
        
    }

    return {
        post: _post
    };
});