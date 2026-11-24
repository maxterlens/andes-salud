/**
 * @NApiVersion 2.1
 */
define(["N/record", "N/log", "N/search", "N/query", "./SalesOrderDAO"], function (record, nLog, search, query, SalesOrderDAO) {

    function createInvoice(data) {
        
        const cargaPorLotes = data && data.cargaPorLotes;
        const medirTiempos = !!(data && data.medirTiempos);
        const inicio = medirTiempos ? Date.now() : 0;
        let inicioEtapa = inicio;
        let inicioBloque = inicio;
        let etapa = "crearRegistro";
        let operacion = "record.create";
        let lineaActual = null;
        let lineasCompletadas = 0;
        const totalLineas = data && data.items && data.items.length ? data.items.length : (data && data.montoTotal > 0 ? 1 : 0);

        function registrarTiempo(evento) {
            if (!medirTiempos) return;
            // El diagnóstico no debe reemplazar un resultado ni el error original.
            try {
                const ahora = Date.now();
                nLog.audit("InvoiceDAO - tiempo", {
                    folio: data.folioBoleta, processKey: data.processKey,
                    etapa: etapa, evento: evento, operacion: operacion,
                    duracionMs: ahora - inicioEtapa, acumuladoMs: ahora - inicio,
                    lineaActual: lineaActual, lineasCompletadas: lineasCompletadas,
                    totalLineas: totalLineas,
                    duracionBloqueMs: etapa === "lineas" && evento === "avance" ? ahora - inicioBloque : null
                });
            } catch (errorMedicion) {
                // Mantener el flujo original incluso si falla el registro del diagnóstico.
            }
        }

        function iniciarEtapa(nombre) {
            if (!medirTiempos) return;
            etapa = nombre;
            operacion = null;
            inicioEtapa = Date.now();
            inicioBloque = inicioEtapa;
            registrarTiempo("inicio");
        }

        registrarTiempo("inicio");

        try {
            
            // Opción exclusiva del nuevo flujo. Las llamadas actuales siguen creando aprobadas.
            if (cargaPorLotes && (typeof cargaPorLotes !== "object" || Array.isArray(cargaPorLotes) ||
                !data.processKey || !Array.isArray(data.items) || !data.items.length ||
                !Number.isSafeInteger(cargaPorLotes.total) || cargaPorLotes.total < data.items.length || cargaPorLotes.total > 10000 ||
                !Number.isSafeInteger(Number(cargaPorLotes.preparadoId)) || Number(cargaPorLotes.preparadoId) <= 0)) {
                throw new Error("Datos de creación por lotes inválidos");
            }
            const newRecord = record.create({ type: record.Type.INVOICE, isDynamic: true });
            // nLog.debug("InvoiceDAO - createInvoice - data", data);

            registrarTiempo("fin");
            iniciarEtapa("consultaOV");
            // Buscar orden de venta para obtener campos adicionales
            let salesOrderFields = null;
            if (data.customerId && data.cuentaPaciente) {
                if (medirTiempos) operacion = "SalesOrderDAO.getSalesOrderFields";
                salesOrderFields = SalesOrderDAO.getSalesOrderFields(
                    data.customerId,
                    data.razonSocialCobro,
                    data.cuentaPaciente
                );
            }
            registrarTiempo("fin");
            iniciarEtapa("cabecera");
            // Set Form
            // newRecord.setValue({fieldId: 'customform', value: 'custform_2win_form_fac_electronica'});

            if (medirTiempos) operacion = "setValue:customform";
            newRecord.setValue({ fieldId: "customform", value: 118 });
            if (medirTiempos) operacion = "setValue:custbody_2win_as_rec_fact_key";
            if (data.processKey) newRecord.setValue({ fieldId: "custbody_2win_as_rec_fact_key", value: data.processKey });
            if (medirTiempos) operacion = "setValue:entity";
            newRecord.setValue({ fieldId: "entity", value: data.customerId });
            if (medirTiempos) operacion = "setValue:subsidiary";
            newRecord.setValue({ fieldId: "subsidiary", value: data.razonSocialCobro || 1 }); // Default Subsidiaria 1 si no se pasa
            if (medirTiempos) operacion = "setValue:trandate";
            newRecord.setValue({ fieldId: "trandate", value: new Date(data.fechaTransaccion) });
            if (medirTiempos) operacion = "setValue:approvalstatus";
            newRecord.setValue({ fieldId: "approvalstatus", value: cargaPorLotes ? 1 : 2 });
            if (cargaPorLotes) {
                newRecord.setValue({ fieldId: "custbody_2w_as_fac_lot_cargando", value: true });
                newRecord.setValue({ fieldId: "custbody_2w_as_fac_lot_avance", value: data.items.length });
            }
            if (medirTiempos) operacion = "setValue:account";
            newRecord.setValue({ fieldId: "account", value: data.account });
            if (medirTiempos) operacion = "setValue:custbody_2winfolioacepta";
            newRecord.setValue({ fieldId: "custbody_2winfolioacepta", value: data.folioBoleta });
            if (!data.isFactura) {
                if (medirTiempos) operacion = "setValue:custbody_2wintipodtesii";
                newRecord.setValue({ fieldId: "custbody_2wintipodtesii", value: data.montoIva > 0 ? 11 : 13 }); // Tipo DTE 11 = Boleta electronica, 13 = Boleta Exenta Electrónica
            } else {
                if (medirTiempos) operacion = "setValue:custbody_2wintipodtesii";
                newRecord.setValue({ fieldId: "custbody_2wintipodtesii", value: data.montoIva > 0 ? 1 : 2 }); // Tipo DTE 1 = Factura Afecta Electrónica, 2 = Factura Exenta Electrónica  
            }
            if (data.isNotaDebito) {
                // Tipo DTE 5 = Nota de Débito Electrónica
                if (medirTiempos) operacion = "setValue:custbody_2wintipodtesii";
                newRecord.setValue({ fieldId: "custbody_2wintipodtesii", value: 5 });
            }
            if (medirTiempos) operacion = "setValue:custbody_2win_tran_origin";
            newRecord.setValue({ fieldId: "custbody_2win_tran_origin", value: data.transaccionOrigen });
            // newRecord.setValue({ fieldId: "class", value: 109 });
            // newRecord.setValue({ fieldId: "location", value: 433 });
            if (medirTiempos) operacion = "setValue:custbody_2win_created_from_income_flow";
            newRecord.setValue({ fieldId: "custbody_2win_created_from_income_flow", value: true });
            if (medirTiempos) operacion = "setValue:memo";
            newRecord.setValue({ fieldId: "memo", value: data.memo || "Factura Generica" });
            // Custom Fields
            if (medirTiempos) operacion = "setValue:custbody_2w_as_id_paciente";
            if (data.idPaciente) newRecord.setValue({ fieldId: "custbody_2w_as_id_paciente", value: data.idPaciente });
            if (medirTiempos) operacion = "setValue:custbody_2w_as_reverso_pago";
            if (data.reversoPago) newRecord.setValue({ fieldId: "custbody_2w_as_reverso_pago", value: data.reversoPago });
            if (medirTiempos) operacion = "setValue:custbody_2w_as_ficha_paciente";
            if (data.ficha) newRecord.setValue({ fieldId: "custbody_2w_as_ficha_paciente", value: data.ficha });
            // if (data.prefactura) newRecord.setValue({ fieldId: "custbody_2w_prefactura", value: data.prefactura });
            if (medirTiempos) operacion = "setValue:custbody_2win_nro_cuenta_paciente";
            if (data.cuentaPaciente) newRecord.setValue({ fieldId: "custbody_2win_nro_cuenta_paciente", value: data.cuentaPaciente });

            // Campos adicionales del CSV para facturas (Sale = Y)
            if (medirTiempos) operacion = "setValue:custbody_2w_prevision_paciente";
            if (data.previsionPaciente) newRecord.setValue({ fieldId: "custbody_2w_prevision_paciente", value: data.previsionPaciente });
            if (medirTiempos) operacion = "setValue:custbody_2win_prevision_nom";
            if (data.previsionNombre) newRecord.setValue({ fieldId: "custbody_2win_prevision_nom", value: data.previsionNombre });
            if (medirTiempos) operacion = "setValue:custbody_2w_as_ficha_paciente";
            if (data.paciente) newRecord.setValue({ fieldId: "custbody_2w_as_ficha_paciente", value: data.paciente });
            if (medirTiempos) operacion = "setValue:custbody_2win_ing_correl";
            if (data.nroAdhesion) newRecord.setValue({ fieldId: "custbody_2win_ing_correl", value: data.nroAdhesion });
            if (medirTiempos) operacion = "setValue:custbody_2win_pac_numficha";
            if (data.nroRegistro) newRecord.setValue({ fieldId: "custbody_2win_pac_numficha", value: data.nroRegistro });
            if (medirTiempos) operacion = "setValue:custbody_2win_tipo_atencion";
            if (data.tipoAtencion) newRecord.setValue({ fieldId: "custbody_2win_tipo_atencion", value: data.tipoAtencion });
            if (medirTiempos) operacion = "setValue:custbody_2win_convenio_cod";
            if (data.convenioCod) newRecord.setValue({ fieldId: "custbody_2win_convenio_cod", value: data.convenioCod });
            if (medirTiempos) operacion = "setValue:custbody_2win_convenio_nom";
            if (data.convenioNom) newRecord.setValue({ fieldId: "custbody_2win_convenio_nom", value: data.convenioNom });
            if (medirTiempos) operacion = "setValue:custbody_2win_as_rec_caja_boleta_nula";
            if (data.boletaNula) newRecord.setValue({ fieldId: "custbody_2win_as_rec_caja_boleta_nula", value: data.boletaNula });

            // Campos de la orden de venta (si se encontró)
            if (salesOrderFields) {
                // Campos HL7
                if (salesOrderFields.custbody_2win_ing_correl && !data.nroAdhesion) {
                    if (medirTiempos) operacion = "setValue:custbody_2win_ing_correl";
                    newRecord.setValue({ fieldId: "custbody_2win_ing_correl", value: salesOrderFields.custbody_2win_ing_correl });
                }
                if (salesOrderFields.custbody_2win_pac_numficha && !data.nroRegistro) {
                    if (medirTiempos) operacion = "setValue:custbody_2win_pac_numficha";
                    newRecord.setValue({ fieldId: "custbody_2win_pac_numficha", value: salesOrderFields.custbody_2win_pac_numficha });
                }
                if (salesOrderFields.custbody_2win_tipo_evento_hl7) {
                    if (medirTiempos) operacion = "setValue:custbody_2win_tipo_evento_hl7";
                    newRecord.setValue({ fieldId: "custbody_2win_tipo_evento_hl7", value: salesOrderFields.custbody_2win_tipo_evento_hl7 });
                }
                if (salesOrderFields.custbody_2win_fecha_evento_hl7) {
                    if (medirTiempos) operacion = "setValue:custbody_2win_fecha_evento_hl7";
                    newRecord.setValue({ fieldId: "custbody_2win_fecha_evento_hl7", value: salesOrderFields.custbody_2win_fecha_evento_hl7 });
                }
                if (salesOrderFields.custbody_2win_id_mensaje_hl7) {
                    if (medirTiempos) operacion = "setValue:custbody_2win_id_mensaje_hl7";
                    newRecord.setValue({ fieldId: "custbody_2win_id_mensaje_hl7", value: salesOrderFields.custbody_2win_id_mensaje_hl7 });
                }

                // Campos de atención
                if (salesOrderFields.custbody_2win_fecha_ingreso) {
                    if (medirTiempos) operacion = "setValue:custbody_2win_fecha_ingreso";
                    newRecord.setValue({ fieldId: "custbody_2win_fecha_ingreso", value: salesOrderFields.custbody_2win_fecha_ingreso });
                }
                if (salesOrderFields.custbody_2win_hora_ingreso) {
                    if (medirTiempos) operacion = "setValue:custbody_2win_hora_ingreso";
                    newRecord.setValue({ fieldId: "custbody_2win_hora_ingreso", value: salesOrderFields.custbody_2win_hora_ingreso });
                }
                if (salesOrderFields.custbody_2win_tiene_reclamo) {
                    if (medirTiempos) operacion = "setValue:custbody_2win_tiene_reclamo";
                    newRecord.setValue({ fieldId: "custbody_2win_tiene_reclamo", value: salesOrderFields.custbody_2win_tiene_reclamo });
                }
                if (salesOrderFields.custbody_2win_tiene_seguro) {
                    if (medirTiempos) operacion = "setValue:custbody_2win_tiene_seguro";
                    newRecord.setValue({ fieldId: "custbody_2win_tiene_seguro", value: salesOrderFields.custbody_2win_tiene_seguro });
                }

                // Campos de servicio
                if (salesOrderFields.custbody_2win_servicio_ingreso) {
                    if (medirTiempos) operacion = "setValue:custbody_2win_servicio_ingreso";
                    newRecord.setValue({ fieldId: "custbody_2win_servicio_ingreso", value: salesOrderFields.custbody_2win_servicio_ingreso });
                }
                if (salesOrderFields.custbody_2win_servicio_ingreso_nom) {
                    if (medirTiempos) operacion = "setValue:custbody_2win_servicio_ingreso_nom";
                    newRecord.setValue({ fieldId: "custbody_2win_servicio_ingreso_nom", value: salesOrderFields.custbody_2win_servicio_ingreso_nom });
                }
                if (salesOrderFields.custbody_2win_procedencia) {
                    if (medirTiempos) operacion = "setValue:custbody_2win_procedencia";
                    newRecord.setValue({ fieldId: "custbody_2win_procedencia", value: salesOrderFields.custbody_2win_procedencia });
                }
                if (salesOrderFields.custbody_2win_ley_previsional) {
                    if (medirTiempos) operacion = "setValue:custbody_2win_ley_previsional";
                    newRecord.setValue({ fieldId: "custbody_2win_ley_previsional", value: salesOrderFields.custbody_2win_ley_previsional });
                }
                if (salesOrderFields.custbody_2win_compania_seguro) {
                    if (medirTiempos) operacion = "setValue:custbody_2win_compania_seguro";
                    newRecord.setValue({ fieldId: "custbody_2win_compania_seguro", value: salesOrderFields.custbody_2win_compania_seguro });
                }

                // Campos previsionales adicionales
                if (salesOrderFields.custbody_2win_prevision_cod && !data.previsionNombre) {
                    if (medirTiempos) operacion = "setValue:custbody_2win_prevision_cod";
                    newRecord.setValue({ fieldId: "custbody_2win_prevision_cod", value: salesOrderFields.custbody_2win_prevision_cod });
                }
                if (salesOrderFields.custbody_2win_tramo_fonasa) {
                    if (medirTiempos) operacion = "setValue:custbody_2win_tramo_fonasa";
                    newRecord.setValue({ fieldId: "custbody_2win_tramo_fonasa", value: salesOrderFields.custbody_2win_tramo_fonasa });
                }
                if (salesOrderFields.custbody_2win_rama_ffaa) {
                    if (medirTiempos) operacion = "setValue:custbody_2win_rama_ffaa";
                    newRecord.setValue({ fieldId: "custbody_2win_rama_ffaa", value: salesOrderFields.custbody_2win_rama_ffaa });
                }
                if (salesOrderFields.custbody_2win_paquete_atencion_cod) {
                    if (medirTiempos) operacion = "setValue:custbody_2win_paquete_atencion_cod";
                    newRecord.setValue({ fieldId: "custbody_2win_paquete_atencion_cod", value: salesOrderFields.custbody_2win_paquete_atencion_cod });
                }
                if (salesOrderFields.custbody_2win_paquete_atencion_nom) {
                    if (medirTiempos) operacion = "setValue:custbody_2win_paquete_atencion_nom";
                    newRecord.setValue({ fieldId: "custbody_2win_paquete_atencion_nom", value: salesOrderFields.custbody_2win_paquete_atencion_nom });
                }

                // Responsable de cuenta
                if (salesOrderFields.custbody_2win_responsable_cuenta_cod) {
                    if (medirTiempos) operacion = "setValue:custbody_2win_responsable_cuenta_cod";
                    newRecord.setValue({ fieldId: "custbody_2win_responsable_cuenta_cod", value: salesOrderFields.custbody_2win_responsable_cuenta_cod });
                }
                if (salesOrderFields.custbody_2win_responsable_cuenta_nom) {
                    if (medirTiempos) operacion = "setValue:custbody_2win_responsable_cuenta_nom";
                    newRecord.setValue({ fieldId: "custbody_2win_responsable_cuenta_nom", value: salesOrderFields.custbody_2win_responsable_cuenta_nom });
                }

                // Campos estándar
                if (salesOrderFields.class) {
                    if (medirTiempos) operacion = "setValue:class";
                    newRecord.setValue({ fieldId: "class", value: salesOrderFields.class[0]?.value });
                }
                if (salesOrderFields.department) {
                    if (medirTiempos) operacion = "setValue:department";
                    newRecord.setValue({ fieldId: "department", value: salesOrderFields.department[0]?.value });
                }
            }

            // Campos de caja
            if (medirTiempos) operacion = "setValue:custbodyunidadcaja";
            if (data.unidadCaja) newRecord.setValue({ fieldId: "custbodyunidadcaja", value: data.unidadCaja });
            if (medirTiempos) operacion = "setValue:custbodyfechacaja";
            if (data.fechaCaja) newRecord.setValue({ fieldId: "custbodyfechacaja", value: new Date(data.fechaCaja) });
            if (medirTiempos) operacion = "setValue:custbodyaperturacaja";
            if (data.aperturaCaja) newRecord.setValue({ fieldId: "custbodyaperturacaja", value: data.aperturaCaja });
            if (medirTiempos) operacion = "setValue:custbodyrazonsocialcaja";
            if (data.razonSocialCaja) newRecord.setValue({ fieldId: "custbodyrazonsocialcaja", value: data.razonSocialCaja });
            if (medirTiempos) operacion = "setValue:custbodynumeromovimiento";
            if (data.numeroMovimiento) newRecord.setValue({ fieldId: "custbodynumeromovimiento", value: data.numeroMovimiento });

            registrarTiempo("fin");
            iniciarEtapa("lineas");
            // Agregar items desde boletasEmitidas (si hay detalle de items, sino usar generico)
            // En el JSON de ejemplo no se ve detalle de items dentro de boleta, solo montos totales.
            // Asumiremos un item generico de servicio por el monto total o desglosado si es necesario.

            // Logica para Egresos/Ingresos que afectan boleta
            if (data.items && data.items.length > 0) {
                data.items.forEach((item, indice) => {
                    if (medirTiempos) lineaActual = indice + 1;
                    if (medirTiempos) operacion = "selectNewLine";
                    newRecord.selectNewLine({ sublistId: "item" });
                    if (medirTiempos) operacion = "setCurrentSublistValue:item";
                    newRecord.setCurrentSublistValue({ sublistId: "item", fieldId: "item", value: item.item });
                    if (medirTiempos) operacion = "setCurrentSublistValue:amount";
                    newRecord.setCurrentSublistValue({ sublistId: "item", fieldId: "amount", value: item.rate || 0 });
                    if (medirTiempos) operacion = "setCurrentSublistValue:tax1amt";
                    newRecord.setCurrentSublistValue({ sublistId: "item", fieldId: "tax1amt", value: item.tax1amt || 0 });

                    // newRecord.setCurrentSublistValue({sublistId: 'item', fieldId: 'description', value: item.descripcion});

                    // Nuevos campos de línea para trazabilidad
                    if (medirTiempos) operacion = "setCurrentSublistValue:custcol_2w_folio";
                    if (item.folioBoleta) newRecord.setCurrentSublistValue({ sublistId: "item", fieldId: "custcol_2w_folio", value: item.folioBoleta });
                    if (medirTiempos) operacion = "setCurrentSublistValue:custcol_2win_as_identificador_fila";
                    newRecord.setCurrentSublistValue({ sublistId: "item", fieldId: "custcol_2win_as_identificador_fila", value: 0 });
                    if (cargaPorLotes) {
                        newRecord.setCurrentSublistValue({ sublistId: "item", fieldId: "custcol_2w_as_fac_lot_linea", value: `${data.processKey}:${indice + 1}` });
                    }

                    if (medirTiempos) operacion = "commitLine";
                    newRecord.commitLine({ sublistId: "item" });
                    if (medirTiempos) {
                        lineasCompletadas++;
                        if (lineasCompletadas % 200 === 0 || lineasCompletadas === totalLineas) {
                            registrarTiempo("avance");
                            inicioBloque = Date.now();
                        }
                    }
                });
            } else {
                // Fallback si no hay items especificos, usar monto total de la boleta
                // Esto depende de como se quiera reflejar contablemente
                if (data.montoTotal > 0) {
                    if (medirTiempos) lineaActual = 1;
                    if (medirTiempos) operacion = "selectNewLine";
                    newRecord.selectNewLine({ sublistId: "item" });
                    if (medirTiempos) operacion = "setCurrentSublistValue:item";
                    newRecord.setCurrentSublistValue({ sublistId: "item", fieldId: "item", value: 7627 });
                    if (medirTiempos) operacion = "setCurrentSublistValue:rate";
                    newRecord.setCurrentSublistValue({ sublistId: "item", fieldId: "rate", value: data.montoTotal });

                    // Nuevos campos de línea para fallback
                    if (medirTiempos) operacion = "setCurrentSublistValue:custcol_2w_folio";
                    if (data.folioBoleta) newRecord.setCurrentSublistValue({ sublistId: "item", fieldId: "custcol_2w_folio", value: data.folioBoleta });
                    if (medirTiempos) operacion = "setCurrentSublistValue:custcol_2win_as_identificador_fila";
                    newRecord.setCurrentSublistValue({ sublistId: "item", fieldId: "custcol_2win_as_identificador_fila", value: 0 });

                    if (medirTiempos) operacion = "commitLine";
                    newRecord.commitLine({ sublistId: "item" });
                    if (medirTiempos) {
                        lineasCompletadas++;
                        if (lineasCompletadas % 200 === 0 || lineasCompletadas === totalLineas) {
                            registrarTiempo("avance");
                            inicioBloque = Date.now();
                        }
                    }
                }
            }

            registrarTiempo("fin");
            iniciarEtapa("guardado");
            if (medirTiempos) operacion = "record.save";
            const newId = newRecord.save({ enableSourcing: false, ignoreMandatoryFields: true });
            registrarTiempo("fin");
            nLog.audit("InvoiceDAO", `Invoice creada: ${newId}`);
            return newId;
        } catch (e) {
            registrarTiempo("error");
            if (!data || data.registrarError !== false) nLog.error("InvoiceDAO Error", e);
            throw e;
        }
    }

    function findInvoiceByFolio(folio, customerId, subsidiariaId) {
        try {
            nLog.audit("findInvoiceByFolio - parametros", {
                folio: folio,
                customerId: customerId,
                subsidiariaId: subsidiariaId
            });
            const results = query
                .runSuiteQL({
                    query: `
                select
                    top 1 transaction.id,
                    BUILTIN.DF(transaction.entity)
                    from
                    transaction
                    inner join transactionline tl on tl.transaction = transaction.id and tl.mainline = 'T'
                    where
                    transaction.custbody_2winfolioacepta is not null
                    and transaction.custbody_2winfolioacepta = ?
                    and transaction.entity = ?
                    and tl.subsidiary = ?
                    and transaction.type = 'CustInvc'`,
                    params: [folio, customerId, subsidiariaId]
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
     * Funcion para recuperar el internalid de un cliente a partir del folio de la transaccion
     * @param {string} folio - folio de la transaccion
     * @returns internalid del cliente
     */
    function getInvoiceEntityByFolio(folio) {
        try {
            // nLog.debug("getInvoiceEntityByFolio - parametro", {
            //     folio: folio
            // });

            const results = query
                .runSuiteQL({
                    query: `
                    select top 1
                        transaction.id,
                        transaction.entity,
                        BUILTIN.DF(transaction.entity) AS entityName
                    from
                        transaction
                    where
                        transaction.custbody_2winfolioacepta is not null
                        and transaction.custbody_2winfolioacepta = ?
                        and transaction.type = 'CustInvc'`,
                    params: [folio]
                })
                .asMappedResults();

            nLog.debug("getInvoiceEntityByFolio - results", {
                extension: results.length,
                results: results
            });

            if (results && results.length > 0) {
                return results[0].entity;
            } else {
                throw new Error(`No se encontró transaccion con folio ${folio}`);
            };
        } catch (e) {
            nLog.error("InvoiceDAO - getInvoiceEntityByFolio Error", e);
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
        getInvoiceEntityByFolio: getInvoiceEntityByFolio,
        findAppliedJournals: findAppliedJournals,
        verificarSaldoPendiente: verificarSaldoPendiente
    };
});
