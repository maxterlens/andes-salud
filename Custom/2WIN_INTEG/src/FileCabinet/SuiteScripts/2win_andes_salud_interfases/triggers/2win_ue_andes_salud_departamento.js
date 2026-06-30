/**
 * @NApiVersion 2.1
 * @NScriptType UserEventScript
 * @description Script para notificar eventos de departamento a Health Connect.
 */

define(["../domain/2win_dom_departamento", "N/log", "N/error"], function (domDepartamento, nLog, error) {
    /**
     * @function afterSubmit - Ejecuta operacion en base a datos recuperados despues de guardar el registro.
     * @param {object} context - Datos del evento.
     */
    function afterSubmit(context) {
        try {
            nLog.audit("afterSubmit - context", context);

            // Recuperar registro
            const newRecord = context.newRecord;
            nLog.audit(`afterSubmit - ${context.type} - newRecord`, newRecord);

            // Variable para almacenar respuesta de ejecucion
            let respuesta;

            // Validar tipo de evento
            if (context.type === context.UserEventType.CREATE) {
                // Enviar detalle de evento a servicio externo
                respuesta = domDepartamento.eventoCreacionRegistro(newRecord);
            }

            // Validar tipo de evento
            if (context.type === context.UserEventType.EDIT) {
                // Enviar detalle de evento a servicio externo
                respuesta = domDepartamento.eventoEdicionRegistro(newRecord);
            }

            // Validar tipo de evento
            if (context.type === context.UserEventType.DELETE) {
                // Enviar detalle de evento a servicio externo
                respuesta = domDepartamento.eventoEliminacionRegistro(newRecord);
            }

            nLog.audit(`afterSubmit - ${context.type} - respuesta`, respuesta);
        } catch (err) {
            nLog.error("afterSubmit - error", err);
        }
    }

    return {
        afterSubmit: afterSubmit
    };
});
