/**
 * AS_NSP_018 — Merma
 * @description Procesa la Merma: valida el stock de la ubicacion y da de baja el
 *              material con un Inventory Adjustment negativo contra la Cuenta de
 *              Ajuste de la cabecera.
 *
 *              No tiene check de sentido ni ubicacion destino: la merma sale del
 *              inventario y el movimiento queda Procesado de una vez.
 *
 * @NApiVersion 2.1
 * @NModuleScope Public
 */
define(['N/redirect', 'N/runtime', 'N/error', '../constants/AS_MovimientoInventarioConstants', '../data/query/AS_MovimientoInventarioQuery', '../data/search/AS_MovimientoInventarioSearch', '../data/record/AS_SolicitudRecord', '../data/record/AS_AjusteRecord'],
    (redirect, runtime, error, CONSTANTES, movimientoQuery, movimientoSearch, solicitudRecord, ajusteRecord) => {

    // ─────────────────────────────────────────────────────────────────────────
    // Principales
    // ─────────────────────────────────────────────────────────────────────────

    function procesarMerma(context) {
        const merma = cargarMerma(context.request.parameters.idMovimiento);

        validarPendienteDeProcesar(merma);

        merma.lineas = movimientoSearch.obtenerLineasMovimiento(merma.id);

        validarStock(merma.lineas, merma.ubicacion, merma.cabecera.getText({ fieldId: 'custrecord_as_mov_ubicacion' }));

        const ajuste = crearAjusteDeSalida(merma);

        marcarProcesada(merma, ajuste);

        redirect.toRecord({ type: CONSTANTES.RECORDS.MOVIMIENTO, id: merma.id });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Secundarias
    // ─────────────────────────────────────────────────────────────────────────

    function cargarMerma(idMovimiento) {
        const cabecera = solicitudRecord.cargarMovimiento(idMovimiento);

        return {
            id       : idMovimiento,
            cabecera : cabecera,
            estado   : cabecera.getText({ fieldId: 'custrecord_as_mov_estado' }),
            ubicacion: cabecera.getValue({ fieldId: 'custrecord_as_mov_ubicacion' }),
        };
    }

    function validarPendienteDeProcesar(merma) {
        if (merma.estado === CONSTANTES.ESTADOS.PENDIENTE_PROCESAR) return;

        throw error.create({
            name     : 'AS_MOVIMIENTO_YA_PROCESADO',
            message  : 'El movimiento ya fue procesado y esta en estado ' + merma.estado + '. No se genera un ajuste nuevo.',
            notifyOff: true,
        });
    }

    function validarStock(lineas, ubicacion, nombreUbicacion) {
        const faltantes = movimientoQuery.obtenerFaltantes(lineas, ubicacion);

        if (faltantes.length === 0) return;

        throw error.create({
            name     : 'AS_STOCK_INSUFICIENTE',
            message  : 'No hay stock suficiente en ' + nombreUbicacion + ': '
                     + faltantes.map((linea) => (linea.lote ? linea.articuloTexto + ' lote ' + linea.lote : linea.articuloTexto)
                                             + ' (da de baja ' + linea.cantidad + ', hay ' + linea.hay + ')').join(' | '),
            notifyOff: true,
        });
    }

    function crearAjusteDeSalida(merma) {
        const cabecera = merma.cabecera;

        return ajusteRecord.crearAjusteSalida({
            subsidiaria: cabecera.getValue({ fieldId: 'custrecord_as_mov_subsidiaria' }),
            servicio   : cabecera.getValue({ fieldId: 'custrecord_as_mov_servicio' }),
            cuenta     : cabecera.getValue({ fieldId: 'custrecord_as_mov_cuenta_ajuste' }),
            ubicacion  : merma.ubicacion,
            memo       : 'MERMA ' + cabecera.getValue({ fieldId: 'name' }),
        }, merma.lineas);
    }

    function marcarProcesada(merma, ajuste) {
        const usuario = runtime.getCurrentUser().id;

        solicitudRecord.actualizarProcesoMovimiento(merma.id, {
            transfer        : ajuste.id,
            estado          : movimientoSearch.obtenerIdEstado(CONSTANTES.ESTADOS.PROCESADO),
            ubicacionDestino: merma.ubicacion,
            procesadoPor    : usuario,
            fechaProceso    : new Date(),
        });

        log.audit({
            title  : CONSTANTES.LOGS.PROCESADO,
            details: 'movimiento: ' + merma.id + ' | tipo: ' + CONSTANTES.TIPOS.MERMA
                   + ' | articulos: ' + merma.lineas.map((linea) => linea.articulo + ' x' + linea.cantidad).join(' | ')
                   + ' | ajuste: ' + ajuste.numero + ' (id ' + ajuste.id + ')'
                   + ' | usuario: ' + usuario,
        });
    }

    return { procesarMerma };
});
