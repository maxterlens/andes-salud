/**
 * @NApiVersion 2.1
 * @NScriptType ClientScript
 */
define([
    'N/ui/dialog',
    './handlers/AS_FacturaVentaHandler'
], (dialog, FacturaVentaHandler) => {

    const validateLine = (context) => {
        const customForm = Number(
            context.currentRecord.getValue({ fieldId: 'customform' })
        );

        if (customForm !== 118) return true;

        return FacturaVentaHandler.validarDescripcionLinea(context, dialog);
    };

    const saveRecord = (context) => {
        const currentRecord = context.currentRecord;

        const customForm = Number(currentRecord.getValue({ fieldId: 'customform' }));
        if (customForm === 118 && !FacturaVentaHandler.validarTodasLasLineasItem(currentRecord, dialog)) {
            return false;
        }

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
        validateLine,
        saveRecord
    };

});
