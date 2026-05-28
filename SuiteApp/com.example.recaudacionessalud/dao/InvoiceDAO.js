/**
 * @NApiVersion 2.1
 */
define(["N/record", "N/log", "N/search", "N/query", "./SalesOrderDAO"], function (record, nLog, search, query, SalesOrderDAO) {
    function createInvoice(data) {
        try {
            const newRecord = record.create({
                type: record.Type.INVOICE,
                isDynamic: true
            });
            nLog.debug("InvoiceDAO - createInvoice - data", data);
            
            // Buscar orden de venta para obtener campos adicionales
            let salesOrderFields = null;
            if (data.customerId && data.cuentaPaciente) {
                salesOrderFields = SalesOrderDAO.getSalesOrderFields(
                    data.customerId,
                    data.razonSocialCobro,
                    data.cuentaPaciente
                );
            }
            // Set Form
            // newRecord.setValue({fieldId: 'customform', value: 'custform_2win_form_fac_electronica'});

            newRecord.setValue({ fieldId: "customform", value: 118 });
            newRecord.setValue({ fieldId: "entity", value: data.customerId });
            newRecord.setValue({ fieldId: "subsidiary", value: data.razonSocialCobro || 1 }); // Default Subsidiaria 1 si no se pasa
            newRecord.setValue({ fieldId: "trandate", value: new Date(data.fechaTransaccion) });
            newRecord.setValue({ fieldId: "approvalstatus", value: 2 });
            newRecord.setValue({ fieldId: "account", value: data.account });
            newRecord.setValue({ fieldId: "custbody_2winfolioacepta", value: data.folioBoleta });
            if (!data.isFactura) {
                newRecord.setValue({ fieldId: "custbody_2wintipodtesii", value: data.montoIva > 0 ? 11 : 13 }); // Tipo DTE 11 = Boleta electronica, 13 = Boleta Exenta Electrónica
            } else {
                newRecord.setValue({ fieldId: "custbody_2wintipodtesii", value: data.montoIva > 0 ? 1 : 2 }); // Tipo DTE 1 = Factura Afecta Electrónica, 2 = Factura Exenta Electrónica  
            }
            if (data.isNotaDebito) {
                // Tipo DTE 5 = Nota de Débito Electrónica
                newRecord.setValue({ fieldId: "custbody_2wintipodtesii", value: 5 });
            }
            newRecord.setValue({ fieldId: "custbody_2win_tran_origin", value: data.transaccionOrigen });
            // newRecord.setValue({ fieldId: "class", value: 109 });
            // newRecord.setValue({ fieldId: "location", value: 433 });
            newRecord.setValue({ fieldId: "custbody_2win_created_from_income_flow", value: true });
            newRecord.setValue({ fieldId: "memo", value: data.memo || "Factura Generica" });
            // Custom Fields
            if (data.idPaciente) newRecord.setValue({ fieldId: "custbody_2w_as_id_paciente", value: data.idPaciente });
            if (data.reversoPago) newRecord.setValue({ fieldId: "custbody_2w_as_reverso_pago", value: data.reversoPago });
            if (data.ficha) newRecord.setValue({ fieldId: "custbody_2w_as_ficha_paciente", value: data.ficha });
            // if (data.prefactura) newRecord.setValue({ fieldId: "custbody_2w_prefactura", value: data.prefactura });
            if (data.cuentaPaciente) newRecord.setValue({ fieldId: "custbody_2win_nro_cuenta_paciente", value: data.cuentaPaciente });

            // Campos adicionales del CSV para facturas (Sale = Y)
            if (data.previsionPaciente) newRecord.setValue({ fieldId: "custbody_2w_prevision_paciente", value: data.previsionPaciente });
            if (data.previsionNombre) newRecord.setValue({ fieldId: "custbody_2win_prevision_nom", value: data.previsionNombre });
            if (data.paciente) newRecord.setValue({ fieldId: "custbody_2w_as_ficha_paciente", value: data.paciente });
            if (data.nroAdhesion) newRecord.setValue({ fieldId: "custbody_2win_ing_correl", value: data.nroAdhesion });
            if (data.nroRegistro) newRecord.setValue({ fieldId: "custbody_2win_pac_numficha", value: data.nroRegistro });
            if (data.tipoAtencion) newRecord.setValue({ fieldId: "custbody_2win_tipo_atencion", value: data.tipoAtencion });
            if (data.convenioCod) newRecord.setValue({ fieldId: "custbody_2win_convenio_cod", value: data.convenioCod });
            if (data.convenioNom) newRecord.setValue({ fieldId: "custbody_2win_convenio_nom", value: data.convenioNom });

            // Campos de la orden de venta (si se encontró)
            if (salesOrderFields) {
                // Campos HL7
                if (salesOrderFields.custbody_2win_ing_correl && !data.nroAdhesion) {
                    newRecord.setValue({ fieldId: "custbody_2win_ing_correl", value: salesOrderFields.custbody_2win_ing_correl });
                }
                if (salesOrderFields.custbody_2win_pac_numficha && !data.nroRegistro) {
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
                
                // Campos previsionales adicionales
                if (salesOrderFields.custbody_2win_prevision_cod && !data.previsionNombre) {
                    newRecord.setValue({ fieldId: "custbody_2win_prevision_cod", value: salesOrderFields.custbody_2win_prevision_cod });
                }
                if (salesOrderFields.custbody_2win_tramo_fonasa) {
                    newRecord.setValue({ fieldId: "custbody_2win_tramo_fonasa", value: salesOrderFields.custbody_2win_tramo_fonasa });
                }
                if (salesOrderFields.custbody_2win_rama_ffaa) {
                    newRecord.setValue({ fieldId: "custbody_2win_rama_ffaa", value: salesOrderFields.custbody_2win_rama_ffaa });
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

            // Campos de caja
            if (data.unidadCaja) newRecord.setValue({ fieldId: "custbodyunidadcaja", value: data.unidadCaja });
            if (data.fechaCaja) newRecord.setValue({ fieldId: "custbodyfechacaja", value: new Date(data.fechaCaja) });
            if (data.aperturaCaja) newRecord.setValue({ fieldId: "custbodyaperturacaja", value: data.aperturaCaja });
            if (data.razonSocialCaja) newRecord.setValue({ fieldId: "custbodyrazonsocialcaja", value: data.razonSocialCaja });
            if (data.numeroMovimiento) newRecord.setValue({ fieldId: "custbodynumeromovimiento", value: data.numeroMovimiento });

            // Agregar items desde boletasEmitidas (si hay detalle de items, sino usar generico)
            // En el JSON de ejemplo no se ve detalle de items dentro de boleta, solo montos totales.
            // Asumiremos un item generico de servicio por el monto total o desglosado si es necesario.

            // Logica para Egresos/Ingresos que afectan boleta
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
            } else {
                // Fallback si no hay items especificos, usar monto total de la boleta
                // Esto depende de como se quiera reflejar contablemente
                if (data.montoTotal > 0) {
                    newRecord.selectNewLine({ sublistId: "item" });
                    newRecord.setCurrentSublistValue({ sublistId: "item", fieldId: "item", value: 7627 });
                    newRecord.setCurrentSublistValue({ sublistId: "item", fieldId: "rate", value: data.montoTotal });

                    // Nuevos campos de línea para fallback
                    if (data.folioBoleta) newRecord.setCurrentSublistValue({ sublistId: "item", fieldId: "custcol_2w_folio", value: data.folioBoleta });
                    newRecord.setCurrentSublistValue({ sublistId: "item", fieldId: "custcol_2win_as_identificador_fila", value: 0 });

                    newRecord.commitLine({ sublistId: "item" });
                }
            }

            const newId = newRecord.save({ enableSourcing: false, ignoreMandatoryFields: true });
            nLog.audit("InvoiceDAO", `Invoice creada: ${newId}`);
            return newId;
        } catch (e) {
            nLog.error("InvoiceDAO Error", e);
            throw e;
        }
    }

    function findInvoiceByFolio(folio) {
        try {
            const results = query
                .runSuiteQL({
                    query: `
                select
                    top 1 transaction.id,
                    BUILTIN.DF(transaction.entity)
                    from
                    transaction
                    where
                    transaction.custbody_2winfolioacepta is not null
                    and transaction.custbody_2winfolioacepta = ?
                    and transaction.type = 'CustInvc'`,
                    params: [folio]
                })
                .asMappedResults();
            if (results.length > 0) return results[0].id;
            return null;
        } catch (e) {
            nLog.error("InvoiceDAO - findInvoiceByFolio Error", e);
            throw e;
        }
    }

    /**
     * Busca los journals aplicados a una factura
     * @param {number} invoiceId - ID interno de la factura
     * @returns {Array} - Array con los journals aplicados
     */
    function findAppliedJournals(invoiceId) {
        try {
            if (!invoiceId) return [];
            const sql = `
                SELECT DISTINCT
                    t.id,
                    t.tranid,
                    t.memo,
                    t.trandate
                FROM
                    Transaction t
                    INNER JOIN NextTransactionLink ntl ON ntl.nextdoc = t.id
                WHERE
                    ntl.previousdoc = ?
                    AND t.recordtype = 'journalentry'
                ORDER BY
                    t.trandate DESC
            `;

            const results = query
                .runSuiteQL({
                    query: sql,
                    params: [invoiceId]
                })
                .asMappedResults();

            return results;
        } catch (e) {
            nLog.error("InvoiceDAO - findAppliedJournals Error", e);
            throw e;
        }
    }

    /**
     * Verifica el saldo pendiente de una factura usando search.lookupFields.
     * Consumo: ~2 unidades de gobernanza.
     * @param {number} invoiceId - ID interno de la factura
     * @returns {Object} Objeto con montoTotal y saldoPendiente
     */
    function verificarSaldoPendiente(invoiceId) {
        try {
            const lookup = search.lookupFields({
                type: search.Type.INVOICE,
                id: invoiceId,
                columns: ["amount", "amountremaining"]
            });
            return {
                montoTotal: parseFloat(lookup.amount) || 0,
                saldoPendiente: parseFloat(lookup.amountremaining) || 0
            };
        } catch (e) {
            nLog.error("InvoiceDAO - verificarSaldoPendiente Error", e);
            throw e;
        }
    }

    return {
        createInvoice: createInvoice,
        findInvoiceByFolio: findInvoiceByFolio,
        findAppliedJournals: findAppliedJournals,
        verificarSaldoPendiente: verificarSaldoPendiente
    };
});
