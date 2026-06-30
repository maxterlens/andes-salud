/**
 * @NApiVersion 2.x
 * @NModule 2win_dom_devolucion
 * @NModuleScope public
 */

define([
    'N/runtime',
    'N/log',
    'N/search',
    '../dao/pos_farmacia/2win_dao_auditoria',
    '../dao/pos_farmacia/2win_dao_create_credit_memo',
    '../dao/pos_farmacia/2win_dao_customer_refund',
    '../dao/pos_farmacia/2win_dao_get_value_refund',
    '../dao/pos_farmacia/2win_dao_create_journal_rounding',
    '../dao/pos_farmacia/2win_dao_delete_invoice',
    '../lib/2win_lib_cache',
    '../dao/pos_farmacia/2win_dao_search_cuenta_redondeo'
], function(runtime, log, search, daoAuditoria, daoCreditMemo, daoCustomerRefund, daoGetValueRefund, daoJournalRounding, daoDeleteInvoice, libCache, searchCuentaRedondeoDAO) {

        const tokenAuditoria = daoAuditoria.obtenerToken();

        const CODE_RESPONSE = {
            'OK': 200,
            'BAD_REQUEST': 400,
            'CONFLICT': 409,
            'INTERNAL_SERVER_ERROR': 500
        }

        /**
         * @description Función helper para registrar auditoría de manera segura
         * @param {Object} params - Parámetros del registro de auditoría
         * @param {string} params.etapa - Etapa del proceso
         * @param {string} params.estado - Estado del proceso (000: éxito, 001: error)
         * @param {string} params.descripcionResultado - Descripción del resultado
         * @param {string} [params.tipoRegistroCreado] - Tipo de registro creado (opcional)
         * @param {string} [params.idRegistroCreado] - ID del registro creado (opcional)
         * @returns {Number} - ID del registro de auditoría creado
         */
        function registrarAuditoria(params) {
            const objAuditoria = {
                'nombreProceso': 'Integración POS - Proceso de devolución',
                'scriptId': runtime.getCurrentScript().id,
                'tipoRegistroCreado': params.tipoRegistroCreado || '',
                'idRegistroCreado': params.idRegistroCreado || '',
                'etapa': params.etapa || '',
                'estado': params.estado || '',
                'tokenProceso': tokenAuditoria,
                'descripcionResultado': params.descripcionResultado || ''
            };

            return daoAuditoria.crearReporteAuditoria(objAuditoria);
        }

        /**
         * @description Proceso de devolución
         * @param {*} datosContext 
         * @returns 
         */
        function procesoDevolucion(datosContext) {
            var folioFactura = datosContext.datos.folioNC;
            var numFactura = datosContext.datos.nFactura;
            var tipoReferencia = datosContext.datos.tipoReferencia;
            var linea = datosContext.datos.linea;
            var ubicacion = datosContext.datos.ubicacion;
            var tipoDevolucion = datosContext.datos.tipoDevolucion;

            var objetoCreditMemo = {
                tipo_devolucion: tipoDevolucion,
                folio_factura: folioFactura,
                num_factura: numFactura,
                tipo_referencia: tipoReferencia,
                linea: linea,
                ubicacion: ubicacion
            };

            try {
                // AN-137: Se comenta validacion para cuenta ya que se usa parametro de operacion andessalud_pos_farmacia_id_articulo_reembolso en la creacion de CUSTOMER_REFUND
                // Pre-validación: buscar cuenta contable ANTES de crear la NC
                // var cuenta = libCache.getCuentaByCodigoDevo(tipoDevolucion);
                // log.debug('procesoDevolucion - cuenta', cuenta);
                // if(!cuenta.success){
                //     log.error('Error al buscar cuenta contable por forma de pago', cuenta.error);
                //     registrarAuditoria({
                //         etapa: 'Validación previa',
                //         estado: '001',
                //         descripcionResultado: 'Error al buscar cuenta contable por forma de pago: ' + cuenta.error
                //     });
                //     return {
                //         "tipoMensaje": "POS^DEVOLUCION",
                //         "estado": {
                //             "success": false,
                //             "codigo": CODE_RESPONSE.INTERNAL_SERVER_ERROR,
                //             "mensaje": "Error al buscar cuenta contable por forma de pago: " + cuenta.error
                //         }
                //     };
                // }

                // Creación nota de crédito
                var idCreditMemo = daoCreditMemo.createCreditMemo(objetoCreditMemo);
                if(!idCreditMemo.success){
                    log.error('Error al registrar la devolución', idCreditMemo.error);
                    registrarAuditoria({
                        etapa: 'Creación nota de crédito',
                        estado: '001',
                        descripcionResultado: 'Error al registrar la devolución: ' + idCreditMemo.error
                    });
                    throw {
                        "tipoMensaje": "POS^DEVOLUCION",
                        "estado": {
                            "success": false,
                            "codigo": CODE_RESPONSE.INTERNAL_SERVER_ERROR,
                            "mensaje": "Error al registrar la devolución: " + idCreditMemo.error
                        }
                    };
                }

                // Obtener valores para el Customer Refund
                var valoresRefund = daoGetValueRefund.getValuesForRefund(idCreditMemo.creditMemoId);

                if(!valoresRefund.success){
                    log.error('Error al obtener valores para refund', valoresRefund.error);
                    registrarAuditoria({
                        etapa: 'Obtención valores refund',
                        estado: '001',
                        descripcionResultado: 'Error al obtener valores para refund: ' + valoresRefund.error
                    });
                    throw {
                        "tipoMensaje": "POS^DEVOLUCION",
                        "estado": {
                            "success": false,
                            "codigo": CODE_RESPONSE.INTERNAL_SERVER_ERROR,
                            "mensaje": "Error al obtener valores para refund: " + valoresRefund.error
                        }
                    };
                }

                // === INICIO: Journal de redondeo ===
                // Buscar Customer Payments de la factura original para determinar monto total pagado
                // y comparar con el total de la NC para detectar diferencia de redondeo
                var idJournalRedondeo = null;
                var ncFields = search.lookupFields({
                    type: search.Type.CREDIT_MEMO,
                    id: idCreditMemo.creditMemoId,
                    columns: ['createdfrom', 'location']
                });

                var invoiceOriginalId = ncFields.createdfrom && ncFields.createdfrom.length > 0
                    ? ncFields.createdfrom[0].value : null;
                var ubicacionNC = ncFields.location && ncFields.location.length > 0
                    ? ncFields.location[0].value : null;

                if (invoiceOriginalId) {
                    // Buscar Customer Payments aplicados a la factura original (pueden ser varios)
                    var totalPagosFactura = 0;
                    var paymentSearch = search.create({
                        type: search.Type.CUSTOMER_PAYMENT,
                        filters: [
                            ['appliedtotransaction', 'is', invoiceOriginalId],
                            'AND',
                            ['mainline', 'is', 'T']
                        ],
                        columns: [
                            search.createColumn({ name: 'amount' })
                        ]
                    });

                    paymentSearch.run().each(function(result) {
                        totalPagosFactura += parseFloat(result.getValue({ name: 'amount' })) || 0;
                        return true;
                    });

                    // Obtener total de la NC
                    var detalleNC = daoJournalRounding.getTransactionDetails(idCreditMemo.creditMemoId, 'creditmemo');

                    if (detalleNC.success) {
                        var totalNC = detalleNC.total;
                        var diferenciaRedondeo = totalPagosFactura - totalNC;

                        log.audit('Redondeo Devolución - Cálculo', {
                            invoiceOriginalId: invoiceOriginalId,
                            totalPagosFactura: totalPagosFactura,
                            totalNC: totalNC,
                            diferenciaRedondeo: diferenciaRedondeo
                        });

                        if (Math.abs(diferenciaRedondeo) > 0 && Math.abs(diferenciaRedondeo) <= 5) {
                            var cuentaRedondeoResult = searchCuentaRedondeoDAO.searchCuentaRedondeo();
                            var departamentoResult = ubicacionNC ? libCache.getCentroCostoByUbicacionId(ubicacionNC) : { success: false };

                            if (cuentaRedondeoResult.success) {
                                // Si los pagos fueron MAYOR que la NC → DEBITO_AR (cancela saldo a favor)
                                // Si los pagos fueron MENOR que la NC → CREDITO_AR (reduce saldo pendiente NC)
                                var direccionJournal = diferenciaRedondeo > 0 ? 'DEBITO_AR' : 'CREDITO_AR';

                                var journalData = {
                                    idTransaccion: idCreditMemo.creditMemoId,
                                    tipoTransaccion: 'creditmemo',
                                    cliente: valoresRefund.customerId,
                                    subsidiaria: valoresRefund.subsidiaryId,
                                    ubicacion: ubicacionNC,
                                    departamento: departamentoResult.success ? departamentoResult.result : null,
                                    montoRedondeo: Math.abs(diferenciaRedondeo),
                                    cuentaRedondeo: cuentaRedondeoResult.result,
                                    cuentaAR: detalleNC.account,
                                    direccionJournal: direccionJournal
                                };

                                var resultadoJournal = daoJournalRounding.createJournalRounding(journalData);

                                if (resultadoJournal.success) {
                                    idJournalRedondeo = resultadoJournal.result;
                                    log.audit('Journal de redondeo creado para NC', { journalId: resultadoJournal.result, diferencia: diferenciaRedondeo });
                                    registrarAuditoria({
                                        etapa: 'Journal de Redondeo',
                                        estado: '000',
                                        tipoRegistroCreado: 'journalentry',
                                        idRegistroCreado: resultadoJournal.result,
                                        descripcionResultado: 'Journal de redondeo creado para NC Folio ' + folioFactura + '. Diferencia: ' + diferenciaRedondeo + ' CLP'
                                    });
                                } else {
                                    log.error('Error al crear journal de redondeo para NC', resultadoJournal.error);
                                    registrarAuditoria({
                                        etapa: 'Journal de Redondeo',
                                        estado: '001',
                                        descripcionResultado: 'Error al crear journal de redondeo para NC Folio ' + folioFactura + ': ' + resultadoJournal.error
                                    });

                                    // Eliminar la NC creada ya que falló el journal de redondeo
                                    var resultadoEliminacionNC = daoDeleteInvoice.deleteCreditMemo(idCreditMemo.creditMemoId);
                                    if (resultadoEliminacionNC.success) {
                                        registrarAuditoria({
                                            etapa: 'Eliminación de NC por error en journal de redondeo',
                                            estado: '000',
                                            tipoRegistroCreado: 'creditmemo',
                                            idRegistroCreado: idCreditMemo.creditMemoId,
                                            descripcionResultado: 'Nota de crédito folio ' + folioFactura + ' eliminada por error en journal de redondeo: ' + resultadoJournal.error
                                        });
                                    } else {
                                        log.error({
                                            title: 'Error al eliminar NC',
                                            details: resultadoEliminacionNC.result
                                        });
                                        registrarAuditoria({
                                            etapa: 'Error al eliminar NC',
                                            estado: '001',
                                            descripcionResultado: 'Error al intentar eliminar NC ID ' + idCreditMemo.creditMemoId + ': ' + resultadoEliminacionNC.result
                                        });
                                    }

                                    throw new Error('Error al crear journal de redondeo: ' + resultadoJournal.error + '. NC eliminada.');
                                }
                            } else {
                                log.error('Cuenta de redondeo no configurada', cuentaRedondeoResult.error);
                                registrarAuditoria({
                                    etapa: 'Journal de Redondeo',
                                    estado: '001',
                                    descripcionResultado: 'Cuenta de redondeo no configurada: ' + cuentaRedondeoResult.error
                                });
                            }
                        } else if (Math.abs(diferenciaRedondeo) > 5) {
                            log.error('Diferencia de redondeo excesiva en devolución', { diferencia: diferenciaRedondeo, folioNC: folioFactura });
                            registrarAuditoria({
                                etapa: 'Journal de Redondeo',
                                estado: '001',
                                descripcionResultado: 'Diferencia de redondeo excesiva (' + diferenciaRedondeo + ' CLP) en NC Folio ' + folioFactura + '. Se omite journal.'
                            });
                        }
                    } else {
                        log.error('Error al obtener detalles de NC para redondeo', detalleNC.error);
                    }
                } else {
                    log.error('No se pudo obtener factura original de la NC', { creditMemoId: idCreditMemo.creditMemoId });
                }
                // === FIN: Journal de redondeo ===

                //Proceso de reembolso - usar cuenta ya validada anteriormente
                // valoresRefund.accountId = cuenta.result;

                var objetoCustomerRefund = {
                    // account: valoresRefund.accountId,
                    creditMemoId: idCreditMemo.creditMemoId,
                    customerId: valoresRefund.customerId,
                    paymentMethodId: valoresRefund.paymentMethodId,
                    subsidiary: valoresRefund.subsidiaryId,
                    memo: 'Reembolso por devolución - NC Folio: ' + folioFactura,
                    items: valoresRefund.items,
                    id_journal: idJournalRedondeo
                };

                var idCustomerRefund = daoCustomerRefund.createCustomerRefund(objetoCustomerRefund);
                if(!idCustomerRefund.success){
                    log.error('Error al crear Customer Refund', idCustomerRefund.error);
                    registrarAuditoria({
                        etapa: 'Creación Customer Refund',
                        estado: '001',
                        descripcionResultado: 'Error al crear Customer Refund: ' + idCustomerRefund.error
                    });
                    throw {
                        "tipoMensaje": "POS^DEVOLUCION",
                        "estado": {
                            "success": false,
                            "codigo": CODE_RESPONSE.INTERNAL_SERVER_ERROR,
                            "mensaje": "Error al crear Customer Refund: " + idCustomerRefund.error
                        }
                    };
                }

                // Auditoría final - solo una vez al completar exitosamente
                registrarAuditoria({
                    etapa: 'Proceso completado',
                    estado: '000',
                    tipoRegistroCreado: 'creditmemo,customerrefund',
                    idRegistroCreado: idCreditMemo.creditMemoId + ',' + idCustomerRefund.customer_refund_id,
                    descripcionResultado: 'Devolución completada exitosamente - NC Folio: ' + folioFactura
                });

                return {  
                    "tipoMensaje": "POS^DEVOLUCION",  
                    "estado": {  
                        "success": true,
                        "codigo": CODE_RESPONSE.OK,  
                        "mensaje": "Devolución registrada exitosamente"  
                    }
                };
            } catch (error) {
                log.error({
                    title: 'Error en Proceso de Devolución',
                    details: error
                });

                registrarAuditoria({
                    etapa: 'Error General',
                    estado: '001',
                    descripcionResultado: 'Error en Proceso de Devolución: ' + (error.message || JSON.stringify(error))
                });

                throw error;
            }
        }

        return {
            procesoDevolucion: procesoDevolucion
        };
    }
)