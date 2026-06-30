/**
 * @NApiVersion 2.1
 * @NScriptType UserEventScript
 * @description Script para notificar eventos de pago a Health Connect.
 */

define(["N/record", "N/runtime", "N/log", "N/error", "../domain/2win_dom_pago"], function (record, runtime, nLog, error, domPago) {

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
                // Iniciar proceso para enviar detalle de evento a servicio externo
                respuesta = domPago.validarPago(newRecord);
                nLog.audit(`afterSubmit - ${context.type} - respuesta`, respuesta);
            };
        } catch (err) {
            nLog.error("afterSubmit - error", err);
        }
    }

    return {
        afterSubmit: afterSubmit
    };
});