/**
 * AS_NSP_032 — Carga de Recuento de Inventario
 * @description Entry point del control de cierre del Recuento de inventario.
 *              Solo recibe la vista del recuento y se la pasa al handler.
 *
 *              beforeLoad → con el recuento en Aprobacion pendiente, oculta
 *                           Aprobar y Rechazar a todo rol que no sea Contable
 *                           (o Administrador). Farmacia cuenta y completa;
 *                           solo Contable aprueba o rechaza.
 * @NApiVersion 2.1
 * @NScriptType UserEventScript
 * @NModuleScope Public
 * @scriptid     customscript_as_rec_inv_cierre_ue
 * @deploymentid customdeploy_as_rec_inv_cierre_ue
 * @author Andes Salud
 * @version 1.0.0
 *
 */

define(['./handler/AS_CierreRecuentoHandler'], (cierreRecuentoHandler) => {

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
    }

    return { beforeLoad };
});
