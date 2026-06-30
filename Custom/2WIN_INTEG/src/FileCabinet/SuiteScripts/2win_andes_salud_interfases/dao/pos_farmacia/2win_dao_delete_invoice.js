/**
 * @NApiVersion 2.x
 * @NModule 2win_dao_delete_invoice
 * @NModuleScope public
 */

define([
    'N/record',
    'N/log'
], function(
    record,
    nLog
) {
    /**
     * @description Elimina una factura de NetSuite.
     * @param {string} invoiceId - ID interno de la factura a eliminar.
     * @returns {Object} - Resultado de la eliminación con success e id de la factura eliminada.
     */
    function deleteInvoice(invoiceId) {
        try{
            nLog.audit({
                title: 'Intentando eliminar factura',
                details: 'ID Factura: ' + invoiceId
            });

            record.delete({
                type: record.Type.INVOICE,
                id: invoiceId
            });

            nLog.audit({
                title: 'Factura eliminada exitosamente',
                details: 'ID Factura: ' + invoiceId
            });

            return { 
                success: true, 
                result: invoiceId,
                message: 'Factura eliminada correctamente'
            };
        } catch(error){
            nLog.error({
                title: 'Error al eliminar factura',
                details: {
                    invoiceId: invoiceId,
                    error: error
                }
            });

            return { 
                success: false, 
                result: error.message || error,
                message: 'Error al eliminar la factura'
            };
        }
    }

    /**
     * @description Elimina una nota de crédito de NetSuite.
     * @param {string} creditMemoId - ID interno de la nota de crédito a eliminar.
     * @returns {Object} - Resultado de la eliminación con success e id de la nota de crédito eliminada.
     */
    function deleteCreditMemo(creditMemoId) {
        try{
            nLog.audit({
                title: 'Intentando eliminar nota de crédito',
                details: 'ID Credit Memo: ' + creditMemoId
            });

            record.delete({
                type: record.Type.CREDIT_MEMO,
                id: creditMemoId
            });

            nLog.audit({
                title: 'Nota de crédito eliminada exitosamente',
                details: 'ID Credit Memo: ' + creditMemoId
            });

            return { 
                success: true, 
                result: creditMemoId,
                message: 'Nota de crédito eliminada correctamente'
            };
        } catch(error){
            nLog.error({
                title: 'Error al eliminar nota de crédito',
                details: {
                    creditMemoId: creditMemoId,
                    error: error
                }
            });

            return { 
                success: false, 
                result: error.message || error,
                message: 'Error al eliminar la nota de crédito'
            };
        }
    }

    return {
        deleteInvoice: deleteInvoice,
        deleteCreditMemo: deleteCreditMemo
    };
}
);