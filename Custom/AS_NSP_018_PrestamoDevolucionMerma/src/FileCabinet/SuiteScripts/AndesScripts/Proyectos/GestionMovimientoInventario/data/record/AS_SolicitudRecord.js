/**
 * AS_NSP_018 — Prestamo, Devolucion y Merma
 * @description Crea y modifica la solicitud en NetSuite: la cabecera
 *              (customrecord_as_movimiento_inventario) y sus lineas de detalle
 *              (customrecord_as_mov_inventario_det). cargarMovimiento queda aca
 *              porque devuelve el record completo con N/record.
 *
 *              El name de la cabecera es el correlativo del tipo (PRE#, DEV#,
 *              MER#): el custom record no numera solo.
 *
 * @NApiVersion 2.1
 * @NModuleScope Public
 */
define(['N/record', '../../constants/AS_MovimientoInventarioConstants', '../search/AS_MovimientoInventarioSearch'],
    (record, CONSTANTES, movimientoSearch) => {

    function cargarMovimiento(idMovimiento) {
        return record.load({ type: CONSTANTES.RECORDS.MOVIMIENTO, id: idMovimiento });
    }

    function crearMovimiento(datos) {
        const cabecera = record.create({ type: CONSTANTES.RECORDS.MOVIMIENTO, isDynamic: false });

        cabecera.setValue({ fieldId: 'name',                                value: datos.correlativo });
        cabecera.setValue({ fieldId: 'custrecord_as_mov_tipo',              value: datos.tipo });
        cabecera.setValue({ fieldId: 'custrecord_as_mov_correlativo',       value: datos.correlativo });
        cabecera.setValue({ fieldId: 'custrecord_as_mov_de_la_clinica',     value: datos.deLaClinica });
        cabecera.setValue({ fieldId: 'custrecord_as_mov_a_la_clinica',      value: datos.aLaClinica });
        cabecera.setValue({ fieldId: 'custrecord_as_mov_subsidiaria',       value: datos.subsidiaria });
        cabecera.setValue({ fieldId: 'custrecord_as_mov_servicio',          value: datos.servicio });
        if (datos.ubicacionOrigen) cabecera.setValue({ fieldId: 'custrecord_as_mov_ubicacion', value: datos.ubicacionOrigen });
        cabecera.setValue({ fieldId: 'custrecord_as_mov_ubicacion_dest',    value: datos.ubicacionDestino });
        cabecera.setValue({ fieldId: 'custrecord_as_mov_estado',            value: datos.estado });
        cabecera.setValue({ fieldId: 'custrecord_as_mov_usuario_resp',      value: datos.usuarioResponsable });
        cabecera.setValue({ fieldId: 'custrecord_as_mov_motivo',            value: datos.motivo });
        cabecera.setValue({ fieldId: 'custrecord_as_mov_cuenta_ajuste',     value: datos.cuentaAjuste });
        cabecera.setValue({ fieldId: 'custrecord_as_mov_prestamo_ref',      value: datos.prestamoRelacionado });
        cabecera.setValue({ fieldId: 'custrecord_as_mov_entidad_receptora', value: datos.entidadReceptora });
        cabecera.setValue({ fieldId: 'custrecord_as_mov_comentarios',       value: datos.comentarios });
        cabecera.setText({ fieldId: 'custrecord_as_mov_fecha', text: datos.fecha });

        return cabecera.save();
    }

    function actualizarDatosMovimiento(idMovimiento, datos) {
        record.submitFields({
            type  : CONSTANTES.RECORDS.MOVIMIENTO,
            id    : idMovimiento,
            values: {
                custrecord_as_mov_fecha        : datos.fecha,
                custrecord_as_mov_usuario_resp : datos.usuarioResponsable,
                custrecord_as_mov_comentarios  : datos.comentarios,
                custrecord_as_mov_de_la_clinica: datos.deLaClinica,
                custrecord_as_mov_a_la_clinica : datos.aLaClinica,
            },
        });
    }

    function actualizarCuentaAjuste(idMovimiento, cuentaAjuste) {
        record.submitFields({ type: CONSTANTES.RECORDS.MOVIMIENTO, id: idMovimiento, values: { custrecord_as_mov_cuenta_ajuste: cuentaAjuste } });
    }

    function actualizarEstadoMovimiento(idMovimiento, idEstado) {
        record.submitFields({ type: CONSTANTES.RECORDS.MOVIMIENTO, id: idMovimiento, values: { custrecord_as_mov_estado: idEstado } });
    }

    function actualizarProcesoMovimiento(idMovimiento, datos) {
        record.submitFields({
            type  : CONSTANTES.RECORDS.MOVIMIENTO,
            id    : idMovimiento,
            values: {
                custrecord_as_mov_transfer      : datos.transfer,
                custrecord_as_mov_estado        : datos.estado,
                custrecord_as_mov_ubicacion_dest: datos.ubicacionDestino,
                custrecord_as_mov_procesado_por : datos.procesadoPor,
                custrecord_as_mov_fecha_proceso : datos.fechaProceso,
            },
        });
    }

    function crearLineaDetalle(idCabecera, articulo, cantidad, lote) {
        const detalle = record.create({ type: CONSTANTES.RECORDS.DETALLE, isDynamic: true });

        detalle.setValue({ fieldId: 'custrecord_as_mov_det_ref',            value: idCabecera });
        detalle.setValue({ fieldId: 'custrecord_as_mov_det_articulo',       value: articulo });
        detalle.setValue({ fieldId: 'custrecord_as_mov_det_lote',           value: lote });
        detalle.setValue({ fieldId: 'custrecord_as_mov_det_cantidad',       value: cantidad });
        detalle.setValue({ fieldId: 'custrecord_as_mov_det_cant_devuelta',  value: 0 });
        detalle.setValue({ fieldId: 'custrecord_as_mov_det_cant_pendiente', value: cantidad });

        return detalle.save();
    }

    function crearLineaDevolucion(idCabecera, articulo, cantidad, idLineaPrestamo) {
        const detalle = record.create({ type: CONSTANTES.RECORDS.DETALLE, isDynamic: true });

        detalle.setValue({ fieldId: 'custrecord_as_mov_det_ref',       value: idCabecera });
        detalle.setValue({ fieldId: 'custrecord_as_mov_det_articulo',  value: articulo });
        detalle.setValue({ fieldId: 'custrecord_as_mov_det_cantidad',  value: cantidad });
        detalle.setValue({ fieldId: 'custrecord_as_mov_det_linea_ref', value: idLineaPrestamo });

        return detalle.save();
    }

    function eliminarLineasMovimiento(idMovimiento) {
        movimientoSearch.obtenerLineasMovimiento(idMovimiento).forEach((linea) => {
            record.delete({ type: CONSTANTES.RECORDS.DETALLE, id: linea.id });
        });
    }

    function actualizarLoteLinea(idLinea, lote) {
        record.submitFields({ type: CONSTANTES.RECORDS.DETALLE, id: idLinea, values: { custrecord_as_mov_det_lote: lote } });
    }

    function actualizarCantidadesDevolucion(idLinea, devuelta, pendiente) {
        record.submitFields({
            type  : CONSTANTES.RECORDS.DETALLE,
            id    : idLinea,
            values: {
                custrecord_as_mov_det_cant_devuelta : devuelta,
                custrecord_as_mov_det_cant_pendiente: pendiente,
            },
        });
    }

    return {
        cargarMovimiento              : cargarMovimiento,
        crearMovimiento               : crearMovimiento,
        actualizarDatosMovimiento     : actualizarDatosMovimiento,
        actualizarCuentaAjuste        : actualizarCuentaAjuste,
        actualizarEstadoMovimiento    : actualizarEstadoMovimiento,
        actualizarProcesoMovimiento   : actualizarProcesoMovimiento,
        crearLineaDetalle             : crearLineaDetalle,
        crearLineaDevolucion          : crearLineaDevolucion,
        eliminarLineasMovimiento      : eliminarLineasMovimiento,
        actualizarLoteLinea           : actualizarLoteLinea,
        actualizarCantidadesDevolucion: actualizarCantidadesDevolucion,
    };
});
