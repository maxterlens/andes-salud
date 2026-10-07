/**
 * AS_NSP_018 — Prestamo, Devolucion y Merma
 * @description Todas las busquedas con N/search del modulo, incluido
 *              lookupFields.
 *
 *              SOLICITUD    obtenerLineasMovimiento, obtenerEstadoMovimiento, obtenerIdEstado
 *              LISTAS       obtenerTiposMovimiento, obtenerMotivosBaja
 *              ARTICULOS    obtenerArticulosConLote
 *              INVENTARIO   obtenerNumeroTransaccion
 *
 * @NApiVersion 2.1
 * @NModuleScope Public
 */
define(['N/search', '../../constants/AS_MovimientoInventarioConstants'],
    (search, CONSTANTES) => {

    // ─────────────────────────────────────────────────────────────────────────
    // Principales
    // ─────────────────────────────────────────────────────────────────────────

    function obtenerLineasMovimiento(idMovimiento) {
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

    function obtenerEstadoMovimiento(idMovimiento) {
        return search.lookupFields({
            type   : CONSTANTES.RECORDS.MOVIMIENTO,
            id     : idMovimiento,
            columns: ['custrecord_as_mov_estado'],
        }).custrecord_as_mov_estado[0].text;
    }

    function obtenerIdEstado(nombre) {
        return search.create({
            type   : CONSTANTES.LISTAS.ESTADO_MOVIMIENTO,
            filters: [['name', 'is', nombre]],
        }).run().getRange({ start: 0, end: 1 })[0].id;
    }

    function obtenerTiposMovimiento() {
        return obtenerOpcionesCustomList(CONSTANTES.LISTAS.TIPO_MOVIMIENTO);
    }

    function obtenerMotivosBaja() {
        return obtenerOpcionesCustomList(CONSTANTES.LISTAS.MOTIVO_BAJA);
    }

    function obtenerArticulosConLote(articulos) {
        if (articulos.length === 0) return {};

        const conLote = {};

        search.create({
            type   : search.Type.ITEM,
            filters: [['internalid', 'anyof', articulos], 'and', ['islotitem', 'is', 'T']],
            columns: ['internalid'],
        }).run().each((resultado) => {
            conLote[String(resultado.id)] = true;
            return true;
        });

        return conLote;
    }

    function obtenerNumeroTransaccion(tipo, idTransaccion) {
        return search.lookupFields({ type: tipo, id: idTransaccion, columns: ['tranid'] }).tranid;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Secundarias
    // ─────────────────────────────────────────────────────────────────────────

    function obtenerOpcionesCustomList(lista) {
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

    return {
        obtenerLineasMovimiento : obtenerLineasMovimiento,
        obtenerEstadoMovimiento : obtenerEstadoMovimiento,
        obtenerIdEstado         : obtenerIdEstado,
        obtenerTiposMovimiento  : obtenerTiposMovimiento,
        obtenerMotivosBaja      : obtenerMotivosBaja,
        obtenerArticulosConLote : obtenerArticulosConLote,
        obtenerNumeroTransaccion: obtenerNumeroTransaccion,
    };
});
