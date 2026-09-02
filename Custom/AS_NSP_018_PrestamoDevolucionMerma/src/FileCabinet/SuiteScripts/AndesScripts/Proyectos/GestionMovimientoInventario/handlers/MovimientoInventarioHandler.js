/**
 * AS_NSP_018 — Prestamo, Devolucion y Merma
 * @NApiVersion 2.1
 * @NModuleScope Public
 */
define(['N/redirect', 'N/error', 'N/runtime', '../lib/MovimientoInventarioConstants', '../repositories/MovimientoInventarioRepository', '../repositories/InventoryTransferRepository'],
    (redirect, error, runtime, CONSTANTES, movimientoRepository, inventoryTransferRepository) => {

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
            prestamo          : request.parameters.custpage_prestamo_ref,
            entidadReceptora  : request.parameters.custpage_entidad_receptora,
            comentarios       : request.parameters.custpage_comentarios,
        };
    }

    function guardarMovimiento(context) {
        const request = context.request;

        const parametros = obtenerParametrosGuardado(request);

        const idMovimiento = parametros.movimiento;

        let movimiento = null;
        let idTipo     = parametros.tipo;

        if (idMovimiento) {
            movimiento = movimientoRepository.cargarMovimiento(idMovimiento);
            idTipo     = movimiento.getValue({ fieldId: 'custrecord_as_mov_tipo' });
        }

        const tipos = movimientoRepository.listarTiposMovimiento();

        const tipoElegido = tipos.filter((opcion) => opcion.id === idTipo)[0];
        const nombreTipo  = tipoElegido ? tipoElegido.nombre : '';
        const rehaceDetalle = !idMovimiento || !movimiento.getValue({ fieldId: 'custrecord_as_mov_transfer' });

        const totalLineas = request.getLineCount({ group: 'custpage_sl_detalle' });

        if (rehaceDetalle) {

            if (totalLineas < 1) {
                throw error.create({
                    name     : 'AS_MOVIMIENTO_SIN_DETALLE',
                    message  : 'El movimiento no tiene lineas de detalle. Agrega al menos un articulo con el boton Add antes de guardar.',
                    notifyOff: true,
                });
            }

            if (nombreTipo !== CONSTANTES.TIPOS.DEVOLUCION) {
                for (let i = 0; i < totalLineas; i++) {
                    if (Number(request.getSublistValue({ group: 'custpage_sl_detalle', name: 'custpage_col_cantidad', line: i })) <= 0) {
                        throw error.create({
                            name     : 'AS_CANTIDAD_INVALIDA',
                            message  : 'La cantidad de cada articulo tiene que ser mayor que cero.',
                            notifyOff: true,
                        });
                    }
                }
            }

            if (nombreTipo === CONSTANTES.TIPOS.DEVOLUCION) {
                let lineasConCantidad = 0;

                for (let i = 0; i < totalLineas; i++) {
                    if (Number(request.getSublistValue({ group: 'custpage_sl_detalle', name: 'custpage_col_a_devolver', line: i })) > 0) {
                        lineasConCantidad++;
                    }
                }

                if (lineasConCantidad < 1) {
                    throw error.create({
                        name     : 'AS_DEVOLUCION_SIN_CANTIDAD',
                        message  : 'Indica cuanto vas a devolver: al menos un articulo tiene que llevar una cantidad mayor que cero.',
                        notifyOff: true,
                    });
                }
            }
        }

        let idCabecera       = idMovimiento;
        let ubicacionOrigen  = parametros.ubicacionOrigen;
        let ubicacionDestino = parametros.ubicacionDestino;

        if (idMovimiento) {
            ubicacionOrigen  = movimiento.getValue({ fieldId: 'custrecord_as_mov_ubicacion' });
            ubicacionDestino = movimiento.getValue({ fieldId: 'custrecord_as_mov_ubicacion_dest' });

            movimientoRepository.actualizarDatosMovimiento(idMovimiento, {
                fecha             : parametros.fecha,
                usuarioResponsable: parametros.usuarioResponsable,
                comentarios       : parametros.comentarios,
            });

            if (rehaceDetalle) {
                movimientoRepository.eliminarLineasMovimiento(idMovimiento);
            }
        } else {
            let subsidiaria = parametros.subsidiaria;
            let servicio    = parametros.servicio;

            if (nombreTipo === CONSTANTES.TIPOS.DEVOLUCION) {
                const prestamo = movimientoRepository.cargarMovimiento(parametros.prestamo);

                subsidiaria      = prestamo.getValue({ fieldId: 'custrecord_as_mov_subsidiaria' });
                servicio         = prestamo.getValue({ fieldId: 'custrecord_as_mov_servicio' });
                ubicacionOrigen  = prestamo.getValue({ fieldId: 'custrecord_as_mov_ubicacion_dest' });
                ubicacionDestino = prestamo.getValue({ fieldId: 'custrecord_as_mov_ubicacion' });
            }

            idCabecera = movimientoRepository.crearMovimiento({
                tipo               : parametros.tipo,
                subsidiaria        : subsidiaria,
                servicio           : servicio,
                ubicacionOrigen    : ubicacionOrigen,
                ubicacionDestino   : ubicacionDestino,
                estado             : movimientoRepository.obtenerIdEstadoMovimiento(CONSTANTES.ESTADOS.PENDIENTE_PROCESAR),
                usuarioResponsable : parametros.usuarioResponsable,
                motivo             : parametros.motivo,
                prestamoRelacionado: parametros.prestamo,
                entidadReceptora   : parametros.entidadReceptora,
                comentarios        : parametros.comentarios,
                fecha              : parametros.fecha,
            });
        }

        const articulos = [];

        if (rehaceDetalle) {
            for (let i = 0; i < totalLineas; i++) {
                const guardada = (nombreTipo === CONSTANTES.TIPOS.DEVOLUCION)
                               ? guardarLineaDevolucion(request, idCabecera, i)
                               : guardarLineaSalida(request, idCabecera, i);

                if (guardada) {
                    articulos.push(guardada.articulo + ' x' + guardada.cantidad);
                }
            }
        }

        log.audit({
            title  : CONSTANTES.LOGS.REGISTRADO,
            details: 'movimiento: ' + idCabecera + ' | tipo: ' + nombreTipo
                   + ' | origen: ' + ubicacionOrigen + ' | destino: ' + ubicacionDestino
                   + ' | articulos: ' + (articulos.join(' | ') || 'detalle sin cambios'),
        });

        redirect.toRecord({
            type: CONSTANTES.RECORDS.MOVIMIENTO,
            id  : idCabecera,
        });
    }

    function guardarLineaSalida(request, idCabecera, linea) {
        const articulo = request.getSublistValue({
            group: 'custpage_sl_detalle',
            name : 'custpage_col_articulo',
            line : linea,
        });
        const cantidad = request.getSublistValue({
            group: 'custpage_sl_detalle',
            name : 'custpage_col_cantidad',
            line : linea,
        });
        const lote = request.getSublistValue({
            group: 'custpage_sl_detalle',
            name : 'custpage_col_lote',
            line : linea,
        });

        movimientoRepository.crearLineaDetalle(idCabecera, articulo, cantidad, lote);

        return { articulo: articulo, cantidad: cantidad };
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
        const cantidad = Number(request.getSublistValue({
            group: 'custpage_sl_detalle',
            name : 'custpage_col_a_devolver',
            line : linea,
        }));

        if (cantidad <= 0) {
            return null;
        }

        movimientoRepository.crearLineaDevolucion(idCabecera, articulo, cantidad, idLineaPrestamo);

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

        const stock = inventoryTransferRepository.buscarStockPorArticulo([articulo], ubicacion);
        const lotes = inventoryTransferRepository.buscarLotesDisponibles(articulo, ubicacion);

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
