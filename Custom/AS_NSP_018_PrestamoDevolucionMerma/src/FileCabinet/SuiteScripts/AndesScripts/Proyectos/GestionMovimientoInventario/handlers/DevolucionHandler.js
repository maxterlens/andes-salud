/**
 * AS_NSP_018 — Prestamo, Devolucion y Merma
 * @NApiVersion 2.1
 * @NModuleScope Public
 */
define(['N/redirect', 'N/error', 'N/runtime', '../lib/MovimientoInventarioConstants', '../repositories/MovimientoInventarioRepository', '../repositories/InventoryTransferRepository'],
    (redirect, error, runtime, CONSTANTES, movimientoRepository, inventoryTransferRepository) => {

    function generarTransferDevolucion(context) {
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

        const idPrestamo = cabecera.getValue({ fieldId: 'custrecord_as_mov_prestamo_ref' });

        const subsidiaria      = cabecera.getValue({ fieldId: 'custrecord_as_mov_subsidiaria' });
        const ubicacionOrigen  = cabecera.getValue({ fieldId: 'custrecord_as_mov_ubicacion' });
        const nombreOrigen     = cabecera.getText({ fieldId: 'custrecord_as_mov_ubicacion' });
        const ubicacionRetorno = cabecera.getValue({ fieldId: 'custrecord_as_mov_ubicacion_dest' });

        const lineas = movimientoRepository.buscarLineasPorMovimiento(idMovimiento);

        const lineasPrestamo = movimientoRepository.buscarLineasPorMovimiento(idPrestamo);

        const pendientePorLinea = {};

        lineasPrestamo.forEach((linea) => {
            pendientePorLinea[linea.id] = linea;
        });

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

        const prestamo = movimientoRepository.cargarMovimiento(idPrestamo);

        const lotesDelPrestamo = inventoryTransferRepository.buscarLotesDelTraslado(
            prestamo.getValue({ fieldId: 'custrecord_as_mov_transfer' }));

        const yaDevuelto = {};

        lineasPrestamo.forEach((linea) => {
            yaDevuelto[linea.articulo] = (yaDevuelto[linea.articulo] || 0) + linea.devuelta;
        });

        lineas.forEach((linea) => {
            linea.lotes = tomarLotesDelPrestamo(lotesDelPrestamo[linea.articulo] || [],
                                                yaDevuelto[linea.articulo] || 0,
                                                linea.cantidad);

            yaDevuelto[linea.articulo] = (yaDevuelto[linea.articulo] || 0) + linea.cantidad;
        });

        const lotesEnLaBodega = {};

        lineas.forEach((linea) => {
            if (!lotesEnLaBodega[linea.articulo]) {
                lotesEnLaBodega[linea.articulo] = inventoryTransferRepository.buscarLotesDisponibles(linea.articulo, ubicacionOrigen);
            }
        });

        const faltantes = [];

        lineas.forEach((linea) => {
            linea.lotes.forEach((lote) => {
                const enLaBodega = lotesEnLaBodega[linea.articulo].filter((fila) => fila.numeroInventario === lote.numeroInventario)[0];

                const hay = enLaBodega ? enLaBodega.enMano : 0;
                lote.nombre = enLaBodega ? enLaBodega.nombreLote : '';

                if (hay < lote.cantidad) {
                    faltantes.push(linea.articuloTexto + ' lote ' + (enLaBodega ? enLaBodega.nombreLote : lote.numeroInventario)
                                 + ' (devuelve ' + lote.cantidad + ', hay ' + hay + ')');
                }
            });
        });

        if (faltantes.length > 0) {
            throw error.create({
                name     : 'AS_STOCK_INSUFICIENTE',
                message  : 'No hay stock suficiente en ' + nombreOrigen + ': ' + faltantes.join(' | '),
                notifyOff: true,
            });
        }

        const usuario = runtime.getCurrentUser().id;

        const transfer = inventoryTransferRepository.crearInventoryTransfer({
            subsidiaria     : subsidiaria,
            servicio        : cabecera.getValue({ fieldId: 'custrecord_as_mov_servicio' }),
            ubicacionOrigen : ubicacionOrigen,
            ubicacionDestino: ubicacionRetorno,
            memo            : 'DEVOLUCION ' + cabecera.getValue({ fieldId: 'name' }),
        }, lineas);

        lineas.forEach((linea) => {
            const nombres = linea.lotes.map((lote) => lote.nombre + ' (' + lote.cantidad + ')');

            if (nombres.length) {
                movimientoRepository.actualizarLoteLinea(linea.id, nombres.join(' | '));
            }
        });

        lineas.forEach((linea) => {
            const original = pendientePorLinea[linea.lineaPrestamo];

            const devuelta  = original.devuelta + linea.cantidad;
            const pendiente = original.pendiente - linea.cantidad;

            movimientoRepository.actualizarCantidadesDevolucion(original.id, devuelta, pendiente);
        });

        const lineasActualizadas = movimientoRepository.buscarLineasPorMovimiento(idPrestamo);

        let nombreEstadoPrestamo = CONSTANTES.ESTADOS.DEVUELTO_PARCIAL;

        if (lineasActualizadas.every((linea) => linea.pendiente === 0)) {
            nombreEstadoPrestamo = CONSTANTES.ESTADOS.DEVUELTO_TOTAL;
        }

        const idEstadoProcesado = movimientoRepository.obtenerIdEstadoMovimiento(CONSTANTES.ESTADOS.PROCESADO);
        const idEstadoPrestamo  = movimientoRepository.obtenerIdEstadoMovimiento(nombreEstadoPrestamo);

        movimientoRepository.actualizarProcesoMovimiento(idMovimiento, {
            transfer        : transfer.id,
            estado          : idEstadoProcesado,
            ubicacionDestino: ubicacionRetorno,
            procesadoPor    : usuario,
            fechaProceso    : new Date(),
        });

        movimientoRepository.actualizarEstadoMovimiento(idPrestamo, idEstadoPrestamo);

        log.audit({
            title  : CONSTANTES.LOGS.PROCESADO,
            details: 'movimiento: ' + idMovimiento + ' | tipo: ' + CONSTANTES.TIPOS.DEVOLUCION
                   + ' | articulos: ' + lineas.map((linea) => linea.articulo + ' x' + linea.cantidad).join(' | ')
                   + ' | traslado: ' + transfer.numero + ' (id ' + transfer.id + ')'
                   + ' | usuario: ' + usuario
                   + ' | prestamo ' + idPrestamo + ' queda: ' + nombreEstadoPrestamo,
        });

        redirect.toRecord({
            type: CONSTANTES.RECORDS.MOVIMIENTO,
            id  : idMovimiento,
        });
    }

    function tomarLotesDelPrestamo(salidos, saltar, cantidad) {
        const tomados = [];

        let porSaltar = saltar;
        let porTomar  = cantidad;

        salidos.forEach((lote) => {
            if (porTomar <= 0) {
                return;
            }

            let quedan = lote.cantidad;

            if (porSaltar > 0) {
                const salta = Math.min(porSaltar, quedan);

                porSaltar -= salta;
                quedan    -= salta;
            }

            if (quedan <= 0) {
                return;
            }

            const toma = Math.min(porTomar, quedan);

            porTomar -= toma;

            tomados.push({
                numeroInventario: lote.numeroInventario,
                cantidad        : toma,
            });
        });

        return tomados;
    }

    return { generarTransferDevolucion };
});
