/**
 * @NApiVersion 2.1
 * @NScriptType UserEventScript
 * @NModuleScope SameAccount
 * @file AS_OrdenTraslado_UE_2.1.js
 * @description Entry Point — User Event Script para Asignación de Lotes en OT.
 */
define([
    './handlers/InformeGastoHandler'
], (InformeGastoHandler) => {

    const beforeLoad = (context) => {
        try {
            InformeGastoHandler.agregarPopupRechazo(context);
        } catch (e) {
            log.error({ title: 'UE beforeLoad - AS_OrdenTraslado', details: e.message });
            throw e;
        }
    };
    
    return { beforeLoad };
});