/**
 * AS_NSP_018 — Prestamo, Devolucion y Merma
 * @description Imprime el comprobante del movimiento: lee la cabecera, sus
 *              lineas y, en una Devolucion, lo prestado en cada linea del
 *              prestamo, y le pasa todo a AS_ComprobanteForm, que arma el PDF con
 *              la plantilla AS_Comprobante<Tipo>.ftl.
 *
 * @NApiVersion 2.1
 * @NModuleScope Public
 */
define(['../constants/AS_MovimientoInventarioConstants', '../data/search/AS_MovimientoInventarioSearch', '../data/record/AS_SolicitudRecord', '../form/AS_ComprobanteForm'],
    (CONSTANTES, movimientoSearch, solicitudRecord, comprobanteForm) => {

    function imprimirComprobante(context) {
        const idMovimiento = context.request.parameters.idMovimiento;

        const movimiento       = solicitudRecord.cargarMovimiento(idMovimiento);
        const tipo             = movimiento.getText({ fieldId: 'custrecord_as_mov_tipo' });
        const lineas           = movimientoSearch.obtenerLineasMovimiento(idMovimiento);
        const prestadaPorLinea = {};

        if (tipo === CONSTANTES.TIPOS.DEVOLUCION) {
            movimientoSearch.obtenerLineasMovimiento(
                movimiento.getValue({ fieldId: 'custrecord_as_mov_prestamo_ref' })
            ).forEach((linea) => {
                prestadaPorLinea[linea.id] = linea.cantidad;
            });
        }

        context.response.renderPdf(comprobanteForm.construirComprobante(movimiento, tipo, lineas, prestadaPorLinea));
    }

    return {
        imprimirComprobante: imprimirComprobante,
    };
});
