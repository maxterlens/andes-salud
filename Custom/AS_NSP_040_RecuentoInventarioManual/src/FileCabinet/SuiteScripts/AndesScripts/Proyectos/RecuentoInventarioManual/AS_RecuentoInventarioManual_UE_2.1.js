/**
 * AS_NSP_040 — Recuento de Inventario Manual
 * @description Entry point del Recuento de inventario. Solo recibe el recuento
 *              y se lo pasa al handler que toca.
 *
 *              beforeLoad → con el recuento en Aprobacion pendiente, cambia
 *                           el Aprobar nativo por el propio, que aprueba por la
 *                           cola, y oculta Aprobar y Rechazar a todo rol que no
 *                           sea Contable (o Administrador). Farmacia cuenta y
 *                           completa; solo Contable aprueba o rechaza. Con una
 *                           aprobacion en curso, no deja ninguno de los dos.
 *                         → en vista, agrega la ficha informativa "Importes del
 *                           recuento" (cantidad x tarifa). En edicion no sale.
 *                         → en vista, agrega el boton Descargar TXT. Las
 *                           cantidades se cargan desde la pantalla Cargar CSV
 *                           del Suitelet, no desde el recuento.
 *                         → en vista, con el recuento Iniciado, en Aprobacion
 *                           pendiente o Aprobado,
 *                           agrega el boton Detalle de conteo: el CSV de la
 *                           sublista Articulos.
 *
 * @NApiVersion 2.1
 * @NScriptType UserEventScript
 * @NModuleScope Public
 * @scriptid     customscript_as_rec_inv_cierre_ue
 * @deploymentid customdeploy_as_rec_inv_cierre_ue
 * @author Andes Salud
 * @version 1.6.0
 *
 */
define(['./handler/AS_CierreRecuentoHandler', './handler/AS_ImporteRecuentoHandler', './handler/AS_ArchivoRecuentoHandler'],
    (cierreRecuentoHandler, importeRecuentoHandler, archivoRecuentoHandler) => {

    function beforeLoad(context) {
        try {
            cierreRecuentoHandler.prepararAprobacion(context.form, context.newRecord);
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
            archivoRecuentoHandler.agregarBotones(context.form, context.newRecord);
        } catch (fallo) {
            log.error({
                title  : 'RECUENTO INVENTARIO TXT ERROR',
                details: 'recuento: ' + context.newRecord.id
                       + ' | motivo: ' + (fallo.message || fallo),
            });
        }
    }

    return { beforeLoad };
});
