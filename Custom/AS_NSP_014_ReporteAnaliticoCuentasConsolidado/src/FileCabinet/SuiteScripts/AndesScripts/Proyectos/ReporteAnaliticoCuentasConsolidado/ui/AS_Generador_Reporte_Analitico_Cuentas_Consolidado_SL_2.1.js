/**
 * AS_NSP_014 — Reporte Analítico de Cuentas Consolidado
 * @description Entry point del Suitelet. Enruta las peticiones GET/POST
 *              a los handlers correspondientes según el parámetro 'op'.
 *
 * Parámetros GET reconocidos:
 *   op=view   (default) → Vista principal: filtros + histórico de logs + botón Generar
 *   op=detail           → Vista de detalle del histórico de un reporte
 *   fileId              → ID del archivo de datos (requerido para op=detail)
 *
 * @NApiVersion 2.1
 * @NScriptType Suitelet
 * @NModuleScope Public
 */
define([
    './handlers/GeneradorReporteAnaliticoCuentasHandler',
    './handlers/GeneradorReporteAnaliticoCuentasDetalleHandler',
], function (mainHandler, detalleHandler) {

    const ACCIONES = {
        VIEW  : 'view',
        DETAIL: 'detail',
    };

    /* ─── Entry point ─────────────────────────────────────────────── */
    function onRequest(context) {
        try {
            if (context.request.method === 'GET') {
                _handleGet(context);
            } else {
                _handlePost(context);
            }
        } catch (e) {
            log.error({ title: 'onRequest — Error no controlado', details: e });
            context.response.write(
                '<p style="color:#721c24;font-weight:bold;font-family:sans-serif;">' +
                'Error: ' + (e.message || String(e)) + '</p>'
            );
        }
    }

    /* ─── GET ─────────────────────────────────────────────────────── */
    function _handleGet(context) {
        const params = context.request.parameters;
        const op     = params.op     || ACCIONES.VIEW;
        const fileId = params.fileId || null;

        switch (op) {
            case ACCIONES.DETAIL:
                detalleHandler.handleGet(context, fileId);
                break;
            case ACCIONES.VIEW:
            default:
                mainHandler.handleGet(context);
                break;
        }
    }

    /* ─── POST (siempre desde la vista principal) ─────────────────── */
    function _handlePost(context) {
        mainHandler.handlePost(context);
    }

    return { onRequest };
});
