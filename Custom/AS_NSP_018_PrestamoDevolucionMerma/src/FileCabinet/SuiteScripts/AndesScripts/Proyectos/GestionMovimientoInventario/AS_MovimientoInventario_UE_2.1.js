/**
 * AS_NSP_018 — Prestamo, Devolucion y Merma
 * @description Entry point del User Event sobre la cabecera del movimiento. Solo
 *              rutea: los dos hooks los resuelve MovimientoInventarioUEHandler.
 *
 *              beforeLoad   → arma la vista: campos por tipo, tab de detalle,
 *                             botones de proceso, y manda la creacion y la
 *                             edicion hacia el Suitelet.
 *              beforeSubmit → corta el guardado de un movimiento que ya no se
 *                             corrige.
 *
 * @NApiVersion 2.1
 * @NScriptType UserEventScript
 * @NModuleScope Public
 * @scriptid     customscript_as_ue_movimiento_inv
 * @deploymentid customdeploy_as_ue_movimiento_inv
 * @recordtype   customrecord_as_movimiento_inventario
 */
define(['./lib/MovimientoInventarioConstants', './handlers/MovimientoInventarioUEHandler'],
    (CONSTANTES, ueHandler) => {

    function beforeLoad(context) {
        try {
            ueHandler.construirVista(context);
        } catch (fallo) {
            log.error({
                title  : CONSTANTES.LOGS.ERROR,
                details: 'movimiento: ' + context.newRecord.id + ' | operacion: vista'
                       + ' | motivo: ' + (fallo.message || fallo),
            });

            throw fallo;
        }
    }

    function beforeSubmit(context) {
        try {
            ueHandler.validarEdicion(context);
        } catch (fallo) {
            log.error({
                title  : CONSTANTES.LOGS.ERROR,
                details: 'movimiento: ' + context.newRecord.id + ' | operacion: edicion'
                       + ' | motivo: ' + (fallo.message || fallo),
            });

            throw fallo;
        }
    }

    return { beforeLoad, beforeSubmit };
});
