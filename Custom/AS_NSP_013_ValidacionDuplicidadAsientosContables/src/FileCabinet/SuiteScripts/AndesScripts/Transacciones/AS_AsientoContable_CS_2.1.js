/**
 * @NApiVersion 2.1
 * @NScriptType ClientScript
 * @NModuleScope SameAccount
 * @file AS_AsientoContable_CS_2.1.js
 */
define(['./handlers/AS_AsientoContableHandler', 'N/ui/dialog', 'N/log'], (AsientoContableHandler, dialog, log) => {

    const saveRecord = (context) => {
        try {
            const errores = AsientoContableHandler.validar(context.currentRecord);
            if (errores.length === 0) return true;

            dialog.alert({
                title: 'Duplicidad de Asiento Contable',
                message: errores.join('<br><br>')
            });
            return false;
        } catch (e) {
            log.error({ title: 'CS saveRecord - AS_AsientoContable', details: e.message });
            throw e;
        }
    };

    return { saveRecord };
});
