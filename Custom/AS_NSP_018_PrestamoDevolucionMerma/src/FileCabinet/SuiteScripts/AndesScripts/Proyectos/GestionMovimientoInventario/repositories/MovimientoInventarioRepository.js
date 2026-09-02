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

    function cargarMovimiento(idMovimiento) {
        return record.load({
            type: CONSTANTES.RECORDS.MOVIMIENTO,
            id  : idMovimiento,
        });
    }

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
        cabecera.setValue({ fieldId: 'custrecord_as_mov_entidad_receptora', value: datos.entidadReceptora });
        cabecera.setValue({ fieldId: 'custrecord_as_mov_comentarios',    value: datos.comentarios });

        cabecera.setText({ fieldId: 'custrecord_as_mov_fecha',            text: datos.fecha });
        cabecera.setText({ fieldId: 'custrecord_as_mov_fecha_devolucion', text: datos.fechaDevolucion });

        return cabecera.save();
    }

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

    function eliminarLineasMovimiento(idMovimiento) {
        buscarLineasPorMovimiento(idMovimiento).forEach((linea) => {
            record.delete({
                type: CONSTANTES.RECORDS.DETALLE,
                id  : linea.id,
            });
        });
    }

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

    function listarEntidadesPorSubsidiaria() {
        const filas = query.runSuiteQL({
            query: [
                'SELECT r.custrecord_as_recep_subsidiaria AS subsidiaria,',
                '       r.custrecord_as_recep_entidad AS id,',
                '       BUILTIN.DF(r.custrecord_as_recep_entidad) AS nombre',
                'FROM customrecord_as_receptor_subsidiaria r',
                'WHERE r.isinactive = ?',
                'ORDER BY BUILTIN.DF(r.custrecord_as_recep_entidad)',
            ].join(' '),
            params: ['F'],
        }).asMappedResults();

        return filas.map((fila) => ({
            subsidiaria: String(fila.subsidiaria),
            id         : String(fila.id),
            nombre     : fila.nombre,
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
        listarEntidadesPorSubsidiaria  : listarEntidadesPorSubsidiaria,
        listarPrestamosPendientes      : listarPrestamosPendientes,
    };
});
