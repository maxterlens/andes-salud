/**
 * AS_NSP_018 — Prestamo, Devolucion y Merma
 * @description Procesa la Merma: valida el stock de la ubicacion y da de baja el
 *              material con un Inventory Adjustment negativo contra la Cuenta de
 *              Ajuste de la cabecera.
 *
 *              A diferencia del Prestamo y de la Devolucion no hay traslado, por
 *              lo tanto tampoco hay ubicacion destino ni pendiente que seguir: la
 *              merma sale del inventario y el movimiento queda Procesado de una
 *              vez.
 *
 *              El stock se valida contra la misma ubicacion de la que sale el
 *              material: por lote si la linea eligio uno, y contra el disponible
 *              del articulo si no.
 *
 * @NApiVersion 2.1
 * @NModuleScope Public
 */
define(['N/redirect', 'N/error', 'N/runtime', '../lib/MovimientoInventarioConstants', '../repositories/MovimientoInventarioRepository', '../repositories/InventoryTransferRepository', '../repositories/AS_InventoryAdjustmentRepository'],
    (redirect, error, runtime, CONSTANTES, movimientoRepository, inventoryTransferRepository, inventoryAdjustmentRepository) => {

    function generarAjusteMerma(context) {
        const idMovimiento = context.request.parameters.idMovimiento;

        const cabecera = movimientoRepository.cargarMovimiento(idMovimiento);

        validarPendienteDeProcesar(cabecera);

        const ubicacion = cabecera.getValue({ fieldId: 'custrecord_as_mov_ubicacion' });
        const lineas    = movimientoRepository.buscarLineasPorMovimiento(idMovimiento);

        const lotesPorArticulo = validarStockSuficiente(lineas, ubicacion, cabecera.getText({ fieldId: 'custrecord_as_mov_ubicacion' }));

        const usuario = runtime.getCurrentUser().id;

        const ajuste = inventoryAdjustmentRepository.crearInventoryAdjustment({
            subsidiaria: cabecera.getValue({ fieldId: 'custrecord_as_mov_subsidiaria' }),
            servicio   : cabecera.getValue({ fieldId: 'custrecord_as_mov_servicio' }),
            cuenta     : cabecera.getValue({ fieldId: 'custrecord_as_mov_cuenta_ajuste' }),
            ubicacion  : ubicacion,
            memo       : 'MERMA ' + cabecera.getValue({ fieldId: 'name' }),
        }, lineas, lotesPorArticulo);

        movimientoRepository.actualizarProcesoMovimiento(idMovimiento, {
            transfer        : ajuste.id,
            estado          : movimientoRepository.obtenerIdEstadoMovimiento(CONSTANTES.ESTADOS.PROCESADO),
            ubicacionDestino: ubicacion,
            procesadoPor    : usuario,
            fechaProceso    : new Date(),
        });

        log.audit({
            title  : CONSTANTES.LOGS.PROCESADO,
            details: armarDetalleProcesado(idMovimiento, lineas, ajuste, usuario),
        });

        redirect.toRecord({
            type: CONSTANTES.RECORDS.MOVIMIENTO,
            id  : idMovimiento,
        });
    }

    function validarPendienteDeProcesar(cabecera) {
        const estado = cabecera.getText({ fieldId: 'custrecord_as_mov_estado' });

        if (estado === CONSTANTES.ESTADOS.PENDIENTE_PROCESAR) {
            return;
        }

        throw error.create({
            name     : 'AS_MOVIMIENTO_YA_PROCESADO',
            message  : 'El movimiento ya fue procesado y esta en estado ' + estado + '. '
                     + 'No se genera un ajuste nuevo.',
            notifyOff: true,
        });
    }

    function validarStockSuficiente(lineas, ubicacion, nombreUbicacion) {
        const { faltantes, lotesPorArticulo } = obtenerFaltantes(lineas, ubicacion);

        if (faltantes.length === 0) {
            return lotesPorArticulo;
        }

        throw error.create({
            name     : 'AS_STOCK_INSUFICIENTE',
            message  : 'No hay stock suficiente en ' + nombreUbicacion + ': ' + armarDetalleFaltantes(faltantes),
            notifyOff: true,
        });
    }

    function obtenerFaltantes(lineas, ubicacion) {
        const stock = inventoryTransferRepository.buscarStockPorArticulo(
            lineas.map((linea) => linea.articulo), ubicacion);

        const lotesPorArticulo = {};

        lineas.forEach((linea) => {
            if (!linea.lote) {
                linea.hay = stock[linea.articulo].disponible;
                return;
            }

            if (!lotesPorArticulo[linea.articulo]) {
                lotesPorArticulo[linea.articulo] = inventoryTransferRepository.buscarLotesDisponibles(linea.articulo, ubicacion);
            }

            const elegido = lotesPorArticulo[linea.articulo].filter((lote) => lote.nombreLote === linea.lote)[0];

            linea.hay = elegido ? elegido.enMano : 0;
        });

        return { faltantes: lineas.filter((linea) => linea.hay < linea.cantidad), lotesPorArticulo };
    }

    function armarDetalleFaltantes(faltantes) {
        return faltantes.map((linea) => {
            const queSale = linea.lote ? linea.articuloTexto + ' lote ' + linea.lote : linea.articuloTexto;

            return queSale + ' (da de baja ' + linea.cantidad + ', hay ' + linea.hay + ')';
        }).join(' | ');
    }

    function armarDetalleProcesado(idMovimiento, lineas, ajuste, usuario) {
        return 'movimiento: ' + idMovimiento + ' | tipo: ' + CONSTANTES.TIPOS.MERMA
             + ' | articulos: ' + lineas.map((linea) => linea.articulo + ' x' + linea.cantidad).join(' | ')
             + ' | ajuste: ' + ajuste.numero + ' (id ' + ajuste.id + ')'
             + ' | usuario: ' + usuario;
    }

    return { generarAjusteMerma };
});
