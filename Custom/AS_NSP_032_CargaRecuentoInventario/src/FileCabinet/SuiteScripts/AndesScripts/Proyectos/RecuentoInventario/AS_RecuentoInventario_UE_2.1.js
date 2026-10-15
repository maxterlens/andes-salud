/**
 * AS_NSP_032 — Carga de Recuento de Inventario
 * @description Entry point del control de cierre del Recuento de inventario.
 *              Solo recibe la vista del recuento y se la pasa al handler.
 *
 *              beforeLoad (vista) → oculta Completar recuento a todo rol que no
 *                                   sea el que cierra (Contable): el recuento lo
 *                                   inicia y lo cierra Contable; Abastecimiento y
 *                                   Farmacia solo cuentan.
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
            if (context.type !== context.UserEventType.VIEW) return;
            cierreRecuentoHandler.ocultarCompletarRecuento(context.form);
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
