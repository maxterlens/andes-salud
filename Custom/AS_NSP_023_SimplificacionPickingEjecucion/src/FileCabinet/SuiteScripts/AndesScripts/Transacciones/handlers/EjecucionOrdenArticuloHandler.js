/**
 * @NApiVersion 2.1
 * @NModuleScope SameAccount
 * @file EjecucionOrdenArticuloHandler.js
 * @description Handler — orquesta los eventos del User Event de Ejecución de Orden de Artículo.
 */
define([
    '../services/EjecucionOrdenArticuloService'
], (EjecucionOrdenArticuloService) => {

    /**
     * beforeLoad: sugiere el estado Enviado en el formulario al crear
     * una ejecución desde una Orden de Traslado.
     * @param {Object} context - Contexto del User Event.
     */
    function asignarEstadoEnviado(context) {
        const { newRecord, type } = context;
        const createdFrom = newRecord.getValue('createdfrom');

        if (EjecucionOrdenArticuloService.debeMarcarseEnviado({ type, createdFrom })) {
            newRecord.setValue('shipstatus', EjecucionOrdenArticuloService.SHIP_STATUS.SHIPPED);
        }
    }

    /**
     * afterSubmit: asegura el estado Enviado en ejecuciones creadas
     * desde una Orden de Traslado (UI, script, CSV o integración).
     * @param {Object} context - Contexto del User Event.
     */
    function marcarComoEnviado(context) {
        const { newRecord, type } = context;

        EjecucionOrdenArticuloService.marcarComoEnviado({
            id: newRecord.id,
            type,
            createdFrom: newRecord.getValue('createdfrom'),
            shipStatus: newRecord.getValue('shipstatus')
        });
    }

    return {
        asignarEstadoEnviado,
        marcarComoEnviado
    };
});
