/**
 *@NApiVersion 2.1
 *@NScriptType Restlet
 */
define(["../domain/2win_dom_prefactura"], function (dom_prefactura) {
    function _post(context) {
        try {
            log.debug("_post - context", context);

            // Lógica para agendar una tarea de creación de prefacturas en NetSuite
            let id_proceso = dom_prefactura.agendarTareaCrear(context);

            return {
                tipoMensaje: "SEND^IN",
                estado: "success",
                codigo: 200,
                tipo_proceso: "Crear Prefactura",
                id_proceso: id_proceso,
                mensaje: "El proceso de creación de prefacturas se ha iniciado correctamente",
                data: {}
            };
        } catch (error) {
            log.error("_post - error", error);
            throw {
                name: error.name || "CUSTOM_VALIDATION_ERROR",
                message: error.message,
                notifyOff: true
            };
        }
    }

    return {
        post: _post
    };
});
