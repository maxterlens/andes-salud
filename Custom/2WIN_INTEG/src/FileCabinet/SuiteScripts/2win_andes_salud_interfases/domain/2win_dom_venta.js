/**
 * @NApiVersion 2.x
 * @NModule 2win_dom_venta
 * @NModuleScope public
 */

define([
    'N/log',
    'N/runtime',
    '../dao/pos_farmacia/2win_dao_create_invoice',
    '../dao/pos_farmacia/2win_dao_auditoria',
    '../dao/pos_farmacia/2win_dao_create_customer_payment',
    '../dao/pos_farmacia/2win_dao_search_customer',
    '../dao/pos_farmacia/2win_dao_create_cash_sale',
    '../dao/pos_farmacia/2win_dao_search_invoice',
    '../dao/pos_farmacia/2win_dao_delete_invoice',
    '../dao/pos_farmacia/2win_dao_create_journal_rounding',
    '../lib/2win_lib_cache',
    '../dao/pos_farmacia/2win_dao_mapping',
    '../dao/pos_farmacia/2win_dao_search_cuenta_redondeo'
],
    function(
        log,
        runtime,
        daoCreateInvoice,
        daoAuditoria,
        daoCreateCustomerPayment,
        daoSearchCustomer,
        daoCreateCashSale,
        daoSearchInvoice,
        daoDeleteInvoice,
        daoJournalRounding,
        libCache,
        MappingDAO,
        searchCuentaRedondeoDAO
   ){
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
            var objAuditoria = {
                'nombreProceso': 'Integración POS - Proceso de venta',
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
         * @description Crea un objeto de auditoría sin registrarlo (para acumular en batch)
         * @param {Object} params - Parámetros del registro de auditoría
         * @returns {Object} - Objeto de auditoría listo para batch
         */
        function crearObjAuditoria(params) {
            return {
                'nombreProceso': 'Integración POS - Proceso de venta',
                'scriptId': runtime.getCurrentScript().id,
                'tipoRegistroCreado': params.tipoRegistroCreado || '',
                'idRegistroCreado': params.idRegistroCreado || '',
                'etapa': params.etapa || '',
                'estado': params.estado || '',
                'tokenProceso': tokenAuditoria,
                'descripcionResultado': params.descripcionResultado || ''
            };
        }

        /**
         * @description Proceso de venta
         * @param {*} context 
         * @returns 
         */
        function procesoVenta(context) {
            try{
                var datosContext = context.datos;
                log.debug('Datos recibidos en procesoVenta:', datosContext);
                var rutSubContext = datosContext.subsidiaria;
                var formatRutSubsidiaria = rutSubContext.slice(0, -1) + '-' + rutSubContext.slice(-1);

                // Obtener ID de subsidiaria desde caché usando libCache
                var internalIdSubsidiaria = libCache.getSubsidiariaByRut(formatRutSubsidiaria);

                if(!internalIdSubsidiaria.success){
                    registrarAuditoria({
                        etapa: 'Búsqueda de Subsidiaria',
                        estado: '001',
                        descripcionResultado: internalIdSubsidiaria.error
                    });

                    throw new Error(internalIdSubsidiaria.error);
                }

                var dataSearchInvoice = {folioFactura: datosContext.folio};
                var existFolioInvoice = daoSearchInvoice.searchInvoice(dataSearchInvoice);

                if(existFolioInvoice.success){
                    var mensaje = "La factura con folio: " + datosContext.folio + " ya existe";
                    log.audit(mensaje);
                    throw new Error(mensaje);
                }

                var idSubsidiaria = internalIdSubsidiaria.result;
                log.audit("ID Interno de Subsidiaria Encontrado", idSubsidiaria);

                datosContext.subsidiaria = idSubsidiaria;

                // Obtener ID de ubicación desde caché usando libCache
                var internalIdUbicacion = libCache.getUbicacionByCodigo(datosContext.ubicacion);

                if(!internalIdUbicacion.success){
                    registrarAuditoria({
                        etapa: 'Búsqueda de Ubicación',
                        estado: '001',
                        descripcionResultado: internalIdUbicacion.error
                    });

                    throw internalIdUbicacion.result;
                }

                var idUbicacion = internalIdUbicacion.result;
                datosContext.ubicacion = idUbicacion;

                // Obtener ID de tipo DTE desde caché usando libCache
                var internalIdTipoDTE = libCache.getTipoDTEByCodigo(datosContext.tipoDocumento);

                if(!internalIdTipoDTE.success){
                    registrarAuditoria({
                        etapa: 'Búsqueda de Tipo DTE',
                        estado: '001',
                        descripcionResultado: internalIdTipoDTE.error
                    });

                    throw new Error(internalIdTipoDTE.error);
                }

                var idTipoDTE = internalIdTipoDTE.result;
                datosContext.id_tipo_dte = idTipoDTE;
                var idPaciente = MappingDAO.getItemMapping(111).cliente
                
                var internalIdCliente = daoSearchCustomer.buscarClientePorExtId(datosContext.cliente);
                var idCliente = internalIdCliente.result;
                if(!internalIdCliente.success){
                    // registrarAuditoria({
                    //     etapa: 'Búsqueda de Cliente',
                    //     estado: '001',
                    //     descripcionResultado: 'Cliente no encontrado con External ID: ' + datosContext.cliente
                    // });

                    // throw new Error('Cliente no encontrado con External ID: ' + datosContext.cliente);

                    idCliente = idPaciente; // Cliente genérico para ventas sin cliente identificado
                }

                
                datosContext.cliente = idCliente;

                var idFormaPago = 1;
                datosContext.formaPago = idFormaPago;

                var discountMap = null;
                var hasDiscounts = false;

                // Se verifica si hay productos con descuento
                for (var check = 0; check < datosContext.detalleProductos.length; check++) {
                    if (datosContext.detalleProductos[check].descuento != 0 &&
                        datosContext.detalleProductos[check].descuento != null &&
                        datosContext.detalleProductos[check].descuento != undefined &&
                        typeof parseFloat(datosContext.detalleProductos[check].descuento) === 'number') {
                        log.debug("procesoVenta - descuento", {descuento: datosContext.detalleProductos[check].descuento});    
                        hasDiscounts = true;
                        break;
                    }
                }
                
                // Buscar artículo de descuento en pesos desde caché usando libCache
                var paramDescuento = libCache.getParametroByNombre("andessalud_pos_farmacia_id_articulo_descuento");
                var articuloDeDescuento = paramDescuento.success ? paramDescuento.result : null;
                log.debug("procesoVenta - articuloDeDescuento", {articuloDeDescuento: articuloDeDescuento});    

                if (hasDiscounts) {
                    var listDiscountsResult = libCache.getAllDiscounts();

                    if (!listDiscountsResult.success) {
                        throw new Error('Error al obtener lista de descuentos: ' + listDiscountsResult.error);
                    }

                    var listDiscounts = listDiscountsResult.result;

                    discountMap = {};
                    for (var d = 0; d < listDiscounts.length; d++) {
                        discountMap[listDiscounts[d].discount_rate] = listDiscounts[d];
                    }

                    log.debug({
                        title: 'Discount Map creado',
                        details: 'Total descuentos: ' + listDiscounts.length
                    });
                }

                var datosLineas = [];
                for (var i = 0; i < datosContext.detalleProductos.length; i++) {
                    var producto = datosContext.detalleProductos[i];

                    // Validación valor unitario Neto
                    if(
                        producto.hasOwnProperty('valorUnitarioNeto') &&
                        producto.valorUnitarioNeto == "" || 
                        producto.valorUnitarioNeto == null || 
                        producto.valorUnitarioNeto == undefined || 
                        producto.valorUnitarioNeto === 0
                    ) { 
                        return {
                            "tipoMensaje": "POS^VENTA",
                            "estado": {
                                "success": false,
                                "codigo": CODE_RESPONSE.BAD_REQUEST,
                                "mensaje": 'El valor unitario bruto no puede ser cero o vacío para el artículo: ' + producto.articulo
                            }
                        };
                    } 

                    datosLineas.push({
                        articulo: producto.articulo,
                        cantidad: producto.cantidad,
                        valorUnitarioNeto: producto.valorUnitarioNeto,
                        codIVA: producto.codIVA == null || producto.codIVA == "" ? 0 : producto.codIVA,
                        total: producto.total
                    });

                    // Línea para descuento
                    if (producto.descuento != 0 && producto.descuento != null && producto.descuento != undefined && typeof parseFloat(producto.descuento) === 'number') {
                        
                        var discount = -Math.abs(producto.descuento + (producto.descuento * 0.19));

                        log.debug("procesoVenta - descuento en pesos", {descuento: discount});
                        
                        datosLineas.push({
                            articulo: articuloDeDescuento.text,
                            cantidad: 1,
                            valorUnitarioNeto: -Math.abs(producto.descuento)*producto.valorUnitarioNeto/100,
                            codIVA: producto.codIVA == null || producto.codIVA == "" ? 0 : producto.codIVA,
                            //total: discount
                        });
                    }
                }

                var dataJsonTrx = {
                    cliente: idCliente,
                    subsidiaria: idSubsidiaria,
                    ubicacion: idUbicacion,
                    id_tipo_dte: idTipoDTE,
                    folio: datosContext.folio,
                    formaPago: idFormaPago,
                    datosLinea: datosLineas
                };

                var resultadoFactura = crearInvoice(dataJsonTrx);

                if(!resultadoFactura.success){
                    registrarAuditoria({
                        etapa: 'Creación de Factura',
                        estado: '001',
                        descripcionResultado: 'Error al crear factura de venta folio: ' + datosContext.folio + ', ' + resultadoFactura.result
                    });

                    throw new Error(resultadoFactura.result);
                }

                var idFactura = resultadoFactura.result;
                registrarAuditoria({
                    etapa: 'Creación de Factura',
                    estado: '000',
                    tipoRegistroCreado: 'invoice',
                    idRegistroCreado: idFactura,
                    descripcionResultado: 'Factura de venta folio ' + datosContext.folio + ' creada satisfactoriamente'
                });

                // === INICIO: Journal de redondeo por pago EFECTIVO ===
                // Calcular diferencia entre total de la factura y los pagos recibidos
                // El redondeo se origina en el pago en EFECTIVO
                var idJournalRedondeo = null;
                var detalleFactura = daoJournalRounding.getTransactionDetails(idFactura, 'invoice');
                
                if (detalleFactura.success) {
                    var totalInvoice = detalleFactura.total;
                    
                    // Sumar montos por tipo de pago
                    var montoEfectivo = 0;
                    var totalOtrosPagos = 0;
                    
                    for (var fp = 0; fp < datosContext.detalleFormaPago.length; fp++) {
                        var pagoFP = datosContext.detalleFormaPago[fp];
                        if (pagoFP.tipoFormaPago && pagoFP.tipoFormaPago.toUpperCase() === 'EFECTIVO') {
                            montoEfectivo += parseFloat(pagoFP.monto) || 0;
                        } else {
                            totalOtrosPagos += parseFloat(pagoFP.monto) || 0;
                        }
                    }
                    
                    // El efectivo esperado es lo que falta para cubrir la factura después de los otros pagos
                    var montoEfectivoEsperado = totalInvoice - totalOtrosPagos;
                    var diferenciaRedondeo = montoEfectivo - montoEfectivoEsperado;
                    
                    log.audit('Redondeo Venta - Cálculo', {
                        totalInvoice: totalInvoice,
                        montoEfectivo: montoEfectivo,
                        totalOtrosPagos: totalOtrosPagos,
                        montoEfectivoEsperado: montoEfectivoEsperado,
                        diferenciaRedondeo: diferenciaRedondeo
                    });
                    
                    if (Math.abs(diferenciaRedondeo) > 0 && Math.abs(diferenciaRedondeo) <= 5) {
                        // Obtener cuenta de redondeo y departamento
                        var cuentaRedondeoResult = searchCuentaRedondeoDAO.searchCuentaRedondeo();
                        var departamentoResult = libCache.getCentroCostoByUbicacionId(idUbicacion);
                        
                        if (cuentaRedondeoResult.success) {
                            var direccionJournal = diferenciaRedondeo > 0 ? 'DEBITO_AR' : 'CREDITO_AR';
                            
                            var journalData = {
                                idTransaccion: idFactura,
                                tipoTransaccion: 'invoice',
                                cliente: dataJsonTrx.cliente,
                                subsidiaria: dataJsonTrx.subsidiaria,
                                ubicacion: dataJsonTrx.ubicacion,
                                departamento: departamentoResult.success ? departamentoResult.result : null,
                                montoRedondeo: Math.abs(diferenciaRedondeo),
                                cuentaRedondeo: cuentaRedondeoResult.result,
                                cuentaAR: detalleFactura.account,
                                direccionJournal: direccionJournal
                            };
                            
                            var resultadoJournal = daoJournalRounding.createJournalRounding(journalData);
                            
                            if (resultadoJournal.success) {
                                idJournalRedondeo = resultadoJournal.result;
                                log.audit('Journal de redondeo creado', { journalId: resultadoJournal.result, diferencia: diferenciaRedondeo });
                                registrarAuditoria({
                                    etapa: 'Journal de Redondeo',
                                    estado: '000',
                                    tipoRegistroCreado: 'journalentry',
                                    idRegistroCreado: resultadoJournal.result,
                                    descripcionResultado: 'Journal de redondeo creado para factura folio ' + datosContext.folio + '. Diferencia: ' + diferenciaRedondeo + ' CLP (EFECTIVO)'
                                });
                            } else {
                                log.error('Error al crear journal de redondeo', resultadoJournal.error);
                                registrarAuditoria({
                                    etapa: 'Journal de Redondeo',
                                    estado: '001',
                                    descripcionResultado: 'Error al crear journal de redondeo para factura folio ' + datosContext.folio + ': ' + resultadoJournal.error
                                });

                                // Eliminar la factura creada ya que falló el journal de redondeo
                                var resultadoEliminacion = daoDeleteInvoice.deleteInvoice(idFactura);
                                if (resultadoEliminacion.success) {
                                    registrarAuditoria({
                                        etapa: 'Eliminación de Factura por error en journal de redondeo',
                                        estado: '000',
                                        tipoRegistroCreado: 'invoice',
                                        idRegistroCreado: idFactura,
                                        descripcionResultado: 'Factura de venta folio ' + datosContext.folio + ' eliminada por error en journal de redondeo: ' + resultadoJournal.error
                                    });
                                } else {
                                    log.error({
                                        title: 'Error al eliminar factura',
                                        details: resultadoEliminacion.result
                                    });
                                    registrarAuditoria({
                                        etapa: 'Error al eliminar factura',
                                        estado: '001',
                                        descripcionResultado: 'Error al intentar eliminar factura ID ' + idFactura + ': ' + resultadoEliminacion.result
                                    });
                                }

                                throw new Error('Error al crear journal de redondeo: ' + resultadoJournal.error + '. Factura eliminada.');
                            }
                        } else {
                            log.error('Cuenta de redondeo no configurada', cuentaRedondeoResult.error);
                            registrarAuditoria({
                                etapa: 'Journal de Redondeo',
                                estado: '001',
                                descripcionResultado: 'Cuenta de redondeo no configurada, no se pudo crear journal: ' + cuentaRedondeoResult.error
                            });
                        }
                    } else if (Math.abs(diferenciaRedondeo) > 5) {
                        log.error('Diferencia de redondeo excesiva', { diferencia: diferenciaRedondeo, folio: datosContext.folio });
                        registrarAuditoria({
                            etapa: 'Journal de Redondeo',
                            estado: '001',
                            descripcionResultado: 'Diferencia de redondeo excesiva (' + diferenciaRedondeo + ' CLP) para factura folio ' + datosContext.folio + '. Se omite journal.'
                        });
                    }
                } else {
                    log.error('Error al obtener detalles de factura para redondeo', detalleFactura.error);
                }
                // === FIN: Journal de redondeo por pago EFECTIVO ===

                var idsPagoCreados = [];

                for (var j = 0; j < datosContext.detalleFormaPago.length; j++) {
                    var pago = datosContext.detalleFormaPago[j];

                    // Obtener cuenta contable desde caché usando libCache
                    var cuenta = libCache.getCuentaByFormaPagoVenta((pago.tipoFormaPago).toUpperCase());

                    if(!cuenta.success){
                        idsPagoCreados.push({
                            success: false,
                            result: 'Cuenta no encontrada para forma de pago: ' + pago.tipoFormaPago + ', error: ' + cuenta.error
                        });
                        continue;
                    }

                    var objPagoInvoice = {
                        id_invoice: idFactura,
                        forma_pago: pago.tipoFormaPago,
                        cuenta: cuenta.result,
                        folio_doc_forma_pago: pago.folioDocFormaPago,
                        monto: pago.monto,
                        cliente: idCliente,
                        subsidiaria: idSubsidiaria,
                        id_journal: (pago.tipoFormaPago && pago.tipoFormaPago.toUpperCase() === 'EFECTIVO') ? idJournalRedondeo : null
                    };

                    try {
                        var resultadoPago = pagoInvoice(objPagoInvoice);
                        idsPagoCreados.push(resultadoPago);
                    } catch (ePago) {
                        log.error({
                            title: 'Excepción en pagoInvoice',
                            details: ePago
                        });
                        idsPagoCreados.push({
                            success: false,
                            result: ePago.message || String(ePago)
                        });
                    }
                }

                var errores = [];
                var pagosOK = [];
                var auditoriasPagos = [];

                for (var k = 0; k < idsPagoCreados.length; k++) {
                    var resPago = idsPagoCreados[k];

                    if(!resPago.success){
                        log.error('Error Pago factura', resPago.result);
                        errores.push(resPago.result);

                        auditoriasPagos.push(crearObjAuditoria({
                            etapa: 'Pago de factura',
                            estado: '001',
                            descripcionResultado: 'Error al crear pago de factura de venta folio: ' + datosContext.folio + ', ' + resPago.result
                        }));
                    } else {
                        var idPago = resPago.result;
                        pagosOK.push(idPago);

                        auditoriasPagos.push(crearObjAuditoria({
                            etapa: 'Pago de factura',
                            estado: '000',
                            tipoRegistroCreado: 'customerpayment',
                            idRegistroCreado: idPago,
                            descripcionResultado: 'Pago de factura folio: ' + datosContext.folio + ' creado satisfactoriamente'
                        }));
                    }
                }

                if(auditoriasPagos.length > 0){
                    daoAuditoria.crearReportesAuditoriaBatch(auditoriasPagos);
                }


                if(errores.length > 0){
                    // Eliminar la factura creada ya que fallaron los pagos
                    var resultadoEliminacion = daoDeleteInvoice.deleteInvoice(idFactura);
                    
                    if(resultadoEliminacion.success){
                        registrarAuditoria({
                            etapa: 'Eliminación de Factura por error en pagos',
                            estado: '000',
                            tipoRegistroCreado: 'invoice',
                            idRegistroCreado: idFactura,
                            descripcionResultado: 'Factura de venta folio ' + datosContext.folio + ' eliminada por error en pagos: ' + errores.join(', ')
                        });
                    } else {
                        log.error({
                            title: 'Error al eliminar factura',
                            details: resultadoEliminacion.result
                        });
                        registrarAuditoria({
                            etapa: 'Error al eliminar factura',
                            estado: '001',
                            descripcionResultado: 'Error al intentar eliminar factura ID ' + idFactura + ': ' + resultadoEliminacion.result
                        });
                    }
                    
                    throw new Error(errores.join(', '));
                }

                return {  
                    "tipoMensaje": "POS^VENTA",  
                    "estado": {  
                        "success": true,  
                        "codigo": CODE_RESPONSE.OK,  
                        "mensaje": "Venta registrada exitosamente"
                    }
                };
                
            } catch (error) {
                log.error({
                    title: 'Error en Proceso de Venta',
                    details: error
                });

                throw error;
            }
        }

        return {
            procesoVenta: procesoVenta
        };

        /**
         * @description Obtiene el ID interno de la subsidiaria a partir de su RUT.
         * @param {*} rutSubsidiaria 
         * @returns 
         */
        function obtenerIdSubPorRut(rutSubsidiaria) {
            try{
                var formatRutSubsidiaria = rutSubsidiaria.slice(0, -1) + '-' + rutSubsidiaria.slice(-1);
                log.debug({
                    title: 'RUT Formateado de Subsidiaria',
                    details: formatRutSubsidiaria
                });

                var resultSearchSubsidiaria = daoSearchSubsidiaria.searchSubsidiaria(formatRutSubsidiaria);

                if(resultSearchSubsidiaria.length === 0){
                    return { success: false, result: "Subsidiaria no encontrada" };
                }

                return { success: true, result: resultSearchSubsidiaria[0].internal_id };
            } catch (error) {
                log.error({
                    title: 'Error en obtenerIdSubPorRut',
                    details: error
                });

                return { success: false, result: error.message };
            }
        }

        /**
         * @description Obtiene el ID interno de la ubicación a partir de su nombre.
         * @param {*} nombreUbicacion 
         * @returns 
         */
        function obtenerIdUbicacionPorNombre(nombreUbicacion) {
            try {
                var resultSearchUbicacion = daoSearchUbicacion.searchUbicacion(nombreUbicacion);

                if (resultSearchUbicacion.length === 0) {
                    return { success: false, result: "Ubicación no encontrada" };
                }

                return { success: true, result: resultSearchUbicacion[0].internal_id };
            } catch (error) {
                log.error({
                    title: 'Error en obtenerIdUbicacionPorNombre',
                    details: error
                });

                return { success: false, result: error.message };
            }
        }
       
        /**
         * @description Crea una factura en NetSuite con los datos proporcionados.
         * @param {*} data 
         * @returns 
         */
        function crearInvoice(data){
            log.debug('Datos para crear la factura:', data);

            var invoice = daoCreateInvoice.createInvoice(data);

            log.debug({
                title: 'Invoice Creado',
                details: invoice
            });

            return invoice;
        } 

        /**
         * @description Crea un pago de factura en NetSuite con los datos proporcionados.
         * @param {*} data 
         * @returns 
         */
        function pagoInvoice(data){
            log.debug('Datos para crear el pago:', data);

            var payment = daoCreateCustomerPayment.createCustomerPayment(data);

            log.debug({
                title: 'Pago Creado',
                details: payment
            });

            return payment;
        }

        function crearBoleta(data){
            log.debug('Datos para crear la boleta:', data);

            var boleta = daoCreateCashSale.createCashSale(data);

            log.debug({
                title: 'Boleta Creada',
                details: boleta
            });

            return boleta;
        }
    }
);