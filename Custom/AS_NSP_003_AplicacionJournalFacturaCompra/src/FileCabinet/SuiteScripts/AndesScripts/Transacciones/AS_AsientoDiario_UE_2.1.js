/**
 * @NApiVersion 2.1
 * @NScriptType UserEventScript
 */
define(['./handlers/AsientoDiarioHandler'], (AsientoDiarioHandler) => {

    const afterSubmit = (context) => {
        try {
            AsientoDiarioHandler.aplicarTransaccionesRelacionadas(context);
        } catch (e) {
            log.error({ title: 'UE afterSubmit - AS_AsientoDiario', details: e.message });
            throw e;
        }
    };

    return { afterSubmit };
});
