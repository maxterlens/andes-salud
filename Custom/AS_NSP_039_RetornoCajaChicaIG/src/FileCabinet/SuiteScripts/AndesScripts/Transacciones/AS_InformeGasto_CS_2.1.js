/**
 * @NApiVersion 2.1
 * @NScriptType ClientScript
 * @NModuleScope SameAccount
 * @file AS_InformeGasto_CS_2.1.js
 * @description Entry Point — Client Script del Informe de Gastos (AS_NSP_039 Retorno Caja Chica).
 */
define([
    './handlers/InformeGastoClientHandler'
], (InformeGastoClientHandler) => {

    const pageInit = (context) => {
        try {
            InformeGastoClientHandler.pageInit(context);
        } catch (e) {
            console.error('[AS] CS pageInit - AS_InformeGasto', e);
        }
    };

    const fieldChanged = (context) => {
        try {
            InformeGastoClientHandler.fieldChanged(context);
        } catch (e) {
            console.error('[AS] CS fieldChanged - AS_InformeGasto', e);
        }
    };

    const saveRecord = (context) => {
        try {
            return InformeGastoClientHandler.saveRecord(context);
        } catch (e) {
            console.error('[AS] CS saveRecord - AS_InformeGasto', e);
            return true;
        }
    };

    return { pageInit, fieldChanged, saveRecord };
});
