/**
 * @NApiVersion 2.1
 * @NModuleScope SameAccount
 */
define(['N/ui/message', 'N/log'], (message, log) => {

    const manejarAlertaFacturaPagada = (context) => {
        const { newRecord, type, form, UserEventType} = context;
        if (type !== UserEventType.EDIT) return;

        const statusRef = newRecord.getValue({ fieldId: 'statusRef' });
        log.error('statusRef', statusRef);
        if (statusRef != 'paidInFull') return;

        // ── Banner superior (nativo N/ui/message) ────────────────────────────
        form.addPageInitMessage({
            type: message.Type.ERROR,
            title: '¡Atención! Factura Totalmente Pagada',
            message:
                'Modificar este documento reabrirá la factura y podría generar un doble pago por error. ' +
                'No realizar cambios sin la autorización previa del encargado de Tesorería.'
        });
    };


    return {
        manejarAlertaFacturaPagada,
    };
});
