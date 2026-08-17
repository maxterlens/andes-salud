/**
 * @NApiVersion 2.1
 * @NScriptType ClientScript
 */
define([
    './handlers/AS_FacturaVentaHandler'
], (FacturaVentaHandler) => {

    const saveRecord = (context) => {

        return FacturaVentaHandler.validarDuplicidad(context.currentRecord
        );

    };


    return {
        saveRecord
    };

});