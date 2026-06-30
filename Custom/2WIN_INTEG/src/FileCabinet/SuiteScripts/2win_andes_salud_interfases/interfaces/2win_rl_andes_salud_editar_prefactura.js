/**
 *@NApiVersion 2.1
 *@NScriptType Restlet
 */
define(['../domain/2win_dom_prefactura'],

    function (dom_prefactura) {

        function _put(context) {

            try {

                log.debug("_put - context", context);

                // Lógica para agendar una tarea de edición de prefacturas en NetSuite
                var id_proceso = dom_prefactura.agendarTareaEditar(context);

                return {
                    tipoMensaje: "SEND^UPD",
                    estado: "success",
                    codigo: 200,
                    mensaje: "El proceso de edición de prefacturas se ha iniciado correctamente",
                    tipo_proceso: "Editar Prefactura",
                    id_proceso: id_proceso,
                    data: { }
                };

            } catch (error) {
                log.error("_put - error", error);
                throw {
                    name: error.name || "CUSTOM_VALIDATION_ERROR",
                    message: error.message,
                    notifyOff: true
                };
            }

        }

        return {
            put: _put
        }
    }
);
