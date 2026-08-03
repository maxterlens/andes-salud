/**
 * @NApiVersion 2.1
 * @NScriptType UserEventScript
 * @NModuleScope SameAccount
 * @file AS_SolicitudConsumo_UE_2.1.js
 * @description Entry Point — User Event Script.
 *              Delega toda la lógica al handler ASSolicitudConsumoHandler.
 */
define([
    './handlers/ASSolicitudConsumoHandler'
], (Handler) => {

    const beforeLoad = (context) => {
        try {
            Handler.redirigirSuiteletSolicitudConsumo(context);
            Handler.agregarBotonImpresion(context);
        } catch (e) {
            log.error({ title: 'UE beforeLoad - AS_SolicitudConsumo', details: e.message });
            throw e;
        }
    };

    return { beforeLoad };
});