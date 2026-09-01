/**
 * AS_NSP_018 — Prestamo, Devolucion y Merma
 * @description Libreria de acceso a los datos propios del modulo: la cabecera
 *              del movimiento, sus lineas de detalle y las customlists del
 *              proyecto. Unico punto que usa N/record y N/search sobre estos
 *              custom records.
 *
 *              CABECERA  cargarMovimiento, crearMovimiento,
 *                        actualizarDatosMovimiento, actualizarEstadoMovimiento,
 *                        actualizarProcesoMovimiento
 *              DETALLE   crearLineaDetalle, crearLineaDevolucion,
 *                        buscarLineasPorMovimiento, actualizarCantidadesDevolucion,
 *                        eliminarLineasMovimiento
 *              LISTAS    obtenerIdEstadoMovimiento, listarTiposMovimiento,
 *                        listarMotivosBaja, listarUbicacionesPorSubsidiaria
 *
 * @NApiVersion 2.1
 * @NModuleScope Public
 */
define(['N/record', 'N/search', 'N/query', '../lib/MovimientoInventarioConstants'],
    (record, search, query, CONSTANTES) => {

    // ------------------------------------------------------------------
    // CABECERA  customrecord_as_movimiento_inventario
    // ------------------------------------------------------------------

    function cargarMovimiento(idMovimiento) {
        return record.load({
            type: CONSTANTES.RECORDS.MOVIMIENTO,
            id  : idMovimiento,
        });
    }

    // Solo el estado, con lookupFields: la vista de una devolucion necesita
    // saber como quedo su prestamo y cargar el record entero para un campo es
    // caro de mas.
    function obtenerEstadoMovimiento(idMovimiento) {
        const campos = search.lookupFields({
            type   : CONSTANTES.RECORDS.MOVIMIENTO,
            id     : idMovimiento,
            columns: ['custrecord_as_mov_estado'],
        });

        return campos.custrecord_as_mov_estado[0].text;
    }

    function crearMovimiento(datos) {
        const cabecera = record.create({
            type     : CONSTANTES.RECORDS.MOVIMIENTO,
            isDynamic: false,
        });

        cabecera.setValue({ fieldId: 'custrecord_as_mov_tipo',           value: datos.tipo });
        cabecera.setValue({ fieldId: 'custrecord_as_mov_subsidiaria',    value: datos.subsidiaria });
        cabecera.setValue({ fieldId: 'custrecord_as_mov_servicio',       value: datos.servicio });
        cabecera.setValue({ fieldId: 'custrecord_as_mov_ubicacion',      value: datos.ubicacionOrigen });
        cabecera.setValue({ fieldId: 'custrecord_as_mov_ubicacion_dest', value: datos.ubicacionDestino });
        cabecera.setValue({ fieldId: 'custrecord_as_mov_estado',         value: datos.estado });
        cabecera.setValue({ fieldId: 'custrecord_as_mov_usuario_resp',   value: datos.usuarioResponsable });
        cabecera.setValue({ fieldId: 'custrecord_as_mov_motivo',         value: datos.motivo });
        cabecera.setValue({ fieldId: 'custrecord_as_mov_prestamo_ref',   value: datos.prestamoRelacionado });
        cabecera.setValue({ fieldId: 'custrecord_as_mov_comentarios',    value: datos.comentarios });


        // Las fechas llegan como texto DD/MM/YYYY desde el request: setText las
        // convierte segun el formato del usuario, setValue esperaria un Date.
        cabecera.setText({ fieldId: 'custrecord_as_mov_fecha',            text: datos.fecha });
        cabecera.setText({ fieldId: 'custrecord_as_mov_fecha_devolucion', text: datos.fechaDevolucion });

        return cabecera.save();
    }

    // Los tres unicos datos que la pantalla de edicion deja corregir. Va por
    // submitFields como el resto del modulo: es XEDIT y no dispara el bloqueo de
    // edicion del User Event.
    function actualizarDatosMovimiento(idMovimiento, datos) {
        record.submitFields({
            type  : CONSTANTES.RECORDS.MOVIMIENTO,
            id    : idMovimiento,
            values: {
                custrecord_as_mov_fecha       : datos.fecha,
                custrecord_as_mov_usuario_resp: datos.usuarioResponsable,
                custrecord_as_mov_comentarios : datos.comentarios,
            },
        });
    }

    function actualizarEstadoMovimiento(idMovimiento, idEstado) {
        record.submitFields({
            type  : CONSTANTES.RECORDS.MOVIMIENTO,
            id    : idMovimiento,
            values: { custrecord_as_mov_estado: idEstado },
        });
    }

    // Cierra el proceso de un movimiento: deja el traslado que genero, el estado
    // en que queda y quien lo proceso y cuando. Del traslado se guarda el id
    // interno, no el numero: el campo es de tipo Transaction y NetSuite lo pinta
    // como enlace. Quien procesa no es necesariamente el responsable del
    // movimiento: ese se captura al registrarlo y no se toca aqui.
    function actualizarProcesoMovimiento(idMovimiento, datos) {
        record.submitFields({
            type  : CONSTANTES.RECORDS.MOVIMIENTO,
            id    : idMovimiento,
            values: {
                custrecord_as_mov_transfer      : datos.transfer,
                custrecord_as_mov_estado        : datos.estado,
                custrecord_as_mov_ubicacion_dest: datos.ubicacionDestino,
                custrecord_as_mov_procesado_por : datos.procesadoPor,
                custrecord_as_mov_fecha_proceso : datos.fechaProceso,
            },
        });
    }

    // ------------------------------------------------------------------
    // DETALLE  customrecord_as_mov_inventario_det
    // ------------------------------------------------------------------

    // isDynamic true para que NetSuite dispare el sourcing de la Unidad desde el
    // articulo: en modo estatico el campo queda vacio.
    //
    // Lo pendiente de devolucion nace igual a lo prestado: el traslado mueve todo
    // lo de la linea, asi que desde el primer momento esa cantidad esta en la
    // bodega de prestamos esperando volver.
    function crearLineaDetalle(idCabecera, articulo, cantidad, lote) {
        const detalle = record.create({
            type     : CONSTANTES.RECORDS.DETALLE,
            isDynamic: true,
        });

        detalle.setValue({ fieldId: 'custrecord_as_mov_det_ref',      value: idCabecera });
        detalle.setValue({ fieldId: 'custrecord_as_mov_det_articulo', value: articulo });
        detalle.setValue({ fieldId: 'custrecord_as_mov_det_lote',     value: lote });
        detalle.setValue({ fieldId: 'custrecord_as_mov_det_cantidad', value: cantidad });
        detalle.setValue({ fieldId: 'custrecord_as_mov_det_cant_devuelta',  value: 0 });
        detalle.setValue({ fieldId: 'custrecord_as_mov_det_cant_pendiente', value: cantidad });

        return detalle.save();
    }

    // Linea de una Devolucion: guarda contra que linea del prestamo descuenta,
    // para no tener que cuadrar despues por articulo.
    function crearLineaDevolucion(idCabecera, articulo, cantidad, idLineaPrestamo) {
        const detalle = record.create({
            type     : CONSTANTES.RECORDS.DETALLE,
            isDynamic: true,
        });

        detalle.setValue({ fieldId: 'custrecord_as_mov_det_ref',       value: idCabecera });
        detalle.setValue({ fieldId: 'custrecord_as_mov_det_articulo',  value: articulo });
        detalle.setValue({ fieldId: 'custrecord_as_mov_det_cantidad',  value: cantidad });
        detalle.setValue({ fieldId: 'custrecord_as_mov_det_linea_ref', value: idLineaPrestamo });

        return detalle.save();
    }

    function buscarLineasPorMovimiento(idMovimiento) {
        const lineas = [];

        search.create({
            type   : CONSTANTES.RECORDS.DETALLE,
            filters: [['custrecord_as_mov_det_ref', 'anyof', idMovimiento]],
            columns: [
                'custrecord_as_mov_det_articulo',
                'custrecord_as_mov_det_unidad',
                'custrecord_as_mov_det_lote',
                'custrecord_as_mov_det_cantidad',
                'custrecord_as_mov_det_cant_devuelta',
                'custrecord_as_mov_det_cant_pendiente',
                'custrecord_as_mov_det_linea_ref',
            ],
        }).run().each((resultado) => {
            lineas.push({
                id           : resultado.id,
                articulo     : resultado.getValue('custrecord_as_mov_det_articulo'),
                articuloTexto: resultado.getText('custrecord_as_mov_det_articulo'),
                unidadTexto  : resultado.getText('custrecord_as_mov_det_unidad'),
                lote         : resultado.getValue('custrecord_as_mov_det_lote'),
                cantidad     : Number(resultado.getValue('custrecord_as_mov_det_cantidad')),
                devuelta     : Number(resultado.getValue('custrecord_as_mov_det_cant_devuelta')),
                pendiente    : Number(resultado.getValue('custrecord_as_mov_det_cant_pendiente')),
                lineaPrestamo: resultado.getValue('custrecord_as_mov_det_linea_ref'),
            });

            return true;
        });

        return lineas;
    }

    // El detalle de un movimiento pendiente se rehace entero al editarlo: hasta
    // que no se procesa el traslado nada descuenta contra esas lineas, asi que
    // borrarlas y volver a crearlas no deja nada colgando.
    function eliminarLineasMovimiento(idMovimiento) {
        buscarLineasPorMovimiento(idMovimiento).forEach((linea) => {
            record.delete({
                type: CONSTANTES.RECORDS.DETALLE,
                id  : linea.id,
            });
        });
    }

    // El lote de una linea de devolucion no se captura: se decide al procesar,
    // leyendo el traslado del prestamo. Se sella aqui para que quede en el
    // registro y se pueda ver sin abrir el Inventory Transfer.
    function actualizarLoteLinea(idLinea, lote) {
        record.submitFields({
            type  : CONSTANTES.RECORDS.DETALLE,
            id    : idLinea,
            values: { custrecord_as_mov_det_lote: lote },
        });
    }

    function actualizarCantidadesDevolucion(idLinea, devuelta, pendiente) {
        record.submitFields({
            type  : CONSTANTES.RECORDS.DETALLE,
            id    : idLinea,
            values: {
                custrecord_as_mov_det_cant_devuelta : devuelta,
                custrecord_as_mov_det_cant_pendiente: pendiente,
            },
        });
    }

    // ------------------------------------------------------------------
    // LISTAS  customlist del proyecto
    // ------------------------------------------------------------------

    function obtenerIdEstadoMovimiento(nombre) {
        return search.create({
            type   : CONSTANTES.LISTAS.ESTADO_MOVIMIENTO,
            filters: [['name', 'is', nombre]],
        }).run().getRange({ start: 0, end: 1 })[0].id;
    }

    function listarTiposMovimiento() {
        return buscarOpcionesCustomList(CONSTANTES.LISTAS.TIPO_MOVIMIENTO);
    }

    function listarMotivosBaja() {
        return buscarOpcionesCustomList(CONSTANTES.LISTAS.MOTIVO_BAJA);
    }

    function buscarOpcionesCustomList(lista) {
        const opciones = [];

        search.create({
            type   : lista,
            columns: ['name'],
        }).run().each((resultado) => {
            opciones.push({ id: resultado.id, nombre: resultado.getValue('name') });
            return true;
        });

        return opciones;
    }

    // Una ubicacion puede estar mapeada a mas de una subsidiaria: la consulta
    // devuelve una fila por combinacion y el client script filtra por la que
    // el usuario elige en el formulario.
    function listarUbicacionesPorSubsidiaria() {
        const filas = query.runSuiteQL({
            query: [
                'SELECT lsm.subsidiary AS subsidiaria, l.id AS id, l.name AS nombre,',
                '       l.custrecord_as_es_bodega_prestamo AS esbodegaprestamo',
                'FROM location l',
                'INNER JOIN LocationSubsidiaryMap lsm ON lsm.location = l.id',
                'WHERE l.isinactive = ?',
                'ORDER BY l.name',
            ].join(' '),
            params: ['F'],
        }).asMappedResults();

        return filas.map((fila) => ({
            subsidiaria     : String(fila.subsidiaria),
            id              : String(fila.id),
            nombre          : fila.nombre,
            esBodegaPrestamo: (fila.esbodegaprestamo === 'T'),
        }));
    }

    // Los prestamos que todavia esperan devolucion, con lo que falta por devolver
    // sumado de sus lineas. Se une contra las customlist por nombre para no
    // depender de los ids internos de cada cuenta. Viajan todos al cliente y el
    // client script deja los de la subsidiaria elegida, igual que las ubicaciones.
    function listarPrestamosPendientes() {
        const filas = query.runSuiteQL({
            query: [
                'SELECT m.id AS id,',
                '       m.name AS nombre,',
                '       m.custrecord_as_mov_subsidiaria AS subsidiaria,',
                '       l.name AS ubicacion,',
                '       SUM(d.custrecord_as_mov_det_cant_pendiente) AS pendiente',
                'FROM customrecord_as_movimiento_inventario m',
                'INNER JOIN customlist_as_tipo_movimiento t ON t.id = m.custrecord_as_mov_tipo',
                'INNER JOIN customlist_as_estado_movimiento e ON e.id = m.custrecord_as_mov_estado',
                'INNER JOIN customrecord_as_mov_inventario_det d ON d.custrecord_as_mov_det_ref = m.id',
                'LEFT JOIN location l ON l.id = m.custrecord_as_mov_ubicacion',
                'WHERE t.name = ?',
                '  AND e.name IN (?, ?)',
                'GROUP BY m.id, m.name, m.custrecord_as_mov_subsidiaria, l.name',
                'HAVING SUM(d.custrecord_as_mov_det_cant_pendiente) > 0',
                'ORDER BY m.name',
            ].join(' '),
            params: [CONSTANTES.TIPOS.PRESTAMO, CONSTANTES.ESTADOS.PENDIENTE_DEVOLUCION, CONSTANTES.ESTADOS.DEVUELTO_PARCIAL],
        }).asMappedResults();

        return filas.map((fila) => ({
            id         : String(fila.id),
            nombre     : fila.nombre,
            subsidiaria: String(fila.subsidiaria),
            ubicacion  : fila.ubicacion,
            pendiente  : Number(fila.pendiente),
        }));
    }

    return {
        cargarMovimiento               : cargarMovimiento,
        obtenerEstadoMovimiento        : obtenerEstadoMovimiento,
        crearMovimiento                : crearMovimiento,
        actualizarDatosMovimiento      : actualizarDatosMovimiento,
        actualizarEstadoMovimiento     : actualizarEstadoMovimiento,
        actualizarProcesoMovimiento    : actualizarProcesoMovimiento,
        crearLineaDetalle              : crearLineaDetalle,
        crearLineaDevolucion           : crearLineaDevolucion,
        buscarLineasPorMovimiento      : buscarLineasPorMovimiento,
        actualizarLoteLinea            : actualizarLoteLinea,
        actualizarCantidadesDevolucion : actualizarCantidadesDevolucion,
        eliminarLineasMovimiento       : eliminarLineasMovimiento,
        obtenerIdEstadoMovimiento      : obtenerIdEstadoMovimiento,
        listarTiposMovimiento          : listarTiposMovimiento,
        listarMotivosBaja              : listarMotivosBaja,
        listarUbicacionesPorSubsidiaria: listarUbicacionesPorSubsidiaria,
        listarPrestamosPendientes      : listarPrestamosPendientes,
    };
});
