/**
 * @NApiVersion 2.x
 * @NModule 2win_dao_get_value_refund
 * @NModuleScope public
 */

define(['N/log', 'N/search'],
    function(log, search) {
        
        /**
         * @description Obtiene los valores necesarios para crear un Customer Refund desde un Credit Memo
         * @param {number|string} creditMemoId - ID interno del Credit Memo
         * @returns {object} Objeto con los valores necesarios para el Customer Refund
         */
        function getValuesForRefund(creditMemoId) {
            try {
                log.debug('getValuesForRefund - Inicio', { creditMemoId: creditMemoId });

                // Usar lookupFields para campos del header (más eficiente)
                var creditMemoFields = search.lookupFields({
                    type: search.Type.CREDIT_MEMO,
                    id: creditMemoId,
                    columns: ['entity', 'subsidiary', 'createdfrom']
                });

                var customerId = creditMemoFields.entity[0] ? creditMemoFields.entity[0].value : null;
                var subsidiaryId = creditMemoFields.subsidiary[0] ? creditMemoFields.subsidiary[0].value : null;
                var invoiceId = creditMemoFields.createdfrom[0] ? creditMemoFields.createdfrom[0].value : null;

                // Obtener payment method de la factura original
                var paymentMethodId = null;
                if (invoiceId) {
                    var invoiceFields = search.lookupFields({
                        type: search.Type.INVOICE,
                        id: invoiceId,
                        columns: ['custbody_2win_paymentmethod']
                    });
                    paymentMethodId = invoiceFields.custbody_2win_paymentmethod[0] ? 
                        invoiceFields.custbody_2win_paymentmethod[0].value : null;
                }

                log.debug('getValuesForRefund - Campos básicos', {
                    customerId: customerId,
                    subsidiaryId: subsidiaryId,
                    invoiceId: invoiceId,
                    paymentMethodId: paymentMethodId
                });

                // Para items (sublista) no hay alternativa: debe ser search
                var items = [];
                var itemSearch = search.create({
                    type: search.Type.CREDIT_MEMO,
                    filters: [
                        ['internalid', 'is', creditMemoId],
                        'AND',
                        ['mainline', 'is', 'F'],
                        'AND',
                        ['taxline', 'is', 'F']
                    ],
                    columns: [
                        search.createColumn({ name: 'item' }),
                        search.createColumn({ name: 'quantity' }),
                        search.createColumn({ name: 'rate' }),
                        search.createColumn({ name: 'amount' })
                    ]
                });

                itemSearch.run().each(function(result) {
                    items.push({
                        itemId: result.getValue({ name: 'item' }),
                        quantity: parseFloat(result.getValue({ name: 'quantity' })) || 0,
                        rate: parseFloat(result.getValue({ name: 'rate' })) || 0,
                        amount: parseFloat(result.getValue({ name: 'amount' })) || 0
                    });
                    return true;
                });

                log.debug('getValuesForRefund - Datos obtenidos', {
                    customerId: customerId,
                    paymentMethodId: paymentMethodId,
                    subsidiaryId: subsidiaryId,
                    itemsCount: items.length
                });

                return {
                    success: true,
                    customerId: customerId,
                    subsidiaryId: subsidiaryId,
                    paymentMethodId: paymentMethodId,
                    items: items
                };

            } catch (error) {
                log.error({
                    title: 'Error en getValuesForRefund',
                    details: error
                });
                return {
                    success: false,
                    error: error.message || JSON.stringify(error)
                };
            }
        }

        return {
            getValuesForRefund: getValuesForRefund
        };
    }
);
