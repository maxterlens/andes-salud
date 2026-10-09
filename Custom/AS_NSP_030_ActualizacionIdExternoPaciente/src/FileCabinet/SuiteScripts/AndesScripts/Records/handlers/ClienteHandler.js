/**
 * @NApiVersion 2.1
 * @NModuleScope SameAccount
 * @file ClienteHandler.js
 * @description Handler — orquesta la lógica del User Event de Cliente según el tipo de evento.
 */
define([
    '../services/ClienteService'
], (ClienteService) => {

    const aplicaEvento = ({ type, UserEventType }) =>
        type === UserEventType.CREATE || type === UserEventType.EDIT;

    /**
     * beforeSubmit: valida que el número de ficha no esté asignado como externalid a otro cliente.
     * @param {Object} context - Contexto del User Event (beforeSubmit).
     */
    const validarIdExternoDuplicado = (context) => {
        if (!aplicaEvento(context)) return;

        ClienteService.validarIdExternoDuplicado(context.newRecord);
    };

    /**
     * afterSubmit: copia custentity_pac_numficha al externalid del cliente.
     * @param {Object} context - Contexto del User Event (afterSubmit).
     */
    const sincronizarIdExterno = (context) => {
        if (!aplicaEvento(context)) return;

        ClienteService.copiarNumFichaAIdExterno(context.newRecord);
    };

    return { validarIdExternoDuplicado, sincronizarIdExterno };
});
