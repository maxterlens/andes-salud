/**
 * @NApiVersion 2.1
 * @NScriptType UserEventScript
 * @NModuleScope SameAccount
 * @file AS_OrdenTraslado_UE_2.1.js
 * @description Entry Point — User Event Script para Asignación de Lotes en OT.
 */
define([
    './handlers/OrdenTrasladoHandler'
], (OrdenTrasladoHandler) => {

    const beforeLoad = (context) => {
        try {
            OrdenTrasladoHandler.agregarBotonAsignacionLote(context);
        } catch (e) {
            log.error({ title: 'UE afterSubmit - AS_AsientoDiario', details: e.message });
            throw e;
        }
    };
    
    return { beforeLoad };
});
