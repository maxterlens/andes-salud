/**
 * AS_NSP_018 — Prestamo
 * @description Procesa el Prestamo. El check del registro decide que se genera:
 *
 *              De la Clinica  → el material sale de Andes: valida el stock del
 *                               origen y lo mueve a la bodega de prestamos con un
 *                               Inventory Transfer.
 *              A la Clinica   → el material llega de afuera: entra a la bodega con
 *                               un Inventory Adjustment positivo contra la Cuenta
 *                               de Ajuste de la cabecera.
 *
 *              En los dos el movimiento queda Pendiente de Devolucion.
 *
 * @NApiVersion 2.1
 * @NModuleScope Public
 */
define(['N/redirect', 'N/runtime', 'N/error', '../constants/AS_MovimientoInventarioConstants', '../data/query/AS_MovimientoInventarioQuery', '../data/search/AS_MovimientoInventarioSearch', '../data/record/AS_SolicitudRecord', '../data/record/AS_TrasladoRecord', '../data/record/AS_AjusteRecord'],
    (redirect, runtime, error, CONSTANTES, movimientoQuery, movimientoSearch, solicitudRecord, trasladoRecord, ajusteRecord) => {

    // ─────────────────────────────────────────────────────────────────────────
    // Principales
    // ─────────────────────────────────────────────────────────────────────────

    function procesarPrestamo(context) {
        const prestamo = cargarPrestamo(context.request.parameters.idMovimiento);

        validarPendienteDeProcesar(prestamo);

        prestamo.lineas = movimientoSearch.obtenerLineasMovimiento(prestamo.id);

        const transaccion = prestamo.esALaClinica
                          ? crearAjusteDeEntrada(prestamo)
                          : crearTrasladoABodega(prestamo);

        marcarPendienteDeDevolucion(prestamo, transaccion);

        redirect.toRecord({ type: CONSTANTES.RECORDS.MOVIMIENTO, id: prestamo.id });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Secundarias
    // ─────────────────────────────────────────────────────────────────────────

    function cargarPrestamo(idMovimiento) {
        const cabecera     = solicitudRecord.cargarMovimiento(idMovimiento);
        const esALaClinica = !!cabecera.getValue({ fieldId: 'custrecord_as_mov_a_la_clinica' });

        return {
            id          : idMovimiento,
            cabecera    : cabecera,
            esALaClinica: esALaClinica,
            estado      : cabecera.getText({ fieldId: 'custrecord_as_mov_estado' }),
            queGenera   : esALaClinica ? 'ajuste' : 'traslado',
            destino     : cabecera.getValue({ fieldId: 'custrecord_as_mov_ubicacion_dest' }),
        };
    }

    function validarPendienteDeProcesar(prestamo) {
        if (prestamo.estado === CONSTANTES.ESTADOS.PENDIENTE_PROCESAR) return;

        throw error.create({
            name     : 'AS_MOVIMIENTO_YA_PROCESADO',
            message  : 'El movimiento ya fue procesado y esta en estado ' + prestamo.estado + '. No se genera un ' + prestamo.queGenera + ' nuevo.',
            notifyOff: true,
        });
    }

    /**
     * A la Clinica: el material llega de afuera. Entra a la bodega de prestamos
     * con un ajuste positivo contra la Cuenta de Ajuste; no hay stock que validar.
     */
    function crearAjusteDeEntrada(prestamo) {
        const cabecera = prestamo.cabecera;

        return ajusteRecord.crearAjusteEntrada({
            subsidiaria: cabecera.getValue({ fieldId: 'custrecord_as_mov_subsidiaria' }),
            servicio   : cabecera.getValue({ fieldId: 'custrecord_as_mov_servicio' }),
            memo       : 'PRESTAMO ' + cabecera.getValue({ fieldId: 'name' }),
            cuenta     : cabecera.getValue({ fieldId: 'custrecord_as_mov_cuenta_ajuste' }),
            ubicacion  : prestamo.destino,
        }, prestamo.lineas);
    }

    /**
     * De la Clinica: el material sale de Andes. Valida el stock del origen y lo
     * mueve a la bodega de prestamos con un traslado.
     */
    function crearTrasladoABodega(prestamo) {
        const cabecera = prestamo.cabecera;
        const origen   = cabecera.getValue({ fieldId: 'custrecord_as_mov_ubicacion' });

        validarStock(prestamo.lineas, origen, cabecera.getText({ fieldId: 'custrecord_as_mov_ubicacion' }));

        return trasladoRecord.crearTraslado({
            subsidiaria     : cabecera.getValue({ fieldId: 'custrecord_as_mov_subsidiaria' }),
            servicio        : cabecera.getValue({ fieldId: 'custrecord_as_mov_servicio' }),
            memo            : 'PRESTAMO ' + cabecera.getValue({ fieldId: 'name' }),
            ubicacionOrigen : origen,
            ubicacionDestino: prestamo.destino,
        }, prestamo.lineas);
    }

    function validarStock(lineas, ubicacion, nombreUbicacion) {
        const faltantes = movimientoQuery.obtenerFaltantes(lineas, ubicacion);

        if (faltantes.length === 0) return;

        throw error.create({
            name     : 'AS_STOCK_INSUFICIENTE',
            message  : 'No hay stock suficiente en ' + nombreUbicacion + ': '
                     + faltantes.map((linea) => (linea.lote ? linea.articuloTexto + ' lote ' + linea.lote : linea.articuloTexto)
                                             + ' (presta ' + linea.cantidad + ', hay ' + linea.hay + ')').join(' | '),
            notifyOff: true,
        });
    }

    function marcarPendienteDeDevolucion(prestamo, transaccion) {
        const usuario = runtime.getCurrentUser().id;

        solicitudRecord.actualizarProcesoMovimiento(prestamo.id, {
            transfer        : transaccion.id,
            estado          : movimientoSearch.obtenerIdEstado(CONSTANTES.ESTADOS.PENDIENTE_DEVOLUCION),
            ubicacionDestino: prestamo.destino,
            procesadoPor    : usuario,
            fechaProceso    : new Date(),
        });

        log.audit({
            title  : CONSTANTES.LOGS.PROCESADO,
            details: 'movimiento: ' + prestamo.id + ' | tipo: ' + CONSTANTES.TIPOS.PRESTAMO
                   + ' | articulos: ' + prestamo.lineas.map((linea) => linea.articulo + ' x' + linea.cantidad).join(' | ')
                   + ' | ' + prestamo.queGenera + ': ' + transaccion.numero + ' (id ' + transaccion.id + ')'
                   + ' | usuario: ' + usuario,
        });
    }

    return { procesarPrestamo };
});
