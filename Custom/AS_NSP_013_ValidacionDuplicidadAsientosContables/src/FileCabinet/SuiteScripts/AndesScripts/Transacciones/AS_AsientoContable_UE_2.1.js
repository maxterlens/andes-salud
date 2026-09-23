/**
 * @NApiVersion 2.1
 * @NScriptType UserEventScript
 * @file AS_AsientoContable_UE_2.1.js
 * @description User Event del Asiento Diario (journalentry).
 *              Solo valida en contexto de CSV Import: para guardados desde la UI,
 *              el único control es el Client Script (ver AS_AsientoContable_CS_2.1.js).

 */
define(['./handlers/AS_AsientoContableHandler', 'N/error', 'N/log', 'N/runtime'], (AsientoContableHandler, error, log, runtime) => {

    const beforeSubmit = (context) => {
        if (context.type === context.UserEventType.DELETE) return;
        if (runtime.executionContext !== runtime.ContextType.CSV_IMPORT) return;

        try {
            const { internos, externos } = AsientoContableHandler.validar(context.newRecord);
            const errores = [...internos, ...externos];
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
