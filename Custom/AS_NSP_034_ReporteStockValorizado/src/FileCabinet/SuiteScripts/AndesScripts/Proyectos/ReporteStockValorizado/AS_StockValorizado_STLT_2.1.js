/**
 * AS_NSP_035 — Reporte de Stock Valorizado
 * @description Entry point de la pantalla del reporte. Solo recibe la peticion y
 *              se la pasa al handler.
 *
 *              GET  → filtros e historial de reportes.
 *              POST → Generar: lanza el reporte en segundo plano.
 * @NApiVersion 2.1
 * @NScriptType Suitelet
 * @NModuleScope Public
 * @scriptid     customscript_as_stock_valorizado_stlt
 * @deploymentid customdeploy_as_stock_valorizado_stlt
 * @author Andes Salud
 * @version 1.0.0
 *
 */
define(['./handler/AS_StockValorizadoHandler'],
    (stockValorizadoHandler) => {

    function onRequest(context) {
        try {
            if (context.request.method === 'GET') {
                stockValorizadoHandler.mostrarFormulario(context);
            } else {
                stockValorizadoHandler.solicitarReporte(context);
            }
        } catch (fallo) {
            log.error({
                title  : 'STOCK VALORIZADO ERROR',
                details: 'metodo: ' + context.request.method
                       + ' | motivo: ' + (fallo.message || fallo),
            });

            throw fallo;
        }
    }

    return { onRequest };
});
