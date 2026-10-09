/**
 * AS_NSP_026 — Nomina de Pago (seleccion manual de transacciones)
 * @description Entry point del Suitelet de Generacion de Nomina de Pago.
 *              Enruta las peticiones GET/POST al handler correspondiente.
 *              No contiene logica de negocio — ver ./handlers/GeneracionNominaPagoHandler.js
 *
 *              Vistas (parametro GET "view"):
 *                landing     (default) → el usuario elige Subsidiaria/Banco/Cuenta Banco
 *                seleccion               → grilla de transacciones candidatas con checkbox
 *                resultado               → confirmacion tras crear la Nomina de Pago
 *
 * @NApiVersion 2.1
 * @NScriptType Suitelet
 * @NModuleScope Public
 */
define([
    './handlers/GeneracionNominaPagoHandler',
    'N/log'
], (Handler, log) => {

    /* --- Entry point --------------------------------------------------- */
    const onRequest = (context) => {
        try {
            if (context.request.method === 'GET') {
                Handler.handleGet(context);
            } else {
                Handler.handlePost(context);
            }
        } catch (e) {
            log.error({ title: 'onRequest — Error no controlado', details: e });
            context.response.write(
                '<p style="color:#721c24;font-weight:bold;font-family:sans-serif;">' +
                'Error: ' + (e.message || String(e)) + '</p>'
            );
        }
    };

    return { onRequest };
});
