/**
 * @NApiVersion 2.x
 * @NModule 2win_dao_create_invoice
 * @NModuleScope public
 */

define([
    'N/record',
    // './2win_dao_search_tax_code', // Reemplazado por libCache
    './2win_dao_search_item',
    '../2win_dao_static_params_facturacion',
    './2win_dao_search_number_deposit',
    'N/format',
    '../../lib/moment',
    'N/search',
    './2win_dao_assign_inv_details',
    // './2win_dao_search_centro_costo', // Reemplazado por libCache
    '../../lib/2win_lib_cache'
], function(
    record,
    // daoSearchTaxCode, // Reemplazado por libCache
    daoSearchItem,
    daoParamsFact,
    daoSearchNumberDeposit,
    format,
    moment,
    search,
    daoAssignInvDetails,
    // daoSearchCentroCosto, // Reemplazado por libCache
    libCache
) {
        /**
         * @description Crea una factura en NetSuite.
         * @param {Object} data - Los datos de la factura.
         * @returns {Object} - El resultado de la creación de la factura.
         */
        function createInvoice(data) {
            try{
                var invoice = record.create({
                    type: record.Type.INVOICE,
                    isDynamic: true
                });

                var trandate = moment(data.fecha).toDate();
                var duedate = moment(data.fecha).add(30, 'days').toDate();

                var internalIdCC = libCache.getCentroCostoByUbicacionId(data.ubicacion);
                if(!internalIdCC.success){
                    throw new Error('Error al obtener Centro de Costo desde Ubicación: ' + data.ubicacion + ' - error: ' + internalIdCC.error);
                }

                invoice.setValue({ fieldId: 'customform', value: daoParamsFact.getParam('pos_formulario_id_invoice').text });
                invoice.setValue({ fieldId: 'entity', value: data.cliente });
                invoice.setValue({ fieldId: 'trandate', value: trandate });
                invoice.setValue({ fieldId: 'duedate', value: duedate });
                invoice.setValue({ fieldId: 'custbody_2wintipodtesii', value:  data.id_tipo_dte});
                invoice.setValue({ fieldId: 'custbody_2w_forma_pago', value: data.formaPago });
                invoice.setValue({ fieldId: 'subsidiary', value: data.subsidiaria });
                invoice.setValue({ fieldId: 'location', value: data.ubicacion });
                invoice.setValue({ fieldId: 'department', value: internalIdCC.result });
                // Si el folio es alfanumérico, usar campo Transbank; si es numérico, usar campo acepta
                var folioEsAlfanumerico = data.folio && !/^[0-9]+$/.test(String(data.folio));
                if (folioEsAlfanumerico) {
                    invoice.setValue({ fieldId: 'custbody_2winfolio_transbank', value: data.folio });
                } else {
                    invoice.setValue({ fieldId: 'custbody_2winfolioacepta', value: data.folio });
                }
                invoice.setValue({ fieldId: 'custbody_2win_paymentmethod', value: data.formaPago });
                invoice.setValue({ fieldId: 'approvalstatus', value: '2' });

                var allTaxCodesResult = libCache.getTaxCodeMap();
                var taxCodeMap = {};

                if (allTaxCodesResult.success) {
                    taxCodeMap = allTaxCodesResult.result;
                } else {
                    throw new Error('Error al obtener tax codes: ' + allTaxCodesResult.error);
                }

                for (var i = 0; i < data.datosLinea.length; i++) {
                    var item = data.datosLinea[i];
                    if (item.codIVA != null && item.codIVA != undefined) {
                        var taxCode = taxCodeMap[item.codIVA];
                        if (!taxCode) {
                            log.error('Error Tax Code', 'Tax Code no encontrado: ' + item.codIVA);
                        }
                    } else {
                        var taxCode = null;
                    }

                    // Crear nueva línea en modo dinámico
                    invoice.selectNewLine({ sublistId: 'item' });
                    invoice.setCurrentSublistValue({ sublistId: 'item', fieldId: 'item', value: item.articulo });
                    invoice.setCurrentSublistValue({ sublistId: 'item', fieldId: 'location', value: data.ubicacion });
                    invoice.setCurrentSublistValue({ sublistId: 'item', fieldId: 'quantity', value: item.cantidad });

                    if (item.valorUnitarioNeto != null && item.valorUnitarioNeto != undefined && item.valorUnitarioNeto != 0) {
                        invoice.setCurrentSublistValue({ sublistId: 'item', fieldId: 'rate', value: item.valorUnitarioNeto });
                    } else {
                        log.error('Error Rate', 'Valor unitario no proporcionado para el artículo: ' + item.articulo);
                        throw new Error('Valor unitario no proporcionado para el artículo: ' + item.articulo);
                    }

                    if (taxCode) {
                        invoice.setCurrentSublistValue({ sublistId: 'item', fieldId: 'taxcode', value: taxCode });
                    }

                    invoice.setCurrentSublistValue({ sublistId: 'item', fieldId: 'custcol_2win_as_identificador_fila', value: i + 1 });

                    // Asignar inventory detail en modo dinámico
                    daoAssignInvDetails.assignInventoryDetailToCurrentLine(invoice, {
                        itemId: item.articulo,
                        locationId: data.ubicacion,
                        quantity: item.cantidad,
                        trxType: 'issueinventorynumber'
                    });

                    // Commitear la línea
                    invoice.commitLine({ sublistId: 'item' });
                }

                var invoiceId = invoice.save({
                    enableSourcing: true,
                    ignoreMandatoryFields: true
                });

                return { success: true, result: invoiceId };
            } catch(error){
                log.error({
                    title: 'Error en createInvoice',
                    details: error
                });

                return { success: false, result: error.message || error };
            }
        }

        return {
            createInvoice: createInvoice
        };
    }
)