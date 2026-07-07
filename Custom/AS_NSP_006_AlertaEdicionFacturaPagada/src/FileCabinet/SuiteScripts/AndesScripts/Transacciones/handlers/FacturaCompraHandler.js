/**
 * @NApiVersion 2.1
 * @NModuleScope SameAccount
 */
define(['N/ui/message', 'N/log'], (message, log) => {

    // ─── Funcionalidades beforeLoad ───────────────────────────────────────────

    /**
     * Muestra un aviso de advertencia cuando la factura de compra
     * está totalmente pagada y el usuario intenta editarla.
     * Se utiliza addPageInitMessage para que el banner aparezca
     * al renderizar el formulario, sin necesidad de código cliente.
     *
     * @param {Object} context - Contexto del evento UserEvent
     */
    const manejarAlertaFacturaPagada = (context) => {
        const { newRecord, type, form, UserEventType} = context;
        if (type !== UserEventType.EDIT) return;

        const statusRef = newRecord.getValue({ fieldId: 'statusRef' });
        log.error('statusRef', statusRef);
        if (statusRef != 'paidInFull') return;
        form.addPageInitMessage({
            type: message.Type.ERROR,
            title: '¡Atención! Factura Totalmente Pagada',
            message:
                'Modificar este documento reabrirá la factura y podría generar un doble pago por error. ' +
                'No realizar cambios sin la autorización previa del encargado de Tesorería.'
        });
    };

    // ─── Triggers (índice público) ───────────────────────────────────────────

    return {
        manejarAlertaFacturaPagada,
    };
});
