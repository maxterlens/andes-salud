/**
 * AS_NSP_018 — Prestamo, Devolucion y Merma
 * @description Flujo de la devolucion: genera el Inventory Transfer inverso,
 *              desde la bodega de prestamos hacia la ubicacion de origen del
 *              prestamo, descuenta lo devuelto de las lineas del prestamo y lo
 *              deja en Devuelto Parcial o Devuelto Total. Cada devolucion genera
 *              su propio traslado, asi que admite devoluciones por partes.
 *
 * @NApiVersion 2.1
 * @NModuleScope Public
 */
define(['N/redirect', 'N/error', 'N/runtime', '../lib/MovimientoInventarioConstants', '../repositories/MovimientoInventarioRepository', '../repositories/InventoryTransferRepository'],
    (redirect, error, runtime, CONSTANTES, movimientoRepository, inventoryTransferRepository) => {

    function generarTransferDevolucion(context) {
        const idMovimiento = context.request.parameters.idMovimiento;

        const cabecera = movimientoRepository.cargarMovimiento(idMovimiento);

        // El estado es la unica marca de que el traslado ya se genero. Sin este
        // corte, dos clics en el boton -o un F5 sobre la URL del proceso- creaban
        // dos Inventory Transfer: el inventario se movia dos veces y el segundo
        // pisaba el sello de quien proceso y cuando.
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

        // Las dos ubicaciones son las que quedaron guardadas en la devolucion: el
        // formulario las propone invertidas respecto del prestamo, pero el usuario
        // las puede cambiar y manda lo que eligio.
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

        // El material tiene que volver con el mismo lote que salio: la devolucion
        // no elige. Se leen los lotes del traslado que genero el prestamo y se
        // consumen en el mismo orden, salteando lo que ya volvio en devoluciones
        // anteriores. El prestamo si elige, con su criterio de la bodega.
        const prestamo = movimientoRepository.cargarMovimiento(idPrestamo);

        const lotesDelPrestamo = inventoryTransferRepository.buscarLotesDelTraslado(
            prestamo.getValue({ fieldId: 'custrecord_as_mov_transfer' }));

        // Lo ya devuelto se cuenta por articulo y no por linea: los lotes del
        // prestamo salieron en una sola lista por articulo, asi que si el
        // prestamo repite un articulo en dos lineas, las dos consumen de ahi.
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

        // El stock se valida lote por lote y no por articulo: la bodega guarda a
        // la vez el material de todos los prestamos abiertos, asi que puede
        // sobrar del articulo y faltar justo del lote que esta devolucion tiene
        // que devolver. Se mira lo que hay fisicamente y no lo disponible, porque
        // la bodega de prestamos no publica disponibilidad: su material esta
        // fuera de la clinica y no debe contar como stock usable hasta que vuelva.
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

                // El plan trae el id interno del lote; el nombre sale de la
                // bodega y es lo que despues se sella en la linea y se muestra.
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

        // Cada linea de la devolucion sabe contra que linea del prestamo va, asi
        // que se descuenta una a una. Cuadrar por articulo descontaba de mas cuando
        // el prestamo repetia el mismo articulo en dos lineas.
        // Con que lote volvio cada linea. Se guarda despues de generar el traslado,
        // que es cuando ya es un hecho. Una linea puede volver partida en dos
        // lotes si el prestamo la cubrio con dos.
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

        // Total solo cuando no queda ninguna linea con pendiente: la suma total
        // puede dar cero compensando lineas y no significa lo mismo.
        let nombreEstadoPrestamo = CONSTANTES.ESTADOS.DEVUELTO_PARCIAL;

        if (lineasActualizadas.every((linea) => linea.pendiente === 0)) {
            nombreEstadoPrestamo = CONSTANTES.ESTADOS.DEVUELTO_TOTAL;
        }

        const idEstadoProcesado = movimientoRepository.obtenerIdEstadoMovimiento(CONSTANTES.ESTADOS.PROCESADO);
        const idEstadoPrestamo  = movimientoRepository.obtenerIdEstadoMovimiento(nombreEstadoPrestamo);

        // El sello de proceso va en la devolucion, no en el prestamo: el prestamo
        // conserva el suyo, el del dia que salio el material.
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

    // Recorre los lotes que salieron en el prestamo, saltea las unidades que ya
    // volvieron en devoluciones anteriores y toma las siguientes. Un lote se
    // puede partir entre dos devoluciones: si salieron 5 del lote A y ya
    // volvieron 2, esta devolucion arranca en la tercera unidad de A.
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
