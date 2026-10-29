define(['./2win_dao', 'N/search', 'N/record', 'N/runtime'],

    function (dao, search, record, runtime) {

        const ESTADO_APROBACION_APROBADO = 2;

        function findByInternalId(internalid) {

            try {

                log.debug('findByInternalId', internalid);

                var tabItem = {
                    type: "transaction",
                    settings: [{ "name": "consolidationtype", "value": "ACCTTYPE" }],
                    filters:
                        [
                            ["internalidnumber", "equalto", internalid],	/* ID Interno de factura */
                            "AND",
                            ["type", "anyof", "VendBill"],
                            "AND",
                            ["accounttype", "anyof", "AcctPay"],
                            "AND",
                            ["amountremaining", "greaterthan", "0"]
                        ],
                    columns:
                        [
                            search.createColumn({ name: "internalid", label: "id" }),
                            search.createColumn({ name: "trandate", label: "fecha" }),
                            search.createColumn({ name: "account", label: "id_cuenta" }),
                            search.createColumn({ name: "debitamount", label: "debito" }),
                            //search.createColumn({ name: "creditamount", label: "credito" }),
                            search.createColumn({ name: "amountremaining", label: "credito" }),
                            search.createColumn({ name: "accounttype", label: "tipo_cuenta" }),
                            search.createColumn({ name: "entity", label: "id_proveedor" }),
                            search.createColumn({ name: "subsidiary", label: "subsidiaria"})
                        ]
                }

                var result = dao.getDataSearch(tabItem);

                if (result.length > 0) {
                    return result[0];
                } else {
                    return null;
                }

            } catch (error) {
                throw error;
            }
        }

        function findByAccountInternalId(account, internalid) {

            try {

                log.debug('findByAccountInternalId', internalid, account);

                var tabItem = {
                    type: "transaction",
                    settings: [{ "name": "consolidationtype", "value": "ACCTTYPE" }],
                    filters:
                        [
                            [
                                ["account", "anyof", account], 
                                "AND", 
                                ["internalidnumber", "equalto", internalid], 
                                "AND", 
                                ["type", "anyof", "VendBill"]]
                        ],
                    columns:
                        [
                            search.createColumn({ name: "internalid", label: "id" }),
                            search.createColumn({ name: "trandate", label: "fecha" }),
                            search.createColumn({ name: "account", label: "cuenta" }),
                            search.createColumn({ name: "amount", label: "monto" }),
                            search.createColumn({ name: "accounttype", label: "tipo_cuenta" }),
                            search.createColumn({ name: "entity", label: "id_proveedor" }),
                            search.createColumn({ name: "grossamount", label: "monto_bruto" })
                        ]
                }

                var result = dao.getDataSearch(tabItem);

                if (result.length > 0) {
                    return result[0];
                } else {
                    return null;
                }

            } catch (error) {
                throw error;
            }
        }

        function createVendPymt(id_informe, id_diario, facturas_proveedor) {

            try {

                log.debug('createVendPymt - total facturas proveedor', Object.keys(facturas_proveedor).length);
                var scriptObj = runtime.getCurrentScript();
                
                Object.keys(facturas_proveedor).forEach(function(id_proveedor) {

                    log.debug('createVendPymt - id_proveedor', id_proveedor);                    
                    log.debug("createVendPymt - remaining usage units (Proveedor " + id_proveedor + ")", scriptObj.getRemainingUsage());
                    
                    // Transformar cada proveedor de factura en pago de factura.
                    var vendorToVendorPaymentRecord = record.transform({
                        fromType: record.Type.VENDOR,
                        fromId: id_proveedor,
                        toType: record.Type.VENDOR_PAYMENT,
                        isDynamic: true
                    });

                    var facturas = facturas_proveedor[id_proveedor];
                    log.debug('createVendPymt - facturas', facturas);

                    if (facturas.length > 0) {
                        log.debug('createVendPymt - cuenta que se asigna', facturas[0].id_cuenta); 
                        vendorToVendorPaymentRecord.setValue({ fieldId: 'apacct', value: facturas[0].id_cuenta });
                        log.debug('createVendPymt - subsidiaria que se asigna', facturas[0].subsidiaria); 
                        vendorToVendorPaymentRecord.setValue({ fieldId: 'subsidiary', value: facturas[0].subsidiaria });

                        //aca pausa para actualizar y refrescar el registro
    
                        var num_lines = vendorToVendorPaymentRecord.getLineCount({ sublistId: 'apply' });
                        log.debug('createVendPymt - num_lines', num_lines);                        
    
                        if (num_lines > 0) {

                            for (var index = 0; index < num_lines; index++) {                            
                                    
                                // Seleccionar la línea para relacionar.
                                log.debug('createVendPymt - selectLine', index);
                                vendorToVendorPaymentRecord.selectLine({ sublistId: 'apply', line: index });
                                
                                var internalid = vendorToVendorPaymentRecord.getCurrentSublistValue({ sublistId: 'apply', fieldId: 'internalid' });
                                log.debug('createVendPymt - internalid', internalid);  
                                
                                // Seleccionar una o más facturas.
                                facturas.forEach(function(factura) {

                                    if (internalid == factura.id) {
    
                                        vendorToVendorPaymentRecord.setCurrentSublistValue({ sublistId: 'apply', fieldId: 'apply', value: true });
                                        vendorToVendorPaymentRecord.commitLine({ sublistId: 'apply' });
        
                                        log.debug('createVendPymt - commitLine Factura', index);
                                    }
                                })
    
                                // Seleccionar una o más diarios.
                                if (internalid == id_diario) {
    
                                    vendorToVendorPaymentRecord.setCurrentSublistValue({ sublistId: 'apply', fieldId: 'apply', value: true });
                                    vendorToVendorPaymentRecord.commitLine({ sublistId: 'apply' });
    
                                    log.debug('createVendPymt - commitLine Diario', index);
                                }
                            }
                        }
                    }

                    log.debug('createVendPymt - VendorPaymentRecord a grabar',  JSON.stringify(vendorToVendorPaymentRecord));
                    var vendorToVendorPaymentRecordId = vendorToVendorPaymentRecord.save({enableSourcing: true, ignoreMandatoryFields: true });
                    log.debug('createVendPymt - vendorToVendorPaymentRecordId', vendorToVendorPaymentRecordId);
                    log.debug("createVendPymt - remaining usage units (VendorPaymentRecord)", scriptObj.getRemainingUsage());
                });

                // Transformar informe de gasto en pago de factura.
                log.debug('createVendPymt - id_informe', id_informe);

                var vendorBillToVendorPaymentRecord = record.transform({
                    fromType: record.Type.VENDOR_BILL,
                    fromId: id_informe,
                    toType: record.Type.VENDOR_PAYMENT,
                    isDynamic: true
                });

                vendorBillToVendorPaymentRecord.setValue({ fieldId: 'approvalstatus', value: ESTADO_APROBACION_APROBADO }); // Aprobado

                var vendorBillToVendorPaymentRecordId = vendorBillToVendorPaymentRecord.save({ ignoreMandatoryFields: true });
                log.debug('createVendPymt - vendorBillToVendorPaymentRecordId', vendorBillToVendorPaymentRecordId);
                
            } catch (error) {
                throw error;
            }

        }

        return {
            findByInternalId: findByInternalId,
            findByAccountInternalId: findByAccountInternalId,
            createVendPymt: createVendPymt
        }
    }
);
