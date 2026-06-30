/**
 *@NApiVersion 2.1
 *@NScriptType UserEventScript
 *@description Script para notificar eventos de familia de producto a Health Connect.
 */
define(["N/log", "N/search", "N/ui/message", "N/url", "N/query", "N/runtime", "N/ui/serverWidget", "../domain/2win_dom_familia_producto", "../lib/2win_lib_validacion_duplicidad"], function (
    nLog,
    search,
    message,
    url,
    query,
    runtime,
    serverWidget,
    domFamiliaProducto,
    validacionDuplicidad
) {
    function beforeLoad(context) {
        try {
            // Adjuntar ClientScript para validación cliente
            let form = context.form;

            // form.clientScriptModulePath = "../clients/2win_cl_familia_producto.js";

            if (context.type === context.UserEventType.EDIT) {
                let field = form.getField({ id: "custrecord_2win_familycode" });
                if (field) {
                    field.updateDisplayType({ displayType: serverWidget.FieldDisplayType.DISABLED });
                }
            }
        } catch (err) {
            nLog.error("beforeLoad - error", err);
        }
    }

    function beforeSubmit(context) {
        try {
            if (context.type === context.UserEventType.CREATE) {
                let newRecord = context.newRecord;
                let familycode = newRecord.getValue({ fieldId: "custrecord_2win_familycode" });
                let name = newRecord.getValue({ fieldId: "name" });

                // Validar duplicidad de familycode
                if (familycode) {
                    const esDuplicado = validacionDuplicidad.validarDuplicado({
                        recordType: "customrecord_wmsse_item_family",
                        fieldId: "custrecord_2win_familycode",
                        value: familycode
                    });
                    if (esDuplicado) {
                        throw new Error(`Ya existe un registro con el código de familia '${familycode}'.`);
                    }
                }

                // Validar duplicidad de name
                if (name) {
                    const esDuplicadoName = validacionDuplicidad.validarDuplicado({
                        recordType: "customrecord_wmsse_item_family",
                        fieldId: "name",
                        value: name
                    });
                    if (esDuplicadoName) {
                        throw new Error(`Ya existe un registro con el nombre '${name}'.`);
                    }
                }
            } else if (context.type === context.UserEventType.EDIT) {
                let newRecord = context.newRecord;
                let familycode = newRecord.getValue({ fieldId: "custrecord_2win_familycode" });
                let name = newRecord.getValue({ fieldId: "name" });
                let internalId = newRecord.id;

                // Validar duplicidad de familycode
                if (familycode) {
                    const esDuplicado = validacionDuplicidad.validarDuplicado({
                        recordType: "customrecord_wmsse_item_family",
                        fieldId: "custrecord_2win_familycode",
                        value: familycode,
                        internalId: internalId
                    });
                    if (esDuplicado) {
                        throw new Error(`Ya existe un registro con el código de familia '${familycode}'.`);
                    }
                }

                // Validar duplicidad de name
                if (name) {
                    const esDuplicadoName = validacionDuplicidad.validarDuplicado({
                        recordType: "customrecord_wmsse_item_family",
                        fieldId: "name",
                        value: name,
                        internalId: internalId
                    });
                    if (esDuplicadoName) {
                        throw new Error(`Ya existe un registro con el nombre '${name}'.`);
                    }
                }
            }
        } catch (err) {
            nLog.error("beforeSubmit - validation error", err);
            throw err;
        }
    }

    /**
     * @function afterSubmit - Ejecuta operacion en base a datos recuperados despues de guardar el registro.
     * @param {object} context - Datos del evento.
     */
    function afterSubmit(context) {
        try {
            nLog.debug("afterSubmit - context", context);

            // Validar que el evento sea de tipo "create"
            if (context.type === context.UserEventType.CREATE) {
                let newRecord = context.newRecord;
                nLog.debug(`afterSubmit - ${context.type} - newRecord`, newRecord);

                let respuesta = domFamiliaProducto.eventoCreacionRegistro(newRecord);
                nLog.audit(`afterSubmit - ${context.type} - respuesta`, respuesta);
            }
            // Validar que el evento sea de tipo "edit"
            if (context.type === context.UserEventType.EDIT) {
                let newRecord = context.newRecord;
                nLog.debug(`afterSubmit - ${context.type} - newRecord`, newRecord);

                let respuesta = domFamiliaProducto.eventoEdicionRegistro(newRecord);
                nLog.audit(`afterSubmit - ${context.type} - respuesta`, respuesta);
            }
            // Validar que el evento sea de tipo "delete"
            if (context.type === context.UserEventType.DELETE) {
                let oldRecord = context.oldRecord;
                nLog.debug(`afterSubmit - ${context.type} - oldRecord`, oldRecord);

                // Enviar evento de eliminación con vigencia "N"
                let payload = {
                    ...oldRecord,
                    lines: [{
                        UprSimbolo: oldRecord.getValue({ fieldId: "custrecord_2win_familycode" }),
                        UprNombre: oldRecord.getValue({ fieldId: "name" }),
                        Vigente: "N",
                        Usuario: runtime.getCurrentUser().name
                    }]
                };
                
                let respuestaEliminacion = domFamiliaProducto.eventoEdicionRegistro(payload);
                nLog.audit(`afterSubmit - ${context.type} - respuestaEliminacion`, respuestaEliminacion);
            }
        } catch (err) {
            nLog.error("afterSubmit - error", err);
        }
    }
    return {
        beforeLoad: beforeLoad,
        beforeSubmit: beforeSubmit,
        afterSubmit: afterSubmit
    };
});
