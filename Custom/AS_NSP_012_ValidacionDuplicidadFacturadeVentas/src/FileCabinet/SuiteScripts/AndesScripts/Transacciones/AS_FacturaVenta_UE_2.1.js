/**
 * @NApiVersion 2.1
 * @NScriptType UserEventScript
 */
define([
    'N/error',
    './handlers/AS_FacturaVentaHandler'
], (error, FacturaVentaHandler) => {

    const beforeSubmit = (context) => {
        const esCreacionOEdicion =
            context.type === context.UserEventType.CREATE ||
            context.type === context.UserEventType.EDIT;

        if (!esCreacionOEdicion) {
            return;
        }

        const duplicado = FacturaVentaHandler.buscarFacturaDuplicada(context.newRecord);
        if (!duplicado) {
            return;
        }

        throw error.create({
            name: 'FACTURA_VENTA_DUPLICADA',
            message:
                'Ya existe una factura de venta con el mismo Folio Acepta, cliente, subsidiaria y Tipo DTE SII Acepta. ' +
                'Transacción: ' + duplicado.documentNumber + ' (ID interno: ' + duplicado.internalId + ')'
        });
    };

    return {
        beforeSubmit
    };

});
