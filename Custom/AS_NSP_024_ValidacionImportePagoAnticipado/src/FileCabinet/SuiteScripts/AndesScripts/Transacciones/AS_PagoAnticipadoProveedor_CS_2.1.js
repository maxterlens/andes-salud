/**
 * @NApiVersion 2.1
 * @NScriptType ClientScript
 * @NModuleScope SameAccount
 * @file AS_PagoAnticipadoProveedor_CS_2.1.js
 * @description Client Script del Pago Anticipado de Proveedor (vendorprepayment).
 * Valida que el importe no supere el total de la OC asociada.
 */
define([
    './handlers/PagoAnticipadoProveedorHandler',
    'N/ui/dialog',
], (PagoAnticipadoProveedorHandler, dialog) => {

    const saveRecord = (context) => {
        debugger;
        const { currentRecord } = context;

        try {
            const errores = PagoAnticipadoProveedorHandler.validarImporteNoSuperaTotalOC(currentRecord);
            if (errores.length === 0) return true;

            dialog.alert({
                title: 'Importe excede el total de la OC',
                message: errores.join('<br><br>')
            });
            return false;
        } catch (e) {
            log.error({ title: 'CS saveRecord - AS_PagoAnticipadoProveedor', details: e.message });
            throw e;
        }
    };

    return {
        saveRecord
    };

});
