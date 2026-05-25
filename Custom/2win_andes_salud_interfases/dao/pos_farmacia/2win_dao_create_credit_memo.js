/**
 * @NApiVersion 2.x
 * @NModule 2win_dao_create_credit_memo
 * @NModuleScope public
 */

define([
    'N/log',
    'N/record',
    './2win_dao_search_invoice',
    '../2win_dao_static_params_facturacion',
    // './2win_dao_search_type_dte', // Reemplazado por libCache
    // './2win_dao_search_ubicacion', // Reemplazado por libCache
    // '../2win_dao_static_params_operacion', // Reemplazado por libCache
    // './2win_dao_search_tax_code', // Reemplazado por libCache
    './2win_dao_assign_inv_details',
    '../../lib/2win_lib_cache'
],
    function(
        log,
        record,
        daoSearchInvoice,
        daoParamsFact,
        // daoSearchTypeDTE, // Reemplazado por libCache
        // daoSearchUbicacion, // Reemplazado por libCache
        // daoParametrosOperacion, // Reemplazado por libCache
        // daoSearchTaxCode, // Reemplazado por libCache
        daoAssignInvDetails,
        libCache
    ){
        /**
         * @description Creación de Nota de Crédito en NetSuite con ajuste de cantidades por línea y detalles de inventario.
         * @param {*} objNC 
         * @returns {object} Resultado de la creación de la Nota de Crédito.
         */
        function createCreditMemo(objNC) {
            try{

                var folioNC = objNC.folio_factura;
                var folioFacturaOriginal = objNC.num_factura;
                var tipoDocumento = objNC.tipo_referencia;
                var linea = objNC.linea;
                var codigoUbicacion = objNC.ubicacion;

                // var ubicacionResult = daoSearchUbicacion.searchUbicacion(codigoUbicacion); // Reemplazado por libCache
                var ubicacionResult = libCache.getUbicacionByCodigo(codigoUbicacion);
                if(!ubicacionResult.success){
                    return { success: false, error: 'Error al buscar ubicación: ' + ubicacionResult.error };
                }
                var ubicacionId = ubicacionResult.result;

                // tipoDocumento = daoSearchTypeDTE.searchTypeDTE(tipoDocumento); // Reemplazado por libCache
                var tipoDocumentoResult = libCache.getTipoDTEByCodigo(tipoDocumento);
                if(!tipoDocumentoResult.success){
                    return tipoDocumentoResult;
                }
                tipoDocumento = tipoDocumentoResult;

                var dataSearchInvoice = { folioFactura: folioFacturaOriginal };

                var internalIdInvoice = daoSearchInvoice.searchInvoice(dataSearchInvoice);
                if(!internalIdInvoice.success){
                    return { success: false, error: internalIdInvoice.error };
                }

                internalIdInvoice = internalIdInvoice.result;

                var requestedItems = {};
                for (var i = 0; i < linea.length; i++) {
                    requestedItems[String(linea[i].articulo)] = {
                        cantidad: parseFloat(linea[i].cantidad),
                        valorUnitarioNeto: parseFloat(linea[i].valorUnitarioNeto || 0),
                        descuento: parseFloat(linea[i].descuento || 0),
                        codIVA: linea[i].codIVA || '19'
                    };
                }

                // var articuloDeDescuento = daoParametrosOperacion.getParam("andessalud_pos_farmacia_id_articulo_descuento").text; // Reemplazado por libCache
                var paramDescuento = libCache.getParametroByNombre("andessalud_pos_farmacia_id_articulo_descuento");
                var articuloDeDescuento = paramDescuento.success ? paramDescuento.result.text : null;
                if (!articuloDeDescuento) {
                    log.error('createCreditMemo - descuento', 'artículo de descuento no configurado');
                    articuloDeDescuento = null;
                }

                // var allTaxCodesResult = daoSearchTaxCode.getAllTaxCodes(); // Reemplazado por libCache
                var allTaxCodesResult = libCache.getTaxCodeMap();
                var taxCodeMap = {};
                if (allTaxCodesResult.success) {
                    taxCodeMap = allTaxCodesResult.result;
                } else {
                    log.error('createCreditMemo - Error obteniendo tax codes', allTaxCodesResult.error);
                }

                var creditMemo = record.transform({
                    fromType: record.Type.INVOICE,
                    fromId: internalIdInvoice,
                    toType: record.Type.CREDIT_MEMO,
                    isDynamic: true
                });

                // creditMemo.setValue({ fieldId: 'customform', value: daoParamsFact.getParam('formulario_id_nc').text });
                creditMemo.setValue({ fieldId: 'customform', value: 163 });
                creditMemo.setValue({ fieldId: 'custbody_2w_docreferenciado', value: tipoDocumento.result });
                creditMemo.setValue({ fieldId: 'custbody_2winfoliodocref', value: folioFacturaOriginal });
                creditMemo.setValue({ fieldId: 'custbody_2winfolioacepta', value: folioNC });
                creditMemo.setValue({ fieldId: 'approvalstatus', value: '2' });

                // var numApply = creditMemo.getLineCount({ sublistId: 'apply' });
                
                // for (var j = 0; j < numApply; j++) {
                //     creditMemo.selectLine({ sublistId: 'apply', line: j });
                //     creditMemo.setCurrentSublistValue({ 
                //         sublistId: 'apply', 
                //         fieldId: 'apply', 
                //         value: false 
                //     });
                //     creditMemo.commitLine({ sublistId: 'apply' });
                // }
                
                // var numLines = creditMemo.getLineCount({ sublistId: 'item' });

                // var discountLinesToAdd = [];
                // var currentLineCounter = 0;
                
                // for (var i = numLines - 1; i >= 0; i--) {
                //     creditMemo.selectLine({ sublistId: 'item', line: i });
                //     var lineItemId = creditMemo.getCurrentSublistValue({ sublistId: 'item', fieldId: 'item' });
                //     var lineItemIdStr = String(lineItemId);

                //     if (!requestedItems[lineItemIdStr]) {
                //         creditMemo.removeLine({ sublistId: 'item', line: i });
                //     } else {
                //         var requestedItem = requestedItems[lineItemIdStr];
                //         var taxCode = taxCodeMap[requestedItem.codIVA];

                //         creditMemo.setCurrentSublistValue({ sublistId: 'item', fieldId: 'quantity', value: requestedItem.cantidad });
                //         creditMemo.setCurrentSublistValue({ sublistId: 'item', fieldId: 'location', value: ubicacionId });
                        
                //         // Ajustar inventory detail si es necesario (el DAO detecta si es devolución y ajusta cantidades)
                //         try {
                //             daoAssignInvDetails.assignInventoryDetailToCurrentLine(creditMemo, {
                //                 itemId: lineItemId,
                //                 locationId: ubicacionId,
                //                 quantity: requestedItem.cantidad,
                //                 trxType: 'receiptinventorynumber'
                //             });
                //         } catch (invError) {
                //             log.audit({ title: 'createCreditMemo - inventory detail omitido', details: 'Item: ' + lineItemId + ' - ' + (invError.message || invError) });
                //         }
                        
                //         creditMemo.setCurrentSublistValue({ sublistId: 'item', fieldId: 'rate', value: requestedItem.valorUnitarioNeto });
                //         creditMemo.setCurrentSublistValue({ sublistId: 'item', fieldId: 'description', value: 'Devolución de producto' });
                        
                //         if (taxCode) {
                //             creditMemo.setCurrentSublistValue({ sublistId: 'item', fieldId: 'taxcode', value: taxCode });
                //         }

                //         creditMemo.setCurrentSublistValue({ sublistId: 'item', fieldId: 'custcol_2win_as_identificador_fila', value: currentLineCounter + 1 });
                //         creditMemo.commitLine({ sublistId: 'item' });

                //         requestedItems[lineItemIdStr].processed = true;
                //         currentLineCounter++;
                        
                //         if (requestedItem.descuento && parseFloat(requestedItem.descuento) > 0) {
                //             discountLinesToAdd.push({
                //                 cantidad: requestedItem.cantidad,
                //                 descuento: parseFloat(requestedItem.descuento),
                //                 taxCode: taxCode
                //             });
                //         }
                //     }
                // }
                
                // if (discountLinesToAdd.length > 0) {
                //     for (var d = 0; d < discountLinesToAdd.length; d++) {
                //         var discountInfo = discountLinesToAdd[d];
                        
                //         creditMemo.selectNewLine({ sublistId: 'item' });
                        
                //         creditMemo.setCurrentSublistValue({ 
                //             sublistId: 'item', 
                //             fieldId: 'item', 
                //             value: articuloDeDescuento
                //         });
                        
                //         var discountAmount = parseFloat(discountInfo.descuento);
                        
                //         creditMemo.setCurrentSublistValue({ 
                //             sublistId: 'item', 
                //             fieldId: 'quantity', 
                //             value: 1
                //         });
                        
                //         creditMemo.setCurrentSublistValue({ 
                //             sublistId: 'item', 
                //             fieldId: 'rate', 
                //             value: -discountAmount
                //         });
                        
                //         creditMemo.setCurrentSublistValue({ 
                //             sublistId: 'item', 
                //             fieldId: 'location', 
                //             value: ubicacionId
                //         });

                //         if (discountInfo.taxCode) {
                //             creditMemo.setCurrentSublistValue({ 
                //                 sublistId: 'item', 
                //                 fieldId: 'taxcode', 
                //                 value: discountInfo.taxCode 
                //             });
                //         }
                        
                //         creditMemo.setCurrentSublistValue({ 
                //             sublistId: 'item', 
                //             fieldId: 'description', 
                //             value: 'Descuento Farmacia' 
                //         });
                        
                //         creditMemo.setCurrentSublistValue({ 
                //             sublistId: 'item', 
                //             fieldId: 'custcol_2win_as_identificador_fila', 
                //             value: currentLineCounter + 1 
                //         });
                        
                //         creditMemo.commitLine({ sublistId: 'item' });
                        
                //         currentLineCounter++;
                //     }
                // } else if (discountLinesToAdd.length > 0 && !articuloDeDescuento) {
                //     throw new Error('Artículo de descuento no configurado.');
                // }
                
                var creditMemoId = creditMemo.save({
                    // enableSourcing: false,
                    ignoreMandatoryFields: true
                });

                return { success: true, creditMemoId: creditMemoId };
            }
            catch(error){
                log.error({
                    title: 'Error en createCreditMemo',
                    details: error
                });
                return { success: false, error: error.message };
            }
        }
        return {
            createCreditMemo: createCreditMemo
        };
    }
);