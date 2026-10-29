/**
 * @NApiVersion 2.1
 * @NModuleScope SameAccount
 * @file RecepcionArticuloHandler.js
 * @description Handler — orquesta los eventos del User Event de Recepción de Artículo.
 */
define([
    'N/error',
    'N/log',
    'N/runtime',
    '../services/RecepcionArticuloService'
], (error, log, runtime, RecepcionArticuloService) => {

    /**
     * beforeSubmit: impide eliminar una recepción si alguno de sus lotes
     * quedaría con saldo físico negativo en su ubicación.
     * @param {Object} context - Contexto del User Event.
     */
    function validarEliminacion(context) {
        const { type, UserEventType, oldRecord } = context;

        if (type !== UserEventType.DELETE) return;

        const recepcionId = oldRecord && oldRecord.id;
        if (!recepcionId) return;

        const conflictos = RecepcionArticuloService.obtenerLotesEnConflicto(
            recepcionId,
            oldRecord.getValue({ fieldId: 'trandate' })
        );
        if (!conflictos.length) return;

        log.audit({
            title: `Eliminación bloqueada - Recepción ${recepcionId}`,
            details: JSON.stringify(conflictos)
        });

        throw error.create({
            name: RecepcionArticuloService.ERROR_LOTE_CONSUMIDO,
            message: RecepcionArticuloService.construirMensaje(conflictos, {
                html: runtime.executionContext === runtime.ContextType.USER_INTERFACE,
                numeroRecepcion: oldRecord.getValue({ fieldId: 'tranid' }) || `#${recepcionId}`
            }),
            notifyOff: true
        });
    }

    return {
        validarEliminacion
    };
});
