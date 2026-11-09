/**
 * AS_NSP_032 — Carga de Recuento de Inventario
 * @description Entry point del Recuento de inventario. Solo recibe el recuento
 *              y se lo pasa al handler que toca.
 *
 *              beforeLoad → con el recuento en Aprobacion pendiente, oculta
 *                           Aprobar y Rechazar a todo rol que no sea Contable
 *                           (o Administrador). Farmacia cuenta y completa;
 *                           solo Contable aprueba o rechaza.
 *                         → en vista, agrega la ficha informativa "Importes del
 *                           recuento" (cantidad x tarifa). En edicion no sale.
 * @NApiVersion 2.1
 * @NScriptType UserEventScript
 * @NModuleScope Public
 * @scriptid     customscript_as_rec_inv_cierre_ue
 * @deploymentid customdeploy_as_rec_inv_cierre_ue
 * @author Andes Salud
 * @version 1.1.0
 *
 */

define(['./handler/AS_CierreRecuentoHandler', './handler/AS_ImporteRecuentoHandler'],
    (cierreRecuentoHandler, importeRecuentoHandler) => {

    function beforeLoad(context) {
        try {
            cierreRecuentoHandler.ocultarAprobarRechazar(context.form, context.newRecord);
        } catch (fallo) {
            log.error({
                title  : 'RECUENTO INVENTARIO CIERRE ERROR',
                details: 'recuento: ' + context.newRecord.id
                       + ' | motivo: ' + (fallo.message || fallo),
            });
        }
        if (context.type !== context.UserEventType.VIEW) return;
        try {
            importeRecuentoHandler.mostrarImportes(context.form, context.newRecord);
        } catch (fallo) {
            log.error({
                title  : 'RECUENTO INVENTARIO IMPORTES ERROR',
                details: 'recuento: ' + context.newRecord.id
                       + ' | motivo: ' + (fallo.message || fallo),
            });
        }
    }

    return { beforeLoad };
});
