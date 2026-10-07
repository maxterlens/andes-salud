/**
 * AS_NSP_018 — Prestamo, Devolucion y Merma
 * @NApiVersion 2.1
 * @NModuleScope Public
 */
define(['N/redirect', 'N/error', 'N/runtime', 'N/format', '../lib/AS_MovimientoInventarioConstants', '../repositories/AS_MovimientoInventarioRepository', '../repositories/AS_MovimientoInventarioCorrelativoRepository', '../repositories/AS_ConsultaStockRepository'],
    (redirect, error, runtime, format, CONSTANTES, movimientoRepository, correlativoRepository, consultaStockRepository) => {

    function validarPermisoEscritura() {
        if (CONSTANTES.ROLES_AUTORIZADOS.includes(runtime.getCurrentUser().role)) {
            return;
        }

        throw error.create({
            name     : 'AS_ROL_NO_AUTORIZADO',
            message  : 'Tu rol solo puede consultar los movimientos de inventario. '
                     + 'Para registrar, editar, procesar o anular uno necesitas el rol autorizado.',
            notifyOff: true,
        });
    }

    function guardarMovimiento(context) {
        const request           = context.request;
        const parametros        = obtenerParametrosGuardado(request);
        const movimiento        = parametros.movimiento ? movimientoRepository.cargarMovimiento(parametros.movimiento) : null;
        const nombreTipo        = obtenerNombreTipo(movimiento ? movimiento.getValue({ fieldId: 'custrecord_as_mov_tipo' }) : parametros.tipo);
        const esDevolucionNueva = !movimiento && nombreTipo === CONSTANTES.TIPOS.DEVOLUCION;
        const prestamo          = esDevolucionNueva ? movimientoRepository.cargarMovimiento(parametros.prestamo) : null;

        resolverSentido(parametros, nombreTipo, movimiento || prestamo);

        const rehaceDetalle = !movimiento || !movimiento.getValue({ fieldId: 'custrecord_as_mov_transfer' });
        const totalLineas   = request.getLineCount({ group: 'custpage_sl_detalle' });

        if (rehaceDetalle) validarDetalle(request, parametros, nombreTipo, totalLineas);

        const cabecera = movimiento
                       ? actualizarCabecera(movimiento, parametros, nombreTipo, rehaceDetalle)
                       : crearCabecera(parametros, prestamo);

        const articulos = rehaceDetalle ? guardarLineas(request, cabecera.id, nombreTipo, totalLineas) : [];

        log.audit({
            title  : CONSTANTES.LOGS.REGISTRADO,
            details: 'movimiento: ' + cabecera.id + ' | tipo: ' + nombreTipo
                   + ' | origen: ' + cabecera.ubicacionOrigen + ' | destino: ' + cabecera.ubicacionDestino
                   + ' | articulos: ' + (articulos.join(' | ') || 'detalle sin cambios'),
        });

        redirect.toRecord({
            type: CONSTANTES.RECORDS.MOVIMIENTO,
            id  : cabecera.id,
        });
    }

    function obtenerParametrosGuardado(request) {
        return {
            movimiento        : request.parameters.custpage_movimiento,
            tipo              : request.parameters.custpage_tipo,
            fecha             : request.parameters.custpage_fecha,
            subsidiaria       : request.parameters.custpage_subsidiaria,
            servicio          : request.parameters.custpage_servicio,
            ubicacionOrigen   : request.parameters.custpage_ubicacion,
            ubicacionDestino  : request.parameters.custpage_ubicacion_dest,
            usuarioResponsable: request.parameters.custpage_usuario_resp,
            motivo            : request.parameters.custpage_motivo,
            cuentaAjuste      : request.parameters.custpage_cuenta_ajuste,
            prestamo          : request.parameters.custpage_prestamo_ref,
            entidadReceptora  : request.parameters.custpage_entidad_receptora,
            comentarios       : request.parameters.custpage_comentarios,
            deLaClinica       : request.parameters.custpage_de_la_clinica === 'T',
            aLaClinica        : request.parameters.custpage_a_la_clinica === 'T',
        };
    }

    function obtenerNombreTipo(idTipo) {
        const tipoElegido = movimientoRepository.listarTiposMovimiento().filter((opcion) => opcion.id === idTipo)[0];

        return tipoElegido ? tipoElegido.nombre : '';
    }

    /**
     * El sentido de un movimiento ya guardado, o de la devolucion de un prestamo,
     * manda el registro y pisa los checks del request: no se edita ni se elige
     * distinto al del prestamo. El de un prestamo nuevo sale de los checks.
     */
    function resolverSentido(parametros, nombreTipo, referencia) {
        if (referencia) {
            parametros.aLaClinica  = !!referencia.getValue({ fieldId: 'custrecord_as_mov_a_la_clinica' });
            parametros.deLaClinica = !parametros.aLaClinica;
        }

        if (nombreTipo !== CONSTANTES.TIPOS.PRESTAMO && nombreTipo !== CONSTANTES.TIPOS.DEVOLUCION) return;
        if (parametros.deLaClinica !== parametros.aLaClinica) return;

        throw error.create({
            name     : 'AS_SENTIDO_INVALIDO',
            message  : 'Marca solo uno de los sentidos: De la Clinica o A la Clinica.',
            notifyOff: true,
        });
    }

    function validarDetalle(request, parametros, nombreTipo, totalLineas) {
        if (totalLineas < 1) {
            throw error.create({
                name     : 'AS_MOVIMIENTO_SIN_DETALLE',
                message  : 'El movimiento no tiene lineas de detalle. Agrega al menos un articulo con el boton Add antes de guardar.',
                notifyOff: true,
            });
        }

        if (nombreTipo === CONSTANTES.TIPOS.DEVOLUCION) {
            validarCantidadesDevolucion(request, totalLineas);
            return;
        }

        validarCantidadesSalida(request, totalLineas);

        if (nombreTipo === CONSTANTES.TIPOS.PRESTAMO && parametros.aLaClinica) {
            validarLotesPrestamoALaClinica(request, totalLineas);
        }
    }

    function validarCantidadesDevolucion(request, totalLineas) {
        let lineasConCantidad = 0;

        for (let i = 0; i < totalLineas; i++) {
            if (format.parse({ value: request.getSublistValue({ group: 'custpage_sl_detalle', name: 'custpage_col_a_devolver', line: i }), type: format.Type.FLOAT }) > 0) {
                lineasConCantidad++;
            }
        }

        if (lineasConCantidad > 0) return;

        throw error.create({
            name     : 'AS_DEVOLUCION_SIN_CANTIDAD',
            message  : 'Indica cuanto vas a devolver: al menos un articulo tiene que llevar una cantidad mayor que cero.',
            notifyOff: true,
        });
    }

    function validarCantidadesSalida(request, totalLineas) {
        for (let i = 0; i < totalLineas; i++) {
            if (format.parse({ value: request.getSublistValue({ group: 'custpage_sl_detalle', name: 'custpage_col_cantidad', line: i }), type: format.Type.FLOAT }) <= 0) {
                throw error.create({
                    name     : 'AS_CANTIDAD_INVALIDA',
                    message  : 'La cantidad de cada articulo tiene que ser mayor que cero.',
                    notifyOff: true,
                });
            }
        }
    }

    function validarLotesPrestamoALaClinica(request, totalLineas) {
        const sinLote = [];

        for (let i = 0; i < totalLineas; i++) {
            const lote = request.getSublistValue({ group: 'custpage_sl_detalle', name: 'custpage_col_lote', line: i });
            if (String(lote || '').trim()) continue;

            sinLote.push({
                articulo: request.getSublistValue({ group: 'custpage_sl_detalle', name: 'custpage_col_articulo', line: i }),
                linea   : i + 1,
            });
        }

        if (sinLote.length === 0) return;
        const articulosConLote = consultaStockRepository.buscarArticulosConLote(sinLote.map((fila) => fila.articulo));
        const faltantes = sinLote.filter((fila) => articulosConLote[String(fila.articulo)]);
        if (faltantes.length === 0) return;

        throw error.create({
            name     : 'AS_LOTE_OBLIGATORIO',
            message  : 'Indica un lote para los articulos con control de lotes en las lineas '
                     + faltantes.map((fila) => fila.linea).join(', ') + '.',
            notifyOff: true,
        });
    }

    function actualizarCabecera(movimiento, parametros, nombreTipo, rehaceDetalle) {
        movimientoRepository.actualizarDatosMovimiento(movimiento.id, {
            fecha             : parametros.fecha,
            usuarioResponsable: parametros.usuarioResponsable,
            comentarios       : parametros.comentarios,
            deLaClinica       : parametros.deLaClinica,
            aLaClinica        : parametros.aLaClinica,
        });

        if (nombreTipo === CONSTANTES.TIPOS.MERMA
            || (nombreTipo === CONSTANTES.TIPOS.PRESTAMO && parametros.aLaClinica)) {
            movimientoRepository.actualizarCuentaAjuste(movimiento.id, parametros.cuentaAjuste);
        }

        if (rehaceDetalle) movimientoRepository.eliminarLineasMovimiento(movimiento.id);

        return {
            id              : movimiento.id,
            ubicacionOrigen : movimiento.getValue({ fieldId: 'custrecord_as_mov_ubicacion' }),
            ubicacionDestino: movimiento.getValue({ fieldId: 'custrecord_as_mov_ubicacion_dest' }),
        };
    }

    /**
     * La devolucion no toma del request subsidiaria, servicio, ubicaciones ni
     * cuenta: los hereda del prestamo. Sale de la bodega donde quedo el prestamo
     * y, De la Clinica, vuelve a su origen; A la Clinica no tiene destino y usa
     * la cuenta del prestamo para revertir el ajuste.
     */
    function crearCabecera(parametros, prestamo) {
        const datos = {
            subsidiaria     : parametros.subsidiaria,
            servicio        : parametros.servicio,
            ubicacionOrigen : parametros.ubicacionOrigen,
            ubicacionDestino: parametros.ubicacionDestino,
            cuentaAjuste    : parametros.cuentaAjuste,
        };

        if (prestamo) {
            datos.subsidiaria      = prestamo.getValue({ fieldId: 'custrecord_as_mov_subsidiaria' });
            datos.servicio         = prestamo.getValue({ fieldId: 'custrecord_as_mov_servicio' });
            datos.ubicacionOrigen  = prestamo.getValue({ fieldId: 'custrecord_as_mov_ubicacion_dest' });
            datos.ubicacionDestino = parametros.aLaClinica ? '' : prestamo.getValue({ fieldId: 'custrecord_as_mov_ubicacion' });
            if (parametros.aLaClinica) datos.cuentaAjuste = prestamo.getValue({ fieldId: 'custrecord_as_mov_cuenta_ajuste' });
        }

        const correlativo = correlativoRepository.obtenerSiguienteCorrelativo(parametros.tipo);
        const idCabecera  = movimientoRepository.crearMovimiento({
            tipo               : parametros.tipo,
            correlativo        : correlativo,
            subsidiaria        : datos.subsidiaria,
            servicio           : datos.servicio,
            ubicacionOrigen    : datos.ubicacionOrigen,
            ubicacionDestino   : datos.ubicacionDestino,
            estado             : movimientoRepository.obtenerIdEstadoMovimiento(CONSTANTES.ESTADOS.PENDIENTE_PROCESAR),
            usuarioResponsable : parametros.usuarioResponsable,
            motivo             : parametros.motivo,
            cuentaAjuste       : datos.cuentaAjuste,
            prestamoRelacionado: parametros.prestamo,
            entidadReceptora   : parametros.entidadReceptora,
            comentarios        : parametros.comentarios,
            fecha              : parametros.fecha,
            deLaClinica        : parametros.deLaClinica,
            aLaClinica         : parametros.aLaClinica,
        });

        return {
            id              : idCabecera,
            ubicacionOrigen : datos.ubicacionOrigen,
            ubicacionDestino: datos.ubicacionDestino,
        };
    }

    function guardarLineas(request, idCabecera, nombreTipo, totalLineas) {
        const articulos = [];

        for (let i = 0; i < totalLineas; i++) {
            const guardada = (nombreTipo === CONSTANTES.TIPOS.DEVOLUCION)
                           ? guardarLineaDevolucion(request, idCabecera, i)
                           : guardarLineaSalida(request, idCabecera, i);

            if (guardada) articulos.push(guardada.articulo + ' x' + guardada.cantidad);
        }

        return articulos;
    }

    function guardarLineaDevolucion(request, idCabecera, linea) {
        const idLineaPrestamo = request.getSublistValue({
            group: 'custpage_sl_detalle',
            name : 'custpage_col_linea',
            line : linea,
        });
        const articulo = request.getSublistValue({
            group: 'custpage_sl_detalle',
            name : 'custpage_col_articulo_id',
            line : linea,
        });
        const cantidad = format.parse({
            value: request.getSublistValue({
                group: 'custpage_sl_detalle',
                name : 'custpage_col_a_devolver',
                line : linea,
            }),
            type : format.Type.FLOAT,
        });

        if (cantidad <= 0) {
            return null;
        }

        movimientoRepository.crearLineaDevolucion(idCabecera, articulo, cantidad, idLineaPrestamo);

        return { articulo: articulo, cantidad: cantidad };
    }

    function guardarLineaSalida(request, idCabecera, linea) {
        const articulo = request.getSublistValue({
            group: 'custpage_sl_detalle',
            name : 'custpage_col_articulo',
            line : linea,
        });
        const cantidad = format.parse({
            value: request.getSublistValue({
                group: 'custpage_sl_detalle',
                name : 'custpage_col_cantidad',
                line : linea,
            }),
            type : format.Type.FLOAT,
        });
        const lote = request.getSublistValue({
            group: 'custpage_sl_detalle',
            name : 'custpage_col_lote',
            line : linea,
        });

        movimientoRepository.crearLineaDetalle(idCabecera, articulo, cantidad, lote);

        return { articulo: articulo, cantidad: cantidad };
    }

    function anularMovimientoInventario(context) {
        const idMovimiento = context.request.parameters.idMovimiento;

        movimientoRepository.actualizarEstadoMovimiento(idMovimiento, movimientoRepository.obtenerIdEstadoMovimiento(CONSTANTES.ESTADOS.ANULADO));

        redirect.toRecord({
            type: CONSTANTES.RECORDS.MOVIMIENTO,
            id  : idMovimiento,
        });
    }

    function consultarDisponible(context) {
        const articulo  = context.request.parameters.articulo;
        const ubicacion = context.request.parameters.ubicacion;

        const stock = consultaStockRepository.buscarStockPorArticulo([articulo], ubicacion);
        const lotes = consultaStockRepository.buscarLotesDisponibles(articulo, ubicacion);

        context.response.write(JSON.stringify({
            unidad    : stock[articulo].unidad,
            disponible: stock[articulo].disponible,
            lotes     : lotes.map((lote) => ({ nombre: lote.nombreLote, enMano: lote.enMano })),
        }));
    }

    return {
        validarPermisoEscritura   : validarPermisoEscritura,
        guardarMovimiento         : guardarMovimiento,
        anularMovimientoInventario: anularMovimientoInventario,
        consultarDisponible       : consultarDisponible,
    };
});
