/**
 * @NApiVersion 2.1
 * @NScriptType ClientScript
 */
define([
    'N/ui/dialog',
    './handlers/AS_FacturaVentaHandler'
], (dialog, FacturaVentaHandler) => {

    const saveRecord = (context) => {
        const currentRecord = context.currentRecord;
        const duplicado = FacturaVentaHandler.buscarFacturaDuplicada(currentRecord);
        if (duplicado) {
            dialog.alert({
                title: 'Documento duplicado',
                message:
                    'Ya existe una factura de venta con el mismo Folio Acepta, cliente, subsidiaria y Tipo DTE SII Acepta.' +
                    '<br><br>Transacción: ' + duplicado.documentNumber +
                    '<br>ID interno: ' + duplicado.internalId
            });
            return false;
        }

        return true;
    };

    return {
        saveRecord
    };

});
