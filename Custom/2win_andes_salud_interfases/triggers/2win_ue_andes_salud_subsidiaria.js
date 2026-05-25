/**
 * @NApiVersion 2.1
 * @NScriptType UserEventScript
 * @description Script para notificar eventos de empresa o holding a Health Connect.
 */

define(["../domain/2win_dom_subsidiaria", "N/error", "N/format", "N/log"], function ( domSubsidiaria, error, format, nLog) {

    /**
     * @function beforeSubmit - Ejecuta operacion en base a datos recuperados antes de guardar el registro.
     * @param {object} context - Datos del evento.
     */
    function beforeSubmit(context) {
        try {
            nLog.debug("beforeSubmit - context", context);
            const newRecord = context.newRecord;
            nLog.debug(`beforeSubmit - ${context.type} - newRecord`, newRecord);

            if (context.type === context.UserEventType.CREATE || context.type === context.UserEventType.EDIT) {

                // Recuperar valores de campos a validar
                let fechaInicio = newRecord.getValue({ fieldId: "custrecord_2win_fecha_inicio_vigencia" });
                let fechaFin = newRecord.getValue({ fieldId: "custrecord_2win_fecha_fin_vigencia" });
                let subRegistroDireccion = newRecord.getSubrecord({ fieldId: "mainaddress" });
                let codigoPais = subRegistroDireccion.getValue({ fieldId: "custrecord_2w_nacionalidad" });
                nLog.debug("beforeSubmit - campos", {
                    fechaInicio: fechaInicio,
                    fechaFin: fechaFin,
                    codigoPais: codigoPais
                });

                // Validar que fecha fin de vigencia no sea anterior a fecha inicio de vigencia
                if (fechaInicio && fechaFin && fechaFin < fechaInicio) {
                    // Ajustar formato de fecha
                    fechaInicio = format.format({ value: fechaInicio, type: format.Type.DATE });
                    fechaFin = format.format({ value: fechaFin, type: format.Type.DATE });
    
                    // Lanzar error
                    throw new Error (`<b>Error:</b> la fecha de fin de vigencia: <b>${fechaFin}</b> no puede ser anterior a la fecha de inicio de vigencia: <b>${fechaInicio}</b>, ajuste fecha fin de vigencia`)
                } else if (!codigoPais || codigoPais === "") { // Validar que campo tenga valor
                    // Lanzar error
                    throw new Error (`<b>Error:</b> Campo de Direccion: <b>PAIS - NACIONALIDAD</b> no debe estar vacio. Por favor diligencie el campo`)
                }

            }

            
        } catch (err) {
            nLog.error("beforeSubmit - error", err);
            throw {
                name: err.name || "CUSTOM_VALIDATION_ERROR",
                message: err.message,
                notifyOff: true
            };
            // throw err;
        }
    }

    /**
     * @function afterSubmit - Ejecuta operacion en base a datos recuperados despues de guardar el registro.
     * @param {object} context - Datos del evento.
     */
    function afterSubmit(context) {
        try {
            nLog.debug("afterSubmit - context", context);

            // Recuperar nuevo registro
            const newRecord = context.newRecord;
            nLog.debug(`afterSubmit - ${context.type} - newRecord`, newRecord);

            let respuesta

            // Validar que el evento sea de tipo "create"
            if (context.type === context.UserEventType.CREATE) {
                // Enviar detalle de evento a servicio externo
                respuesta = domSubsidiaria.eventoCreacionRegistro(newRecord);
                nLog.audit(`afterSubmit - ${context.type} - respuesta`, respuesta);
            }

            // Validar que el evento sea de tipo "edit"
            if (context.type === context.UserEventType.EDIT) {
                // Enviar detalle de evento a servicio externo
                respuesta = domSubsidiaria.eventoEdicionRegistro(newRecord);
                nLog.audit(`afterSubmit - ${context.type} - respuesta`, respuesta);
            }
        } catch (err) {
            nLog.error("afterSubmit - error", err);
        }
    }

    return {
        beforeSubmit: beforeSubmit,
        afterSubmit: afterSubmit
    };
});
