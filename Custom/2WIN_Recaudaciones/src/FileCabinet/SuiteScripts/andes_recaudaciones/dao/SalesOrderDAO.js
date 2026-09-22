/**
 * @NApiVersion 2.1
 */
define(["N/record", "N/search", "N/log", "N/format"], function (record, search, nLog, format) {
    // Caché para campos de SalesOrder - optimización para flujos con muchos movimientos
    let soFieldsCache = {};

    function findOpenOrder(customerId, subsidiary, cuentaPaciente) {
        // Buscar OV abierta para el cliente y cuenta paciente
        const filters = [
            ["entity", "anyof", customerId],
            // "AND",
            // ["status", "anyof", ["SalesOrd:A", "SalesOrd:B", "SalesOrd:C"]], // Pending Approval, Pending Fulfillment
            "AND",
            ["custbody_2win_nro_cuenta_paciente", "is", cuentaPaciente] // Asumiendo campo custom
        ];

        if (subsidiary) {
            filters.push("AND");
            filters.push(["subsidiary", "anyof", subsidiary]);
        }

        const searchObj = search.create({
            type: record.Type.SALES_ORDER,
            filters: filters,
            columns: ["internalid"]
        });

        const results = searchObj.run().getRange({ start: 0, end: 1 });
        if (results && results.length > 0) {
            return results[0].getValue("internalid");
        }
        return null;
    }

    function createOrder(data) {
        try {
            nLog.debug("createOrder", data);
            const newRecord = record.create({
                type: record.Type.SALES_ORDER,
                isDynamic: true
            });

            // Set Form
            // newRecord.setValue({fieldId: 'customform', value: 'custform_2w_prestaciones_ingreso'}); // ID from prompt

            newRecord.setValue({ fieldId: "entity", value: data.customerId });
            newRecord.setValue({ fieldId: "subsidiary", value: data.subsidiaria });
            newRecord.setValue({ fieldId: "trandate", value: new Date(data.fechaTransaccion) });
            newRecord.setValue({ fieldId: "memo", value: "Orden Venta Generica" });
            newRecord.setValue({ fieldId: "custbody_2win_created_from_income_flow", value: true });
            // Custom Fields
            if (data.ficha) newRecord.setValue({ fieldId: "custbody_2w_ficha", value: data.ficha });
            // falta la classification
            // falta el departamento
            // if (data.prefactura) newRecord.setValue({ fieldId: "custbody_2w_prefactura", value: data.prefactura });
            if (data.cuentaPaciente) newRecord.setValue({ fieldId: "custbody_2win_nro_cuenta_paciente", value: data.cuentaPaciente });

            // Item Generico precio 0
            newRecord.selectNewLine({ sublistId: "item" });
            const itemText = "Apertura de cuenta";

            newRecord.setCurrentSublistText({ sublistId: "item", fieldId: "item", text: itemText }); // newRecord.setCurrentSublistValue({ sublistId: "item", fieldId: "quantity", value: 1 });
            // newRecord.setCurrentSublistValue({ sublistId: "item", fieldId: "rate", value: 0 });
            newRecord.setCurrentSublistValue({ sublistId: "item", fieldId: "custcol_2win_as_identificador_fila", value: 0 });

            newRecord.commitLine({ sublistId: "item" });

            const newId = newRecord.save({ ignoreMandatoryFields: true });
            nLog.audit("SalesOrderDAO", `OV creada: ${newId}`);
            return newId;
        } catch (e) {
            nLog.error("SalesOrderDAO Error", e);
            throw e;
        }
    }

    /**
     * Obtiene los campos HL7 y adicionales de una orden de venta
     * @param {number} customerId - ID del cliente
     * @param {number} subsidiary - ID de la subsidiaria
     * @param {string} cuentaPaciente - Número de cuenta del paciente
     * @returns {Object|null} - Objeto con los campos de la orden de venta o null si no se encuentra
     */
    function getSalesOrderFields(customerId, subsidiary, cuentaPaciente) {
        try {
            // Verificar caché primero - optimización
            const cacheKey = `${customerId}_${subsidiary}_${cuentaPaciente}`;
            if (soFieldsCache[cacheKey]) {
                return soFieldsCache[cacheKey];
            }

            const salesOrderId = findOpenOrder(customerId, subsidiary, cuentaPaciente);

            if (!salesOrderId) {
                nLog.debug("SalesOrderDAO - getSalesOrderFields", "No se encontró orden de venta");
                return null;
            }

            const salesOrderFields = search.lookupFields({
                type: search.Type.SALES_ORDER,
                id: salesOrderId,
                columns: [
                    // Campos HL7
                    "custbody_2win_ing_correl",
                    "custbody_2win_pac_numficha",
                    "custbody_2win_nro_cuenta_paciente",
                    "custbody_2win_tipo_evento_hl7",
                    // "custbody_2win_fecha_evento_hl7",
                    "custbody_2win_id_mensaje_hl7",
                    // Campos de atención
                    // "custbody_2win_fecha_ingreso",
                    // "custbody_2win_hora_ingreso",
                    "custbody_2win_tiene_reclamo",
                    "custbody_2win_tiene_seguro",
                    // Campos de servicio
                    "custbody_2win_servicio_ingreso",
                    "custbody_2win_servicio_ingreso_nom",
                    "custbody_2win_procedencia",
                    "custbody_2win_ley_previsional",
                    "custbody_2win_compania_seguro",
                    // Campos previsionales
                    "custbody_2win_prevision_nom",
                    "custbody_2win_prevision_cod",
                    "custbody_2win_tramo_fonasa",
                    "custbody_2win_rama_ffaa",
                    "custbody_2win_convenio_cod",
                    "custbody_2win_convenio_nom",
                    "custbody_2win_paquete_atencion_cod",
                    "custbody_2win_paquete_atencion_nom",
                    // Responsable
                    "custbody_2win_responsable_cuenta_cod",
                    "custbody_2win_responsable_cuenta_nom",
                    // Campos estándar
                    "class",
                    "department"
                ]
            });
            // salesOrderFields.custbody_2win_fecha_evento_hl7 = format.format({ type: format.Type.DATE, value: salesOrderFields.custbody_2win_fecha_evento_hl7 });
            // salesOrderFields.custbody_2win_fecha_ingreso = format.format({ type: format.Type.DATE, value: salesOrderFields.custbody_2win_fecha_ingreso });
            // salesOrderFields.custbody_2win_fecha_ingreso = format.format({ type: format.Type.TIME, value: salesOrderFields.custbody_2win_hora_ingreso });
            nLog.debug("SalesOrderDAO - getSalesOrderFields", `Campos obtenidos de OV: ${salesOrderId}`);
            
            // Guardar en caché
            soFieldsCache[cacheKey] = salesOrderFields;
            
            return salesOrderFields;
        } catch (error) {
            nLog.error("SalesOrderDAO - getSalesOrderFields Error", error);
            return null;
        }
    }

    return {
        findOpenOrder: findOpenOrder,
        createOrder: createOrder,
        getSalesOrderFields: getSalesOrderFields
    };
});
