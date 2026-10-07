/**
 * AS_NSP_018 — Devolucion A la Clinica
 * @NApiVersion 2.1
 * @NModuleScope Public
 */
define(['N/redirect', 'N/error', 'N/runtime', '../lib/AS_MovimientoInventarioConstants', '../repositories/AS_MovimientoInventarioRepository', '../repositories/AS_ConsultaStockRepository', '../repositories/AS_MovimientoInventarioAjusteRepository'],
    (redirect, error, runtime, CONSTANTES, movimientoRepository, consultaStockRepository, ajusteRepository) => {

    function generarAjusteDevolucion(context) {
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

        const idPrestamo = cabecera.getValue({ fieldId: 'custrecord_as_mov_prestamo_ref' });
        const ubicacion = cabecera.getValue({ fieldId: 'custrecord_as_mov_ubicacion' });
        const nombreUbicacion = cabecera.getText({ fieldId: 'custrecord_as_mov_ubicacion' });
        const lineas = movimientoRepository.buscarLineasPorMovimiento(idMovimiento);
        const lineasPrestamo = movimientoRepository.buscarLineasPorMovimiento(idPrestamo);
        const pendientePorLinea = {};
        lineasPrestamo.forEach((linea) => { pendientePorLinea[linea.id] = linea; });

        const excedidas = lineas.filter((linea) => linea.cantidad > pendientePorLinea[linea.lineaPrestamo].pendiente);
        if (excedidas.length > 0) {
            const detalleExcedidas = excedidas.map((linea) => linea.articuloTexto
                                   + ' (devuelve ' + linea.cantidad
                                   + ', pendiente ' + pendientePorLinea[linea.lineaPrestamo].pendiente + ')').join(' | ');
            throw error.create({
                name     : 'AS_DEVOLUCION_EXCEDE_PENDIENTE',
                message  : 'No se puede devolver mas de lo pendiente: ' + detalleExcedidas,
                notifyOff: true,
            });
        }

        lineas.forEach((linea) => { linea.lote = pendientePorLinea[linea.lineaPrestamo].lote; });
        const lotesPorArticulo = validarStockSuficiente(lineas, ubicacion, nombreUbicacion);
        const usuario = runtime.getCurrentUser().id;
        const ajuste = ajusteRepository.crearAjusteInventario({
            subsidiaria: cabecera.getValue({ fieldId: 'custrecord_as_mov_subsidiaria' }),
            servicio   : cabecera.getValue({ fieldId: 'custrecord_as_mov_servicio' }),
            cuenta     : cabecera.getValue({ fieldId: 'custrecord_as_mov_cuenta_ajuste' }),
            ubicacion  : ubicacion,
            memo       : 'DEVOLUCION ' + cabecera.getValue({ fieldId: 'name' }),
        }, lineas, lotesPorArticulo);

        lineas.forEach((linea) => {
            if (linea.lote) movimientoRepository.actualizarLoteLinea(linea.id, linea.lote);
            const original = pendientePorLinea[linea.lineaPrestamo];
            const devuelta = Math.round((original.devuelta + linea.cantidad) * 100000000) / 100000000;
            const pendiente = Math.round((original.pendiente - linea.cantidad) * 100000000) / 100000000;
            movimientoRepository.actualizarCantidadesDevolucion(original.id, devuelta, pendiente);
        });

        const lineasActualizadas = movimientoRepository.buscarLineasPorMovimiento(idPrestamo);
        let nombreEstadoPrestamo = CONSTANTES.ESTADOS.DEVUELTO_PARCIAL;
        if (lineasActualizadas.every((linea) => linea.pendiente === 0)) {
            nombreEstadoPrestamo = CONSTANTES.ESTADOS.DEVUELTO_TOTAL;
        }
        const idEstadoProcesado = movimientoRepository.obtenerIdEstadoMovimiento(CONSTANTES.ESTADOS.PROCESADO);
        const idEstadoPrestamo = movimientoRepository.obtenerIdEstadoMovimiento(nombreEstadoPrestamo);
        movimientoRepository.actualizarProcesoMovimiento(idMovimiento, {
            transfer        : ajuste.id,
            estado          : idEstadoProcesado,
            ubicacionDestino: '',
            procesadoPor    : usuario,
            fechaProceso    : new Date(),
        });
        movimientoRepository.actualizarEstadoMovimiento(idPrestamo, idEstadoPrestamo);

        log.audit({
            title  : CONSTANTES.LOGS.PROCESADO,
            details: 'movimiento: ' + idMovimiento + ' | tipo: ' + CONSTANTES.TIPOS.DEVOLUCION
                   + ' | articulos: ' + lineas.map((linea) => linea.articulo + ' x' + linea.cantidad).join(' | ')
                   + ' | ajuste: ' + ajuste.numero + ' (id ' + ajuste.id + ')'
                   + ' | usuario: ' + usuario
                   + ' | prestamo ' + idPrestamo + ' queda: ' + nombreEstadoPrestamo,
        });
        redirect.toRecord({ type: CONSTANTES.RECORDS.MOVIMIENTO, id: idMovimiento });
    }

    function validarStockSuficiente(lineas, ubicacion, nombreUbicacion) {
        const stock = consultaStockRepository.buscarStockPorArticulo(
            lineas.map((linea) => linea.articulo), ubicacion);
        const lotesPorArticulo = {};
        lineas.forEach((linea) => {
            if (!linea.lote) {
                linea.hay = stock[linea.articulo].disponible;
                return;
            }
            if (!lotesPorArticulo[linea.articulo]) {
                lotesPorArticulo[linea.articulo] = consultaStockRepository.buscarLotesDisponibles(linea.articulo, ubicacion);
            }
            const elegido = lotesPorArticulo[linea.articulo].filter((lote) => lote.nombreLote === linea.lote)[0];
            linea.hay = elegido ? elegido.enMano : 0;
        });
        const faltantes = lineas.filter((linea) => linea.hay < linea.cantidad);
        if (faltantes.length === 0) return lotesPorArticulo;
        throw error.create({
            name     : 'AS_STOCK_INSUFICIENTE',
            message  : 'No hay stock suficiente en ' + nombreUbicacion + ': '
                     + faltantes.map((linea) => {
                         const articulo = linea.lote ? linea.articuloTexto + ' lote ' + linea.lote : linea.articuloTexto;
                         return articulo + ' (devuelve ' + linea.cantidad + ', hay ' + linea.hay + ')';
                     }).join(' | '),
            notifyOff: true,
        });
    }

    return { generarAjusteDevolucion };
});
