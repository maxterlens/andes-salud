/**
 * AS_NSP_005 — Reposición de Inventario por Orden de Traslado (módulo M2)
 * @description Entry point del Suitelet de Resolución de Stock Limitado.
 *              Enruta las peticiones GET/POST al handler correspondiente.
 *              No contiene lógica de negocio — ver ./handlers/ResolucionStockLimitadoHandler.js
 *
 *              Vistas (parámetro GET "view"):
 *                landing     (default) → pantalla inicial con botón "Buscar"
 *                resolucion              → grilla de resolución de conflictos (calculada en vivo)
 *                resultados              → listado de resultados tras confirmar una resolución
 *
 * @NApiVersion 2.1
 * @NScriptType Suitelet
 * @NModuleScope Public
 */
define([
    './handlers/ResolucionStockLimitadoHandler',
    'N/log'
], (Handler, log) => {

    /* ─── Entry point ─────────────────────────────────────────────────── */
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
