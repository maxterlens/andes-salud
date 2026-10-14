/**
 * @NApiVersion 2.1
 * @NScriptType Suitelet
 * @NModuleScope SameAccount
 *
 * AS_NSP_029 - Impresión de Cheques (Pagos de Factura)
 * ─────────────────────────────────────────────────────────────────────────────
 * Permite filtrar pagos de factura, seleccionar hasta 4 e indicar la posición
 * de cada cheque en la hoja carta. La impresión se delega a la API global
 * ImpresionPDF (reporte pagofactura_cheque_pdf) desde el Client Script.
 */
define(['./ui/handlers/ImpresionChequesHandler'], (ImpresionChequesHandler) => {

    const onRequest = (context) => {
        try {
            ImpresionChequesHandler.handleRequest(context);
        } catch (e) {
            log.error('AS_ImpresionCheques_SL | onRequest', e);
            context.response.write(`Error al cargar la Impresión de Cheques: ${e.message || e}`);
        }
    };

    return { onRequest };
});
