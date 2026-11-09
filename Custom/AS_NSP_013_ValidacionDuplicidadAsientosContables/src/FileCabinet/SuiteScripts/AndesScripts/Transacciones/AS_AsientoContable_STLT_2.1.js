/**
 * @NApiVersion 2.1
 * @NScriptType Suitelet
 * @NModuleScope SameAccount
 * @file AS_AsientoContable_STLT_2.1.js
 * @description Valida campos obligatorios y duplicidad de un Asiento Diario para el Client Script.
 *              Las busquedas corren aqui (con su propio presupuesto de unidades) y no en el CS,
 *              que se quedaba sin gobernanza en asientos de ~100 lineas.
 *
 */
define(['./handlers/AS_AsientoContableHandler', 'N/log'], (AsientoContableHandler, log) => {

    const onRequest = (context) => {
        try {
            const datos = JSON.parse(context.request.body);
            const resultado = AsientoContableHandler.validarAsiento(datos);

            context.response.setHeader({ name: 'Content-Type', value: 'application/json' });
            context.response.write(JSON.stringify(resultado));
        } catch (e) {
            log.error({ title: 'STLT onRequest - AS_AsientoContable', details: e.message });
            throw e;
        }
    };

    return { onRequest };
});
