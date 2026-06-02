/**
 * @module ASControlCargaRepository
 * @description Acceso a datos del record AS Control de Carga.
 *              Provee búsqueda del registro Pendiente, resolución de IDs de estados
 *              y actualización de estado/detalle.
 */
define([
    'N/search',
    'N/record',
    '../commons/constants'
], function (search, record, C) {

    /**
     * Resuelve el internal ID de un valor del customlist_as_estado_procesamiento
     * a partir de su nombre de texto. El resultado se cachea en memoria para
     * evitar búsquedas repetidas dentro del mismo script.
     *
     * @param   {string} nombreEstado - Ej: 'Pendiente', 'En Proceso'
     * @returns {string} Internal ID del valor de lista
     * @throws  {Error}  Si el estado no existe en la lista
     */
    var _cacheEstados = {};
    function resolverIdEstado(nombreEstado) {
        if (_cacheEstados[nombreEstado]) {
            return _cacheEstados[nombreEstado];
        }
        var resultado = search.create({
            type: 'customlist_as_estado_procesamiento',
            filters: [['name', search.Operator.IS, nombreEstado]],
            columns: [search.createColumn({ name: 'internalid' })],
        }).run().getRange({ start: 0, end: 1 });

        if (!resultado.length) {
            throw new Error('Estado no encontrado en la lista: ' + nombreEstado);
        }
        _cacheEstados[nombreEstado] = resultado[0].id;
        return resultado[0].id;
    }

    /**
     * Busca el registro de control de carga más reciente en estado Pendiente.
     *
     * @returns {{ id: string, idArchivo: string } | null}
     *          Objeto con internal ID del record y el ID del archivo CSV,
     *          o null si no hay registros pendientes.
     */
    function obtenerPendiente() {
        var idPendiente = resolverIdEstado(C.ESTADOS.PENDIENTE);

        var resultados = search.create({
            type: C.RECORDS.CONTROL_CARGA,
            filters: [
                [C.FIELDS_CONTROL_CARGA.ESTADO, search.Operator.ANYOF, idPendiente],
            ],
            columns: [
                search.createColumn({ name: C.FIELDS_CONTROL_CARGA.ID_ARCHIVO }),
                search.createColumn({
                    name: C.FIELDS_CONTROL_CARGA.FECHA,
                    sort: search.Sort.DESC,
                }),
            ],
        }).run().getRange({ start: 0, end: 1 });

        if (!resultados.length) return null;

        var fila = resultados[0];
        return {
            id:         fila.id,
            idArchivo:  fila.getValue(C.FIELDS_CONTROL_CARGA.ID_ARCHIVO),
        };
    }

    /**
     * Busca el registro de control de carga en estado pendiente por internalId.
     *
     * @returns {{ id: string, idArchivo: string } | null}
     *          Objeto con internal ID del record y el ID del archivo CSV,
     *          o null si no hay registros pendientes.
     */    
    function obtenerPendientePorId(controlCargaId) {
        var idPendiente = resolverIdEstado(C.ESTADOS.PENDIENTE);

        var resultados = search.create({
            type: C.RECORDS.CONTROL_CARGA,
            filters: [
                [C.FIELDS_CONTROL_CARGA.FIELDS_CONTROL_CARGA, search.Operator.ANYOF, controlCargaId],
                'AND',
                [C.FIELDS_CONTROL_CARGA.ESTADO, search.Operator.ANYOF, idPendiente],
            ],
            columns: [
                search.createColumn({ name: C.FIELDS_CONTROL_CARGA.ID_ARCHIVO }),
                search.createColumn({
                    name: C.FIELDS_CONTROL_CARGA.FECHA,
                    sort: search.Sort.DESC,
                }),
            ],
        }).run().getRange({ start: 0, end: 1 });

        if (!resultados.length) return null;

        var fila = resultados[0];
        return {
            id:         fila.id,
            idArchivo:  fila.getValue(C.FIELDS_CONTROL_CARGA.ID_ARCHIVO),
        };
    }

    /**
     * Actualiza el campo Estado del record de cabecera.
     * Usa setText para portabilidad entre ambientes.
     *
     * @param {string|number} id          - Internal ID del record
     * @param {string}        textoEstado - Valor de texto del estado (usar C.ESTADOS.*)
     */
    function actualizarEstado(id, textoEstado) {
        record.submitFields({
            type:   C.RECORDS.CONTROL_CARGA,
            id:     id,
            values: { [C.FIELDS_CONTROL_CARGA.ESTADO]: resolverIdEstado(textoEstado) },
        });
    }

    /**
     * Actualiza el campo Detalle (resumen/mensaje) del record de cabecera.
     *
     * @param {string|number} id      - Internal ID del record
     * @param {string}        detalle - Texto a guardar en el campo
     */
    function actualizarDetalle(id, detalle) {
        record.submitFields({
            type:   C.RECORDS.CONTROL_CARGA,
            id:     id,
            values: { [C.FIELDS_CONTROL_CARGA.DETALLE]: detalle },
        });
    }

    /**
     * Actualiza Estado y Detalle en una sola operación de guardado.
     *
     * @param {string|number} id          - Internal ID del record
     * @param {string}        textoEstado - Valor de texto del estado
     * @param {string}        detalle     - Texto descriptivo del resultado
     */
    function actualizarEstadoYDetalle(id, textoEstado, detalle) {
        record.submitFields({
            type:   C.RECORDS.CONTROL_CARGA,
            id:     id,
            values: {
                [C.FIELDS_CONTROL_CARGA.ESTADO]:  resolverIdEstado(textoEstado),
                [C.FIELDS_CONTROL_CARGA.DETALLE]: detalle,
            },
        });
    }

    return {
        resolverIdEstado,
        obtenerPendiente,
        obtenerPendientePorId,
        actualizarEstado,
        actualizarDetalle,
        actualizarEstadoYDetalle,
    };
});
