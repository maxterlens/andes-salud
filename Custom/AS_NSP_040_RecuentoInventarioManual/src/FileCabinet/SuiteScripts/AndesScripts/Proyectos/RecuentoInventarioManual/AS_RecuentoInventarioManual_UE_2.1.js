/**
 * AS_NSP_040 — Recuento de Inventario Manual
 * @description Entry point del Recuento de inventario. Solo recibe el recuento
 *              y se lo pasa al handler que toca.
 *
 *              beforeLoad → con el recuento en Aprobacion pendiente, oculta
 *                           Aprobar y Rechazar a todo rol que no sea Contable
 *                           (o Administrador). Farmacia cuenta y completa;
 *                           solo Contable aprueba o rechaza.
 *                         → en vista, agrega la ficha informativa "Importes del
 *                           recuento" (cantidad x tarifa). En edicion no sale.
 *                         → en vista, agrega el boton Descargar TXT y, con el
 *                           recuento Iniciado, el boton Cargar CSV.
 *
 * CHANGELOG v1.3.0 (2026-11-15):
 * - [FEAT] Boton Cargar CSV con el recuento Iniciado, version de prueba.
 *
 * CHANGELOG v1.2.0 (2026-11-15):
 * - [FEAT] Boton Descargar TXT en la vista, version de prueba.
 *
 * CHANGELOG v1.1.0 (2026-11-15):
 * - [FEAT] Pasa del AS_NSP_032 (AS_RecuentoInventario_UE_2.1.js) al AS_NSP_040 sin
 *          cambios de logica; mismo scriptid customscript_as_rec_inv_cierre_ue.
 *
 * @NApiVersion 2.1
 * @NScriptType UserEventScript
 * @NModuleScope Public
 * @scriptid     customscript_as_rec_inv_cierre_ue
 * @deploymentid customdeploy_as_rec_inv_cierre_ue
 * @author Andes Salud
 * @version 1.3.0
 */
define(['./handler/AS_CierreRecuentoHandler', './handler/AS_ImporteRecuentoHandler', './handler/AS_ArchivoRecuentoHandler',
        './handler/AS_CargaCantidadesHandler'],
    (cierreRecuentoHandler, importeRecuentoHandler, archivoRecuentoHandler, cargaCantidadesHandler) => {

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
        try {
            archivoRecuentoHandler.agregarBoton(context.form);
        } catch (fallo) {
            log.error({
                title  : 'RECUENTO INVENTARIO TXT ERROR',
                details: 'recuento: ' + context.newRecord.id
                       + ' | motivo: ' + (fallo.message || fallo),
            });
        }
        try {
            cargaCantidadesHandler.agregarBoton(context.form, context.newRecord);
        } catch (fallo) {
            log.error({
                title  : 'RECUENTO INVENTARIO CSV ERROR',
                details: 'recuento: ' + context.newRecord.id
                       + ' | motivo: ' + (fallo.message || fallo),
            });
        }
    }

    return { beforeLoad };
});
