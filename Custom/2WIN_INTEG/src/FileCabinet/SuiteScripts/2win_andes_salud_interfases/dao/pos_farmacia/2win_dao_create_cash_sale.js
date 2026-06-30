/**
 * @NApiVersion 2.x
 * @module 2win_dao_create_cash_sale
 * @NModuleScope Public
 */

define(['N/record',
    // './2win_dao_search_tax_code', // Reemplazado por libCache
    '../2win_dao_static_params_facturacion',
    '../../lib/moment',
    'N/search',
    './2win_dao_assign_inv_details',
    // './2win_dao_search_centro_costo', // Reemplazado por libCache
    '../../lib/2win_lib_cache'
], function(record, daoParamsFact, moment, search, daoAssignInvDetails, libCache) {
        /**
         * @description Crea una venta en NetSuite.
         * @param {Object} data - Los datos de la venta.
         * @returns {Object} Resultado de la creación de la venta.
         */
    function createCashSale(data) {
        try {
            log.debug('createCashSale - data', JSON.stringify(data));

            var cashSale = record.create({
                type: record.Type.CASH_SALE,
                isDynamic: true
            });

            var trandate = moment(data.fecha).toDate();

            // var internalIdCC = daoSearchCentroCosto.getIdCentroCostoUbicacion(data.ubicacion); // Reemplazado por libCache
            var internalIdCC = libCache.getCentroCostoByUbicacionId(data.ubicacion);
            if(!internalIdCC.success){
                throw new Error('Error al obtener centro de costo para ubicación ' + data.ubicacion + ': ' + internalIdCC.error);
            }

            cashSale.setValue({ fieldId: 'customform', value: daoParamsFact.getParam('pos_formulario_id_cashsale').text });  // DTE - Factura Electrónica (33/34)
            cashSale.setValue({ fieldId: 'entity', value: data.cliente });
            cashSale.setValue({ fieldId: 'trandate', value: trandate });
            cashSale.setValue({ fieldId: 'custbody_2wintipodtesii', value:  data.id_tipo_dte}); // 1: Afecto, 2: Exento
            cashSale.setValue({ fieldId: 'custbody_2w_forma_pago', value: data.formaPago }); // 1: Contado, 2: Crédito
            cashSale.setValue({ fieldId: 'subsidiary', value: data.subsidiaria });
            cashSale.setValue({ fieldId: 'location', value: data.ubicacion });
            cashSale.setValue({ fieldId: 'department', value: internalIdCC.result });
            cashSale.setValue({ fieldId: 'custbody_2winfolioacepta', value: data.folio });
            cashSale.setValue({ fieldId: 'custbody_2win_paymentmethod', value: data.formaPago });
            cashSale.setValue({ fieldId: 'approvalstatus', value: '2' }); // Aprobado

            // OPTIMIZACIÓN: Obtener TODOS los tax codes de una sola vez (con N/cache)
            // var allTaxCodesResult = daoSearchTaxCode.getAllTaxCodes(); // Reemplazado por libCache
            var allTaxCodesResult = libCache.getTaxCodeMap();
            var taxCodeMap = {};

            if (allTaxCodesResult.success) {
                taxCodeMap = allTaxCodesResult.result;
            } else {
                throw new Error('Error al obtener tax codes: ' + allTaxCodesResult.error);
            }

            // Se agregan las líneas de la venta
            for (var i = 0; i < data.linea.length; i++) {
                var item = data.linea[i];
                var taxCode = taxCodeMap[item.codIVA];

                if (!taxCode) {
                    log.error('Error Tax Code', 'Tax Code no encontrado: ' + item.codIVA);
                }

                cashSale.selectNewLine({ sublistId: 'item' });
                cashSale.setCurrentSublistValue({ sublistId: 'item', fieldId: 'item', value: item.articulo });
                cashSale.setCurrentSublistValue({ sublistId: 'item', fieldId: 'custcol_2win_rut_forma_pago', value: item.rutFormaPago });
                cashSale.setCurrentSublistValue({ sublistId: 'item', fieldId: 'location', value: data.ubicacion });
                cashSale.setCurrentSublistValue({ sublistId: 'item', fieldId: 'quantity', value: item.cantidad });
                cashSale.setCurrentSublistValue({ sublistId: 'item', fieldId: 'rate', value: item.valorUnitarioNeto });
                cashSale.setCurrentSublistValue({ sublistId: 'item', fieldId: 'taxcode', value: taxCode });
                cashSale.setCurrentSublistValue({ sublistId: 'item', fieldId: 'grossamt', value: item.total });
                cashSale.setCurrentSublistValue({ sublistId: 'item', fieldId: 'custcol_2win_as_identificador_fila', value: i + 1 });

                // Asignar Inventory Detail (lotes/seriales) a la línea actual
                daoAssignInvDetails.assignInventoryDetailToCurrentLine(cashSale, {
                    itemId: item.articulo,
                    locationId: data.ubicacion,
                    quantity: item.cantidad,
                    trxType: 'issueinventorynumber'
                });

                cashSale.commitLine({ sublistId: 'item' });
            }

            var cashSaleId = cashSale.save();

            return { success: true, cashSaleId: cashSaleId };

        } catch (e) {
            log.error({
                title: 'Error en createCashSale',
                details: e
            });

           return { success: false, error: e.message || e  };
        }
    }

    return {
        createCashSale: createCashSale
    };
});