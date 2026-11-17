/**
 * AS_NSP_040 — Recuento de Inventario Manual
 * @description Entry point de AS Recuento Inventario Manual Cola. Solo recibe la
 *              solicitud y se la pasa al handler.
 *
 *              beforeLoad → en vista, el estado de la solicitud arriba y, si no
 *                           termino, la recarga automatica.
 *
 * @NApiVersion 2.1
 * @NScriptType UserEventScript
 * @NModuleScope Public
 * @scriptid     customscript_as_rec_inv_man_cola_ue
 * @deploymentid customdeploy_as_rec_inv_man_cola_ue
 * @author Andes Salud
 * @version 1.0.0
 */
define(['./handler/AS_VistaColaHandler'],
    (vistaColaHandler) => {

    function beforeLoad(context) {
        if (context.type !== context.UserEventType.VIEW) return;
        try {
            vistaColaHandler.mostrarEstado(context.form, context.newRecord);
        } catch (fallo) {
            log.error({
                title  : 'RECUENTO INVENTARIO COLA ERROR',
                details: 'solicitud: ' + context.newRecord.id
                       + ' | motivo: ' + (fallo.message || fallo),
            });
        }
    }

    return { beforeLoad };
});
