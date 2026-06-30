/**
 * @NApiVersion 2.1
 * @NModuleScope Public
 */
define(["N/log", "./2win_ue_ov_search"], function (nLog, searchModule) {
    /**
     * Configura campos obligatorios en el formulario
     * @param {Form} form - El objeto del formulario
     */
    function setMandatoryFields(form) {
        const departmentField = form.getField("department");
        if (departmentField) departmentField.isMandatory = true;

        const classField = form.getField("class");
        if (classField) classField.isMandatory = true;
    }

    /**
     * Valida que el responsable de cuenta exista
     * @param {string} rut - RUT del responsable
     * @throws {Error} Si el responsable no existe
     */
    function validateResponsable(rut) {
        if (!rut) return;

        const customerId = searchModule.searchCustomerByRut(rut);
        if (!customerId) {
            throw Error(`No existe la entidad responsable con rut ${rut}, por favor verifique que exista en Netsuite`);
        }
    }

    /**
     * Valida que no exista otra orden de venta con el mismo número de cuenta
     * @param {string} nroCuentaPaciente - Número de cuenta del paciente
     * @param {string} subsidiaria - ID de la subsidiaria
     * @param {string} excludeId - ID a excluir de la búsqueda
     * @throws {Error} Si ya existe una orden de venta con el mismo número de cuenta
     */
    function validateUniqueAccount(nroCuentaPaciente, subsidiaria, excludeId) {
        if (!nroCuentaPaciente || !subsidiaria) return;

        const exists = searchModule.searchDuplicateSalesOrder(nroCuentaPaciente, subsidiaria, excludeId);
        if (exists) {
            throw new Error(`Ya existe una admision con el numero de cuenta ${nroCuentaPaciente}`);
        }
    }

    /**
     * Obtiene los IDs de campos personalizados y sus campos de registro correspondientes
     * @returns {Object}
     */
    function getFieldMappings() {
        return {
            listCustIds: [
                "custpage_nro_cuenta_paciente",
                "custpage_nro_admision",
                "custpage_id_clinico",
                "custpage_tipo_atencion",
                "custpage_servicio_ingreso",
                "custpage_servicio_ingreso_nom",
                "custpage_procedencia",
                "custpage_prestador_tratante",
                "custpage_prestador_tratante_nom",
                "custpage_responsable_cuenta_cod",
                "custpage_responsable_cuenta_nom",
                "custpage_ley_previsional",
                "custpage_compania_seguro",
                "custpage_tramo_fonasa",
                "custpage_rama_ffaa",
                "custpage_convenio_cod",
                "custpage_convenio_nom",
                "custpage_paquete_atencion_cod",
                "custpage_paquete_atencion_nom",
                "custpage_tiene_reclamo",
                "custpage_tiene_seguro",
                "custpage_id_mensaje_hl7",
                "custpage_tipo_evento_hl7",
                "custpage_fecha_mensaje",
                "custpage_fecha_anulacion",
                "custpage_nro_solicitud_farmacia",
                "custpage_tipo_doc_adjunto",
                "custpage_folio_doc_adjunto",
                "custpage_fecha_ingreso",
                "custpage_hora_ingreso",
                "custpage_prevision_nom",
                "custpage_prevision_cod",
                "custpage_ref_cuenta_urg",
                "custpage_ref_admision_urg",
                "custpage_ref_ficha_urg"
            ],
            listRecordFields: [
                "custbody_2win_nro_cuenta_paciente",
                "custbody_2win_ing_correl",
                "custbody_2win_pac_numficha",
                "class",
                "custbody_2win_servicio_ingreso",
                "custbody_2win_servicio_ingreso_nom",
                "custbody_2win_procedencia",
                "custbody_2win_prestador_tratante",
                "custbody_2win_prestador_tratante_nom",
                "custbody_2win_responsable_cuenta_cod",
                "custbody_2win_responsable_cuenta_nom",
                "custbody_2win_ley_previsional",
                "custbody_2win_compania_seguro",
                "custbody_2win_tramo_fonasa",
                "custbody_2win_rama_ffaa",
                "custbody_2win_convenio_cod",
                "custbody_2win_convenio_nom",
                "custbody_2win_paquete_atencion_cod",
                "custbody_2win_paquete_atencion_nom",
                "custbody_2win_tiene_reclamo",
                "custbody_2win_tiene_seguro",
                "custbody_2win_id_mensaje_hl7",
                "custbody_2win_tipo_evento_hl7",
                "custbody_2win_fecha_evento_hl7",
                "custbody_2win_fecha_anulacion",
                "custbody_2win_nro_solicitud_farmacia",
                "custbody_2win_tipo_doc_adjunto",
                "custbody_2win_folio_doc_adjunto",
                "custbody_2win_fecha_ingreso",
                "custbody_2win_hora_ingreso",
                "custbody_2win_prevision_nom",
                "custbody_2win_prevision_cod",
                "custbody_2win_nro_cuenta_paciente_urg",
                "custbody_2win_ing_correl_urg",
                "custbody_2win_pac_numficha_urg"
            ]
        };
    }

    /**
     * Determina si es una orden de venta (admisión)
     * @param {string} recordType - Tipo de registro
     * @returns {boolean}
     */
    function isSalesOrder(recordType) {
        return recordType === "salesorder";
    }

    /**
     * Determina si es un evento de creación
     * @param {string} eventType - Tipo de evento
     * @returns {boolean}
     */
    function isCreateEvent(eventType) {
        return eventType === "create";
    }

    /**
     * Determina si es un evento de eliminación
     * @param {string} eventType - Tipo de evento
     * @returns {boolean}
     */
    function isDeleteEvent(eventType) {
        return eventType === "delete";
    }

    /**
     * Determina si debe ejecutar lógica de orden de venta
     * @param {string} recordType - Tipo de registro
     * @param {string} eventType - Tipo de evento
     * @returns {boolean}
     */
    function shouldExecuteOVLogic(recordType, eventType) {
        return isSalesOrder(recordType) && !isDeleteEvent(eventType);
    }

    /**
     * Valida si hay cambios relevantes en las líneas de la orden de venta
     * @param {object} oldRecord - Registro antiguo
     * @param {object} newRecord - Registro nuevo
     * @returns {object} - { hayCambios: boolean, estadoActualizacion: string }
     */
    function validarCambiosLineas(oldRecord, newRecord) {
        if (!oldRecord) {
            return { hayCambios: true, estadoActualizacion: "CREATE" };
        }

        const oldLineCount = oldRecord.getLineCount({ sublistId: "item" });
        const newLineCount = newRecord.getLineCount({ sublistId: "item" });

        // Tipos de ítems inventariables
        const inventoryItemTypes = ["InvtPart", "Assembly", "Kit"];

        // Obtener líneas del oldRecord
        const oldLinesMap = new Map();
        for (let i = 0; i < oldLineCount; i++) {
            const itemType = oldRecord.getSublistValue({ sublistId: "item", fieldId: "itemtype", line: i });
            if (inventoryItemTypes.includes(itemType)) {
                const item = oldRecord.getSublistValue({ sublistId: "item", fieldId: "item", line: i });
                const quantity = parseFloat(oldRecord.getSublistValue({ sublistId: "item", fieldId: "quantity", line: i }) || "0");
                const identificadorFila = oldRecord.getSublistValue({ sublistId: "item", fieldId: "custcol_2win_as_identificador_fila", line: i });
                oldLinesMap.set(identificadorFila || `${item}`, { item, quantity });
            }
        }

        // Obtener líneas del newRecord y comparar
        for (let i = 0; i < newLineCount; i++) {
            const itemType = newRecord.getSublistValue({ sublistId: "item", fieldId: "itemtype", line: i });
            if (!inventoryItemTypes.includes(itemType)) continue;

            const item = newRecord.getSublistValue({ sublistId: "item", fieldId: "item", line: i });
            const quantity = parseFloat(newRecord.getSublistValue({ sublistId: "item", fieldId: "quantity", line: i }) || "0");
            const identificadorFila = newRecord.getSublistValue({ sublistId: "item", fieldId: "custcol_2win_as_identificador_fila", line: i });
            const key = identificadorFila || `${item}`;

            const oldLine = oldLinesMap.get(key);

            // Línea nueva
            if (!oldLine) {
                return { hayCambios: true, estadoActualizacion: "UPDATE" };
            }

            // Cantidad modificada
            if (oldLine.quantity !== quantity) {
                return { hayCambios: true, estadoActualizacion: "UPDATE" };
            }
        }

        // Verificar líneas eliminadas
        const newLinesSet = new Set();
        for (let i = 0; i < newLineCount; i++) {
            const itemType = newRecord.getSublistValue({ sublistId: "item", fieldId: "itemtype", line: i });
            if (inventoryItemTypes.includes(itemType)) {
                const item = newRecord.getSublistValue({ sublistId: "item", fieldId: "item", line: i });
                const identificadorFila = newRecord.getSublistValue({ sublistId: "item", fieldId: "custcol_2win_as_identificador_fila", line: i });
                newLinesSet.add(identificadorFila || `${item}`);
            }
        }

        for (const key of oldLinesMap.keys()) {
            if (!newLinesSet.has(key)) {
                return { hayCambios: true, estadoActualizacion: "UPDATE" };
            }
        }

        return { hayCambios: false, estadoActualizacion: null };
    }

    return {
        setMandatoryFields: setMandatoryFields,
        validateResponsable: validateResponsable,
        validateUniqueAccount: validateUniqueAccount,
        getFieldMappings: getFieldMappings,
        isSalesOrder: isSalesOrder,
        isCreateEvent: isCreateEvent,
        isDeleteEvent: isDeleteEvent,
        shouldExecuteOVLogic: shouldExecuteOVLogic,
        validarCambiosLineas: validarCambiosLineas
    };
});
