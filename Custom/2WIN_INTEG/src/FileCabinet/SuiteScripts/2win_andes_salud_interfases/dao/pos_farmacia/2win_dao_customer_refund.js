/**
 * @NApiVersion 2.x
 * @ModuleScope Public
 * @module 2win_dao_customer_refund
 */

define(['N/record', 'N/search', '../2win_dao_static_params_operacion'],
    function (record, search, daoGetParams) {

        /**
         * Crea un Customer Refund en NetSuite
         * @param {Object} customerRefundData - Datos necesarios para crear el Customer Refund
         * @returns {number} - ID del Customer Refund creado
         */
        function createCustomerRefund(customerRefundData) {

            log.audit('Inicio createCustomerRefund', customerRefundData);

            // Validar que creditMemoId esté presente
            if (!customerRefundData.creditMemoId) {
                log.error('Error: creditMemoId no proporcionado', customerRefundData);
                return {
                    success: false,
                    error: 'creditMemoId es requerido para crear el Customer Refund'
                };
            }

            var customerRefundRecord = record.create({
                type: record.Type.CUSTOMER_REFUND,
                isDynamic: true
            });

            customerRefundRecord.setValue({
                fieldId: 'customform',
                value: daoGetParams.getParam('andessalud_pos_farmacia_id_form_reembolso').text
            });

            customerRefundRecord.setValue({
                fieldId: 'customer',
                value: customerRefundData.customerId
            });

            customerRefundRecord.setValue({
                fieldId: 'subsidiary',
                value: customerRefundData.subsidiary
            });

            customerRefundRecord.setValue({
                fieldId: 'account',
                value: daoGetParams.getParam('andessalud_pos_farmacia_id_articulo_reembolso').text
            });

            customerRefundRecord.setValue({
                fieldId: 'custbody_2win_paymentmethod',
                value: customerRefundData.paymentMethodId
            });

            customerRefundRecord.setValue({
                fieldId: 'memo',
                value: customerRefundData.memo
            });

            // Aplicar el Credit Memo en la sublista apply
            var applyLineCount = customerRefundRecord.getLineCount({ sublistId: 'apply' });
            log.audit('Líneas en apply', applyLineCount);
            
            for (var i = 0; i < applyLineCount; i++) {
                customerRefundRecord.selectLine({ sublistId: 'apply', line: i });
                
                var applyInternalId = customerRefundRecord.getCurrentSublistValue({
                    sublistId: 'apply',
                    fieldId: 'internalid'
                });
                
                log.audit('Revisando línea apply', { line: i, internalid: applyInternalId, buscando: customerRefundData.creditMemoId });
                
                if (applyInternalId == customerRefundData.creditMemoId) {
                    customerRefundRecord.setCurrentSublistValue({
                        sublistId: 'apply',
                        fieldId: 'apply',
                        value: true
                    });
                    
                    customerRefundRecord.commitLine({ sublistId: 'apply' });
                    log.audit('Credit Memo aplicado al refund', { creditMemoId: customerRefundData.creditMemoId });
                } else {
                    customerRefundRecord.commitLine({ sublistId: 'apply' });
                }
            }

            // Aplicar Journal de redondeo si existe
            if (customerRefundData.id_journal) {
                var journalApplied = false;
                for (var j = 0; j < applyLineCount; j++) {
                    customerRefundRecord.selectLine({ sublistId: 'apply', line: j });
                    var applyId = customerRefundRecord.getCurrentSublistValue({
                        sublistId: 'apply',
                        fieldId: 'internalid'
                    });
                    if (applyId == customerRefundData.id_journal) {
                        customerRefundRecord.setCurrentSublistValue({
                            sublistId: 'apply',
                            fieldId: 'apply',
                            value: true
                        });
                        customerRefundRecord.commitLine({ sublistId: 'apply' });
                        journalApplied = true;
                        log.audit('Journal de redondeo aplicado al refund', { journalId: customerRefundData.id_journal });
                        break;
                    }
                    customerRefundRecord.commitLine({ sublistId: 'apply' });
                }
                if (!journalApplied) {
                    log.error('Journal de redondeo no encontrado en apply del refund', { journalId: customerRefundData.id_journal });
                }
            }

            var customerRefundId = customerRefundRecord.save({
                ignoreMandatoryFields: true
            });
            log.audit('Customer Refund creado', { customerRefundId: customerRefundId })
            return {
                success: true,
                customer_refund_id: customerRefundId
            };
        }

        return {
            createCustomerRefund: createCustomerRefund
        };
    });