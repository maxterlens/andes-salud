/**
 * AS_NSP_018 — Devolucion
 * @description Procesa la Devolucion: el reverso del prestamo. El check del
 *              registro (heredado del prestamo) decide que se genera:
 *
 *              De la Clinica  → saca de la bodega de prestamos los mismos lotes
 *                               que salieron con el prestamo, saltando lo que ya
 *                               volvio en devoluciones anteriores, y los vuelve a
 *                               su origen con un Inventory Transfer.
 *              A la Clinica   → el material sale de Andes con un Inventory
 *                               Adjustment negativo contra la cuenta del prestamo,
 *                               con el lote escrito en la linea del prestamo.
 *
 *              En los dos: no deja devolver mas de lo pendiente, descuenta lo
 *              devuelto de cada linea del prestamo, deja la devolucion Procesada y
 *              el prestamo Devuelto Total si ya no queda nada, o Devuelto Parcial.
 * @NApiVersion 2.1
 * @NModuleScope Public
 */
define(['N/redirect', 'N/runtime', 'N/error', '../constants/AS_MovimientoInventarioConstants', '../data/query/AS_MovimientoInventarioQuery', '../data/search/AS_MovimientoInventarioSearch', '../data/record/AS_SolicitudRecord', '../data/record/AS_TrasladoRecord', '../data/record/AS_AjusteRecord', '../utils/AS_MovimientoInventarioUtils'],
    (redirect, runtime, error, CONSTANTES, movimientoQuery, movimientoSearch, solicitudRecord, trasladoRecord, ajusteRecord, UTILS) => {

    // ─────────────────────────────────────────────────────────────────────────
    // Principales
    // ─────────────────────────────────────────────────────────────────────────

    function procesarDevolucion(context) {
        const devolucion = cargarDevolucion(context.request.parameters.idMovimiento);

        validarPendienteDeProcesar(devolucion);
        cargarLineas(devolucion);
        validarNoExcedePendiente(devolucion);

        const transaccion = devolucion.esALaClinica
                          ? crearAjusteDeSalida(devolucion)
                          : crearTrasladoDeVuelta(devolucion);

        descontarPendientes(devolucion);
        cerrarDevolucion(devolucion, transaccion);

        redirect.toRecord({ type: CONSTANTES.RECORDS.MOVIMIENTO, id: devolucion.id });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Secundarias
    // ─────────────────────────────────────────────────────────────────────────

    function cargarDevolucion(idMovimiento) {
        const cabecera     = solicitudRecord.cargarMovimiento(idMovimiento);
        const esALaClinica = !!cabecera.getValue({ fieldId: 'custrecord_as_mov_a_la_clinica' });

        return {
            id             : idMovimiento,
            cabecera       : cabecera,
            esALaClinica   : esALaClinica,
            estado         : cabecera.getText({ fieldId: 'custrecord_as_mov_estado' }),
            queGenera      : esALaClinica ? 'ajuste' : 'traslado',
            idPrestamo     : cabecera.getValue({ fieldId: 'custrecord_as_mov_prestamo_ref' }),
            ubicacion      : cabecera.getValue({ fieldId: 'custrecord_as_mov_ubicacion' }),
            nombreUbicacion: cabecera.getText({ fieldId: 'custrecord_as_mov_ubicacion' }),
            destino        : esALaClinica ? '' : cabecera.getValue({ fieldId: 'custrecord_as_mov_ubicacion_dest' }),
        };
    }

    function validarPendienteDeProcesar(devolucion) {
        if (devolucion.estado === CONSTANTES.ESTADOS.PENDIENTE_PROCESAR) return;

        throw error.create({
            name     : 'AS_MOVIMIENTO_YA_PROCESADO',
            message  : 'El movimiento ya fue procesado y esta en estado ' + devolucion.estado + '. No se genera un ' + devolucion.queGenera + ' nuevo.',
            notifyOff: true,
        });
    }

    /**
     * Las lineas de la devolucion y las del prestamo, y estas ultimas indexadas
     * por id para cruzar cada linea con la del prestamo que devuelve.
     */
    function cargarLineas(devolucion) {
        devolucion.lineas         = movimientoSearch.obtenerLineasMovimiento(devolucion.id);
        devolucion.lineasPrestamo = movimientoSearch.obtenerLineasMovimiento(devolucion.idPrestamo);
        devolucion.lineaPrestamo  = {};

        devolucion.lineasPrestamo.forEach((linea) => { devolucion.lineaPrestamo[linea.id] = linea; });
    }

    function validarNoExcedePendiente(devolucion) {
        const lineaPrestamo = devolucion.lineaPrestamo;
        const excedidas     = devolucion.lineas.filter((linea) => linea.cantidad > lineaPrestamo[linea.lineaPrestamo].pendiente);

        if (excedidas.length === 0) return;

        throw error.create({
            name     : 'AS_DEVOLUCION_EXCEDE_PENDIENTE',
            message  : 'No se puede devolver mas de lo pendiente: '
                     + excedidas.map((linea) => linea.articuloTexto + ' (devuelve ' + linea.cantidad
                                             + ', pendiente ' + lineaPrestamo[linea.lineaPrestamo].pendiente + ')').join(' | '),
            notifyOff: true,
        });
    }

    /**
     * A la Clinica: el material sale de Andes con un ajuste negativo contra la
     * cuenta del prestamo, con el lote escrito en la linea del prestamo.
     */
    function crearAjusteDeSalida(devolucion) {
        const cabecera = devolucion.cabecera;

        devolucion.lineas.forEach((linea) => { linea.lote = devolucion.lineaPrestamo[linea.lineaPrestamo].lote; });
        validarStock(devolucion.lineas, devolucion.ubicacion, devolucion.nombreUbicacion);

        return ajusteRecord.crearAjusteSalida({
            subsidiaria: cabecera.getValue({ fieldId: 'custrecord_as_mov_subsidiaria' }),
            servicio   : cabecera.getValue({ fieldId: 'custrecord_as_mov_servicio' }),
            memo       : 'DEVOLUCION ' + cabecera.getValue({ fieldId: 'name' }),
            cuenta     : cabecera.getValue({ fieldId: 'custrecord_as_mov_cuenta_ajuste' }),
            ubicacion  : devolucion.ubicacion,
        }, devolucion.lineas);
    }

    function validarStock(lineas, ubicacion, nombreUbicacion) {
        const faltantes = movimientoQuery.obtenerFaltantes(lineas, ubicacion);

        if (faltantes.length === 0) return;

        throw error.create({
            name     : 'AS_STOCK_INSUFICIENTE',
            message  : 'No hay stock suficiente en ' + nombreUbicacion + ': '
                     + faltantes.map((linea) => (linea.lote ? linea.articuloTexto + ' lote ' + linea.lote : linea.articuloTexto)
                                             + ' (devuelve ' + linea.cantidad + ', hay ' + linea.hay + ')').join(' | '),
            notifyOff: true,
        });
    }

    /**
     * De la Clinica: saca de la bodega de prestamos los mismos lotes que
     * salieron con el prestamo y los vuelve a su origen con un traslado.
     */
    function crearTrasladoDeVuelta(devolucion) {
        const cabecera = devolucion.cabecera;
        const prestamo = solicitudRecord.cargarMovimiento(devolucion.idPrestamo);

        asignarLotesDelPrestamo(devolucion.lineas, devolucion.lineasPrestamo, prestamo.getValue({ fieldId: 'custrecord_as_mov_transfer' }));
        validarLotesEnBodega(devolucion.lineas, devolucion.ubicacion, devolucion.nombreUbicacion);

        return trasladoRecord.crearTraslado({
            subsidiaria     : cabecera.getValue({ fieldId: 'custrecord_as_mov_subsidiaria' }),
            servicio        : cabecera.getValue({ fieldId: 'custrecord_as_mov_servicio' }),
            memo            : 'DEVOLUCION ' + cabecera.getValue({ fieldId: 'name' }),
            ubicacionOrigen : devolucion.ubicacion,
            ubicacionDestino: devolucion.destino,
        }, devolucion.lineas);
    }

    /**
     * Cada linea se lleva en linea.lotes los lotes del traslado del prestamo,
     * en el orden en que salieron, saltando lo que ya volvio en devoluciones
     * anteriores de ese articulo.
     */
    function asignarLotesDelPrestamo(lineas, lineasPrestamo, idTraslado) {
        const lotesDelPrestamo = trasladoRecord.obtenerLotesDelTraslado(idTraslado);
        const yaDevuelto       = {};

        lineasPrestamo.forEach((linea) => { yaDevuelto[linea.articulo] = (yaDevuelto[linea.articulo] || 0) + linea.devuelta; });

        lineas.forEach((linea) => {
            let porSaltar = yaDevuelto[linea.articulo] || 0;
            let porTomar  = linea.cantidad;

            linea.lotes = [];

            (lotesDelPrestamo[linea.articulo] || []).forEach((salido) => {
                const salta  = Math.min(porSaltar, salido.cantidad);
                const quedan = UTILS.redondearCantidad(salido.cantidad - salta);

                porSaltar = UTILS.redondearCantidad(porSaltar - salta);

                if (porTomar <= 0 || quedan <= 0) return;

                const toma = Math.min(porTomar, quedan);

                porTomar = UTILS.redondearCantidad(porTomar - toma);
                linea.lotes.push({ numeroInventario: salido.numeroInventario, cantidad: toma });
            });

            yaDevuelto[linea.articulo] = (yaDevuelto[linea.articulo] || 0) + linea.cantidad;
        });
    }

    /**
     * Cada lote heredado tiene que estar todavia en la bodega de prestamos. De
     * paso le pone el nombre (lote.nombre), que es lo que queda escrito en la
     * linea de la devolucion.
     */
    function validarLotesEnBodega(lineas, ubicacion, nombreUbicacion) {
        const lotesEnLaBodega = movimientoQuery.obtenerLotesPorArticulo(lineas.map((linea) => linea.articulo), ubicacion);
        const faltantes       = [];

        lineas.forEach((linea) => {
            linea.lotes.forEach((lote) => {
                const enLaBodega = lotesEnLaBodega[linea.articulo].filter((fila) => fila.numeroInventario === lote.numeroInventario)[0];
                const hay        = enLaBodega ? enLaBodega.enMano : 0;

                lote.nombre = enLaBodega ? enLaBodega.nombreLote : '';

                if (hay < lote.cantidad) {
                    faltantes.push(linea.articuloTexto + ' lote ' + (lote.nombre || lote.numeroInventario)
                                 + ' (devuelve ' + lote.cantidad + ', hay ' + hay + ')');
                }
            });
        });

        if (faltantes.length === 0) return;

        throw error.create({
            name     : 'AS_STOCK_INSUFICIENTE',
            message  : 'No hay stock suficiente en ' + nombreUbicacion + ': ' + faltantes.join(' | '),
            notifyOff: true,
        });
    }

    /**
     * Escribe en cada linea de la devolucion el lote con que salio, y descuenta
     * lo devuelto del pendiente de la linea del prestamo.
     */
    function descontarPendientes(devolucion) {
        devolucion.lineas.forEach((linea) => {
            const original = devolucion.lineaPrestamo[linea.lineaPrestamo];
            const lote     = devolucion.esALaClinica ? linea.lote : linea.lotes.map((tomado) => tomado.nombre + ' (' + tomado.cantidad + ')').join(' | ');

            if (lote) solicitudRecord.actualizarLoteLinea(linea.id, lote);

            solicitudRecord.actualizarCantidadesDevolucion(original.id,
                UTILS.redondearCantidad(original.devuelta + linea.cantidad),
                UTILS.redondearCantidad(original.pendiente - linea.cantidad));
        });
    }

    /**
     * Deja la devolucion Procesada y el prestamo Devuelto Total si ya no le
     * queda nada pendiente, o Devuelto Parcial.
     */
    function cerrarDevolucion(devolucion, transaccion) {
        const sinPendiente   = movimientoSearch.obtenerLineasMovimiento(devolucion.idPrestamo).every((linea) => linea.pendiente === 0);
        const estadoPrestamo = sinPendiente ? CONSTANTES.ESTADOS.DEVUELTO_TOTAL : CONSTANTES.ESTADOS.DEVUELTO_PARCIAL;
        const usuario        = runtime.getCurrentUser().id;

        solicitudRecord.actualizarProcesoMovimiento(devolucion.id, {
            transfer        : transaccion.id,
            estado          : movimientoSearch.obtenerIdEstado(CONSTANTES.ESTADOS.PROCESADO),
            ubicacionDestino: devolucion.destino,
            procesadoPor    : usuario,
            fechaProceso    : new Date(),
        });

        solicitudRecord.actualizarEstadoMovimiento(devolucion.idPrestamo, movimientoSearch.obtenerIdEstado(estadoPrestamo));

        log.audit({
            title  : CONSTANTES.LOGS.PROCESADO,
            details: 'movimiento: ' + devolucion.id + ' | tipo: ' + CONSTANTES.TIPOS.DEVOLUCION
                   + ' | articulos: ' + devolucion.lineas.map((linea) => linea.articulo + ' x' + linea.cantidad).join(' | ')
                   + ' | ' + devolucion.queGenera + ': ' + transaccion.numero + ' (id ' + transaccion.id + ')'
                   + ' | usuario: ' + usuario
                   + ' | prestamo ' + devolucion.idPrestamo + ' queda: ' + estadoPrestamo,
        });
    }

    return { procesarDevolucion };
});
