define([
    "N/record",
    "N/runtime",
    "N/search",
    "N/query",
    "N/log",
    "./2win_dao",
    "./2win_dao_cliente",
    "./2win_dao_convenio",
    "./2win_dao_departamento",
    "./2win_dao_impuesto",
    "./2win_dao_ingresos",
    "./2win_dao_producto",
    "./2win_dao_subsidiaria",
    "./2win_dao_tipo_atencion",
    "../domain/2win_dom_evento",
    "../lib/2win_lib_mapeo",
    "../lib/2win_lib_peticion"
], function (
    record,
    runtime,
    search,
    query,
    nLog,
    dao,
    daoCliente,
    daoConvenio,
    daoDepartamento,
    daoImpuesto,
    daoIngresos,
    daoProducto,
    daoSubsidiaria,
    daoTipoAtencion,
    { EventService, ExternalEventServiceAdapter, NivelEvento },
    libMapeo,
    libPeticion
) {
    /**
     *  Crea una orden de venta en NetSuite a partir de un contexto dado.
     *  Utiliza el mapeo de datos para establecer los valores del registro.
     * @param {object} context - El objeto 'mappedJson' con los datos del mensaje HL7.
     * @param {boolean} isAdmition - Flag para indicar si es una admisión.
     * @param {string} entityId - El ID interno del paciente en NetSuite.
     * @returns {object} - Resultado de la operación con éxito o error.
     * @throws {Error} - Si ocurre un error durante la creación de la orden de venta.
     * @description Esta función implementa la lógica para crear una orden de venta en NetSuite.
     */
    const crear = function ({ context, isAdmition = false, entityId }) {
        try {
            const salesOrder = record.create({
                type: record.Type.SALES_ORDER,
                isDynamic: true
            });
            salesOrder.setValue("customform", 121);
            salesOrder.setValue("orderstatus", "B");
            nLog.debug("orden de venta - crear - context", JSON.stringify(context));
            nLog.debug("orden de venta - crear - isAdmition", isAdmition);
            nLog.debug("orden de venta - crear - idPaciente", entityId);

            // Extraer los segmentos del context. La estructura ahora es la de mappedJson.
            const MSH = context.MSH || {};
            const PID = context.PID || {};
            const PV1 = context.PV1 || {};
            const EVN = context.EVN || {};
            const OBX = context.OBX || {};

            // Se asume que estos segmentos mantienen una estructura de array si existen.
            const ORC = context.ORC || [];
            const RXE = context.RXE || [];
            const RXD = context.RXD || [];

            nLog.debug("orden de venta - crear - entityId", entityId);
            salesOrder.setValue({ fieldId: "entity", value: entityId });

            const prestadorTratante = formatearRut(PV1["PV1-7.1"] || "");
            nLog.debug("orden de venta - crear - subsidiaryRUT", prestadorTratante);
            let idSubsidiaria = getSubsidiaria(prestadorTratante);

            if (RXE.length > 0 && RXE[0].bodegaDestino) {
                nLog.debug("orden de venta - crear - RXE[0].bodegaDestino", RXE[0].bodegaDestino);
                idSubsidiaria = getSubsidiaryByLocation(RXE[0].bodegaDestino);
            }
            nLog.debug("orden de venta - crear - subsidiaryId", idSubsidiaria);
            salesOrder.setValue({ fieldId: "subsidiary", value: idSubsidiaria });

            const nroAdmision = PV1["PV1-5.1"] || "";
            nLog.debug("orden de venta - crear - custbody_2win_ing_correl (N° de Admisión)", nroAdmision);
            salesOrder.setValue({ fieldId: "custbody_2win_ing_correl", value: nroAdmision });

            const numFicha = PV1["PV1-2.1"] || "";
            nLog.debug("orden de venta - crear - custbody_2win_pac_numficha (N° de Ficha)", numFicha);
            salesOrder.setValue({ fieldId: "custbody_2win_pac_numficha", value: numFicha });

            const nroCuentaPaciente = PV1["PV1-19.1"] || "";
            nLog.debug("orden de venta - crear - custbody_2win_nro_cuenta_paciente (N° de cuenta paciente)", nroCuentaPaciente);
            salesOrder.setValue({ fieldId: "custbody_2win_nro_cuenta_paciente", value: nroCuentaPaciente });

            nLog.debug("ExternalId", ` ${idSubsidiaria}-${nroCuentaPaciente}`);
            salesOrder.setValue({ fieldId: "externalid", value: `OV-${idSubsidiaria}-${nroCuentaPaciente}` });
            // nLog.debug("orden de venta - crear - tranid", nroCuentaPaciente);
            // salesOrder.setValue({ fieldId: "tranid", value: nroCuentaPaciente });

            const tipoEventoHL7 = EVN["EVN-1.1"] || "";
            nLog.debug("orden de venta - crear - custbody_2win_tipo_evento_hl7", tipoEventoHL7);
            salesOrder.setValue({ fieldId: "custbody_2win_tipo_evento_hl7", value: tipoEventoHL7 });

            const fechaEventoHL7 = EVN["EVN-2.1"] || null;
            nLog.debug("orden de venta - crear - custbody_2win_fecha_evento_hl7", fechaEventoHL7);
            salesOrder.setValue({ fieldId: "custbody_2win_fecha_evento_hl7", value: fechaEventoHL7 });

            const idMensajeHL7 = MSH["MSH-10.1"] || "";
            nLog.debug("orden de venta - crear - custbody_2win_id_mensaje_hl7", idMensajeHL7);
            salesOrder.setValue({ fieldId: "custbody_2win_id_mensaje_hl7", value: idMensajeHL7 });

            if (PV1["PV1-18.1"]) {
                const tipoAtencionRaw = PV1["PV1-18.1"];
                nLog.debug("orden de venta - crear - tipoAtencion (raw)", tipoAtencionRaw);
                const tipoAtencionID = getTipoAtencion(tipoAtencionRaw);
                nLog.debug("orden de venta - crear - class (ID)", tipoAtencionID);
                if (tipoAtencionID) {
                    salesOrder.setValue({ fieldId: "class", value: tipoAtencionID });
                }
            }
            salesOrder.setValue({ fieldId: "custbody_2win_fecha_ingreso", value: PV1["PV1-5.2"] || "" });
            salesOrder.setValue({ fieldId: "custbody_2win_hora_ingreso", value: PV1["PV1-5.3"] || "" });
            const tieneReclamo = PV1["PV1-20.1"] === "S";
            nLog.debug("orden de venta - crear - custbody_2win_tiene_reclamo", tieneReclamo);
            salesOrder.setValue({ fieldId: "custbody_2win_tiene_reclamo", value: tieneReclamo });

            const tieneSeguro = PV1["PV1-20.2"] === "S";
            nLog.debug("orden de venta - crear - custbody_2win_tiene_seguro", tieneSeguro);
            salesOrder.setValue({ fieldId: "custbody_2win_tiene_seguro", value: tieneSeguro });

            const servicioIngresoCod = (PV1["PV1-3.1"] || "").trim();
            nLog.debug("orden de venta - crear - custbody_2win_servicio_ingreso", servicioIngresoCod);
            salesOrder.setValue({ fieldId: "custbody_2win_servicio_ingreso", value: servicioIngresoCod });

            const servicioIngresoNom = (PV1["PV1-3.2"] || "").trim();
            nLog.debug("orden de venta - crear - custbody_2win_servicio_ingreso_nom", servicioIngresoNom);
            salesOrder.setValue({ fieldId: "custbody_2win_servicio_ingreso_nom", value: servicioIngresoNom });
            if (servicioIngresoNom) {
                if (isNaN(servicioIngresoCod)) {
                    const departmentID = getServicioIngreso(servicioIngresoNom);
                    salesOrder.setValue({ fieldId: "department", value: departmentID || "" });
                } else {
                    salesOrder.setValue({ fieldId: "department", value: servicioIngresoCod || "" });
                }
            }
            const procedencia = PV1["PV1-3.3"] || "";
            nLog.debug("orden de venta - crear - custbody_2win_procedencia", procedencia);
            salesOrder.setValue({ fieldId: "custbody_2win_procedencia", value: procedencia });

            const leyPrevisional = PV1["PV1-3.4"] || "";
            nLog.debug("orden de venta - crear - custbody_2win_ley_previsional", leyPrevisional);
            salesOrder.setValue({ fieldId: "custbody_2win_ley_previsional", value: leyPrevisional });

            const companiaSeguro = PV1["PV1-3.5"] || "";
            nLog.debug("orden de venta - crear - custbody_2win_compania_seguro", companiaSeguro);
            salesOrder.setValue({ fieldId: "custbody_2win_compania_seguro", value: companiaSeguro });

            // salesOrder.setValue({ fieldId: "custbody_2win_prestador_tratante", value: prestadorTratante });

            // const prestadorTratanteNom = PV1["PV1-7.2"] || "";
            // nLog.debug("orden de venta - crear - custbody_2win_prestador_tratante_nom", prestadorTratanteNom);
            // salesOrder.setValue({ fieldId: "custbody_2win_prestador_tratante_nom", value: prestadorTratanteNom });

            const responsableCuentaCod = PV1["PV1-8.1"] || "";
            nLog.debug("orden de venta - crear - custbody_2win_responsable_cuenta_cod", formatearRut(responsableCuentaCod));
            salesOrder.setValue({ fieldId: "custbody_2win_responsable_cuenta_cod", value: formatearRut(responsableCuentaCod) });

            const responsableCuentaNom = PV1["PV1-8.2"] || "";
            nLog.debug("orden de venta - crear - custbody_2win_responsable_cuenta_nom", responsableCuentaNom);
            salesOrder.setValue({ fieldId: "custbody_2win_responsable_cuenta_nom", value: responsableCuentaNom });

            //-Campos Prevision
            const previsionNom = PV1["PV1-11.2"] || "";
            const previsionCod = PV1["PV1-11.1"] || "";
            salesOrder.setValue({ fieldId: "custbody_2win_prevision_nom", value: previsionNom });
            salesOrder.setValue({ fieldId: "custbody_2win_prevision_cod", value: previsionCod });

            const tramoFonasa = PV1["PV1-11.3"] || "";
            nLog.debug("orden de venta - crear - custbody_2win_tramo_fonasa", tramoFonasa);
            salesOrder.setValue({ fieldId: "custbody_2win_tramo_fonasa", value: tramoFonasa });

            const ramaFfaa = PV1["PV1-11.5"] || "";
            nLog.debug("orden de venta - crear - custbody_2win_rama_ffaa", ramaFfaa);
            salesOrder.setValue({ fieldId: "custbody_2win_rama_ffaa", value: ramaFfaa });

            const convenioCod = PV1["PV1-11.6"] || "";
            nLog.debug("orden de venta - crear - custbody_2win_convenio_cod", convenioCod);
            salesOrder.setValue({ fieldId: "custbody_2win_convenio_cod", value: convenioCod });

            const convenioNom = PV1["PV1-11.7"] || "";
            nLog.debug("orden de venta - crear - custbody_2win_convenio_nom", convenioNom);
            salesOrder.setValue({ fieldId: "custbody_2win_convenio_nom", value: convenioNom });

            const paqueteAtencionCod = PV1["PV1-11.8"] || "";
            nLog.debug("orden de venta - crear - custbody_2win_paquete_atencion_cod", paqueteAtencionCod);
            salesOrder.setValue({ fieldId: "custbody_2win_paquete_atencion_cod", value: paqueteAtencionCod });

            const paqueteAtencionNom = PV1["PV1-11.9"] || "";
            nLog.debug("orden de venta - crear - custbody_2win_paquete_atencion_nom", paqueteAtencionNom);
            salesOrder.setValue({ fieldId: "custbody_2win_paquete_atencion_nom", value: paqueteAtencionNom });

            if (ORC.length > 0) {
                const nroSolicitudFarmacia = ORC[0].numeroSolicitud;
                nLog.debug("orden de venta - crear - custbody_2win_nro_solicitud_farmacia", nroSolicitudFarmacia);
                salesOrder.setValue({ fieldId: "custbody_2win_nro_solicitud_farmacia", value: nroSolicitudFarmacia });
            }

            const listRecordGarantia = [];
            if (OBX && OBX.length > 0) {
                const tipoDocAdjunto = OBX[0]["OBX 3.2"] || "";
                nLog.debug("orden de venta - crear - custbody_2win_tipo_doc_adjunto", tipoDocAdjunto);
                salesOrder.setValue({ fieldId: "custbody_2win_tipo_doc_adjunto", value: tipoDocAdjunto });

                const folioDocAdjunto = OBX[0]["OBX 4.1"] || "";
                nLog.debug("orden de venta - crear - custbody_2win_folio_doc_adjunto", folioDocAdjunto);
                salesOrder.setValue({ fieldId: "custbody_2win_folio_doc_adjunto", value: folioDocAdjunto });
                // docuentos y garantias
                OBX.forEach((obxData) => {
                    const recordGarantia = record.create({
                        type: "customrecord_2win_garantias",
                        isDynamic: false
                    });
                    if (!obxData["OBX 3.2"]) throw Error("La garantia no esta definida o mal formateada");
                    recordGarantia.setValue("custrecord_2win_garantias_doc_type", obxData["OBX 3.2"] || "");
                    recordGarantia.setValue("custrecord_2win_garantias_folio_doc", obxData["OBX 4.1"] || "");
                    recordGarantia.setValue("custrecord_2win_garantias_rut_titular", formatearRut(obxData["OBX 7.1"]) || "");
                    recordGarantia.setValue("custrecord_2win_garantias_nombre_titular", obxData["OBX 13.1"] || "");
                    listRecordGarantia.push(recordGarantia.save());
                });
            }

            if (ORC && ORC.length > 0) {
                nLog.debug("orden de venta - crear - Procesando items de ORC. Cantidad:", ORC.length);
                ORC.forEach(function (orc, index) {
                    const rxeItem = RXE[index] || {};
                    const rxdItem = RXD[index] || {};
                    salesOrder.selectNewLine({ sublistId: "item" });

                    nLog.debug(`Sublista item - Fila ${index} - item`, rxeItem.codProducto);
                    salesOrder.setCurrentSublistValue({ sublistId: "item", fieldId: "item", value: rxeItem.codProducto });

                    nLog.debug(`Sublista item - Fila ${index} - quantity`, rxeItem.cantidad || 1);
                    salesOrder.setCurrentSublistValue({ sublistId: "item", fieldId: "quantity", value: rxeItem.cantidad || 1 });

                    nLog.debug(`Sublista item - Fila ${index} - location`, rxeItem.bodegaDestino);
                    salesOrder.setCurrentSublistValue({ sublistId: "item", fieldId: "location", value: rxeItem.bodegaDestino });

                    nLog.debug(`Sublista item - Fila ${index} - units`, rxeItem.unidadMedida);
                    salesOrder.setCurrentSublistValue({ sublistId: "item", fieldId: "units", value: rxeItem.unidadMedida });

                    nLog.debug(`Sublista item - Fila ${index} - rate`, rxdItem.precioUnitarioNeto || 0);
                    salesOrder.setCurrentSublistValue({ sublistId: "item", fieldId: "rate", value: rxdItem.precioUnitarioNeto || 0 });

                    nLog.debug(`Sublista item - Fila ${index} - amount`, rxdItem.precioVentaNeto || 0);
                    salesOrder.setCurrentSublistValue({ sublistId: "item", fieldId: "amount", value: rxdItem.precioVentaNeto || 0 });

                    nLog.debug(`Sublista item - Fila ${index} - custcol_2win_as_codigo_servicio`, rxeItem.servicioSolicitante);
                    salesOrder.setCurrentSublistValue({ sublistId: "item", fieldId: "custcol_2win_as_codigo_servicio", value: rxeItem.servicioSolicitante });

                    const identificadorFila = rxeItem.identificadorUnicoFila;
                    nLog.debug(`Sublista item - Fila ${index} - custcol_2win_as_identificador_fila`, identificadorFila);
                    salesOrder.setCurrentSublistValue({ sublistId: "item", fieldId: "custcol_2win_as_identificador_fila", value: identificadorFila });

                    salesOrder.commitLine({ sublistId: "item" });
                });
            } else if (isAdmition) {
                nLog.debug("isAdmition", "orden de venta - crear - Es Admisión, agregando línea de 'Apertura de cuenta'.");
                const orderStatus = "B";
                nLog.debug("orden de venta - crear - orderstatus", orderStatus);
                salesOrder.setValue({ fieldId: "orderstatus", value: orderStatus });

                salesOrder.selectNewLine({ sublistId: "item" });

                const itemText = "Apertura de cuenta";
                nLog.debug("Sublista item - Fila 0 - item (texto)", itemText);
                salesOrder.setCurrentSublistText({ sublistId: "item", fieldId: "item", text: itemText });

                const quantity = 1;
                nLog.debug("Sublista item - Fila 0 - quantity", quantity);
                salesOrder.setCurrentSublistValue({ sublistId: "item", fieldId: "quantity", value: quantity });

                const identificadorFila = 0;
                nLog.debug("Sublista item - Fila 0 - custcol_2win_as_identificador_fila", identificadorFila);
                salesOrder.setCurrentSublistValue({ sublistId: "item", fieldId: "custcol_2win_as_identificador_fila", value: identificadorFila });

                salesOrder.commitLine({ sublistId: "item" });
            }
            const idIngreso = daoIngresos.creaRegistro({
                cuentaPaciente: nroCuentaPaciente,
                idPaciente: entityId,
                idFichaPaciente: numFicha,
                idIngresoPaciente: nroAdmision,
                fechaIngreso: PV1["PV1-5.2"]
            });
            salesOrder.setValue("custbody_2w_as_cuenta_paciente", idIngreso);
            const recordId = salesOrder.save({ ignoreMandatoryFields: false });
            listRecordGarantia.forEach((idRecordGarantia) => {
                record.submitFields({
                    type: "customrecord_2win_garantias",
                    id: idRecordGarantia,
                    values: {
                        custrecord_2win_garantias_ref_trans: recordId
                    }
                });
            });
            nLog.debug("orden de venta - crear - Registro guardado con ID:", recordId);

            return { success: true, id: recordId };
        } catch (err) {
            nLog.error("Error en la función crear", err);
            throw err;
        }
    };

    /**
     *
     * @param {*} param0
     *
     * @returns
     */
    const editar = function ({ id, mensaje }) {
        try {
            if (!id) {
                throw new Error("El ID del registro a editar es requerido.");
            }

            // Cargar el registro de la Orden de Venta
            const salesOrder = record.load({
                type: record.Type.SALES_ORDER,
                id: id,
                isDynamic: true
            });

            // Extraer los segmentos del context. La estructura ahora es la de mappedJson.
            const MSH = mensaje.MSH || {};
            const PID = mensaje.PID || {};
            const PV1 = mensaje.PV1 || {};
            const EVN = mensaje.EVN || {};
            const OBX = mensaje.OBX || {};

            // Se asume que estos segmentos mantienen una estructura de array si existen.
            const ORC = mensaje.ORC || [];
            const RXE = mensaje.RXE || [];
            const RXD = mensaje.RXD || [];
            const listRecordGarantia = [];
            // const prestadorTratante = PV1["PV1-7.1"] || "";
            // nLog.debug("orden de venta - crear - subsidiaryRUT", prestadorTratante);
            // let idSubsidiaria = getSubsidiaria(prestadorTratante);
            // if (idSubsidiaria !== salesOrder.getValue({ fieldId: "subsidiary" })) {
            //     nLog.debug("orden de venta - editar", "La subsidiaria ha cambiado. Actualizando...");
            //     salesOrder.setValue({ fieldId: "subsidiary", value: idSubsidiaria });
            // }
            // Usa la clave del campo N° de Admisión
            salesOrder.setValue({ fieldId: "custbody_2win_ing_correl", value: PV1["PV1-5.1"] || "" });

            salesOrder.setValue({ fieldId: "custbody_2win_pac_numficha", value: PV1["PV1-2.1"] || "" });

            // Usa la clave del campo N° de cuenta paciente
            salesOrder.setValue({ fieldId: "custbody_2win_nro_cuenta_paciente", value: PV1["PV1-19.1"] || "" });
            salesOrder.setValue({ fieldId: "tranid", value: PV1["PV1-19.1"] || "" });

            salesOrder.setValue({ fieldId: "custbody_2win_tipo_evento_hl7", value: EVN["EVN-1.1"] || "" });

            salesOrder.setValue({ fieldId: "custbody_2win_fecha_evento_hl7", value: EVN["EVN-2.1"] || null });

            salesOrder.setValue({ fieldId: "custbody_2win_id_mensaje_hl7", value: MSH["MSH-10.1"] || "" });

            if (PV1["PV1-18.1"]) {
                // Tipo Atención (A, H)
                nLog.debug("orden de venta - crear - tipoAtencion", PV1["PV1-18.1"]);
                const tipoAtencionID = getTipoAtencion(PV1["PV1-18.1"]);
                if (tipoAtencionID) {
                    salesOrder.setValue({ fieldId: "class", value: tipoAtencionID });
                }
            }
            //-Campos Prevision
            const previsionNom = PV1["PV1-11.2"] || "";
            const previsionCod = PV1["PV1-11.1"] || "";
            salesOrder.setValue({ fieldId: "custbody_2win_prevision_nom", value: previsionNom });
            salesOrder.setValue({ fieldId: "custbody_2win_prevision_cod", value: previsionCod });
            salesOrder.setValue({ fieldId: "custbody_2win_tiene_reclamo", value: PV1["PV1-20.1"] === "S" ? true : false });
            salesOrder.setValue({ fieldId: "custbody_2win_tiene_seguro", value: PV1["PV1-20.2"] === "S" ? true : false });
            salesOrder.setValue({ fieldId: "custbody_2win_servicio_ingreso", value: PV1["PV1-3.1"] || "" });
            salesOrder.setValue({ fieldId: "custbody_2win_servicio_ingreso_nom", value: PV1["PV1-3.2"] || "" });
            salesOrder.setValue({ fieldId: "custbody_2win_fecha_ingreso", value: PV1["PV1-5.2"] || "" });
            salesOrder.setValue({ fieldId: "custbody_2win_hora_ingreso", value: PV1["PV1-5.3"] || "" });

            salesOrder.setValue({ fieldId: "custbody_2win_procedencia", value: PV1["PV1-3.3"] || "" });
            salesOrder.setValue({ fieldId: "custbody_2win_ley_previsional", value: PV1["PV1-3.4"] || "" });
            salesOrder.setValue({ fieldId: "custbody_2win_compania_seguro", value: PV1["PV1-3.5"] || "" });

            salesOrder.setValue({ fieldId: "custbody_2win_prestador_tratante", value: PV1["PV1-7.1"] || "" });

            salesOrder.setValue({ fieldId: "custbody_2win_prestador_tratante_nom", value: PV1["PV1-7.2"] || "" });
            const responsableCuentaCod = PV1["PV1-8.1"] || "";
            salesOrder.setValue({ fieldId: "custbody_2win_responsable_cuenta_cod", value: formatearRut(responsableCuentaCod) || "" });
            salesOrder.setValue({ fieldId: "custbody_2win_responsable_cuenta_nom", value: PV1["PV1-8.2"] || "" });
            salesOrder.setValue({ fieldId: "custbody_2win_tramo_fonasa", value: PV1["PV1-11.3"] || "" });
            salesOrder.setValue({ fieldId: "custbody_2win_rama_ffaa", value: PV1["PV1-11.5"] || "" });
            salesOrder.setValue({ fieldId: "custbody_2win_convenio_cod", value: PV1["PV1-11.6"] || "" });
            salesOrder.setValue({ fieldId: "custbody_2win_convenio_nom", value: PV1["PV1-11.7"] || "" });
            salesOrder.setValue({ fieldId: "custbody_2win_paquete_atencion_cod", value: PV1["PV1-11.8"] || "" });
            salesOrder.setValue({ fieldId: "custbody_2win_paquete_atencion_nom", value: PV1["PV1-11.9"] || "" });

            // Mapeo de campos OBX (documentos adjuntos)
            salesOrder.setValue({ fieldId: "custbody_2win_tipo_doc_adjunto", value: OBX["OBX 3.2"] || "" });
            salesOrder.setValue({ fieldId: "custbody_2win_folio_doc_adjunto", value: OBX["OBX 4.1"] || "" });

            // Mapeo de campos ORC (información de farmacia)
            if (ORC.length > 0) {
                salesOrder.setValue({ fieldId: "custbody_2win_nro_solicitud_farmacia", value: ORC[0].numeroSolicitud || "" }); // Asume una estructura para ORC
            }

            if (ORC && ORC.length > 0) {
                ORC.forEach(function (orc, index) {
                    const rxeItem = RXE[index] || {};
                    const rxdItem = RXD[index] || {};

                    if (!rxeItem.codProducto) return; // No agregar línea si no hay producto

                    salesOrder.selectNewLine({ sublistId: "item" });
                    salesOrder.setCurrentSublistValue({ sublistId: "item", fieldId: "item", value: rxeItem.codProducto });
                    salesOrder.setCurrentSublistValue({ sublistId: "item", fieldId: "quantity", value: rxeItem.cantidad || 1 });
                    salesOrder.setCurrentSublistValue({ sublistId: "item", fieldId: "location", value: rxeItem.bodegaDestino });
                    salesOrder.setCurrentSublistValue({ sublistId: "item", fieldId: "units", value: rxeItem.unidadMedida });
                    salesOrder.setCurrentSublistValue({ sublistId: "item", fieldId: "rate", value: rxdItem.precioUnitarioNeto || 0 });
                    salesOrder.setCurrentSublistValue({ sublistId: "item", fieldId: "amount", value: rxdItem.precioVentaNeto || 0 });
                    salesOrder.setCurrentSublistValue({ sublistId: "item", fieldId: "custcol_2win_as_codigo_servicio", value: rxeItem.servicioSolicitante });
                    salesOrder.setCurrentSublistValue({ sublistId: "item", fieldId: "custcol_2win_as_identificador_fila", value: rxdItem.identificadorUnicoFila });

                    salesOrder.commitLine({ sublistId: "item" });
                });
            }

            // Guardar el registro
            const editedRecordId = salesOrder.save({ ignoreMandatoryFields: true });

            // Eliminar garantías existentes vinculadas a la orden antes de crear nuevas
            try {
                const garantiaSearch = search.create({
                    type: "customrecord_2win_garantias",
                    filters: [["custrecord_2win_garantias_ref_trans", "anyof", id]],
                    columns: ["internalid"]
                });
                const garantiaResults = garantiaSearch.run().getRange({ start: 0, end: 1000 });
                garantiaResults.forEach((res) => {
                    const garantiaId = res.getValue("internalid");
                    record.delete({ type: "customrecord_2win_garantias", id: garantiaId });
                });
            } catch (e) {
                nLog.error("Error eliminando garantías previas", e);
            }
            if (OBX && OBX.length > 0) {
                const tipoDocAdjunto = OBX[0]["OBX 3.2"] || "";
                nLog.debug("orden de venta - crear - custbody_2win_tipo_doc_adjunto", tipoDocAdjunto);
                salesOrder.setValue({ fieldId: "custbody_2win_tipo_doc_adjunto", value: tipoDocAdjunto });

                const folioDocAdjunto = OBX[0]["OBX 4.1"] || "";
                nLog.debug("orden de venta - crear - custbody_2win_folio_doc_adjunto", folioDocAdjunto);
                salesOrder.setValue({ fieldId: "custbody_2win_folio_doc_adjunto", value: folioDocAdjunto });
                // docuentos y garantias
                OBX.forEach((obxData) => {
                    const recordGarantia = record.create({
                        type: "customrecord_2win_garantias",
                        isDynamic: false
                    });
                    if (!obxData["OBX 3.2"]) throw Error("La garantia no esta definida o mal formateada");
                    recordGarantia.setValue("custrecord_2win_garantias_doc_type", obxData["OBX 3.2"] || "");
                    recordGarantia.setValue("custrecord_2win_garantias_folio_doc", obxData["OBX 4.1"] || "");
                    recordGarantia.setValue("custrecord_2win_garantias_rut_titular", formatearRut(obxData["OBX 7.1"]) || "");
                    recordGarantia.setValue("custrecord_2win_garantias_nombre_titular", obxData["OBX 13.1"] || "");
                    listRecordGarantia.push(recordGarantia.save());
                });
            }
            // Vincular nuevas garantías creadas a la orden editada
            if (listRecordGarantia && listRecordGarantia.length > 0) {
                listRecordGarantia.forEach((garId) => {
                    record.submitFields({
                        type: "customrecord_2win_garantias",
                        id: garId,
                        values: {
                            custrecord_2win_garantias_ref_trans: editedRecordId
                        }
                    });
                });
            }

            nLog.audit("Edición Exitosa", `Sales Order ID: ${editedRecordId} actualizado con datos HL7.`);

            return { success: true, id: editedRecordId, mensaje: mensaje };
        } catch (err) {
            nLog.error({ title: "Error al Editar Registro con HL7", details: err });
            // Re-lanzar el error para que el framework de NetSuite lo maneje
            throw err;
        }
    };
    /**
     * @function getServicioIngreso - Obtener el ID del servicio de ingreso a partir de su nombre.
     * @param {string} servicioIngreso - Nombre del servicio de ingreso a buscar
     * @returns {number|null} - Internal ID del servicio de ingreso o null si no se encuentra
     */
    const getServicioIngreso = (servicioIngreso) => {
        // if (!Number(servicioIngreso)) throw Error(`Servicio de ingreso ${servicioIngreso} no encontrado en netsuite, verificar que este registrado en Netsuite`);
        // const servicioIngresoSearch = search.create({
        //     type: "department",
        //     filters: [["internalid", "is", servicioIngreso]],
        //     columns: ["internalid"]
        // });
        // const result = servicioIngresoSearch.run().getRange({ start: 0, end: 1 });
        // return result.length > 0 ? result[0].getValue("internalid") : null;
        const results = query
            .runSuiteQL({
                query: `
            select top 1
                id
            from
                department
            where
                isinactive = 'F'
            and
                (
                UPPER(name) = ?
                )`,
                params: [servicioIngreso.trim().toLocaleUpperCase()]
            })
            .asMappedResults();
        return results[0]?.id;
    };
    const getSubsidiaryByLocation = (locationId) => {
        try {
            const result = query
                .runSuiteQL({
                    query: `
                SELECT 
                    Location.subsidiary as subsidiaryid
                FROM location
                WHERE 
                location.id = ?
                `,
                    params: [locationId]
                })
                .asMappedResults();
            if (result.length === 0) {
                throw new Error(`No se encontró la sucursal para la ubicación con internalid: ${locationId}`);
            }
            return result[0].subsidiaryid;
        } catch (error) {
            nLog.error("getSubsidiaryByLocation - error", error);
            throw new Error(`Error al obtener la sucursal para la ubicación con internalid ${locationId}: ${error.message}`);
        }
    };
    /**
     * @function getTipoAtencion - Obtener el ID del tipo de atención a partir de su scriptid.
     * @param {string} tipoAtencion - Tipo de atención a buscar
     * @returns {number} - Internal ID del tipo de atención
     */
    const tipoAtencionCache = {};
    const getTipoAtencion = function (tipoAtencion = "") {
        try {
            const tipoAtencionSearch = search.create({
                type: search.Type.CLASSIFICATION,
                filters: [["externalid", "is", tipoAtencion.toLocaleLowerCase()]],
                columns: ["internalid"]
            });
            if (tipoAtencionCache[tipoAtencion]) {
                return tipoAtencionCache[tipoAtencion];
            }
            const result = tipoAtencionSearch.run().getRange({ start: 0, end: 1 })[0]?.getValue("internalid");
            tipoAtencionCache[tipoAtencion] = result;
            return result;
        } catch (error) {
            nLog.error("getTipoAtencion", error);
            return null;
        }
    };
    const getConvenio = function (tipoAtencion = "") {
        try {
            const convenioSearch = search.create({
                type: "customlist_2win_prevision_convenio",
                filters: [["scriptid", "is", tipoAtencion.toLocaleLowerCase()]],
                columns: ["internalid"]
            });
            return convenioSearch.run().getRange({ start: 0, end: 1 })[0]?.getValue("internalid");
        } catch (error) {
            nLog.error("getConvenio", error);
            return null;
        }
    };
    const getSubsidiaria = (rutSubsidiaria) => {
        try {
            const subsidiaria = search.create({
                type: search.Type.SUBSIDIARY,
                filters: [["custrecord_2winrutsubsiudiaria", "is", rutSubsidiaria]],
                columns: ["internalid"]
            });
            const result = subsidiaria.run().getRange({ start: 0, end: 1 });
            return result.length > 0 ? result[0].getValue("internalid") : null;
        } catch (error) {
            nLog.error("getTratante", error);
            return null;
        }
    };

    const anular = function ({ id, parametro }) {
        try {
            if (!id) {
                throw new Error("El ID del registro a anular es requerido.");
            }

            const salesOrder = record.load({
                type: record.Type.SALES_ORDER,
                id: id,
                isDynamic: true // Requerido para modificar líneas de sublista
            });

            const itemCount = salesOrder.getLineCount({
                sublistId: "item"
            });

            nLog.debug("Anulación", `Cerrando ${itemCount} líneas en el Sales Order ID: ${id}`);

            for (let i = 0; i < itemCount; i++) {
                salesOrder.selectLine({ sublistId: "item", line: i });
                salesOrder.setCurrentSublistValue({ sublistId: "item", fieldId: "isclosed", value: true });
                salesOrder.commitLine({ sublistId: "item" });
            }

            const PV1 = parametro.PV1 || {};
            const fechaAnulacionHL7 = PV1["PV1-10.1"];

            if (fechaAnulacionHL7) {
                const fechaAnulacionJS = parseHL7Date(fechaAnulacionHL7); // Convertir fecha

                if (fechaAnulacionJS) {
                    salesOrder.setValue({
                        fieldId: "custbody_2win_fecha_anulacion",
                        value: fechaAnulacionJS
                    });
                    nLog.debug("Fecha de Anulación", `Establecida en: ${fechaAnulacionJS}`);
                }
            }

            const savedRecordId = salesOrder.save({ ignoreMandatoryFields: true });

            nLog.audit("Anulación Exitosa", `Sales Order ID: ${savedRecordId} ha sido anulado.`);

            return { success: true, id: savedRecordId };
        } catch (err) {
            nLog.error({ title: "Error al Anular Registro con HL7", details: err });
            throw err;
        }
    };
    const buscar = function (nroCuentaPaciente, esClinica) {
        try {
            nroCuentaPaciente = String(nroCuentaPaciente).trim();
            if (!nroCuentaPaciente) {
                throw new Error("Numero de cuenta es requerido para buscar la orden de venta.");
            }
            const filtros = [["type", "anyof", "SalesOrd"], "AND", ["custbody_2win_nro_cuenta_paciente", "is", nroCuentaPaciente], "AND", ["mainline", "is", "T"]];
            if (esClinica) filtros.push("AND", ["subsidiary.custrecord_2w_esclinica", "IS", "T"]);
            const salesOrderSearch = search.create({
                type: search.Type.SALES_ORDER,
                filters: filtros,
                columns: ["internalid"]
            });

            const result = salesOrderSearch.run().getRange(0, 1);

            return result[0] ? result[0].getValue("internalid") : null; // Return null if no results found
        } catch (err) {
            // Manejar errores de manera adecuada
            throw new Error(`Error al buscar la orden de venta: ${err.message}`);
        }
    };

    /**
     * @function busquedaRegistroPorCuenta - Función para realizar una busqueda en una tabla de netsuite.
     * @param {object} parametro - Parametros a usar en los filtros de la busqueda.
     * @return {?Array.<Object>} - Resultados de la busqueda.
     */
    function busquedaRegistroPorCuenta(parametro) {
        try {
            nLog.debug("busquedaRegistroPorCuenta - parametro", {
                parametro: parametro,
                tipoDato: typeof parametro
            });

            // Tipo, filtros y columnas para la busqueda
            let objSearch = {
                type: "salesorder",
                filters: [
                    ["type", "anyof", "SalesOrd"],
                    "AND",
                    ["mainline", "is", "T"],
                    "AND",
                    [
                        ["custbody_2w_as_cuenta_paciente.name", "is", parametro.custbody_2win_nro_cuenta_paciente],
                        "OR",
                        ["custbody_2win_nro_cuenta_paciente", "is", parametro.custbody_2win_nro_cuenta_paciente]
                    ]
                ],
                columns: [
                    // Campos cuerpo registro
                    search.createColumn({ name: "internalid", label: "internalid" })
                ]
            };

            // Agregar filtro subsidiaria si viene en los parametros
            if (parametro.hasOwnProperty("subsidiary") && parametro.subsidiary) {
                objSearch.filters.push("AND", ["subsidiary", "is", parametro.subsidiary]);
            }

            let filtros = `tipo: ${objSearch.type}, filtros: ${objSearch.filters}`;
            nLog.audit("busquedaRegistroPorCuenta - filtros", { filtros: objSearch.filters });

            // Ejecutar busqueda
            let result = dao.obtenerResultados(objSearch);
            nLog.audit("busquedaRegistroPorCuenta - resultados", {
                extension: result.length,
                resultado: result
            });

            // Valida que la busqueda retorne resultados
            if (result.length > 0) {
                return result;
            } else {
                return null;
            }
        } catch (error) {
            nLog.error("busquedaRegistroPorCuenta - error", error);
            throw error;
        }
    }

    /**
     *
     * @param {object} parametro - Parametros usados para filtro de busqueda
     * @returns {array} - Resultados de busqueda
     */
    function busquedaOvPorNumeroCuentaEnDiferenteSubsidiaria(parametro) {
        try {
            nLog.debug("busquedaOvPorNumeroCuentaEnDiferenteSubsidiaria - parametro", { parametro: parametro });

            // Buscar otras órdenes de venta con la misma cuenta pero diferente subsidiaria
            let objSearch = {
                type: "salesorder",
                filters: [
                    ["type", "anyof", "SalesOrd"],
                    "AND",
                    ["mainline", "is", "T"],
                    "AND",
                    ["custbody_2win_nro_cuenta_paciente", "is", parametro.nroCuentaPaciente],
                    "AND",
                    ["subsidiary", "noneof", parametro.subsidiaryActual]
                ],
                columns: [search.createColumn({ name: "internalid", label: "internalid" }), search.createColumn({ name: "subsidiary", label: "subsidiary" })]
            };
            nLog.debug("busquedaOvPorNumeroCuentaEnDiferenteSubsidiaria - filtros", { filtros: objSearch.filters });

            // Ejecutar búsqueda
            let resultados = dao.obtenerResultados(objSearch);
            nLog.audit("busquedaOvPorNumeroCuentaEnDiferenteSubsidiaria - resultados", {
                cantidad: resultados ? resultados.length : 0,
                resultados: resultados
            });

            // Si no hay resultados
            if (resultados || resultados.length > 0) {
                return resultados;
            } else {
                nLog.debug("busquedaOvPorNumeroCuentaEnDiferenteSubsidiaria", "No se encontraron OV para otras subsidiarias con la misma cuenta");
                return null;
            }
        } catch (error) {
            nLog.error("busquedaOvPorNumeroCuentaEnDiferenteSubsidiaria - error", error);
            throw error;
        }
    }

    /**
     * @function recuperarCoincidenciasDeLineas - Recuperar coincidencias de lineas en la sublista item del registro actual.
     * @param {Object} parametro
     * @returns {Array.<Object>} - Retorna coincidencias encontradas
     */
    function recuperarCoincidenciasDeLineas(parametro) {
        try {
            nLog.debug("recuperarCoincidenciasDeLineas - parametro", {
                parametro: parametro
            });

            let coincidencia = [];
            let lineCount = parametro.registro.getLineCount({ sublistId: "item" });
            nLog.debug("recuperarCoincidenciasDeLineas - lineCount", lineCount);

            // Recorrer cada linea existente en la sublista item
            for (let i = 0; i < lineCount; i++) {
                let linea = {
                    indice: i,
                    custcol_2win_as_identificador_fila: String(parametro.registro.getSublistValue({ sublistId: "item", fieldId: "custcol_2win_as_identificador_fila", line: i })),
                    item: parametro.registro.getSublistValue({ sublistId: "item", fieldId: "item", line: i }),
                    amount: parametro.registro.getSublistValue({ sublistId: "item", fieldId: "amount", line: i }),
                    taxcode: parametro.registro.getSublistValue({ sublistId: "item", fieldId: "taxcode", line: i })
                };
                // nLog.debug(`recuperarCoincidenciasDeLineas - linea - ${i}`, {
                //     linea: linea
                // });

                // Comparar valores
                if (
                    linea.custcol_2win_as_identificador_fila === parametro.custcol_2win_as_identificador_fila &&
                    linea.item === parametro.item &&
                    linea.amount === Number(parametro.amount) &&
                    linea.taxcode === parametro.taxcode
                ) {
                    coincidencia.push(linea);
                    break; // Salir del bucle si se encuentra una coincidencia
                }
            }

            nLog.audit("recuperarCoincidenciasDeLineas - coincidencia", coincidencia);
            return coincidencia;
        } catch (error) {
            nLog.error("recuperarCoincidenciasDeLineas - error", error);
            throw error;
        }
    }

    /**
     * @function formatearRut - Formatear dato a Rut
     * @param {string|number} parametro - Dato a formatear ejemplo "79123456k" o "184162865"
     * @returns {string} - Rut formateado ejemplo "79123456-K" o "18416286-5"
     */
    function formatearRut(parametro) {
        try {
            

            // Normalizar a string, eliminar espacios y caracteres no alfanuméricos
            const normalizado = String(parametro).trim();
            const alfaNumerico = normalizado.replace(/[^0-9A-Za-z]/g, "");
            if (alfaNumerico.length < 2) return alfaNumerico; // no hay cuerpo + digito verificador

            // Separar cuerpo y (último carácter)
            const body = alfaNumerico.slice(0, -1);
            let digitoVerificador = alfaNumerico.slice(-1);

            // Normalizar digito verificador
            digitoVerificador = digitoVerificador.toString().toUpperCase();

            // Agrega guion
            let formateado = `${body}-${digitoVerificador}`;

            return formateado;
        } catch (error) {
            nLog.error("formatearRut - error", error);
            throw error;
        }
    }

    /**
     * @function definirCamposRegistro - Definir campos de registro (modo estático).
     * @param {Object} parametro - Datos para los campos del registro.
     * @param {record.Record} registro - Instancia de record.Type (nuevo o existente).
     * @param {boolean} esEstatico - Indica si el registro fue cargado en modo estático.
     * @return {record.Record} - Instancia de record.Type.
     * @throws {Error} - Error al definir campos del registro.
     */
    function definirCamposRegistro(parametro, registro, esEstatico = false) {
        try {
            nLog.audit("definirCamposRegistro - parametro", {
                parametro: parametro,
                registro: registro,
                esEstatico: esEstatico
            });

            // Iterar sobre cada campo y asignar valor en el registro
            for (let campo in parametro.datos) {
                nLog.debug(`definirCamposRegistro - campo - ${campo}`, parametro.datos[campo]);

                // Validar si es sublista
                if (Array.isArray(parametro.datos[campo])) {
                    // Aislar datos sublista
                    let sublista = parametro.datos[campo];
                    nLog.debug(`definirCamposRegistro - sublista - ${campo}`, sublista);

                    // Recuperar conteo de lineas de sublista
                    let conteoLineas = registro.getLineCount({ sublistId: campo });
                    nLog.debug(`definirCamposRegistro - conteoLineas - ${campo}`, conteoLineas);

                    // Iterar sobre valores sublista
                    for (let i = 0; i < sublista.length; i++) {
                        // Aislar cada linea de sublista
                        let datosSublista = sublista[i];
                        nLog.debug("definirCamposRegistro - datosSublista", datosSublista);

                        if (esEstatico) {
                            // MODO ESTÁTICO: usar setSublistValue directamente
                            let indiceLinea = conteoLineas + i;

                            // Iterar sobre datos para linea de sublista
                            for (let key in datosSublista) {
                                // Validar si existe subregistro
                                nLog.debug(`definirCamposRegistro - key`, { key: key });
                                nLog.debug(`definirCamposRegistro - sublista - ${campo}`, datosSublista[key]);

                                if (typeof datosSublista[key] === "object" && !(datosSublista[key] instanceof Date)) {
                                    // Aislar datos subregistro
                                    let datosSubregistro = datosSublista[key];
                                    nLog.debug("definirCamposRegistro - datosSubregistro", datosSubregistro);
                                    nLog.debug("definirCamposRegistro - campo", campo);

                                    // Recuperar subregistro en modo estático
                                    let subregistro = registro.getSublistSubrecord({ sublistId: campo, fieldId: key, line: indiceLinea });
                                    nLog.debug("definirCamposRegistro - subregistro", key);

                                    // Iterar sobre datos subregistro
                                    for (let campoSubregistro in datosSubregistro) {
                                        // Definir campos subregistro
                                        subregistro.setValue({ fieldId: campoSubregistro, value: datosSubregistro[campoSubregistro] });
                                        nLog.debug(`definirCamposRegistro - datosSubregistro - ${campoSubregistro}`, datosSubregistro[campoSubregistro]);
                                    }
                                } else {
                                    // Definir campos sublista en modo estático
                                    registro.setSublistValue({ sublistId: campo, fieldId: key, line: indiceLinea, value: datosSublista[key] });
                                    nLog.debug(`definirCamposRegistro - sublista - ${campo} campo - ${key} linea - ${indiceLinea}`, datosSublista[key]);
                                }
                            }
                        } else {
                            // MODO DINÁMICO: comportamiento original
                            // Seleccionar nueva linea
                            let lineaRegistro = registro.selectNewLine({ sublistId: campo });
                            nLog.debug("definirCamposRegistro - linea", campo);

                            // Iterar sobre datos para linea de sublista
                            for (let key in datosSublista) {
                                // Validar si existe subregistro
                                nLog.debug(`definirCamposRegistro - key`, { key: key });
                                nLog.debug(`definirCamposRegistro - sublista - ${campo}`, datosSublista[key]);
                                if (typeof datosSublista[key] === "object" && !(datosSublista[key] instanceof Date)) {
                                    // Aislar datos subregistro
                                    let datosSubregistro = datosSublista[key];
                                    nLog.debug("definirCamposRegistro - datosSubregistro", datosSubregistro);
                                    nLog.debug("definirCamposRegistro - campo", campo);

                                    // Recuperar subregistro
                                    let subregistro = lineaRegistro.getCurrentSublistSubrecord({ sublistId: campo, fieldId: key });
                                    nLog.debug("definirCamposRegistro - subregistro", key);

                                    // Iterar sobre datos subregistro
                                    for (let campoSubregistro in datosSubregistro) {
                                        // Definir campos subregistro
                                        subregistro.setValue({ fieldId: campoSubregistro, value: datosSubregistro[campoSubregistro] });
                                        nLog.debug(`definirCamposRegistro - datosSubregistro - ${campoSubregistro}`, datosSubregistro[campoSubregistro]);
                                    }
                                } else {
                                    // Definir campos sublista
                                    lineaRegistro.setCurrentSublistValue({ sublistId: campo, fieldId: key, value: datosSublista[key] });
                                    nLog.debug(`definirCamposRegistro - sublista - ${campo} campo - ${key}`, datosSublista[key]);
                                }
                            }

                            // Guardar linea
                            lineaRegistro.commitLine({ sublistId: campo });
                            nLog.debug("definirCamposRegistro - lineaRegistro", campo);
                        }
                    }
                } else {
                    // Definir campos de cuerpo
                    registro.setValue({ fieldId: campo, value: parametro.datos[campo], ignoreFieldChange: true });
                    nLog.debug(`definirCamposRegistro - ${campo}`, parametro.datos[campo]);
                }
            }

            return registro;
        } catch (error) {
            nLog.error("definirCamposRegistro - error", error);
            throw error;
        }
    }

    /**
     * @function agregarLineaRegistro - Agregar linea a registro existente.
     * @param {object} linea - Objeto con datos para campos de linea.
     * @param {record.Record} registro - Objeto de registro
     * @param {object} cacheImpuestos - Cache con IDs de impuestos (afecto, exento)
     * @param {Map} lineasExistentes - Map de líneas existentes para validación O(1)
     * @returns {object} - Datos generados en la ejecucion.
     */
    function agregarLineaRegistro(linea, registro, cacheImpuestos, lineasExistentes) {
        try {
            // Variable para almacenar linea
            let parametro = {
                datos: {
                    item: []
                }
            };

            // Definir objeto con campos base para linea
            let camposBaseLinea = {
                custcol_2win_as_identificador_fila: linea.custcol_2win_as_identificador_fila,
                item: linea.item,
                custcol_2win_as_rut_financiador: linea.custcol_2win_as_rut_financiador,
                custcol_2win_as_codigo_convenio: linea.custcol_2win_as_codigo_convenio,
                custcol_2win_as_nombre_convenio: linea.custcol_2win_as_nombre_convenio,
                custcol_2win_as_codigo_paquete: linea.custcol_2win_as_codigo_paquete,
                custcol_2win_as_nombre_paquete: linea.custcol_2win_as_nombre_paquete,
                custcol_2win_as_codigo_servicio: linea.custcol_2win_as_codigo_servicio
            };

            // Caso especial: Ambos montos son 0 - crear una sola línea afecta
            if (linea.hasOwnProperty("MontoAfecto") && linea.hasOwnProperty("MontoExento") && Number(linea.MontoAfecto) === 0 && Number(linea.MontoExento) === 0) {
                let camposLineaCero = {
                    ...camposBaseLinea,
                    amount: 0,
                    taxcode: cacheImpuestos.afecto,
                    tax1amt: 0
                };
                parametro.datos.item.push(camposLineaCero);
            } else {
                if (linea.hasOwnProperty("MontoAfecto") && linea?.MontoAfecto > 0) {
                    let camposLineaAfecta = {
                        ...camposBaseLinea,
                        amount: Number(linea.MontoAfecto), // Usar MontoAfecto para valor
                        taxcode: cacheImpuestos.afecto,
                        tax1amt: linea.Iva || 0
                    };
                    parametro.datos.item.push(camposLineaAfecta);
                }

                if (linea.hasOwnProperty("MontoExento") && linea?.MontoExento > 0) {
                    let camposLineaExenta = {
                        ...camposBaseLinea,
                        amount: Number(linea.MontoExento),
                        taxcode: cacheImpuestos.exento
                    };
                    parametro.datos.item.push(camposLineaExenta);
                }
            }

            // Validar que la linea no este duplicada en la transaccion usando el Map (O(1))
            const identificadorFila = String(linea.custcol_2win_as_identificador_fila);
            const existente = lineasExistentes.get(identificadorFila);

            if (existente) {
                // Verificar si coincide con todos los campos relevantes
                const taxCodeLinea = linea.MontoAfecto > 0 ? cacheImpuestos.afecto : cacheImpuestos.exento;
                if (existente.item === linea.item && existente.amount === Number(linea.MontoAfecto || linea.MontoExento) && existente.taxcode === taxCodeLinea) {
                    throw new Error(`Linea con CrgCorrel: ${identificadorFila} ya existe en la transaccion: ${registro.id}`);
                }
            }

            // Definir campos de registro
            registro = definirCamposRegistro(parametro, registro);

            // Marcar como procesado
            linea.procesado = true;
            return linea;
        } catch (error) {
            nLog.error("agregarLineaRegistro - error", error);

            // Marcar como no procesado y agregar detalle de error
            linea.procesado = false;
            linea.error = error.message;
            return linea;
        }
    }

    /**
     * @function eliminarLineaPorActualizar - Eliminar una linea de un registro existente.
     * @param {object} linea - Datos de la linea.
     * @param {record.Record} registro - Instancia de record.Type (existente).
     * @return {Object} - Datos generados en la ejecucion.
     */
    function eliminarLineaPorActualizar(linea, registro) {
        try {
            nLog.audit("eliminarLineaPorActualizar - parametros", {
                linea: linea,
                registro: registro
            });

            // Recuperar conteo de lineas
            let lineCount = registro.getLineCount({ sublistId: "item" });
            nLog.debug("eliminarLineaPorActualizar - lineCount", lineCount);

            // Variable para contabilizar el numero de lineas eliminadas
            let eliminadas = 0;

            // Iterar de la ultima linea a la primera
            for (let i = lineCount - 1; i >= 0; i--) {
                // Recuperar valor de campo custcol_2win_as_identificador_fila de linea actual
                let custcol_2win_as_identificador_fila = registro.getSublistValue({
                    sublistId: "item",
                    fieldId: "custcol_2win_as_identificador_fila",
                    line: i
                });

                // Validar si los identificadores coinciden
                if (linea.custcol_2win_as_identificador_fila === String(custcol_2win_as_identificador_fila)) {
                    // Eliminar linea
                    registro.removeLine({ sublistId: "item", line: i }); // ,ignoreRecalc: true
                    eliminadas += 1;
                    nLog.debug("eliminarLineaPorActualizar - eliminada", {
                        custcol_2win_as_identificador_fila: linea.custcol_2win_as_identificador_fila,
                        linea: i
                    });
                }
            }

            // Validar si se elimino linea
            nLog.debug("eliminarLineaPorActualizar - eliminadas", { eliminadas: eliminadas });
            if (eliminadas > 2) {
                throw new Error(`Linea con CrgCorrel: ${linea.custcol_2win_as_identificador_fila} fue eliminada: ${eliminadas} veces de la transaccion: ${registro.id}`);
            }

            linea.procesado = true;
            nLog.debug("eliminarLineaPorActualizar - linea", { linea: linea });
            return linea;
        } catch (error) {
            nLog.error("eliminarLineaPorActualizar - error", error);

            // Marcar como no procesado y agreagar detalle de error
            linea.procesado = false;
            linea.error = error.message;
            nLog.debug("eliminarLineaPorActualizar - linea", { linea: linea });
            return linea;
        }
    }

    /**
     * @function formatearFecha
     * @param {string} parametro - Dato "AAAA-MM-DD" a formatear
     * @returns {Date} fecha formateada para campo date de netsuite
     */
    function formatearFecha(parametro) {
        try {
            nLog.audit("formatearFecha - parametro", {
                paraemtro: parametro
            });

            let partes = parametro.split("-"); // ["AAAA","MM","DD"]
            let year = parseInt(partes[0], 10);
            let month = parseInt(partes[1], 10); // 1..12
            let day = parseInt(partes[2], 10);

            // Crear Date local sin hora (medianoche local)
            let objetoFecha = new Date(year, month - 1, day);

            nLog.audit("formatearFecha - objetoFecha", {
                objetoFecha: objetoFecha
            });
            return objetoFecha;
        } catch (error) {
            nLog.error("formatearFecha - error", error);
            throw error;
        }
    }

    /**
     * @function eliminarLineasDeOtrasSubsidiarias - Eliminar líneas con el mismo identificador de fila en otras subsidiarias.
     * @param {object} parametro - Parámetros para la búsqueda y eliminación.
     * @param {string} parametro.nroCuentaPaciente - Número de cuenta del paciente.
     * @param {Array.<string>} parametro.identificadoresFila - Lista de identificadores de fila a eliminar.
     * @param {string} parametro.subsidiaryActual - ID de la subsidiaria actual (no modificar).
     * @return {void}
     * @throws {Error} - Error al eliminar líneas de otras subsidiarias.
     */
    function eliminarLineasDeOtrasSubsidiarias(parametro) {
        try {
            nLog.audit("eliminarLineasDeOtrasSubsidiarias - parametro", {
                nroCuentaPaciente: parametro.nroCuentaPaciente,
                identificadoresFila: parametro.identificadoresFila,
                subsidiaryActual: parametro.subsidiaryActual
            });

            // Validar que se proporcionaron identificadores de fila
            if (!parametro.identificadoresFila || parametro.identificadoresFila.length === 0) {
                nLog.debug("eliminarLineasDeOtrasSubsidiarias", "No hay identificadores de fila para eliminar");
                return;
            }

            // Recuperar ordenes de eventa con la misma cuenta paciente pero diferente subsidiaria
            let resultados = busquedaOvPorNumeroCuentaEnDiferenteSubsidiaria(parametro);
            nLog.audit("eliminarLineasDeOtrasSubsidiarias - resultados", {
                cantidad: resultados ? resultados.length : 0,
                resultados: resultados
            });

            // Si no hay resultados, no hay lineas por eliminar
            if (!resultados || resultados.length === 0) {
                nLog.debug("eliminarLineasDeOtrasSubsidiarias", "No se encontraron OV para otras subsidiarias con la misma cuenta");
                return;
            }

            // Procesar cada orden de venta encontrada
            for (let i = 0; i < resultados.length; i++) {
                let idOrdenVenta = resultados[i].internalid;
                let idSubsidiaria = resultados[i].subsidiary;
                nLog.debug(`eliminarLineasDeOtrasSubsidiarias - procesando OV ${i}`, {
                    idOrdenVenta: idOrdenVenta,
                    idSubsidiaria: idSubsidiaria
                });

                try {
                    // Cargar la orden de venta
                    let registro = record.load({ type: record.Type.SALES_ORDER, id: idOrdenVenta, isDynamic: true });

                    // Contador de lineas eliminadas
                    let lineasEliminadas = 0;

                    // Eliminar solo lineas que coincidan con los identificadores
                    for (let j = 0; j < parametro.identificadoresFila.length; j++) {
                        let identificadorFila = parametro.identificadoresFila[j];
                        nLog.debug(`eliminarLineasDeOtrasSubsidiarias - eliminando linea ${j}`, {
                            identificadorFila: identificadorFila,
                            idOrdenVenta: idOrdenVenta
                        });

                        let resultado = eliminarLineaPorActualizar({ custcol_2win_as_identificador_fila: identificadorFila }, registro);

                        // Validar si linea fue eliminada para sumar al conteo
                        if (resultado.procesado) {
                            lineasEliminadas++;
                        }
                    }

                    // Guardar cambios solo si se eliminaron líneas
                    if (lineasEliminadas > 0) {
                        let idGuardado = registro.save({ enableSourcing: true, ignoreMandatoryFields: true });
                        nLog.audit("eliminarLineasDeOtrasSubsidiarias - lineas eliminadas", {
                            idOrdenVenta: idOrdenVenta,
                            idSubsidiaria: idSubsidiaria,
                            idGuardado: idGuardado,
                            lineasEliminadas: lineasEliminadas
                        });
                    } else {
                        nLog.debug("eliminarLineasDeOtrasSubsidiarias", "No se eliminaron líneas en esta orden");
                    }
                } catch (error) {
                    // Registrar error pero continuar con las demás órdenes
                    nLog.error(`eliminarLineasDeOtrasSubsidiarias - error procesando OV ${idOrdenVenta}`, error);
                }
            }
        } catch (error) {
            nLog.error("eliminarLineasDeOtrasSubsidiarias - error", error);
            throw error;
        }
    }

    /**
     * @function agregarLineasRegistro - Editar registro existente usando record estático para mejor rendimiento.
     * @param {object} parametro - Datos para los campos del registro.
     * @return {object} - Datos generados en la ejecucion.
     */
    function agregarLineasRegistro(parametro) {
        try {
            nLog.audit("agregarLineasRegistro - parametro", {
                parametro: parametro
            });
            parametro.etapa = agregarLineasRegistro.name;

            // OPTIMIZACIÓN: Obtener IDs de impuestos UNA SOLA VEZ (antes del loop)
            const cacheImpuestos = {
                afecto: daoImpuesto.busquedaRegistroPorCodigo("IVA Afecto")[0]?.internalid,
                exento: daoImpuesto.busquedaRegistroPorCodigo("IVA Exento")[0]?.internalid
            };

            // Objeto que almacenara campos del registro
            let camposRegistro = {};

            // Validar mapeo de campos antes de asignar valor
            if (parametro.datos.custbody_2win_as_fecha_alta) {
                camposRegistro.custbody_2win_as_fecha_alta = formatearFecha(parametro.datos.custbody_2win_as_fecha_alta);
            }
            if (parametro.datos.custbody_2win_as_fecha_envio) {
                camposRegistro.custbody_2win_as_fecha_envio = formatearFecha(parametro.datos.custbody_2win_as_fecha_envio);
            }
            if (parametro.datos.class) {
                camposRegistro.custbody_2win_tipo_atencion = parametro.datos.custbody_2win_tipo_atencion;
            }

            // Buscar registro ov
            parametro.idRegistroNetsuite = busquedaRegistroPorCuenta({ custbody_2win_nro_cuenta_paciente: parametro.datos.custbody_2win_nro_cuenta_paciente, subsidiary: parametro.datos.subsidiary });
            nLog.debug("agregarLineasRegistro - idRegistroNetsuite", parametro.idRegistroNetsuite);
            let registro = {};
            const MODO_ESTATICO = true; // Flag para indicar que usamos record estático

            // Validar si se encontro el registro
            if (parametro.idRegistroNetsuite && parametro.idRegistroNetsuite !== null) {
                nLog.audit("agregarLineasRegistro - registro existente", parametro.idRegistroNetsuite[0].internalid);

                // Cargar registro en modo ESTÁTICO para mejor rendimiento con muchas líneas
                registro = record.load({ type: record.Type.SALES_ORDER, id: parametro.idRegistroNetsuite[0].internalid, isDynamic: false });

                // OPTIMIZACIÓN: Batch removal - eliminar líneas existentes en una sola pasada
                const idsAEliminar = new Set(parametro.datos.item.map((i) => String(i.custcol_2win_as_identificador_fila)));
                const lineCount = registro.getLineCount({ sublistId: "item" });

                for (let i = lineCount - 1; i >= 0; i--) {
                    const idFila = String(
                        registro.getSublistValue({
                            sublistId: "item",
                            fieldId: "custcol_2win_as_identificador_fila",
                            line: i
                        })
                    );

                    if (idsAEliminar.has(idFila)) {
                        registro.removeLine({ sublistId: "item", line: i });
                    }
                }
            } else {
                nLog.audit("agregarLineasRegistro - registro no existe", "se creara transaccion nueva");

                // Buscar registro solo por numero de cuenta (sin subsidiaria)
                parametro.idRegistroNetsuite = busquedaRegistroPorCuenta({ custbody_2win_nro_cuenta_paciente: parametro.datos.custbody_2win_nro_cuenta_paciente });
                nLog.debug("agregarLineasRegistro - idRegistroNetsuite - sin subsidiary", parametro.idRegistroNetsuite);

                // Validar si se encontro el registro
                if (parametro.idRegistroNetsuite && parametro.idRegistroNetsuite !== null) {
                    nLog.debug("agregarLineasRegistro - registro existente - sin subsidiary", parametro.idRegistroNetsuite[0].internalid);

                    // Copiar registro en modo ESTÁTICO para mejor rendimiento con muchas líneas
                    registro = record.copy({ type: record.Type.SALES_ORDER, id: parametro.idRegistroNetsuite[0].internalid, isDynamic: false });
                    nLog.debug("agregarLineasRegistro - registro", registro);
                    camposRegistro.custbody_2w_as_cuenta_paciente = registro.getValue("custbody_2w_as_cuenta_paciente");
                    camposRegistro.custbody_2win_nro_cuenta_paciente = parametro.datos.custbody_2win_nro_cuenta_paciente;
                    // Ajustar campo subsidiaria
                    registro.setValue("customform", 121);
                    camposRegistro.entity = parametro.datos.entity;
                    camposRegistro.subsidiary = parametro.datos.subsidiary;
                    camposRegistro.location = "";
                    camposRegistro.orderstatus = "B"; // A - Aprovacion pendiente, B - Ejecucion de la orden pendiente
                    camposRegistro.status = "Ejecución de la orden pendiente";
                    camposRegistro.externalid = `OV-${parametro.datos.subsidiary}-${parametro.datos.custbody_2win_nro_cuenta_paciente}`; // Contruccion de externalid para evitar duplicados
                    // Eliminar lineas existentes menos la primera
                    let lineCount = registro.getLineCount({ sublistId: "item" });
                    nLog.debug("agregarLineasRegistro - lineCount", lineCount);
                    for (let i = lineCount - 1; i >= 1; i--) {
                        registro.removeLine({ sublistId: "item", line: i });
                    }
                    let conteoLineasDespues = registro.getLineCount({ sublistId: "item" });
                    nLog.debug("agregarLineasRegistro - conteoLineasDespues", conteoLineasDespues);
                } else {
                    throw new Error(`No se encontraron datos de orden de venta con numero de cuenta: ${parametro.datos.custbody_2win_nro_cuenta_paciente}`);
                }
            }

            // Definir solo campos de cuerpo registro (pasar esEstatico = true)
            let camposCuerpo = { datos: camposRegistro };
            registro = definirCamposRegistro(camposCuerpo, registro, MODO_ESTATICO);
            nLog.debug("agregarLineasRegistro - items", {
                extension: parametro.datos.item.length,
                items: parametro.datos.item
            });

            // OPTIMIZACIÓN: Crear Map de líneas existentes para validación O(1)
            const lineasExistentes = new Map();
            let lineCount = registro.getLineCount({ sublistId: "item" });

            for (let i = 0; i < lineCount; i++) {
                const idFila = String(
                    registro.getSublistValue({
                        sublistId: "item",
                        fieldId: "custcol_2win_as_identificador_fila",
                        line: i
                    })
                );
                const item = registro.getSublistValue({ sublistId: "item", fieldId: "item", line: i });
                const amount = registro.getSublistValue({ sublistId: "item", fieldId: "amount", line: i });
                const taxcode = registro.getSublistValue({ sublistId: "item", fieldId: "taxcode", line: i });

                lineasExistentes.set(idFila, { item, amount, taxcode, line: i });
            }

            // Agregar lineas a registro usando modo estático
            for (let i = 0; i < parametro.datos.item.length; i++) {
                // Agregar linea a registro pasando cache, Map y flag esEstatico
                parametro.datos.item[i] = agregarLineaRegistroEstatico(parametro.datos.item[i], registro, cacheImpuestos, lineasExistentes, MODO_ESTATICO);
            }

            // Guardar registro
            let idRegistro = registro.save({ enableSourcing: true, ignoreMandatoryFields: true });
            nLog.audit("agregarLineasRegistro - idRegistro", idRegistro);
            parametro.tipoRegistroCreado = registro.type;
            parametro.idRegistroCreado = String(idRegistro);

            // Eliminar líneas con mismo identificador de otras subsidiarias para el mismo número de cuenta
            try {
                // Extraer y agrupar los identificadores de fila de las líneas agregadas
                let identificadoresFila = [];
                for (let i = 0; i < parametro.datos.item.length; i++) {
                    if (parametro.datos.item[i].custcol_2win_as_identificador_fila) {
                        identificadoresFila.push(String(parametro.datos.item[i].custcol_2win_as_identificador_fila));
                    }
                }
                nLog.debug("agregarLineasRegistro - eliminando líneas de otras subsidiarias", {
                    identificadoresFila: identificadoresFila,
                    nroCuenta: parametro.datos.custbody_2win_nro_cuenta_paciente,
                    subsidiaryActual: parametro.datos.subsidiary
                });

                // Eliminar líneas que fueron movidas a otras subsidiarias
                eliminarLineasDeOtrasSubsidiarias({
                    nroCuentaPaciente: parametro.datos.custbody_2win_nro_cuenta_paciente,
                    identificadoresFila: identificadoresFila,
                    subsidiaryActual: parametro.datos.subsidiary
                });
            } catch (error) {
                // Registrar error pero no interrumpir el flujo principal
                nLog.error("agregarLineasRegistro - error eliminar lineas movidas a otras subsidiarias", error);
            }

            return parametro;
        } catch (error) {
            nLog.error("agregarLineasRegistro - error", error);
            throw error;
        }
    }

    /**
     * @function agregarLineaRegistroEstatico - Agregar linea a registro existente usando modo estático.
     * @param {object} linea - Objeto con datos para campos de linea.
     * @param {record.Record} registro - Objeto de registro en modo estático.
     * @param {object} cacheImpuestos - Cache con IDs de impuestos (afecto, exento).
     * @param {Map} lineasExistentes - Map de líneas existentes para validación O(1).
     * @param {boolean} esEstatico - Indica si el registro está en modo estático.
     * @returns {object} - Datos generados en la ejecucion.
     */
    function agregarLineaRegistroEstatico(linea, registro, cacheImpuestos, lineasExistentes, esEstatico = true) {
        try {
            // Validar que la linea no este duplicada en la transaccion usando el Map (O(1))
            const identificadorFila = String(linea.custcol_2win_as_identificador_fila);
            const existente = lineasExistentes.get(identificadorFila);

            if (existente) {
                // Verificar si coincide con todos los campos relevantes
                const taxCodeLinea = linea.MontoAfecto > 0 ? cacheImpuestos.afecto : cacheImpuestos.exento;
                if (existente.item === linea.item && existente.amount === Number(linea.MontoAfecto || linea.MontoExento) && existente.taxcode === taxCodeLinea) {
                    throw new Error(`Linea con CrgCorrel: ${identificadorFila} ya existe en la transaccion: ${registro.id}`);
                }
            }

            // Obtener el índice de la nueva línea
            let lineCount = registro.getLineCount({ sublistId: "item" });

            // Definir objeto con campos base para linea
            let camposBaseLinea = {
                custcol_2win_as_identificador_fila: linea.custcol_2win_as_identificador_fila,
                item: linea.item,
                custcol_2win_as_rut_financiador: linea.custcol_2win_as_rut_financiador,
                custcol_2win_as_codigo_convenio: linea.custcol_2win_as_codigo_convenio,
                custcol_2win_as_nombre_convenio: linea.custcol_2win_as_nombre_convenio,
                custcol_2win_as_codigo_paquete: linea.custcol_2win_as_codigo_paquete,
                custcol_2win_as_nombre_paquete: linea.custcol_2win_as_nombre_paquete,
                custcol_2win_as_codigo_servicio: linea.custcol_2win_as_codigo_servicio
            };

            // Caso especial: Ambos montos son 0 - crear una sola línea afecta
            if (linea.hasOwnProperty("MontoAfecto") && linea.hasOwnProperty("MontoExento") && Number(linea.MontoAfecto) === 0 && Number(linea.MontoExento) === 0) {
                // Establecer campos en modo estático
                registro.setSublistValue({ sublistId: "item", fieldId: "item", line: lineCount, value: camposBaseLinea.item });
                registro.setSublistValue({ sublistId: "item", fieldId: "amount", line: lineCount, value: 0 });
                registro.setSublistValue({ sublistId: "item", fieldId: "taxcode", line: lineCount, value: cacheImpuestos.afecto });
                registro.setSublistValue({ sublistId: "item", fieldId: "tax1amt", line: lineCount, value: 0 });

                // Establecer campos personalizados
                if (camposBaseLinea.custcol_2win_as_identificador_fila) {
                    registro.setSublistValue({ sublistId: "item", fieldId: "custcol_2win_as_identificador_fila", line: lineCount, value: camposBaseLinea.custcol_2win_as_identificador_fila });
                }
                if (camposBaseLinea.custcol_2win_as_rut_financiador) {
                    registro.setSublistValue({ sublistId: "item", fieldId: "custcol_2win_as_rut_financiador", line: lineCount, value: camposBaseLinea.custcol_2win_as_rut_financiador });
                }
                if (camposBaseLinea.custcol_2win_as_codigo_convenio) {
                    registro.setSublistValue({ sublistId: "item", fieldId: "custcol_2win_as_codigo_convenio", line: lineCount, value: camposBaseLinea.custcol_2win_as_codigo_convenio });
                }
                if (camposBaseLinea.custcol_2win_as_nombre_convenio) {
                    registro.setSublistValue({ sublistId: "item", fieldId: "custcol_2win_as_nombre_convenio", line: lineCount, value: camposBaseLinea.custcol_2win_as_nombre_convenio });
                }
                if (camposBaseLinea.custcol_2win_as_codigo_paquete) {
                    registro.setSublistValue({ sublistId: "item", fieldId: "custcol_2win_as_codigo_paquete", line: lineCount, value: camposBaseLinea.custcol_2win_as_codigo_paquete });
                }
                if (camposBaseLinea.custcol_2win_as_nombre_paquete) {
                    registro.setSublistValue({ sublistId: "item", fieldId: "custcol_2win_as_nombre_paquete", line: lineCount, value: camposBaseLinea.custcol_2win_as_nombre_paquete });
                }
                if (camposBaseLinea.custcol_2win_as_codigo_servicio) {
                    registro.setSublistValue({ sublistId: "item", fieldId: "custcol_2win_as_codigo_servicio", line: lineCount, value: camposBaseLinea.custcol_2win_as_codigo_servicio });
                }
            } else {
                // Línea afecta
                if (linea.hasOwnProperty("MontoAfecto") && linea?.MontoAfecto > 0) {
                    registro.setSublistValue({ sublistId: "item", fieldId: "item", line: lineCount, value: camposBaseLinea.item });
                    registro.setSublistValue({ sublistId: "item", fieldId: "amount", line: lineCount, value: Number(linea.MontoAfecto) });
                    registro.setSublistValue({ sublistId: "item", fieldId: "taxcode", line: lineCount, value: cacheImpuestos.afecto });
                    registro.setSublistValue({ sublistId: "item", fieldId: "tax1amt", line: lineCount, value: linea.Iva || 0 });

                    // Establecer campos personalizados
                    if (camposBaseLinea.custcol_2win_as_identificador_fila) {
                        registro.setSublistValue({ sublistId: "item", fieldId: "custcol_2win_as_identificador_fila", line: lineCount, value: camposBaseLinea.custcol_2win_as_identificador_fila });
                    }
                    if (camposBaseLinea.custcol_2win_as_rut_financiador) {
                        registro.setSublistValue({ sublistId: "item", fieldId: "custcol_2win_as_rut_financiador", line: lineCount, value: camposBaseLinea.custcol_2win_as_rut_financiador });
                    }
                    if (camposBaseLinea.custcol_2win_as_codigo_convenio) {
                        registro.setSublistValue({ sublistId: "item", fieldId: "custcol_2win_as_codigo_convenio", line: lineCount, value: camposBaseLinea.custcol_2win_as_codigo_convenio });
                    }
                    if (camposBaseLinea.custcol_2win_as_nombre_convenio) {
                        registro.setSublistValue({ sublistId: "item", fieldId: "custcol_2win_as_nombre_convenio", line: lineCount, value: camposBaseLinea.custcol_2win_as_nombre_convenio });
                    }
                    if (camposBaseLinea.custcol_2win_as_codigo_paquete) {
                        registro.setSublistValue({ sublistId: "item", fieldId: "custcol_2win_as_codigo_paquete", line: lineCount, value: camposBaseLinea.custcol_2win_as_codigo_paquete });
                    }
                    if (camposBaseLinea.custcol_2win_as_nombre_paquete) {
                        registro.setSublistValue({ sublistId: "item", fieldId: "custcol_2win_as_nombre_paquete", line: lineCount, value: camposBaseLinea.custcol_2win_as_nombre_paquete });
                    }
                    if (camposBaseLinea.custcol_2win_as_codigo_servicio) {
                        registro.setSublistValue({ sublistId: "item", fieldId: "custcol_2win_as_codigo_servicio", line: lineCount, value: camposBaseLinea.custcol_2win_as_codigo_servicio });
                    }

                    lineCount++; // Incrementar para la siguiente línea
                }

                // Línea exenta
                if (linea.hasOwnProperty("MontoExento") && linea?.MontoExento > 0) {
                    registro.setSublistValue({ sublistId: "item", fieldId: "item", line: lineCount, value: camposBaseLinea.item });
                    registro.setSublistValue({ sublistId: "item", fieldId: "amount", line: lineCount, value: Number(linea.MontoExento) });
                    registro.setSublistValue({ sublistId: "item", fieldId: "taxcode", line: lineCount, value: cacheImpuestos.exento });

                    // Establecer campos personalizados
                    if (camposBaseLinea.custcol_2win_as_identificador_fila) {
                        registro.setSublistValue({ sublistId: "item", fieldId: "custcol_2win_as_identificador_fila", line: lineCount, value: camposBaseLinea.custcol_2win_as_identificador_fila });
                    }
                    if (camposBaseLinea.custcol_2win_as_rut_financiador) {
                        registro.setSublistValue({ sublistId: "item", fieldId: "custcol_2win_as_rut_financiador", line: lineCount, value: camposBaseLinea.custcol_2win_as_rut_financiador });
                    }
                    if (camposBaseLinea.custcol_2win_as_codigo_convenio) {
                        registro.setSublistValue({ sublistId: "item", fieldId: "custcol_2win_as_codigo_convenio", line: lineCount, value: camposBaseLinea.custcol_2win_as_codigo_convenio });
                    }
                    if (camposBaseLinea.custcol_2win_as_nombre_convenio) {
                        registro.setSublistValue({ sublistId: "item", fieldId: "custcol_2win_as_nombre_convenio", line: lineCount, value: camposBaseLinea.custcol_2win_as_nombre_convenio });
                    }
                    if (camposBaseLinea.custcol_2win_as_codigo_paquete) {
                        registro.setSublistValue({ sublistId: "item", fieldId: "custcol_2win_as_codigo_paquete", line: lineCount, value: camposBaseLinea.custcol_2win_as_codigo_paquete });
                    }
                    if (camposBaseLinea.custcol_2win_as_nombre_paquete) {
                        registro.setSublistValue({ sublistId: "item", fieldId: "custcol_2win_as_nombre_paquete", line: lineCount, value: camposBaseLinea.custcol_2win_as_nombre_paquete });
                    }
                    if (camposBaseLinea.custcol_2win_as_codigo_servicio) {
                        registro.setSublistValue({ sublistId: "item", fieldId: "custcol_2win_as_codigo_servicio", line: lineCount, value: camposBaseLinea.custcol_2win_as_codigo_servicio });
                    }
                }
            }

            // Marcar como procesado
            linea.procesado = true;
            return linea;
        } catch (error) {
            nLog.error("agregarLineaRegistroEstatico - error", error);

            // Marcar como no procesado y agregar detalle de error
            linea.procesado = false;
            linea.error = error.message;
            return linea;
        }
    }

    /**
     * @function eliminarLinea - Eliminar una linea de un registro existente.
     * @param {object} linea - Datos para los campos del registro.
     * @param {record.Record} registro - Instancia de record.Type (existente).
     * @return {Object} - Datos generados en ejecucion.
     */
    function eliminarLinea(linea, registro) {
        try {
            nLog.audit("eliminarLinea - parametros", {
                linea: linea,
                registro: registro
            });

            // Recuperar conteo de lineas
            let lineCount = registro.getLineCount({ sublistId: "item" });
            nLog.debug("eliminarLinea - lineCount", lineCount);

            // Variable para contabilizar el numero de lineas eliminadas
            let eliminadas = 0;

            // Iterar de la ultima linea a la primera
            for (let i = lineCount - 1; i >= 0; i--) {
                // Recuperar valor de campo custcol_2win_as_identificador_fila de linea actual
                let custcol_2win_as_identificador_fila = registro.getSublistValue({
                    sublistId: "item",
                    fieldId: "custcol_2win_as_identificador_fila",
                    line: i
                });

                // Validar si el identificador coincide con el de una linea existente
                if (linea.custcol_2win_as_identificador_fila === String(custcol_2win_as_identificador_fila)) {
                    registro.removeLine({ sublistId: "item", line: i }); // ,ignoreRecalc: true
                    eliminadas += 1;
                    nLog.debug("eliminarLinea - eliminada", {
                        custcol_2win_as_identificador_fila: linea.custcol_2win_as_identificador_fila,
                        linea: i
                    });
                }
            }

            // Validar si se elimino linea
            nLog.debug("eliminarLinea - eliminadas", { eliminadas: eliminadas });
            if (eliminadas === 0) {
                throw new Error(`Linea con CrgCorrel: ${linea.custcol_2win_as_identificador_fila} no existe en la transaccion: ${registro.id}`);
            } else if (eliminadas > 2) {
                throw new Error(`Linea con CrgCorrel: ${linea.custcol_2win_as_identificador_fila} fue eliminada: ${eliminadas} veces de la transaccion: ${registro.id}`);
            }

            linea.procesado = true;
            nLog.debug("eliminarLinea - linea", { linea: linea });
            return linea;
        } catch (error) {
            nLog.error("eliminarLinea - error", error);

            // Marcar como no procesado y agreagar detalle de error
            linea.procesado = false;
            linea.error = error.message;
            nLog.debug("eliminarLinea - linea", { linea: linea });
            return linea;
        }
    }

    /**
     * @function eliminarLineasRegistro - Editar registro existente.
     * @param {object} parametro - Datos para los campos del registro.
     * @return {object} - Datos generados en la ejecucion.
     */
    function eliminarLineasRegistro(parametro) {
        try {
            nLog.audit("eliminarLineasRegistro - parametro", {
                parametro: parametro
            });
            parametro.etapa = eliminarLineasRegistro.name;

            let camposRegistro = {};

            // Validar mapeo de campos antes de asignar valor
            if (parametro.datos.custbody_2win_as_fecha_alta) {
                camposRegistro.custbody_2win_as_fecha_alta = formatearFecha(parametro.datos.custbody_2win_as_fecha_alta);
            }
            if (parametro.datos.custbody_2win_as_fecha_envio) {
                camposRegistro.custbody_2win_as_fecha_envio = formatearFecha(parametro.datos.custbody_2win_as_fecha_envio);
            }

            // Buscar registro
            parametro.idRegistroNetsuite = busquedaRegistroPorCuenta({ custbody_2win_nro_cuenta_paciente: parametro.datos.custbody_2win_nro_cuenta_paciente, subsidiary: parametro.datos.subsidiary });
            nLog.debug("eliminarLineasRegistro - idRegistroNetsuite", parametro.idRegistroNetsuite);
            let registro = {};

            // Validar si se recupero un registro
            if (parametro.idRegistroNetsuite && parametro.idRegistroNetsuite !== null) {
                registro = record.load({ type: record.Type.SALES_ORDER, id: parametro.idRegistroNetsuite[0].internalid, isDynamic: true });
                nLog.debug("eliminarLineasRegistro - registro", registro);

                // Definir solo campos de cuerpo registro
                let camposCuerpo = { datos: camposRegistro };
                registro = definirCamposRegistro(camposCuerpo, registro);
                nLog.debug("eliminarLineasRegistro - registro - cuerpo", registro);
            } else {
                throw new Error(`No se ha encontrado transaccion para la cuenta paciente: ${parametro.datos.custbody_2win_nro_cuenta_paciente}`);
            }

            // Recorrer cada linea a eliminar
            for (let i = 0; i < parametro.datos.item.length; i++) {
                nLog.debug(`eliminarLineasRegistro - item - ${i}`, { item: parametro.datos.item[i] });
                // Eliminar linea de registro
                parametro.datos.item[i] = eliminarLinea(parametro.datos.item[i], registro);
                nLog.debug(`eliminarLineasRegistro - item - ${i}`, { item: parametro.datos.item[i] });
            }

            let idRegistro = registro.save({ enableSourcing: true, ignoreMandatoryFields: true });
            nLog.audit("eliminarLineasRegistro - idRegistro", idRegistro);
            parametro.tipoRegistroCreado = registro.type;
            parametro.idRegistroCreado = String(idRegistro);
            return parametro;
        } catch (error) {
            nLog.error("eliminarLineasRegistro - error", error);
            throw error;
        }
    }

    /**
     * @function actualizarLineasRegistro - actualizar registro existente.
     * @param {object} parametro - Datos para los campos del registro.
     * @return {object} - Datos generados en la ejecucion.
     */
    function actualizarLineasRegistro(parametro) {
        try {
            nLog.audit("actualizarLineasRegistro - parametro", {
                parametro: parametro
            });
            parametro.etapa = actualizarLineasRegistro.name;
            const {
                // identificadorUnicoPaciente,
                // numeroFicha,
                // numeroIngreso,
                cantidad,
                numeroCuentaPaciente,
                identificadorUnicoFila,
                codigoProducto,
                codigoServicio,
                codigoBodega,
                CodConvenio,
                NombreConvenio,
                RutFinanciador,
                CodPaquete,
                NombrePaquete,
                valorNeto,
                valorExento,
                valorIVA,
                valorTotal
            } = parametro.consumoMedicamentos;

            // Recorrer cada cliente
            const idOV = buscar(numeroCuentaPaciente);
            if (!idOV) {
                throw new Error(`No se encontró una Orden de Venta para el número de cuenta del paciente: ${numeroCuentaPaciente}`);
            }
            // Cargar registro existente
            let registro = record.load({ type: record.Type.SALES_ORDER, id: idOV, isDynamic: true, ignoreMandatoryFields: true });

            const lineCount = registro.getLineCount({ sublistId: "item" });
            let existLine = false;
            for (let index = 0; index < lineCount; index++) {
                registro.selectLine({ sublistId: "item", line: index });
                const identificadorLinea = registro.getCurrentSublistValue({ sublistId: "item", fieldId: "custcol_2win_as_identificador_fila" });
                if (Number(identificadorUnicoFila) === Number(identificadorLinea)) {
                    existLine = true;
                    const idFinanciador = getFinanciador(RutFinanciador);
                    // const idConvenio = getConvenio(CodConvenio);

                    // const idServicio = getServicioIngreso(codigoServicio);

                    registro.setCurrentSublistValue({ sublistId: "item", fieldId: "custcol_2win_as_nombre_convenio", value: NombreConvenio });
                    registro.setCurrentSublistValue({ sublistId: "item", fieldId: "custcol_2win_as_codigo_convenio", value: CodConvenio });

                    registro.setCurrentSublistValue({ sublistId: "item", fieldId: "custcol_2win_as_nombre_paquete", value: NombrePaquete });
                    registro.setCurrentSublistValue({ sublistId: "item", fieldId: "custcol_2win_as_codigo_paquete", value: CodPaquete });

                    registro.setCurrentSublistValue({ sublistId: "item", fieldId: "custcol_2win_as_codigo_servicio", value: codigoServicio });
                    registro.setCurrentSublistValue({ sublistId: "item", fieldId: "custcol_2win_as_rut_financiador", value: idFinanciador });
                    if (cantidad) registro.setCurrentSublistValue({ sublistId: "item", fieldId: "quantity", value: cantidad });
                    registro.setCurrentSublistValue({ sublistId: "item", fieldId: "price", value: -1 });
                    registro.setCurrentSublistValue({ sublistId: "item", fieldId: "rate", value: valorNeto });
                    registro.setCurrentSublistValue({ sublistId: "item", fieldId: "tax1amt", value: valorIVA });

                    registro.commitLine({ sublistId: "item", ignoreRecalc: false });
                }
            }
            if (!existLine) {
                throw new Error(`No se encontró la línea con el identificador único de fila: ${identificadorUnicoFila} en la Orden de Venta ID: ${idOV} con cuenta paciente: ${numeroCuentaPaciente}`);
            }
            let idRegistro = registro.save({ enableSourcing: true, ignoreMandatoryFields: true });
            parametro.tipoRegistroCreado = registro.type;
            parametro.idRegistroCreado = String(idRegistro);
            return parametro;
        } catch (error) {
            nLog.error("eliminarLineasRegistro - error", error);
            throw error;
        }
    }
    function eliminarLineaRegistro(parametro) {
        try {
            nLog.audit("actualizarLineasRegistro - parametro", {
                parametro: parametro
            });
            parametro.etapa = actualizarLineasRegistro.name;
            const {
                // identificadorUnicoPaciente,
                // numeroFicha,
                // numeroIngreso,
                cantidad,
                numeroCuentaPaciente,
                identificadorUnicoFila,
                codigoProducto,
                codigoServicio,
                codigoBodega,
                CodConvenio,
                NombreConvenio,
                RutFinanciador,
                CodPaquete,
                NombrePaquete,
                valorNeto,
                valorExento,
                valorIVA,
                valorTotal
            } = parametro.consumoMedicamentos;

            // Recorrer cada cliente
            const idOV = buscar(numeroCuentaPaciente);
            if (!idOV) {
                throw new Error(`No se encontró una Orden de Venta para el número de cuenta del paciente: ${numeroCuentaPaciente}`);
            }
            // Cargar registro existente
            let registro = record.load({ type: record.Type.SALES_ORDER, id: idOV, isDynamic: true, ignoreMandatoryFields: true });

            const lineCount = registro.getLineCount({ sublistId: "item" });
            let existLine = false;
            for (let index = 0; index < lineCount; index++) {
                registro.selectLine({ sublistId: "item", line: index });
                const identificadorLinea = registro.getCurrentSublistValue({ sublistId: "item", fieldId: "custcol_2win_as_identificador_fila" });
                if (Number(identificadorUnicoFila) === Number(identificadorLinea)) {
                    existLine = true;
                    registro.removeLine({ sublistId: "item", line: index, ignoreRecalc: false });
                }
            }
            if (!existLine) {
                throw new Error(`No se encontró la línea con el identificador único de fila: ${identificadorUnicoFila} en la Orden de Venta ID: ${idOV} con cuenta paciente: ${numeroCuentaPaciente}`);
            }
            let idRegistro = registro.save({ enableSourcing: true, ignoreMandatoryFields: true });
            parametro.tipoRegistroCreado = registro.type;
            parametro.idRegistroCreado = String(idRegistro);
            return parametro;
        } catch (error) {
            nLog.error("eliminarLineasRegistro - error", error);
            throw error;
        }
    }
    function agregarLineaFarmacia({ id, datosLinea, save }) {
        nLog.debug("agregarLineaFarmacia - datosLinea", datosLinea);
        const recordFarmacia = record.load({ type: record.Type.SALES_ORDER, id: id, isDynamic: true });

        if (Number(datosLinea.subsidiarylocation) !== Number(recordFarmacia.getValue("subsidiary"))) {
            throw new Error("Bodega no disponible para la filial seleccionada");
        }

        const identifierField = "custcol_2win_as_identificador_fila";
        const newIdentifier = datosLinea[identifierField];

        // Validar que no exista ya otra linea con el mismo identificador
        if (newIdentifier !== undefined && newIdentifier !== null && String(newIdentifier).trim() !== "") {
            const lineCount = recordFarmacia.getLineCount({ sublistId: "item" }) || 0;
            for (let i = 0; i < lineCount; i++) {
                const existing = recordFarmacia.getSublistValue({ sublistId: "item", fieldId: identifierField, line: i });
                if (existing !== undefined && existing !== null && String(existing) === String(newIdentifier)) {
                    throw new Error(`Ya existe una línea en la sublista 'item' con ${identifierField}: ${newIdentifier}`);
                }
            }
        }

        recordFarmacia.selectNewLine({ sublistId: "item" });
        Object.keys(datosLinea).forEach((key) => {
            if (!datosLinea[key] && datosLinea[key] !== 0) return;
            recordFarmacia.setCurrentSublistValue({ sublistId: "item", fieldId: key, value: datosLinea[key] });
        });
        recordFarmacia.commitLine({ sublistId: "item" });

        if (save) {
            const savedId = recordFarmacia.save({ ignoreMandatoryFields: true });
            nLog.debug("agregarLineaFarmacia - registro guardado", savedId);
            return savedId;
        }

        return true;
    }
    function transferir({ id, mensaje }) {
        const PV1 = mensaje.PV1 || {};
        const EVN = mensaje.EVN || {};
        nLog.debug("transferir - PV1", PV1);
        nLog.debug("transferir - EVN", EVN);
        const tipoAtencionID = getTipoAtencion("H");
        nLog.debug("transferir - tipoAtencionID", tipoAtencionID);
        return record.submitFields({
            type: record.Type.SALES_ORDER,
            id: id,
            values: {
                class: tipoAtencionID,
                // custbody_2win_tipo_atencion: tipoAtencionID,
                custbody_2win_ing_correl_urg: PV1["PV1-6.1"],
                custbody_2win_pac_numficha_urg: PV1["PV1-4.1"],
                custbody_2win_nro_cuenta_paciente_urg: PV1["PV1-21.1"],
                custbody_2win_tipo_evento_hl7: EVN["EVN-1.1"]
            }
        });
    }
    // Formato esperado: YYYYMMDDHHMMSS
    function parseHL7Date(hl7Date) {
        if (!hl7Date || hl7Date.length < 8) {
            return null;
        }
        try {
            const year = hl7Date.substring(0, 4);
            const month = hl7Date.substring(4, 6) - 1; // Meses en JS son 0-11
            const day = hl7Date.substring(6, 8);
            const hour = hl7Date.substring(8, 10) || "00";
            const minute = hl7Date.substring(10, 12) || "00";
            const second = hl7Date.substring(12, 14) || "00";
            return new Date(year, month, day, hour, minute, second);
        } catch (e) {
            nLog.error("Error al parsear Fecha HL7", `Valor: ${hl7Date}, Error: ${e.message}`);
            return null;
        }
    }
    const update = (id, values) => {
        try {
            if (!id) throw Error("No se puede actualizar la orden de venta, no esta definido el id del registro.");
            if (typeof values !== "object") throw Error("El formato de los valores a actualizar es incorrecto o no esta definido.");
            const recordId = record.submitFields({
                type: record.Type.SALES_ORDER,
                id: id,
                values: values
            });
            return recordId;
        } catch (error) {
            nLog.error("orden de venta update", error);
            throw error;
        }
    };
    const load = (id) => {
        return record.load({ type: record.Type.SALES_ORDER, isDynamic: true, id: id });
    };

    /**
     * @function enviarRegistroSimulador - Envía los datos del centro de costo a un servicio externo.
     * @param {string} url - URL del endpoint del servicio externo.
     * @param {object} cuerpoPeticion - El cuerpo de la petición a enviar.
     * @returns {object} - La respuesta del servicio externo.
     */
    function enviarRegistroSimulador(url, cuerpoPeticion) {
        try {
            nLog.audit("enviarRegistroSimulador - parametros", { url: url, cuerpoPeticion: cuerpoPeticion });

            // Ejecutar peticion POST al servicio externo
            /**@todo - Pendiente definir enpoint y token para Servio externo, por ahora se usa simulador */
            const eventService = new EventService({
                externalAdapter: new ExternalEventServiceAdapter({ url: url, token: "" })
            });
            const eventData = {
                customerId: cuerpoPeticion.id,
                action: "create",
                user: runtime.getCurrentUser().id
            };
            nLog.debug("eventoEdicionRegistro - eventData", eventData);

            const respuesta = eventService.registerEvent({
                tipo: "Send_in",
                fuente: runtime.getCurrentScript().id,
                datos: eventData,
                nivel: NivelEvento.INFO,
                relatedRecordType: cuerpoPeticion.type,
                relatedRecordId: cuerpoPeticion.id
            });
            nLog.debug("eventoEdicionRegistro - respuesta", respuesta);
            return respuesta;
        } catch (error) {
            nLog.error("enviarRegistroSimulador - error", error);
            throw error;
        }
    }

    /**
     * @function enviarRegistro - Envía los datos del centro de costo a un servicio externo.
     * @param {string} url - URL del endpoint del servicio externo.
     * @param {object} cuerpoPeticion - El cuerpo de la petición a enviar.
     * @returns {object} - La respuesta del servicio externo.
     */
    function enviarRegistro(url, cuerpoPeticion) {
        try {
            nLog.audit("enviarRegistro - parametros", { url: url, cuerpoPeticion: cuerpoPeticion });

            // Utiliza la nueva función autenticada. El tipo de petición es PUT según el DOM.
            const respuesta = libPeticion.ejecutarPeticionAutenticada("PUT", url, cuerpoPeticion);

            nLog.debug("enviarRegistro - respuesta", respuesta);
            return respuesta;
        } catch (error) {
            nLog.error("enviarRegistro - error", error);
            throw error;
        }
    }

    function getFinanciador(RutFinanciador) {}

    function obtenerPorNroCuentaPaciente(nro_cuenta_paciente) {
        try {
            let objSearch = {
                type: "salesorder",
                settings: [
                    { name: "consolidationtype", value: "ACCTTYPE" },
                    { name: "includeperiodendtransactions", value: "F" }
                ],
                filters: [["custbody_2win_nro_cuenta_paciente", "is", nro_cuenta_paciente], "AND", ["type", "anyof", "SalesOrd"], "AND", ["mainline", "is", "T"]],
                columns: [
                    search.createColumn({ name: "internalid", label: "id" }),
                    search.createColumn({ name: "custbody_2win_nro_cuenta_paciente", label: "nro_cuenta_paciente" }),
                    search.createColumn({ name: "internalid", join: "customer", label: "id_paciente" }),
                    search.createColumn({ name: "internalid", join: "subsidiary", label: "id_subsidiaria" })
                ]
            };

            // Ejecutar busqueda
            let result = dao.obtenerResultados(objSearch);

            // Valida que la busqueda retorne resultados
            if (result.length === 0) {
                nLog.error("obtenerPorNroCuentaPaciente - error", `Numero de cuenta paciente no fue encontrada en ninguna orden de venta - nro cuenta paciente: ${nro_cuenta_paciente}`);
                return null;
            }

            return result;
        } catch (error) {
            throw error;
        }
    }

    function obtenerLineas(ids_ordenes_venta) {
        try {
            let filters_ov = ["internalid", "anyof"];
            ids_ordenes_venta.forEach((id) => {
                filters_ov.push(id);
            });
            nLog.debug("obtenerLineas - filters_ov", filters_ov);

            let objSearch = {
                type: "transaction",
                settings: [
                    { name: "consolidationtype", value: "NONE" },
                    { name: "includeperiodendtransactions", value: "F" }
                ],
                filters: [
                    ["type", "anyof", "SalesOrd"],
                    "AND",
                    ["mainline", "is", "F"],
                    "AND",
                    ["custcol_2win_as_identificador_fila", "isnotempty", ""],
                    "AND",
                    ["custcol_2win_as_identificador_fila", "notequalto", "0"],
                    "AND",
                    filters_ov
                ],
                columns: [
                    search.createColumn({ name: "internalid", label: "id" }),
                    search.createColumn({ name: "line", label: "id_linea" }),
                    search.createColumn({ name: "custcol_2win_as_identificador_fila", label: "correlativo" })
                ]
            };

            return dao.obtenerResultados(objSearch);
        } catch (error) {
            throw error;
        }
    }

    return {
        crear: crear,
        editar: editar,
        buscar: buscar,
        anular,
        transferir: transferir,
        formatearRut: formatearRut,
        getTipoAtencion: getTipoAtencion,
        agregarLineasRegistro: agregarLineasRegistro,
        eliminarLineasRegistro: eliminarLineasRegistro,
        actualizarLineasRegistro: actualizarLineasRegistro,
        agregarLineaFarmacia: agregarLineaFarmacia,
        eliminarLineaRegistro: eliminarLineaRegistro,
        enviarRegistroSimulador: enviarRegistroSimulador,
        enviarRegistro: enviarRegistro,
        //-----------------
        update,
        load,
        obtenerPorNroCuentaPaciente: obtenerPorNroCuentaPaciente,
        obtenerLineas: obtenerLineas
    };
});
