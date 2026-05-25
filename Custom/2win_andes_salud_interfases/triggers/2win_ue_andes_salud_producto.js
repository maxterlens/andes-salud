/**
 *@NApiVersion 2.1
 *@NScriptType UserEventScript
 */

define(["N/log", "N/search", "N/ui/message", "N/url", "N/query", "N/runtime", "../domain/2win_dom_producto", "../lib/2win_lib_validacion_duplicidad"], function (
    nLog,
    search,
    message,
    url,
    query,
    runtime,
    domProducto,
    validacionDuplicidad
) {
    function beforeLoad(context) {
        const form = context.form;
        const upccodeField = form.getField("upccode");
        if (upccodeField) upccodeField.isMandatory = true;
        const unitType = form.getField("unitstype");
        if (unitType) unitType.isMandatory = true;
        const familyItem = form.getField("custitem_wmsse_itemfamily");
        if (familyItem) familyItem.isMandatory = true;
    }

    function beforeSubmit(context) {
        try {
            if (context.type === context.UserEventType.DELETE) {
                return;
            }
            const newRecord = context.newRecord;
            const itemid = newRecord.getValue({ fieldId: "itemid" });
            const upccode = newRecord.getValue({ fieldId: "upccode" });
            const displayname = newRecord.getValue({ fieldId: "displayname" });
            const internalId = context.type === context.UserEventType.EDIT ? newRecord.id : undefined;

            // Validar duplicidad de itemid
            if (itemid) {
                const esDuplicadoItemid = validacionDuplicidad.validarDuplicado({
                    recordType: "inventoryitem",
                    fieldId: "itemid",
                    value: itemid,
                    internalId: internalId
                });
                if (esDuplicadoItemid) {
                    throw new Error(`Ya existe un registro con el código de producto (itemid) '${itemid}'.`);
                }
            }

            // Validar duplicidad de upccode
            if (upccode) {
                const esDuplicadoUpc = validacionDuplicidad.validarDuplicado({
                    recordType: "inventoryitem",
                    fieldId: "upccode",
                    value: upccode,
                    internalId: internalId
                });
                if (esDuplicadoUpc) {
                    throw new Error(`Ya existe un registro con el UPC '${upccode}'.`);
                }
            }

            // Validar duplicidad de displayname
            if (displayname) {
                const esDuplicadoDisplay = validacionDuplicidad.validarDuplicado({
                    recordType: "inventoryitem",
                    fieldId: "displayname",
                    value: displayname,
                    internalId: internalId
                });
                if (esDuplicadoDisplay) {
                    throw new Error(`Ya existe un registro con el nombre para mostrar (displayname) '${displayname}'.`);
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

                let respuesta = domProducto.eventoCreacionRegistro(newRecord);
                nLog.audit(`afterSubmit - ${context.type} - respuesta`, respuesta);
            }
            // Validar que el evento sea de tipo "edit"
            if (context.type === context.UserEventType.EDIT) {
                let newRecord = context.newRecord;
                nLog.debug(`afterSubmit - ${context.type} - newRecord`, newRecord);

                let respuesta = domProducto.eventoEdicionRegistro(newRecord);
                nLog.audit(`afterSubmit - ${context.type} - respuesta`, respuesta);
            }
            // Validar que el evento sea de tipo "delete"
            if (context.type === context.UserEventType.DELETE) {
                let oldRecord = context.oldRecord;
                nLog.debug(`afterSubmit - ${context.type} - oldRecord`, oldRecord);

                // Enviar evento de eliminación con vigencia "N"
                let payload = {
                    ...oldRecord,
                    lines: [
                        {
                            UprSimbolo: oldRecord.getValue({ fieldId: "itemid" }),
                            UprNombre: oldRecord.getValue({ fieldId: "displayname" }),
                            Vigente: "N",
                            Usuario: runtime.getCurrentUser().name
                        }
                    ]
                };

                let respuestaEliminacion = domProducto.eventoEdicionRegistro(payload);
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
