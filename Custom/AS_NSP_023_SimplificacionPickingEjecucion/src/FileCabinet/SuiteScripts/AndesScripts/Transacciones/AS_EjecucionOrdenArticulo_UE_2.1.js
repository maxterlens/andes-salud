/**
 * @NApiVersion 2.1
 * @NScriptType UserEventScript
 * @NModuleScope SameAccount
 * @file AS_EjecucionOrdenArticulo_UE_2.1.js
 * @description Entry Point — User Event Script.
 */
define([
    './handlers/EjecucionOrdenArticuloHandler'
], (EjecucionOrdenArticuloHandler) => {

    const beforeLoad = (context) => {
        try {
            EjecucionOrdenArticuloHandler.asignarEstadoEnviado(context);
        } catch (e) {
            log.error({ title: 'UE beforeLoad - AS_OrdenTraslado', details: e.message });
            throw e;
        }
    };
    
    return { beforeLoad };
});