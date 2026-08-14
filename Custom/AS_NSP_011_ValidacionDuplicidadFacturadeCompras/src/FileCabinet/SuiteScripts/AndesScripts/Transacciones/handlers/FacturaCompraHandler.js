/**
 * @NApiVersion 2.1
 * @NModuleScope SameAccount
 */
define(['N/ui/message', 'N/log'], (message, log) => {

    // ─── Funcionalidades beforeLoad ───────────────────────────────────────────

    /**
     * Muestra un aviso de advertencia cuando la factura de compra
     * está totalmente pagada y el usuario intenta editarla.
     *
     * - Banner superior: via addPageInitMessage (nativo, sin JS cliente).
     * - Banner inferior: via clientScriptModulePath — el CS inserta el aviso
     *   justo encima de los botones de guardado inferiores mediante DOM.
     *
     * @param {Object} context - Contexto del evento UserEvent
     */
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

        // ── Banner inferior (Client Script vía DOM) ──────────────────────────
        // El CS inserta el mismo aviso justo encima de los botones inferiores
        // del formulario, donde también existen controles de guardado.
        //form.clientScriptModulePath = '/SuiteScripts/AndesScripts/Transacciones/AS_FacturaCompra_CS_2.1.js';
    };

    // ─── Triggers (índice público) ───────────────────────────────────────────

    return {
        manejarAlertaFacturaPagada,
    };
});
