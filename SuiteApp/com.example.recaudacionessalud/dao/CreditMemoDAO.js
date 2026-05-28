/**
 * @NApiVersion 2.1
 */
define(["N/record", "N/search", "N/log", "N/query", "./SalesOrderDAO"], function (record, search, nLog, query, SalesOrderDAO) {
    function createCreditMemo(data) {
        try {
            nLog.debug("createCreditMemo", data);
            let newRecord;
            
            // Buscar orden de venta para obtener campos adicionales
            let salesOrderFields = null;
            if (data.customerId && data.cuentaPaciente) {
                salesOrderFields = SalesOrderDAO.getSalesOrderFields(
                    data.customerId,
                    data.razonSocialCobro,
                    data.cuentaPaciente
                );
            }
            if (data.esAnticipo === "N") {
                nLog.debug("Creando NC a partir de factura", `Folio de referencia: ${data.folioRef}`);
                const invoiceId = getInvoiceIdByFolio(data.folioRef);

                // Cargar la factura para copiar sus datos
                const invoiceRecord = record.load({
                    type: record.Type.INVOICE,
                    id: invoiceId,
                    isDynamic: true
                });

                // Crear NC nueva
                newRecord = record.create({
                    type: record.Type.CREDIT_MEMO,
                    isDynamic: true
                });
                newRecord.setValue({ fieldId: "customform", value: 163 });
                // Copiar campos de la factura a la NC
                newRecord.setValue({ fieldId: "entity", value: invoiceRecord.getValue("entity") });
                newRecord.setValue({ fieldId: "subsidiary", value: invoiceRecord.getValue("subsidiary") });
                newRecord.setValue({ fieldId: "custbody_2w_as_id_paciente", value: invoiceRecord.getValue("custbody_2w_as_id_paciente") });

                // Copiar campos de caja de la factura
                newRecord.setValue({ fieldId: "custbodyunidadcaja", value: invoiceRecord.getValue("custbodyunidadcaja") });
                newRecord.setValue({ fieldId: "custbodyfechacaja", value: invoiceRecord.getValue("custbodyfechacaja") });
                newRecord.setValue({ fieldId: "custbodyaperturacaja", value: invoiceRecord.getValue("custbodyaperturacaja") });
                newRecord.setValue({ fieldId: "custbodyrazonsocialcaja", value: invoiceRecord.getValue("custbodyrazonsocialcaja") });
                newRecord.setValue({ fieldId: "custbodynumeromovimiento", value: invoiceRecord.getValue("custbodynumeromovimiento") });

                newRecord.setValue({ fieldId: "custbody_2win_created_from_income_flow", value: true });
                // Copiar items de la factura a la NC
                const itemCount = invoiceRecord.getLineCount({ sublistId: "item" });
                for (let i = 0; i < itemCount; i++) {
                    newRecord.selectNewLine({ sublistId: "item" });
                    newRecord.setCurrentSublistValue({ sublistId: "item", fieldId: "item", value: invoiceRecord.getSublistValue({ sublistId: "item", fieldId: "item", line: i }) });
                    newRecord.setCurrentSublistValue({ sublistId: "item", fieldId: "quantity", value: invoiceRecord.getSublistValue({ sublistId: "item", fieldId: "quantity", line: i }) });
                    newRecord.setCurrentSublistValue({ sublistId: "item", fieldId: "rate", value: invoiceRecord.getSublistValue({ sublistId: "item", fieldId: "rate", line: i }) });
                    newRecord.setCurrentSublistValue({ sublistId: "item", fieldId: "amount", value: invoiceRecord.getSublistValue({ sublistId: "item", fieldId: "amount", line: i }) });
                    newRecord.setCurrentSublistValue({ sublistId: "item", fieldId: "tax1code", value: invoiceRecord.getSublistValue({ sublistId: "item", fieldId: "tax1code", line: i }) });
                    newRecord.setCurrentSublistValue({ sublistId: "item", fieldId: "tax1amt", value: invoiceRecord.getSublistValue({ sublistId: "item", fieldId: "tax1amt", line: i }) });
                    newRecord.setCurrentSublistValue({ sublistId: "item", fieldId: "description", value: invoiceRecord.getSublistValue({ sublistId: "item", fieldId: "description", line: i }) });
                    newRecord.setCurrentSublistValue({
                        sublistId: "item",
                        fieldId: "custcol_2win_as_identificador_fila",
                        value: invoiceRecord.getSublistValue({ sublistId: "item", fieldId: "custcol_2win_as_identificador_fila", line: i })
                    });
                    newRecord.commitLine({ sublistId: "item" });
                }
            } else {
                nLog.debug("Creando NC por anticipo", "Creando nuevo registro de NC");
                newRecord = record.create({
                    type: record.Type.CREDIT_MEMO,
                    isDynamic: true
                });
                newRecord.setValue({ fieldId: "entity", value: data.customerId });
                newRecord.setValue({ fieldId: "subsidiary", value: data.razonSocialCobro });
                newRecord.setValue({ fieldId: "memo", value: data.memo || "" });
            }

            newRecord.setValue({ fieldId: "trandate", value: new Date(data.fechaTransaccion) });
            newRecord.setValue({ fieldId: "custbody_2wintipodtesii", value: 4 });
            newRecord.setValue({ fieldId: "custbody_2win_created_from_income_flow", value: true });
            // Campos adicionales del CSV para notas de crédito
            if (data.idPaciente) newRecord.setValue({ fieldId: "custbody_2w_as_id_paciente", value: data.idPaciente });
            if (data.cuentaPaciente) newRecord.setValue({ fieldId: "custbody_2win_nro_cuenta_paciente", value: data.cuentaPaciente });

            // Campos de la orden de venta (si se encontró)
            if (salesOrderFields) {
                // Campos HL7
                if (salesOrderFields.custbody_2win_ing_correl) {
                    newRecord.setValue({ fieldId: "custbody_2win_ing_correl", value: salesOrderFields.custbody_2win_ing_correl });
                }
                if (salesOrderFields.custbody_2win_pac_numficha) {
                    newRecord.setValue({ fieldId: "custbody_2win_pac_numficha", value: salesOrderFields.custbody_2win_pac_numficha });
                }
                if (salesOrderFields.custbody_2win_tipo_evento_hl7) {
                    newRecord.setValue({ fieldId: "custbody_2win_tipo_evento_hl7", value: salesOrderFields.custbody_2win_tipo_evento_hl7 });
                }
                if (salesOrderFields.custbody_2win_fecha_evento_hl7) {
                    newRecord.setValue({ fieldId: "custbody_2win_fecha_evento_hl7", value: salesOrderFields.custbody_2win_fecha_evento_hl7 });
                }
                if (salesOrderFields.custbody_2win_id_mensaje_hl7) {
                    newRecord.setValue({ fieldId: "custbody_2win_id_mensaje_hl7", value: salesOrderFields.custbody_2win_id_mensaje_hl7 });
                }
                
                // Campos de atención
                if (salesOrderFields.custbody_2win_fecha_ingreso) {
                    newRecord.setValue({ fieldId: "custbody_2win_fecha_ingreso", value: salesOrderFields.custbody_2win_fecha_ingreso });
                }
                if (salesOrderFields.custbody_2win_hora_ingreso) {
                    newRecord.setValue({ fieldId: "custbody_2win_hora_ingreso", value: salesOrderFields.custbody_2win_hora_ingreso });
                }
                if (salesOrderFields.custbody_2win_tiene_reclamo) {
                    newRecord.setValue({ fieldId: "custbody_2win_tiene_reclamo", value: salesOrderFields.custbody_2win_tiene_reclamo });
                }
                if (salesOrderFields.custbody_2win_tiene_seguro) {
                    newRecord.setValue({ fieldId: "custbody_2win_tiene_seguro", value: salesOrderFields.custbody_2win_tiene_seguro });
                }
                
                // Campos de servicio
                if (salesOrderFields.custbody_2win_servicio_ingreso) {
                    newRecord.setValue({ fieldId: "custbody_2win_servicio_ingreso", value: salesOrderFields.custbody_2win_servicio_ingreso });
                }
                if (salesOrderFields.custbody_2win_servicio_ingreso_nom) {
                    newRecord.setValue({ fieldId: "custbody_2win_servicio_ingreso_nom", value: salesOrderFields.custbody_2win_servicio_ingreso_nom });
                }
                if (salesOrderFields.custbody_2win_procedencia) {
                    newRecord.setValue({ fieldId: "custbody_2win_procedencia", value: salesOrderFields.custbody_2win_procedencia });
                }
                if (salesOrderFields.custbody_2win_ley_previsional) {
                    newRecord.setValue({ fieldId: "custbody_2win_ley_previsional", value: salesOrderFields.custbody_2win_ley_previsional });
                }
                if (salesOrderFields.custbody_2win_compania_seguro) {
                    newRecord.setValue({ fieldId: "custbody_2win_compania_seguro", value: salesOrderFields.custbody_2win_compania_seguro });
                }
                
                // Campos previsionales
                if (salesOrderFields.custbody_2win_prevision_nom) {
                    newRecord.setValue({ fieldId: "custbody_2win_prevision_nom", value: salesOrderFields.custbody_2win_prevision_nom });
                }
                if (salesOrderFields.custbody_2win_prevision_cod) {
                    newRecord.setValue({ fieldId: "custbody_2win_prevision_cod", value: salesOrderFields.custbody_2win_prevision_cod });
                }
                if (salesOrderFields.custbody_2win_tramo_fonasa) {
                    newRecord.setValue({ fieldId: "custbody_2win_tramo_fonasa", value: salesOrderFields.custbody_2win_tramo_fonasa });
                }
                if (salesOrderFields.custbody_2win_rama_ffaa) {
                    newRecord.setValue({ fieldId: "custbody_2win_rama_ffaa", value: salesOrderFields.custbody_2win_rama_ffaa });
                }
                if (salesOrderFields.custbody_2win_convenio_cod) {
                    newRecord.setValue({ fieldId: "custbody_2win_convenio_cod", value: salesOrderFields.custbody_2win_convenio_cod });
                }
                if (salesOrderFields.custbody_2win_convenio_nom) {
                    newRecord.setValue({ fieldId: "custbody_2win_convenio_nom", value: salesOrderFields.custbody_2win_convenio_nom });
                }
                if (salesOrderFields.custbody_2win_paquete_atencion_cod) {
                    newRecord.setValue({ fieldId: "custbody_2win_paquete_atencion_cod", value: salesOrderFields.custbody_2win_paquete_atencion_cod });
                }
                if (salesOrderFields.custbody_2win_paquete_atencion_nom) {
                    newRecord.setValue({ fieldId: "custbody_2win_paquete_atencion_nom", value: salesOrderFields.custbody_2win_paquete_atencion_nom });
                }
                
                // Responsable de cuenta
                if (salesOrderFields.custbody_2win_responsable_cuenta_cod) {
                    newRecord.setValue({ fieldId: "custbody_2win_responsable_cuenta_cod", value: salesOrderFields.custbody_2win_responsable_cuenta_cod });
                }
                if (salesOrderFields.custbody_2win_responsable_cuenta_nom) {
                    newRecord.setValue({ fieldId: "custbody_2win_responsable_cuenta_nom", value: salesOrderFields.custbody_2win_responsable_cuenta_nom });
                }
                
                // Campos estándar
                if (salesOrderFields.class) {
                    newRecord.setValue({ fieldId: "class", value: salesOrderFields.class[0]?.value });
                }
                if (salesOrderFields.department) {
                    newRecord.setValue({ fieldId: "department", value: salesOrderFields.department[0]?.value });
                }
            }

            // Campos de caja (si aplica)
            if (data.unidadCaja) newRecord.setValue({ fieldId: "custbodyunidadcaja", value: data.unidadCaja });
            if (data.fechaCaja) newRecord.setValue({ fieldId: "custbodyfechacaja", value: new Date(data.fechaCaja) });
            if (data.aperturaCaja) newRecord.setValue({ fieldId: "custbodyaperturacaja", value: data.aperturaCaja });
            if (data.razonSocialCaja) newRecord.setValue({ fieldId: "custbodyrazonsocialcaja", value: data.razonSocialCaja });
            if (data.numeroMovimiento) newRecord.setValue({ fieldId: "custbodynumeromovimiento", value: data.numeroMovimiento });

            if (data.items && data.items.length > 0) {
                data.items.forEach((item) => {
                    newRecord.selectNewLine({ sublistId: "item" });
                    newRecord.setCurrentSublistValue({ sublistId: "item", fieldId: "item", value: item.item });
                    newRecord.setCurrentSublistValue({ sublistId: "item", fieldId: "amount", value: item.rate || 0 });
                    newRecord.setCurrentSublistValue({ sublistId: "item", fieldId: "tax1amt", value: item.tax1amt || 0 });

                    // newRecord.setCurrentSublistValue({sublistId: 'item', fieldId: 'description', value: item.descripcion});

                    // Nuevos campos de línea para trazabilidad
                    if (item.folioBoleta) newRecord.setCurrentSublistValue({ sublistId: "item", fieldId: "custcol_2w_folio", value: item.folioBoleta });
                    newRecord.setCurrentSublistValue({ sublistId: "item", fieldId: "custcol_2win_as_identificador_fila", value: 0 });

                    newRecord.commitLine({ sublistId: "item" });
                });
            } else if (data.montoTotal > 0 && data.esAnticipo === "S") {
                // Items
                newRecord.selectNewLine({ sublistId: "item" });
                newRecord.setCurrentSublistValue({ sublistId: "item", fieldId: "item", value: data.creditoItem });
                newRecord.setCurrentSublistValue({ sublistId: "item", fieldId: "rate", value: Number(data.montoNeto) || Number(data.montoExento) });
                newRecord.setCurrentSublistValue({ sublistId: "item", fieldId: "tax1amt", value: Number(data.montoIva) || 0 });
                newRecord.setCurrentSublistValue({ sublistId: "item", fieldId: "custcol_2win_as_identificador_fila", value: 0 });

                // Agregar descripción si existe folio de referencia
                if (data.folioRef) {
                    newRecord.setCurrentSublistValue({
                        sublistId: "item",
                        fieldId: "description",
                        value: `NC aplicada a factura ${data.folioRef}`
                    });
                }

                newRecord.commitLine({ sublistId: "item" });
            }

            // Campos personalizados
            if (data.folioNC) {
                newRecord.setValue({ fieldId: "custbody_2winfolioacepta", value: data.folioNC });
            }

            if (data.tipoDocRef && data.folioRef) {
                newRecord.setValue({ fieldId: "custbody_tipo_doc_ref", value: data.tipoDocRef });
                newRecord.setValue({ fieldId: "custbody_folio_ref", value: data.folioRef });
                newRecord.setValue({ fieldId: "custbody_fecha_ref", value: new Date(data.fechaRef) });
                newRecord.setValue({ fieldId: "custbody_cod_ref", value: data.codRef });
            }

            const newId = newRecord.save({ enableSourcing: false, ignoreMandatoryFields: true });
            nLog.audit("CreditMemoDAO", `NC creada: ${newId}`);
            return newId;
        } catch (e) {
            nLog.error("CreditMemoDAO Error", e);
            throw e;
        }
    }

    function applyCreditMemo(cmId, invoiceId, prevunapply) {
        try {
            // Cargar la NC y aplicar a la factura
            const cmRecord = record.load({
                type: record.Type.CREDIT_MEMO,
                id: cmId,
                isDynamic: true
            });

            const lineCount = cmRecord.getLineCount({ sublistId: "apply" });
            let applied = false;

            for (let i = 0; i < lineCount; i++) {
                const docId = cmRecord.getSublistValue({ sublistId: "apply", fieldId: "doc", line: i }); // internalid of invoice
                if (prevunapply) {
                    cmRecord.selectLine({ sublistId: "apply", line: i });
                    cmRecord.setCurrentSublistValue({ sublistId: "apply", fieldId: "apply", value: false });
                    cmRecord.commitLine({ sublistId: "apply" });
                }
                if (Number(docId) === Number(invoiceId)) {
                    cmRecord.selectLine({ sublistId: "apply", line: i });
                    cmRecord.setCurrentSublistValue({ sublistId: "apply", fieldId: "apply", value: true });
                    cmRecord.commitLine({ sublistId: "apply" });
                    applied = true;
                    break;
                }
            }

            if (applied) {
                cmRecord.save({ ignoreMandatoryFields: true });
                nLog.audit("CreditMemoDAO", `NC ${cmId} aplicada a Invoice ${invoiceId}`);
            } else {
                nLog.audit("CreditMemoDAO", `No se pudo aplicar NC ${cmId} a Invoice ${invoiceId} (no encontrada en sublista)`);
            }
        } catch (e) {
            nLog.error("CreditMemoDAO Apply Error", e);
            throw e;
        }
    }

    /**
     * Alias para applyCreditMemo - aplica NC contra factura específica usando el folio
     * @param {number} cmId - ID de la NC
     * @param {string} folioRef - Folio de la factura de referencia
     */
    function aplicarNCContraFactura(cmId, folioRef) {
        try {
            const results = query
                .runSuiteQL({
                    query: `select top 1
                    transaction.id,
                    transaction.custbody_2winfolioacepta
                from
                    transaction
                where
                    transaction.custbody_2winfolioacepta is not null
                    and
                    transaction.custbody_2winfolioacepta = ?
                    and transaction.type = 'CustInvc'`,
                    params: [folioRef]
                })
                .asMappedResults();
            if (results && results.length > 0) {
                const invoiceId = results[0].id;
                applyCreditMemo(cmId, invoiceId);
            } else {
                nLog.audit("CreditMemoDAO", `No se encontró factura con folio ${folioRef}`);
            }
        } catch (e) {
            nLog.error("CreditMemoDAO aplicarNCContraFactura Error", e);
            throw e;
        }
    }

    /**
     * Aplica una nota de crédito como forma de pago
     * @param {string} folioNC - Folio de la NC
     * @param {string} folioFactura - Folio de la factura a aplicar
     */
    function aplicarNCComoFormaPago(folioNC, folioFactura) {
        try {
            nLog.debug("aplicarNCComoFormaPago", { folioNC: folioNC, folioFactura: folioFactura });
            const results = query
                .runSuiteQL({
                    query: `select top 1
                    transaction.id,
                    transaction.custbody_2winfolioacepta
                from
                    transaction
                where
                    transaction.custbody_2winfolioacepta is not null
                    and
                    transaction.custbody_2winfolioacepta = ?
                    and transaction.type = 'CustCred'`,
                    params: [folioNC]
                })
                .asMappedResults();
            if (results && results.length > 0) {
                const ncId = results[0]?.id;
                aplicarNCContraFactura(ncId, folioFactura);
                nLog.audit("CreditMemoDAO", `NC ${folioNC} aplicada como forma de pago a factura ${folioFactura}`);
            } else {
                nLog.error("CreditMemoDAO", `No se encontró NC con folio ${folioNC}`);
            }
        } catch (e) {
            nLog.error("CreditMemoDAO aplicarNCComoFormaPago Error", e);
            throw e;
        }
    }

    /**
     * Aplica una nota de crédito intercompany a una factura
     * Busca la NC por folio y la aplica a la factura destino
     * @param {string} folioNC - Folio de la NC
     * @param {string} folioFactura - Folio de la factura destino
     * @param {string} idJournalEntry - ID del Journal Entry
     */
    function aplicarNCIntercompany(folioNC, idJournalEntry) {
        try {
            nLog.debug("aplicarNCIntercompany", { folioNC: folioNC, idJournalEntry: idJournalEntry });

            // Buscar la NC por folio
            const ncResults = query
                .runSuiteQL({
                    query: `select top 1
                    transaction.id,
                    transaction.custbody_2winfolioacepta
                from
                    transaction
                where
                    transaction.custbody_2winfolioacepta is not null
                    and transaction.custbody_2winfolioacepta = ?
                    and transaction.type = 'CustCred'`,
                    params: [folioNC]
                })
                .asMappedResults();

            if (!ncResults || ncResults.length === 0) {
                throw new Error(`No se encontró NC con folio ${folioNC}`);
            }

            const ncId = ncResults[0].id;

            // Aplicar la NC a la factura
            applyCreditMemo(ncId, idJournalEntry);

            nLog.audit("CreditMemoDAO", `NC Intercompany ${folioNC} aplicada a Journal ${idJournalEntry}`);
        } catch (e) {
            nLog.error("CreditMemoDAO aplicarNCIntercompany Error", e);
            throw e;
        }
    }
    function getInvoiceIdByFolio(folio) {
        const results = query
            .runSuiteQL({
                query: `
                select top 1
                    transaction.id
                from
                    transaction
                where
                    transaction.custbody_2winfolioacepta is not null
                    and
                    transaction.custbody_2winfolioacepta = ?
                    and transaction.type = 'CustInvc'`,
                params: [folio]
            })
            .asMappedResults();
        if (results && results.length > 0) {
            return results[0].id;
        } else {
            throw new Error(`No se encontró factura con folio ${folio}`);
        }
    }
    function getCreditIdByFolio(folio) {
        const results = query
            .runSuiteQL({
                query: `
                select top 1
                    transaction.id
                from
                    transaction
                where
                    transaction.custbody_2winfolioacepta is not null
                    and
                    transaction.custbody_2winfolioacepta = ?
                    and transaction.type = 'CustCred'`,
                params: [folio]
            })
            .asMappedResults();
        if (results && results.length > 0) {
            return results[0].id;
        } else {
            throw new Error(`No se encontró factura con folio ${folio}`);
        }
    }
    return {
        createCreditMemo: createCreditMemo,
        applyCreditMemo: applyCreditMemo,
        aplicarNCContraFactura: aplicarNCContraFactura,
        aplicarNCComoFormaPago: aplicarNCComoFormaPago,
        aplicarNCIntercompany: aplicarNCIntercompany,
        getCreditIdByFolio: getCreditIdByFolio
    };
});
