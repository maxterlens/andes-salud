/**
 * @NApiVersion 2.1
 * @NScriptType UserEventScript
 * @file AS_AsientoContable_UE_2.1.js
 * @description User Event del Asiento Diario (journalentry).

 */
define(['./handlers/AS_AsientoContableHandler', 'N/error', 'N/log'], (AsientoContableHandler, error, log) => {

    const beforeSubmit = (context) => {
        if (context.type === context.UserEventType.DELETE) return;

        try {
            const errores = AsientoContableHandler.validar(context.newRecord);
            if (errores.length === 0) return;

            throw error.create({
                name: 'DUPLICIDAD_ASIENTO_CONTABLE',
                message: errores.join(' | '),
                notifyOff: false
            });
        } catch (e) {
            log.error({ title: 'UE beforeSubmit - AS_AsientoContable', details: e.message });
            throw e;
        }
    };

    return { beforeSubmit };
});
