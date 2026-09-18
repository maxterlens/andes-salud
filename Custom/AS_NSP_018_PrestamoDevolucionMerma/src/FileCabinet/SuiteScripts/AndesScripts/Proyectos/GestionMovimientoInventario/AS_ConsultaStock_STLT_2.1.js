/**
 * AS_NSP_018 — Prestamo, Devolucion y Merma
 * @description Entry point de la consulta de stock, la herramienta de apoyo a
 *              desarrollo y QA del modulo. Responde siempre lo mismo: la pantalla
 *              de consulta.
 *
 *              GET                          → filtros vacios.
 *              GET subsidiaria              → carga las ubicaciones de esa subsidiaria.
 *              GET subsidiaria + ubicacion  → lista los articulos con stock.
 *
 *              No escribe: no crea ni modifica registros ni transacciones, asi
 *              que no valida permiso de escritura ni toca la logica de Prestamo,
 *              Devolucion o Merma.
 *
 * @NApiVersion 2.1
 * @NScriptType Suitelet
 * @NModuleScope Public
 * @scriptid     customscript_as_stlt_consulta_stock
 * @deploymentid customdeploy_as_stlt_consulta_stock
 */
define(['./ui/AS_ConsultaStockForm'], (consultaStockForm) => {

    function onRequest(context) {
        try {
            consultaStockForm.construirVista(context);
        } catch (fallo) {
            log.error({
                title  : 'CONSULTA STOCK ERROR',
                details: 'ubicacion: ' + context.request.parameters.ubicacion
                       + ' | motivo: ' + (fallo.message || fallo),
            });

            throw fallo;
        }
    }

    return { onRequest };
});
