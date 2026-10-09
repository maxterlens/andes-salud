/**
 * @NApiVersion 2.1
 * @NScriptType UserEventScript
 * @NModuleScope SameAccount
 * @file AS_Cliente_UE_2.1.js
 * @description Entry Point — User Event Script del registro Cliente (customer).
 */
define([
    './handlers/ClienteHandler'
], (ClienteHandler) => {

    const beforeSubmit = (context) => {
        try {
            log.error('beforeSubmit', 'Start');
            ClienteHandler.validarIdExternoDuplicado(context);
            log.error('beforeSubmit', 'End');
        } catch (e) {
            log.error({ title: 'UE beforeSubmit - AS_Cliente', details: e.message });
            throw e;
        }
    };

    const afterSubmit = (context) => {
        try {
            log.error('afterSubmit', 'Start');
            ClienteHandler.sincronizarIdExterno(context);
            log.error('afterSubmit', 'End');
        } catch (e) {
            log.error({ title: 'UE afterSubmit - AS_Cliente', details: e.message });
            throw e;
        }
    };

    return { beforeSubmit, afterSubmit };
});
