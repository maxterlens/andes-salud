/**
 *@NApiVersion 2.1
 *@NScriptType UserEventScript
 */
define(["N/log", "N/record", "N/runtime", "N/error", "N/url", "N/search", "N/ui/message", "../domain/2win_dom_unidad_producto", "../lib/2win_lib_validacion_duplicidad"], function (
    nLog,
    record,
    runtime,
    error,
    url,
    search,
    message,
    domUnidadProducto,
    validacionDuplicidad
) {
    // ─── Lógica para Banner de Sincronización

    /**
     * Busca el registro de custodia con error "001" asociado a este registro.
     * Retorna null si no existe.
     * @param {String} recordId - El ID interno del registro actual
     */
    const findCustodiaError = (recordId) => {
        const results = search
            .create({
                type: "customrecord_2win_andessalud_custodia",
                filters: [["custrecord_2win_as_id_registro", "is", recordId], "AND", ["custrecord_2win_as_codigo_respuesta", "is", "001"]],
                columns: ["custrecord_2win_as_respuesta", "custrecord_2win_as_interface", "internalid"]
            })
            .run()
            .getRange({ start: 0, end: 1 });

        return results.length > 0 ? results[0] : null;
    };

    /**
     * Parsea el mensaje de error desde la respuesta de custodia.
     * Retorna un string con la razón del error.
     */
    const parseErrorMessage = (rawResponse) => {
        try {
            const cuerpoStr = rawResponse.split("cuerpo: ")[1];
            const data = JSON.parse(JSON.parse(cuerpoStr));
            return data[0]?.estado?.mensaje ?? "Sin detalle";
        } catch (e) {
            nLog.error("parseErrorMessage - no se pudo parsear respuesta", e);
            return rawResponse || "Error desconocido";
        }
    };

    /**
     * Muestra un banner de advertencia si el registro tiene un error de sincronización.
     */
    const showSyncErrorBanner = (form, recordId, isView) => {
        const custodiaResult = findCustodiaError(recordId);
        if (!custodiaResult) return;

        const internalId = custodiaResult.getValue("internalid");
        const rawResponse = custodiaResult.getValue("custrecord_2win_as_respuesta") ?? "";
        const interfaceType = custodiaResult.getValue("custrecord_2win_as_interface") ?? "desconocida";
        const errorReason = parseErrorMessage(rawResponse);

        const custodiaUrl = url.resolveRecord({
            recordType: "customrecord_2win_andessalud_custodia",
            recordId: internalId,
            isEditMode: false
        });

        const msg = message.create({
            type: message.Type.WARNING,
            title: "Error de sincronización",
            message: `El Tipo de Unidad de Medida no pudo ser procesado por el sistema externo.<br>
                       <strong>Interfaz:</strong> ${interfaceType}<br>
                       <strong>Razón:</strong> ${errorReason}<br>
                       <a href="${custodiaUrl}" target="_blank">Ver detalles de la custodia</a>`,
            duration: 30000
        });

        // El banner normalmente se agrega en modo VIEW para auditar el registro guardado
        if (isView) form.addPageInitMessage({ message: msg });
    };

    // ─── Eventos Principales ───────────────────────────────────────────────────

    function beforeLoad(context) {
        try {
            let form = context.form;

            // Adjuntar ClientScript para validación frontend
            form.clientScriptModulePath = "../clients/2win_cl_unidad_producto.js";

            const isView = context.type === context.UserEventType.VIEW;
            const recordId = context.newRecord.id;

            // Mostrar el banner de error de sincronización si aplica (y si el registro ya existe)
            if (recordId) {
                showSyncErrorBanner(form, recordId, isView);
            }
        } catch (err) {
            nLog.error("beforeLoad - error", err);
        }
    }

    function beforeSubmit(context) {
        try {
            if (context.type === context.UserEventType.CREATE || context.type === context.UserEventType.EDIT) {
                let newRecord = context.newRecord;
                let currentRecordId = newRecord.id || "";
                const unitListCount = newRecord.getLineCount({ sublistId: "uom" });

                let abbreviations = [];
                let unitNames = [];

                // 1. RECOLECCIÓN DE DATOS
                for (let i = 0; i < unitListCount; i++) {
                    const abbr = newRecord.getSublistValue({ sublistId: "uom", fieldId: "abbreviation", line: i });
                    const name = newRecord.getSublistValue({ sublistId: "uom", fieldId: "unitname", line: i });

                    if (abbr) abbreviations.push(abbr);
                    if (name) unitNames.push(name);
                }

                // 2. VALIDACIÓN GLOBAL DE ABREVIATURAS
                // if (abbreviations.length > 0) {
                //     const duplicadosAbbr = validacionDuplicidad.validarDuplicadoMasivoSuiteQL({
                //         recordType: "unitsTypeUom",
                //         fieldId: "abbreviation",
                //         valuesArray: abbreviations,
                //         internalId: currentRecordId
                //     });

                //     if (duplicadosAbbr && duplicadosAbbr.length > 0) {
                //         let mensajesError = duplicadosAbbr.map(function (dup) {
                //             let link = url.resolveRecord({
                //                 recordType: "unitstype",
                //                 recordId: dup.parentId,
                //                 isEditMode: false
                //             });
                //             return `- '${dup.valor}' (Enlace: ${link})`;
                //         });

                //         throw new Error(`Ya existen unidades con los siguientes nombres:${mensajesError.join(",")} Por favor, regrese y utilice un nombre diferente.`);
                //     }
                // }

                // 3. VALIDACIÓN GLOBAL DE NOMBRES
                // if (unitNames.length > 0) {
                //     const duplicadosNames = validacionDuplicidad.validarDuplicadoMasivoSuiteQL({
                //         recordType: "unitsTypeUom",
                //         fieldId: "unitname",
                //         valuesArray: unitNames,
                //         internalId: currentRecordId
                //     });

                //     if (duplicadosNames && duplicadosNames.length > 0) {
                //         let mensajesError = duplicadosNames.map(function (dup) {
                //             let link = url.resolveRecord({
                //                 recordType: "unitstype",
                //                 recordId: dup.parentId,
                //                 isEditMode: false
                //             });
                //             return `- '${dup.valor}' (Enlace: ${link})`;
                //         });

                //         throw new Error(`Ya existen unidades con los siguientes nombres:${mensajesError.join(",")} Por favor, regrese y utilice un nombre diferente.`);
                //     }
                // }
            }
        } catch (err) {
            nLog.error("beforeSubmit - validation error", err);
            throw err;
        }
    }

    function afterSubmit(context) {
        try {
            nLog.debug("afterSubmit - context type", context.type);

            let newRecord = context.newRecord;
            const currentUser = runtime.getCurrentUser().name;

            if (context.type === context.UserEventType.CREATE) {
                let respuesta = domUnidadProducto.eventoCreacionRegistro(newRecord);
                nLog.audit(`afterSubmit - CREATE - respuesta`, respuesta);
            } else if (context.type === context.UserEventType.EDIT) {
                let oldRecord = context.oldRecord;

                const oldUnitListCount = oldRecord.getLineCount({ sublistId: "uom" });
                const newUnitListCount = newRecord.getLineCount({ sublistId: "uom" });

                let oldUnitsMap = new Map();

                for (let i = 0; i < oldUnitListCount; i++) {
                    const oldAbbr = oldRecord.getSublistValue({ sublistId: "uom", fieldId: "abbreviation", line: i });
                    const oldName = oldRecord.getSublistValue({ sublistId: "uom", fieldId: "unitname", line: i });
                    oldUnitsMap.set(oldAbbr, oldName);
                }

                const newUnitsPayload = { lines: [] };
                const deletedUnits = [];
                let hasNewUnits = false;
                let existingUnitsChanged = oldRecord.getValue("isinactive") !== newRecord.getValue("isinactive");

                for (let i = 0; i < newUnitListCount; i++) {
                    const newAbbr = newRecord.getSublistValue({ sublistId: "uom", fieldId: "abbreviation", line: i });
                    const newName = newRecord.getSublistValue({ sublistId: "uom", fieldId: "unitname", line: i });

                    if (!oldUnitsMap.has(newAbbr)) {
                        hasNewUnits = true;
                        newUnitsPayload.lines.push({
                            UprSimbolo: newAbbr,
                            UprNombre: newName,
                            Vigente: !newRecord.getValue("isinactive"),
                            Usuario: currentUser
                        });
                    } else {
                        if (oldUnitsMap.get(newAbbr) !== newName) {
                            existingUnitsChanged = true;
                        }
                        oldUnitsMap.delete(newAbbr);
                    }
                }

                for (let [oldAbbr, oldName] of oldUnitsMap) {
                    deletedUnits.push({
                        UprSimbolo: oldAbbr,
                        UprNombre: oldName,
                        Vigente: "N",
                        Usuario: currentUser
                    });
                }

                if (deletedUnits.length > 0) {
                    nLog.debug("Unidades eliminadas detectadas", deletedUnits);
                    let respuestaEliminacion = domUnidadProducto.eventoEdicionRegistro({
                        ...newRecord,
                        lines: deletedUnits
                    });
                    nLog.audit("afterSubmit - respuestaEliminacion", respuestaEliminacion);
                }

                if (hasNewUnits) {
                    nLog.debug("Nuevas unidades detectadas", newUnitsPayload.lines);
                    let respuestaCreacion = domUnidadProducto.eventoCreacionRegistro({
                        ...newRecord,
                        ...newUnitsPayload
                    });
                    nLog.audit("afterSubmit - respuestaCreacion", respuestaCreacion);
                }

                if (existingUnitsChanged) {
                    nLog.debug("Cambios detectados", "Modificaciones en el estado o nombres existentes.");
                    let respuestaEdicion = domUnidadProducto.eventoEdicionRegistro(newRecord);
                    nLog.audit("afterSubmit - respuestaEdicion", respuestaEdicion);
                }
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
