/**
 * @NApiVersion 2.1
 * @NScriptType UserEventScript
 * @description Script para notificar eventos de ubicacion a Health Connect.
 */

define(["../domain/2win_dom_ubicacion", "N/log", "N/search", "N/ui/message", "N/url", "N/query", "N/record"], function (domUbicacion, nLog, search, message, url, query, record) {
    const FIELDS = {
        UBI_CLINICA: "custrecord_2win_as_ubi_clinica",
        CODIGO_UBICACION: "custrecord_2w_codigo_ubicacion",
        CODIGO_CENTRO_COS: "custrecord_2win_ubi_as_codigo_centro_cos",
        CLINICA_PAGE: "custpage_2win_ubi_clinica"
    };

    /**
     * Oculta un campo del formulario de forma segura (sin lanzar error si no existe).
     */
    const hideField = (form, fieldId) => form.getField({ id: fieldId })?.updateDisplayType({ displayType: "hidden" });

    /**
     * Obtiene las clínicas activas desde Subsidiary vía SuiteQL.
     * Retorna [] si falla la consulta.
     */
    const fetchClinicas = () => {
        try {
            return query
                .runSuiteQL({
                    query: `
                    SELECT
                        name || ' - ' || custrecord_2winrutsubsiudiaria AS nameCode,
                        id
                    FROM Subsidiary
                    WHERE isinactive = 'F'
                      AND custrecord_2w_esclinica = 'T'
                    ORDER BY name
                `,
                    params: []
                })
                .asMappedResults();
        } catch (e) {
            nLog.error("fetchClinicas - error al obtener clínicas", e);
            return [];
        }
    };

    /**
     * Agrega el campo select de Clínica al formulario,
     * preseleccionando el valor actual si el registro ya existe.
     */
    const addClinicaField = (form, currentClinicaId) => {
        const clinicField = form.addField({
            id: FIELDS.CLINICA_PAGE,
            type: "select",
            label: "Clínica",
            // Inserta el campo justo antes del campo oculto para mantener orden visual
            insertBefore: FIELDS.CODIGO_CENTRO_COS
        });

        clinicField.isMandatory = true;

        // Opción vacía inicial
        clinicField.addSelectOption({ value: "", text: "" });

        fetchClinicas().forEach(({ id, namecode }) => {
            clinicField.addSelectOption({
                value: id,
                text: namecode ?? "",
                isSelected: String(id) === String(currentClinicaId)
            });
        });
    };

    /**
     * Busca el registro de custodia con error "001" asociado a esta ubicación.
     * Retorna null si no existe.
     */
    const findCustodiaError = (locationId) => {
        const results = search
            .create({
                type: "customrecord_2win_andessalud_custodia",
                filters: [["custrecord_2win_as_id_registro", "is", locationId], "AND", ["custrecord_2win_as_codigo_respuesta", "is", "001"]],
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
            nLog.debug("parseErrorMessage - data[0]", data[0]);
            return data[0]?.estado?.mensaje ?? "Sin detalle";
        } catch (e) {
            nLog.error("parseErrorMessage - no se pudo parsear respuesta", e);
            return rawResponse || "Error desconocido";
        }
    };

    /**
     * Muestra un banner de advertencia si la ubicación tiene un error de sincronización.
     */
    const showSyncErrorBanner = (form, locationId, isView) => {
        const custodiaResult = findCustodiaError(locationId);
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
            message: `La ubicación no pudo ser procesada por el sistema externo.<br>
                       <strong>Interfaz:</strong> ${interfaceType}<br>
                       <strong>Razón:</strong> ${errorReason}<br>
                       <a href="${custodiaUrl}">Ver detalles de la custodia</a>`,
            duration: 30000
        });

        // El banner sólo se puede agregar en modo VIEW
        if (isView) form.addPageInitMessage({ message: msg });
    };

    // ─── Entry Point ─────────────────────────────────────────────────────────────

    const beforeLoad = (context) => {
        try {
            const { form, type, UserEventType, newRecord } = context;
            const isCreateOrEdit = [UserEventType.CREATE, UserEventType.EDIT, UserEventType.COPY].includes(type);
            const isView = type === UserEventType.VIEW;

            // 1. Código de ubicación: siempre oculto (campo técnico, no editable por el usuario)
            hideField(form, FIELDS.CODIGO_UBICACION);

            // 2. Campo nativo de Clínica:
            //    - En CREATE/EDIT/COPY se oculta porque se reemplaza por el select dinámico (custpage)
            //    - En VIEW se muestra para que el usuario vea el valor guardado
            // if (isCreateOrEdit) {
            hideField(form, FIELDS.UBI_CLINICA);
            const currentClinicaId = newRecord.getValue({ fieldId: FIELDS.UBI_CLINICA });
            addClinicaField(form, currentClinicaId);
            // }

            // 3. Centro de Costo: visible y editable en CREATE/EDIT/COPY, sólo lectura en VIEW
            //    NetSuite lo muestra inline por defecto; sólo lo forzamos a "inline" para
            //    asegurarnos de que no quede oculto por alguna configuración previa.
            form.getField({ id: FIELDS.CODIGO_CENTRO_COS })?.updateDisplayType({
                displayType: isCreateOrEdit ? "normal" : "inline"
            });

            // 4. Mostrar banner de error de sincronización si aplica
            const locationId = newRecord.id;
            if (locationId) {
                showSyncErrorBanner(form, locationId, isView);
            }
        } catch (err) {
            nLog.error("beforeLoad - error inesperado", err);
        }
    };

    /**
     * @function beforeSubmit - Valida unicidad del código de ubicación antes de guardar el registro.
     * @param {object} context - Datos del evento.
     */
    function beforeSubmit(context) {
        try {
            // Solo validar en creación o edición
            if (context.type !== context.UserEventType.CREATE && context.type !== context.UserEventType.EDIT) {
                return;
            }

            const newRecord = context.newRecord;

            // Recuperar valor de campo seleccion
            const clinicaId = newRecord.getValue({ fieldId: "custpage_2win_ubi_clinica" });

            // Validar seleccion de campo
            if (clinicaId) {
                // Definir valor de campo con id de seleccion
                newRecord.setValue({ fieldId: "custrecord_2win_as_ubi_clinica", value: clinicaId });
            }

            const codigoUbicacion = newRecord.getValue({ fieldId: "custrecord_2w_codigo_ubicacion" });

            // Si no hay código de ubicación, no validar
            if (!codigoUbicacion) {
                return;
            }

            // Consultar si existe otro registro con el mismo código (excluyendo el registro actual en edición)
            const queryStr =
                context.type === context.UserEventType.CREATE
                    ? `SELECT COUNT(*) as count FROM location WHERE custrecord_2w_codigo_ubicacion = ?`
                    : `SELECT COUNT(*) as count FROM location WHERE custrecord_2w_codigo_ubicacion = ? AND id != ?`;

            const params = context.type === context.UserEventType.CREATE ? [codigoUbicacion] : [codigoUbicacion, newRecord.id];

            const result = query.runSuiteQL({ query: queryStr, params: params }).asMappedResults();

            // Si hay registros con el mismo código, lanzar error
            if (result.length > 0 && result[0].count > 0) {
                throw new Error("El código de ubicación ya existe. Por favor, ingrese un código único.");
            }
        } catch (err) {
            nLog.error("beforeSubmit - error", err);
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

                // Copiar el internalid al campo custrecord_2w_codigo_ubicacion
                const internalId = newRecord.id;
                if (internalId) {
                    try {
                        const locationRecord = record.load({
                            type: record.Type.LOCATION,
                            id: internalId
                        });

                        locationRecord.setValue({
                            fieldId: "custrecord_2w_codigo_ubicacion",
                            value: internalId
                        });

                        locationRecord.save({
                            enableSourcing: false,
                            ignoreMandatoryFields: true
                        });

                        nLog.audit("afterSubmit - internalid copiado", `InternalID ${internalId} copiado a custrecord_2w_codigo_ubicacion`);
                    } catch (loadError) {
                        nLog.error("afterSubmit - error al copiar internalid", loadError);
                    }
                }

                let respuesta = domUbicacion.eventoCreacionRegistro(newRecord);
                nLog.audit(`afterSubmit - ${context.type} - respuesta`, respuesta);
            }
            // Validar que el evento sea de tipo "edit"
            if (context.type === context.UserEventType.EDIT) {
                let newRecord = context.newRecord;
                nLog.debug(`afterSubmit - ${context.type} - newRecord`, newRecord);

                let oldRecord = context.oldRecord;
                nLog.debug(`afterSubmit - ${context.type} - oldRecord`, oldRecord);

                let respuesta = domUbicacion.eventoEdicionRegistro(oldRecord, newRecord);
                nLog.audit(`afterSubmit - ${context.type} - respuesta`, respuesta);
            }
            // Validar que el evento sea de tipo "delete"
            if (context.type === context.UserEventType.DELETE) {
                // En delete, NetSuite solo provee el registro anterior en context.oldRecord
                let oldRecord = context.oldRecord;
                nLog.debug(`afterSubmit - ${context.type} - oldRecord`, oldRecord);

                let respuesta = domUbicacion.eventoEliminacionRegistro(oldRecord);
                nLog.audit(`afterSubmit - ${context.type} - respuesta`, respuesta);
            }
        } catch (err) {
            nLog.error("afterSubmit - error", err);
        }
    }

    return {
        afterSubmit: afterSubmit,
        beforeLoad: beforeLoad,
        beforeSubmit: beforeSubmit
    };
});
