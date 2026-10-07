/**
 * AS_NSP_018 — Prestamo A la Clinica
 * @NApiVersion 2.1
 * @NModuleScope Public
 */
define(['N/redirect', 'N/error', 'N/runtime', '../lib/AS_MovimientoInventarioConstants', '../repositories/AS_MovimientoInventarioRepository', '../repositories/AS_MovimientoInventarioAjusteRepository'],
    (redirect, error, runtime, CONSTANTES, movimientoRepository, ajusteRepository) => {

    function generarAjustePrestamo(context) {
        const idMovimiento = context.request.parameters.idMovimiento;
        const cabecera = movimientoRepository.cargarMovimiento(idMovimiento);
        const estado = cabecera.getText({ fieldId: 'custrecord_as_mov_estado' });

        if (estado !== CONSTANTES.ESTADOS.PENDIENTE_PROCESAR) {
            throw error.create({
                name     : 'AS_MOVIMIENTO_YA_PROCESADO',
                message  : 'El movimiento ya fue procesado y esta en estado ' + estado + '. '
                         + 'No se genera un ajuste nuevo.',
                notifyOff: true,
            });
        }

        const lineas = movimientoRepository.buscarLineasPorMovimiento(idMovimiento);
        const ubicacionDestino = cabecera.getValue({ fieldId: 'custrecord_as_mov_ubicacion_dest' });
        const usuario = runtime.getCurrentUser().id;
        const ajuste = ajusteRepository.crearAjustePositivo({
            subsidiaria: cabecera.getValue({ fieldId: 'custrecord_as_mov_subsidiaria' }),
            servicio   : cabecera.getValue({ fieldId: 'custrecord_as_mov_servicio' }),
            cuenta     : cabecera.getValue({ fieldId: 'custrecord_as_mov_cuenta_ajuste' }),
            ubicacion  : ubicacionDestino,
            memo       : 'PRESTAMO ' + cabecera.getValue({ fieldId: 'name' }),
        }, lineas);

        movimientoRepository.actualizarProcesoMovimiento(idMovimiento, {
            transfer        : ajuste.id,
            estado          : movimientoRepository.obtenerIdEstadoMovimiento(CONSTANTES.ESTADOS.PENDIENTE_DEVOLUCION),
            ubicacionDestino: ubicacionDestino,
            procesadoPor    : usuario,
            fechaProceso    : new Date(),
        });

        log.audit({
            title  : CONSTANTES.LOGS.PROCESADO,
            details: 'movimiento: ' + idMovimiento + ' | tipo: ' + CONSTANTES.TIPOS.PRESTAMO
                   + ' | articulos: ' + lineas.map((linea) => linea.articulo + ' x' + linea.cantidad).join(' | ')
                   + ' | ajuste: ' + ajuste.numero + ' (id ' + ajuste.id + ')'
                   + ' | usuario: ' + usuario,
        });

        redirect.toRecord({
            type: CONSTANTES.RECORDS.MOVIMIENTO,
            id  : idMovimiento,
        });
    }

    return { generarAjustePrestamo };
});
