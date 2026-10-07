/**
 * AS_NSP_018 — Prestamo, Devolucion y Merma
 * @description El registro de la solicitud: el control de rol, guardar la
 *              cabecera y su detalle, anularla, responder el stock que consulta
 *              la pantalla y mostrar el formulario de captura.
 *
 *              Al guardar, el detalle se rehace mientras no haya transaccion
 *              generada: se borran las lineas y se vuelven a crear con lo que
 *              trae el request. Con transaccion, solo se actualiza la cabecera.
 *
 *              El sentido (De la Clinica / A la Clinica) de un movimiento ya
 *              guardado, o de la devolucion de un prestamo, sale del registro y
 *              pisa los checks del request. El de uno nuevo sale de los checks.
 *
 * @NApiVersion 2.1
 * @NModuleScope Public
 */
define(['N/redirect', 'N/error', 'N/runtime', 'N/format', '../constants/AS_MovimientoInventarioConstants', '../data/query/AS_MovimientoInventarioQuery', '../data/search/AS_MovimientoInventarioSearch', '../data/record/AS_SolicitudRecord', '../data/record/AS_CorrelativoRecord', '../form/AS_MovimientoInventarioFormMain'],
    (redirect, error, runtime, format, CONSTANTES, movimientoQuery, movimientoSearch, solicitudRecord, correlativoRecord, formMain) => {

    // ─────────────────────────────────────────────────────────────────────────
    // Principales
    // ─────────────────────────────────────────────────────────────────────────

    function validarPermisoEscritura() {
        if (CONSTANTES.ROLES_AUTORIZADOS.includes(runtime.getCurrentUser().role)) return;

        throw error.create({
            name     : 'AS_ROL_NO_AUTORIZADO',
            message  : 'Tu rol solo puede consultar los movimientos de inventario. '
                     + 'Para registrar, editar, procesar o anular uno necesitas el rol autorizado.',
            notifyOff: true,
        });
    }

    function guardarMovimiento(context) {
        const parametros = obtenerParametrosGuardado(context.request);
        const solicitud  = cargarSolicitud(parametros);

        resolverSentido(parametros, solicitud);

        const lineas = solicitud.rehaceDetalle ? obtenerLineasGuardado(context.request, solicitud.nombreTipo) : [];

        if (solicitud.rehaceDetalle) validarDetalle(lineas, solicitud.nombreTipo, parametros.aLaClinica);

        const cabecera  = solicitud.movimiento
                        ? actualizarCabecera(solicitud.movimiento, parametros, solicitud.nombreTipo, solicitud.rehaceDetalle)
                        : crearCabecera(parametros, solicitud.nombreTipo, solicitud.prestamo);
        const articulos = guardarLineas(cabecera.id, solicitud.nombreTipo, lineas);

        log.audit({
            title  : CONSTANTES.LOGS.REGISTRADO,
            details: 'movimiento: ' + cabecera.id + ' | tipo: ' + solicitud.nombreTipo
                   + ' | origen: ' + cabecera.ubicacionOrigen + ' | destino: ' + cabecera.ubicacionDestino
                   + ' | articulos: ' + (articulos.join(' | ') || 'detalle sin cambios'),
        });

        redirect.toRecord({ type: CONSTANTES.RECORDS.MOVIMIENTO, id: cabecera.id });
    }

    function anularMovimiento(context) {
        const idMovimiento = context.request.parameters.idMovimiento;

        solicitudRecord.actualizarEstadoMovimiento(idMovimiento, movimientoSearch.obtenerIdEstado(CONSTANTES.ESTADOS.ANULADO));

        redirect.toRecord({ type: CONSTANTES.RECORDS.MOVIMIENTO, id: idMovimiento });
    }

    function consultarDisponible(context) {
        const articulo  = context.request.parameters.articulo;
        const ubicacion = context.request.parameters.ubicacion;
        const stock     = movimientoQuery.obtenerStockPorArticulo([articulo], ubicacion);
        const lotes     = movimientoQuery.obtenerLotesPorArticulo([articulo], ubicacion)[articulo];

        context.response.write(JSON.stringify({
            unidad    : stock[articulo].unidad,
            disponible: stock[articulo].disponible,
            lotes     : lotes.map((lote) => ({ nombre: lote.nombreLote, enMano: lote.enMano })),
        }));
    }

    /**
     * Lee todo lo que la pantalla necesita -el movimiento que se edita, el
     * prestamo de una devolucion, las listas de los combos, las lineas y su
     * stock- y se lo pasa armado al form, que solo dibuja. Un rol de solo
     * consulta recibe un aviso en vez del formulario.
     */
    function mostrarFormulario(context) {
        if (!CONSTANTES.ROLES_AUTORIZADOS.includes(runtime.getCurrentUser().role)) {
            context.response.writePage(formMain.construirAvisoSoloConsulta());
            return;
        }

        const parametros = obtenerParametrosFormulario(context.request);
        const solicitud  = identificarSolicitud(parametros);

        context.response.writePage(formMain.construirFormulario(
            Object.assign({ parametros: parametros }, solicitud, leerListas(solicitud), leerLineas(solicitud))));
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Secundarias
    // ─────────────────────────────────────────────────────────────────────────

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

    /**
     * El movimiento que se edita (null si es nuevo), su tipo, el prestamo de una
     * devolucion nueva, y si el detalle se rehace: mientras no haya transaccion
     * generada se borran las lineas y se vuelven a crear con lo que trae el
     * request; con transaccion, solo se actualiza la cabecera.
     */
    function cargarSolicitud(parametros) {
        const movimiento = parametros.movimiento ? solicitudRecord.cargarMovimiento(parametros.movimiento) : null;
        const idTipo     = movimiento ? movimiento.getValue({ fieldId: 'custrecord_as_mov_tipo' }) : parametros.tipo;
        const tipo       = movimientoSearch.obtenerTiposMovimiento().filter((opcion) => opcion.id === idTipo)[0];
        const nombreTipo = tipo ? tipo.nombre : '';

        return {
            movimiento   : movimiento,
            nombreTipo   : nombreTipo,
            prestamo     : !movimiento && nombreTipo === CONSTANTES.TIPOS.DEVOLUCION ? solicitudRecord.cargarMovimiento(parametros.prestamo) : null,
            rehaceDetalle: !movimiento || !movimiento.getValue({ fieldId: 'custrecord_as_mov_transfer' }),
        };
    }

    /**
     * El sentido de un movimiento ya guardado, o de la devolucion de un prestamo,
     * sale del registro y pisa los checks del request. El de uno nuevo sale de
     * los checks, y en un prestamo o una devolucion tiene que ser uno solo.
     */
    function resolverSentido(parametros, solicitud) {
        const referencia = solicitud.movimiento || solicitud.prestamo;

        if (referencia) {
            parametros.aLaClinica  = !!referencia.getValue({ fieldId: 'custrecord_as_mov_a_la_clinica' });
            parametros.deLaClinica = !parametros.aLaClinica;
        }

        if ((solicitud.nombreTipo === CONSTANTES.TIPOS.PRESTAMO || solicitud.nombreTipo === CONSTANTES.TIPOS.DEVOLUCION)
            && parametros.deLaClinica === parametros.aLaClinica) {
            throw error.create({ name: 'AS_SENTIDO_INVALIDO', message: 'Marca solo uno de los sentidos: De la Clinica o A la Clinica.', notifyOff: true });
        }
    }

    /**
     * Las lineas de la sublista del request. La Devolucion trae la linea del
     * prestamo y lo que se devuelve; el Prestamo y la Merma, articulo, cantidad
     * y lote. La cantidad llega con coma decimal (cuenta es_ES), por eso
     * format.parse y no Number().
     */
    function obtenerLineasGuardado(request, nombreTipo) {
        const lineas      = [];
        const totalLineas = request.getLineCount({ group: 'custpage_sl_detalle' });

        for (let i = 0; i < totalLineas; i++) {
            if (nombreTipo === CONSTANTES.TIPOS.DEVOLUCION) {
                lineas.push({
                    lineaPrestamo: request.getSublistValue({ group: 'custpage_sl_detalle', name: 'custpage_col_linea', line: i }),
                    articulo     : request.getSublistValue({ group: 'custpage_sl_detalle', name: 'custpage_col_articulo_id', line: i }),
                    cantidad     : format.parse({
                        value: request.getSublistValue({ group: 'custpage_sl_detalle', name: 'custpage_col_a_devolver', line: i }),
                        type : format.Type.FLOAT,
                    }),
                });
                continue;
            }

            lineas.push({
                articulo: request.getSublistValue({ group: 'custpage_sl_detalle', name: 'custpage_col_articulo', line: i }),
                cantidad: format.parse({
                    value: request.getSublistValue({ group: 'custpage_sl_detalle', name: 'custpage_col_cantidad', line: i }),
                    type : format.Type.FLOAT,
                }),
                lote    : request.getSublistValue({ group: 'custpage_sl_detalle', name: 'custpage_col_lote', line: i }),
            });
        }

        return lineas;
    }

    /**
     * Sin lineas no se guarda. La Devolucion pide al menos una cantidad mayor que
     * cero; el Prestamo y la Merma, todas. El Prestamo A la Clinica, ademas, pide
     * lote en los articulos con control de lotes: el material llega de afuera y
     * no hay stock contra el cual elegirlo.
     */
    function validarDetalle(lineas, nombreTipo, aLaClinica) {
        if (lineas.length === 0) {
            throw error.create({
                name     : 'AS_MOVIMIENTO_SIN_DETALLE',
                message  : 'El movimiento no tiene lineas de detalle. Agrega al menos un articulo con el boton Add antes de guardar.',
                notifyOff: true,
            });
        }

        if (nombreTipo === CONSTANTES.TIPOS.DEVOLUCION) {
            if (lineas.some((linea) => linea.cantidad > 0)) return;

            throw error.create({
                name     : 'AS_DEVOLUCION_SIN_CANTIDAD',
                message  : 'Indica cuanto vas a devolver: al menos un articulo tiene que llevar una cantidad mayor que cero.',
                notifyOff: true,
            });
        }

        if (lineas.some((linea) => linea.cantidad <= 0)) {
            throw error.create({ name: 'AS_CANTIDAD_INVALIDA', message: 'La cantidad de cada articulo tiene que ser mayor que cero.', notifyOff: true });
        }

        if (nombreTipo !== CONSTANTES.TIPOS.PRESTAMO || !aLaClinica) return;

        const sinLote = [];

        lineas.forEach((linea, indice) => { if (!String(linea.lote || '').trim()) sinLote.push({ articulo: linea.articulo, linea: indice + 1 }); });

        if (sinLote.length === 0) return;

        const conLote   = movimientoSearch.obtenerArticulosConLote(sinLote.map((fila) => fila.articulo));
        const faltantes = sinLote.filter((fila) => conLote[String(fila.articulo)]);

        if (faltantes.length === 0) return;

        throw error.create({
            name     : 'AS_LOTE_OBLIGATORIO',
            message  : 'Indica un lote para los articulos con control de lotes en las lineas '
                     + faltantes.map((fila) => fila.linea).join(', ') + '.',
            notifyOff: true,
        });
    }

    function actualizarCabecera(movimiento, parametros, nombreTipo, rehaceDetalle) {
        solicitudRecord.actualizarDatosMovimiento(movimiento.id, {
            fecha             : parametros.fecha,
            usuarioResponsable: parametros.usuarioResponsable,
            comentarios       : parametros.comentarios,
            deLaClinica       : parametros.deLaClinica,
            aLaClinica        : parametros.aLaClinica,
        });

        if (llevaCuentaAjuste(nombreTipo, parametros.aLaClinica)) solicitudRecord.actualizarCuentaAjuste(movimiento.id, parametros.cuentaAjuste);
        if (rehaceDetalle) solicitudRecord.eliminarLineasMovimiento(movimiento.id);

        return {
            id              : movimiento.id,
            ubicacionOrigen : movimiento.getValue({ fieldId: 'custrecord_as_mov_ubicacion' }),
            ubicacionDestino: movimiento.getValue({ fieldId: 'custrecord_as_mov_ubicacion_dest' }),
        };
    }

    /**
     * La Merma y el Prestamo A la Clinica generan un ajuste, asi que llevan
     * Cuenta de Ajuste. El resto genera un traslado y no la usa.
     */
    function llevaCuentaAjuste(nombreTipo, aLaClinica) {
        return nombreTipo === CONSTANTES.TIPOS.MERMA || (nombreTipo === CONSTANTES.TIPOS.PRESTAMO && aLaClinica);
    }

    /**
     * La devolucion no toma del request subsidiaria, servicio, ubicaciones ni
     * cuenta: los hereda del prestamo. Sale de la bodega donde quedo el prestamo
     * y, De la Clinica, vuelve a su origen; A la Clinica no tiene destino y usa
     * la cuenta del prestamo para revertir el ajuste.
     */
    function crearCabecera(parametros, nombreTipo, prestamo) {
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

        const idCabecera = solicitudRecord.crearMovimiento({
            tipo               : parametros.tipo,
            correlativo        : correlativoRecord.reservarCorrelativo(parametros.tipo, nombreTipo),
            subsidiaria        : datos.subsidiaria,
            servicio           : datos.servicio,
            ubicacionOrigen    : datos.ubicacionOrigen,
            ubicacionDestino   : datos.ubicacionDestino,
            estado             : movimientoSearch.obtenerIdEstado(CONSTANTES.ESTADOS.PENDIENTE_PROCESAR),
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

        return { id: idCabecera, ubicacionOrigen: datos.ubicacionOrigen, ubicacionDestino: datos.ubicacionDestino };
    }

    /**
     * Una linea de devolucion en cero no se guarda: es un articulo del prestamo
     * que esta vez no vuelve. Devuelve "articulo xcantidad" de cada linea
     * guardada, para el log.
     */
    function guardarLineas(idCabecera, nombreTipo, lineas) {
        const articulos = [];

        lineas.forEach((linea) => {
            if (nombreTipo === CONSTANTES.TIPOS.DEVOLUCION) {
                if (linea.cantidad <= 0) return;
                solicitudRecord.crearLineaDevolucion(idCabecera, linea.articulo, linea.cantidad, linea.lineaPrestamo);
            } else {
                solicitudRecord.crearLineaDetalle(idCabecera, linea.articulo, linea.cantidad, linea.lote);
            }

            articulos.push(linea.articulo + ' x' + linea.cantidad);
        });

        return articulos;
    }

    function obtenerParametrosFormulario(request) {
        return {
            movimiento : request.parameters.movimiento,
            tipo       : request.parameters.tipo,
            sentido    : request.parameters.sentido,
            prestamo   : request.parameters.prestamo,
            fecha      : decodeURIComponent(request.parameters.fecha || ''),
            responsable: request.parameters.responsable || '',
            comentarios: decodeURIComponent(request.parameters.comentarios || ''),
        };
    }

    /**
     * Que solicitud se muestra: el movimiento que se edita o el tipo elegido, el
     * prestamo de una devolucion y el sentido. El sentido de un movimiento ya
     * guardado, o de la devolucion de un prestamo, sale del registro; el de uno
     * nuevo, del parametro que manda el CS al recargar.
     */
    function identificarSolicitud(parametros) {
        const movimiento   = parametros.movimiento ? solicitudRecord.cargarMovimiento(parametros.movimiento) : null;
        const idTipo       = movimiento ? movimiento.getValue({ fieldId: 'custrecord_as_mov_tipo' }) : parametros.tipo;
        const idPrestamo   = movimiento ? movimiento.getValue({ fieldId: 'custrecord_as_mov_prestamo_ref' }) : parametros.prestamo;
        const tipos        = movimientoSearch.obtenerTiposMovimiento();
        const tipoElegido  = tipos.filter((opcion) => opcion.id === idTipo)[0];
        const nombreTipo   = tipoElegido ? tipoElegido.nombre : '';
        const esPrestamo   = nombreTipo === CONSTANTES.TIPOS.PRESTAMO;
        const esDevolucion = nombreTipo === CONSTANTES.TIPOS.DEVOLUCION;
        const prestamo     = esDevolucion && idPrestamo ? solicitudRecord.cargarMovimiento(idPrestamo) : null;
        const referencia   = movimiento || prestamo;

        return {
            movimiento  : movimiento,
            idTipo      : idTipo,
            tipos       : tipos,
            nombreTipo  : nombreTipo,
            esPrestamo  : esPrestamo,
            esDevolucion: esDevolucion,
            esMerma     : nombreTipo === CONSTANTES.TIPOS.MERMA,
            prestamo    : prestamo,
            idPrestamo  : idPrestamo,
            esALaClinica: (esPrestamo || esDevolucion)
                       && (referencia ? !!referencia.getValue({ fieldId: 'custrecord_as_mov_a_la_clinica' })
                                      : parametros.sentido === CONSTANTES.SENTIDOS.A_LA_CLINICA),
        };
    }

    /**
     * Las opciones de los combos. Cada lista se lee solo si el tipo la usa.
     */
    function leerListas(solicitud) {
        return {
            prestamosPendientes: solicitud.esDevolucion ? movimientoQuery.obtenerPrestamosPendientes(solicitud.esALaClinica) : [],
            cuentasAjuste      : llevaCuentaAjuste(solicitud.nombreTipo, solicitud.esALaClinica)
                               ? movimientoQuery.obtenerCuentasAjuste(solicitud.idTipo, solicitud.esMerma) : [],
            motivosBaja        : solicitud.esMerma ? movimientoSearch.obtenerMotivosBaja() : [],
            ubicaciones        : movimientoQuery.obtenerUbicacionesPorSubsidiaria(),
            entidades          : movimientoQuery.obtenerEntidadesPorSubsidiaria(),
        };
    }

    /**
     * Las lineas que se precargan: las del prestamo de una devolucion, las de la
     * devolucion que se edita, y las de un prestamo o una merma que se editan con
     * su stock y sus lotes en el origen. El A la Clinica no mira stock: el
     * material todavia no esta en Andes.
     */
    function leerLineas(solicitud) {
        const movimiento   = solicitud.movimiento;
        const lineasSalida = movimiento && !solicitud.esDevolucion ? movimientoSearch.obtenerLineasMovimiento(movimiento.id) : [];
        const leeStock     = lineasSalida.length > 0 && !solicitud.esALaClinica;
        const origen       = movimiento ? movimiento.getValue({ fieldId: 'custrecord_as_mov_ubicacion' }) : '';
        const articulos    = lineasSalida.map((linea) => linea.articulo);

        return {
            lineasPrestamo  : solicitud.prestamo ? movimientoSearch.obtenerLineasMovimiento(solicitud.idPrestamo) : [],
            lineasDevolucion: solicitud.esDevolucion && movimiento ? movimientoSearch.obtenerLineasMovimiento(movimiento.id) : [],
            lineasSalida    : lineasSalida,
            stockSalida     : leeStock ? movimientoQuery.obtenerStockPorArticulo(articulos, origen) : {},
            lotesSalida     : leeStock ? movimientoQuery.obtenerLotesPorArticulo(articulos, origen) : {},
        };
    }

    return {
        validarPermisoEscritura: validarPermisoEscritura,
        guardarMovimiento      : guardarMovimiento,
        anularMovimiento       : anularMovimiento,
        consultarDisponible    : consultarDisponible,
        mostrarFormulario      : mostrarFormulario,
    };
});
