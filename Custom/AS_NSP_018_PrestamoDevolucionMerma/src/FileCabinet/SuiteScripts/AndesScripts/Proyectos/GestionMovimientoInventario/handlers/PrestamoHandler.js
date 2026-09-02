/**
 * AS_NSP_018 — Prestamo, Devolucion y Merma
 * @NApiVersion 2.1
 * @NModuleScope Public
 */
define(['N/redirect', 'N/error', 'N/runtime', '../lib/MovimientoInventarioConstants', '../repositories/MovimientoInventarioRepository', '../repositories/InventoryTransferRepository'],
    (redirect, error, runtime, CONSTANTES, movimientoRepository, inventoryTransferRepository) => {

    function generarTransferPrestamo(context) {
        const idMovimiento = context.request.parameters.idMovimiento;

        const cabecera = movimientoRepository.cargarMovimiento(idMovimiento);
        const estado = cabecera.getText({ fieldId: 'custrecord_as_mov_estado' });

        if (estado !== CONSTANTES.ESTADOS.PENDIENTE_PROCESAR) {
            throw error.create({
                name     : 'AS_MOVIMIENTO_YA_PROCESADO',
                message  : 'El movimiento ya fue procesado y esta en estado ' + estado + '. '
                         + 'No se genera un traslado nuevo.',
                notifyOff: true,
            });
        }

        const lineas = movimientoRepository.buscarLineasPorMovimiento(idMovimiento);

        const subsidiaria            = cabecera.getValue({ fieldId: 'custrecord_as_mov_subsidiaria' });
        const ubicacionOrigen        = cabecera.getValue({ fieldId: 'custrecord_as_mov_ubicacion' });
        const nombreUbicacionOrigen  = cabecera.getText({ fieldId: 'custrecord_as_mov_ubicacion' });
        const ubicacionDestino       = cabecera.getValue({ fieldId: 'custrecord_as_mov_ubicacion_dest' });
    
        const stock = inventoryTransferRepository.buscarStockPorArticulo(
            lineas.map((linea) => linea.articulo), ubicacionOrigen);
        const lotesPorArticulo = {};

        lineas.forEach((linea) => {
            if (!linea.lote) {
                linea.hay = stock[linea.articulo].disponible;
                return;
            }

            if (!lotesPorArticulo[linea.articulo]) {
                lotesPorArticulo[linea.articulo] = inventoryTransferRepository.buscarLotesDisponibles(linea.articulo, ubicacionOrigen);
            }

            const elegido = lotesPorArticulo[linea.articulo].filter((lote) => lote.nombreLote === linea.lote)[0];

            linea.hay = elegido ? elegido.enMano : 0;
        });

        const faltantes = lineas.filter((linea) => linea.hay < linea.cantidad);

        if (faltantes.length > 0) {
            const detalleFaltantes = faltantes.map((linea) => {
                const queSale = linea.lote ? linea.articuloTexto + ' lote ' + linea.lote : linea.articuloTexto;

                return queSale + ' (presta ' + linea.cantidad + ', hay ' + linea.hay + ')';
            }).join(' | ');

            throw error.create({
                name     : 'AS_STOCK_INSUFICIENTE',
                message  : 'No hay stock suficiente en ' + nombreUbicacionOrigen + ': ' + detalleFaltantes,
                notifyOff: true,
            });
        }

        const usuario = runtime.getCurrentUser().id;

        const traslado = inventoryTransferRepository.crearInventoryTransfer({
            subsidiaria     : subsidiaria,
            servicio        : cabecera.getValue({ fieldId: 'custrecord_as_mov_servicio' }),
            ubicacionOrigen : ubicacionOrigen,
            ubicacionDestino: ubicacionDestino,
            memo            : 'PRESTAMO ' + cabecera.getValue({ fieldId: 'name' }),
        }, lineas);

        const estadoPendienteDevolucion = movimientoRepository.obtenerIdEstadoMovimiento(CONSTANTES.ESTADOS.PENDIENTE_DEVOLUCION);
        movimientoRepository.actualizarProcesoMovimiento(idMovimiento, {
            transfer        : traslado.id,
            estado          : estadoPendienteDevolucion,
            ubicacionDestino: ubicacionDestino,
            procesadoPor    : usuario,
            fechaProceso    : new Date(),
        });

        log.audit({
            title  : CONSTANTES.LOGS.PROCESADO,
            details: 'movimiento: ' + idMovimiento + ' | tipo: ' + CONSTANTES.TIPOS.PRESTAMO
                   + ' | articulos: ' + lineas.map((linea) => linea.articulo + ' x' + linea.cantidad).join(' | ')
                   + ' | traslado: ' + traslado.numero + ' (id ' + traslado.id + ')'
                   + ' | usuario: ' + usuario,
        });

        redirect.toRecord({
            type: CONSTANTES.RECORDS.MOVIMIENTO,
            id  : idMovimiento,
        });
    }

    return { generarTransferPrestamo };
});
