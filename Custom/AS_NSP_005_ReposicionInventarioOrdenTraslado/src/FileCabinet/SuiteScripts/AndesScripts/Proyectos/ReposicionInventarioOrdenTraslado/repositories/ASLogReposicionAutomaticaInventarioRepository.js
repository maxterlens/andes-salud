/**
 * @NApiVersion 2.1
 * @NModuleScope SameAccount
 *
 * @name        ASLogReposicionAutomaticaInventarioRepository.js
 * @description Repositorio de lectura/escritura del log de reposición.
 *              Responsabilidad exclusiva: crear y consultar el record
 *              customrecord_as_log_repo_auto_inventario. No contiene lógica de negocio.
 */
define(['N/record', 'N/search', 'N/log'], (record, search, log) => {

    const RECORD_TYPE = 'customrecord_as_log_repo_auto_inventario';

    const FIELDS = {
        DATE               : 'custrecord_as_log_rep_aut_inv_fecha',
        SUBSIDIARY         : 'custrecord_as_log_rep_aut_inv_subsi',
        LOC_FROM           : 'custrecord_as_log_rep_aut_inv_ubi_desde',
        LOC_TO             : 'custrecord_as_log_rep_aut_inv_ubi_hasta',
        TO                 : 'custrecord_as_log_rep_aut_inv_transac',
        STATUS             : 'custrecord_as_log_rep_aut_inv_estado',
        MESSAGE            : 'custrecord_as_log_rep_aut_inv_mensaje',
        LINES_DETAIL       : 'custrecord_as_log_rep_aut_inv_detalle',
        // Texto largo con el detalle (JSON) de los artículos/cantidades que una persona
        // confirmó en el Suitelet de Resolución de Stock Limitado, a la espera de que el
        // Map/Reduce AS_ProcesarResolucionManual_MPRD_2.1 cree la Orden de Traslado real.
        // Campo a crear manualmente en NetSuite (este record no tiene SDF object).
        RESOLUCION_DETALLE : 'custrecord_as_log_rep_aut_inv_resolucion'
    };

    // Estado transitorio: una resolución manual ya confirmada por una persona en el
    // Suitelet, cuya Orden de Traslado todavía no fue creada — la crea, en segundo
    // plano, el Map/Reduce AS_ProcesarResolucionManual_MPRD_2.1.
    const ESTADO_PENDIENTE_CREACION_OT = 'Pendiente de Creación de OT';

    /**
     * Guarda un registro de log de reposición automática y retorna su Internal ID,
     * de forma que el llamador (TransferOrderService) pueda referenciarlo — por ejemplo,
     * para mostrarlo en el listado de resultados del Suitelet de Resolución de Stock Limitado.
     *
     * El campo LOC_TO (ubicación destino) es opcional: los logs de "conflicto" (ítem
     * disputado por 2+ destinos, pendiente de resolución manual) no tienen un único
     * destino definitivo hasta que una persona lo resuelve, por lo que se guardan sin él.
     *
     * @param   {Object}         params
     * @param   {string}         params.name          Nombre del registro
     * @param   {Date}           params.date          Fecha y hora de la ejecución
     * @param   {string|number}  params.subsidiaryId  Internal ID de la subsidiaria
     * @param   {string|number}  params.locationFrom  Internal ID de la ubicación origen
     * @param   {string|number|null} params.locationTo Internal ID de la ubicación destino (opcional)
     * @param   {number|null}    params.toId          Internal ID de la OT creada (null si no aplica)
     * @param   {string}         params.status        'Éxito' | 'Éxito parcial' | 'Error' |
     *                                                 'Pendiente de Resolución Manual' | 'Pendiente de Creación de OT'
     * @param   {string}         params.message       Mensaje descriptivo del resultado
     * @param   {string}         params.linesDetail   Detalle de artículos y cantidades
     * @param   {string}         [params.resolucionDetalle]  JSON con los artículos/cantidades ya
     *                                                 resueltos por una persona, a la espera de que
     *                                                 el Map/Reduce en segundo plano cree la OT.
     *                                                 Solo se usa para status = 'Pendiente de Creación de OT'.
     *
     * @returns {number}  Internal ID del registro de log creado
     */
    const save = ({
        name, date, subsidiaryId, locationFrom, locationTo,
        toId, status, message, linesDetail, resolucionDetalle
    }) => {
        const logRec = record.create({ type: RECORD_TYPE });

        logRec.setValue({ fieldId: 'name',               value: name });
        logRec.setValue({ fieldId: FIELDS.DATE,          value: date });
        logRec.setValue({ fieldId: FIELDS.SUBSIDIARY,    value: parseInt(subsidiaryId, 10) });
        logRec.setValue({ fieldId: FIELDS.LOC_FROM,      value: parseInt(locationFrom, 10) });
        logRec.setValue({ fieldId: FIELDS.STATUS,        value: status });
        logRec.setValue({ fieldId: FIELDS.MESSAGE,       value: message });
        logRec.setValue({ fieldId: FIELDS.LINES_DETAIL,  value: linesDetail });

        if (locationTo !== null && locationTo !== undefined && locationTo !== '') {
            logRec.setValue({ fieldId: FIELDS.LOC_TO, value: parseInt(locationTo, 10) });
        }

        if (toId) {
            logRec.setValue({ fieldId: FIELDS.TO, value: toId });
        }

        if (resolucionDetalle) {
            logRec.setValue({ fieldId: FIELDS.RESOLUCION_DETALLE, value: resolucionDetalle });
        }

        const logId = logRec.save();
        log.error('LogReposicionRepository.save', `Log guardado: ${name} (ID ${logId})`);

        return logId;
    };

    /**
     * Actualiza el RESULTADO de un log que estaba en estado 'Pendiente de Creación de OT',
     * una vez que el Map/Reduce en segundo plano efectivamente creó (o intentó crear) la
     * Orden de Traslado. Actualiza el MISMO registro (no crea uno nuevo) para conservar el
     * detalle de resolución original como historial de qué se pidió vs. qué ocurrió.
     *
     * @param   {Object}        params
     * @param   {string|number} params.logId    Internal ID del log a actualizar
     * @param   {number|null}   params.toId     Internal ID de la OT creada (null si falló)
     * @param   {string}        params.status   'Éxito' | 'Éxito parcial' | 'Error'
     * @param   {string}        params.message  Mensaje descriptivo del resultado
     * @param   {string}        params.linesDetail  Detalle de artículos y cantidades procesados
     */
    const updateResultado = ({ logId, toId, status, message, linesDetail }) => {
        const values = {
            [FIELDS.STATUS]      : status,
            [FIELDS.MESSAGE]     : message,
            [FIELDS.LINES_DETAIL]: linesDetail
        };

        if (toId) {
            values[FIELDS.TO] = toId;
        }

        record.submitFields({ type: RECORD_TYPE, id: logId, values });

        log.error('LogReposicionRepository.updateResultado',
            `Log ${logId} actualizado → estado "${status}"${toId ? `, OT ${toId}` : ''}`
        );
    };

    /**
     * Recupera todos los logs en estado 'Pendiente de Creación de OT' (resoluciones
     * manuales ya confirmadas en el Suitelet, cuya Orden de Traslado todavía no se creó).
     * Usada por AS_ProcesarResolucionManual_MPRD_2.1 tanto en getInputData (qué procesar)
     * como en summarize (si queda algo pendiente, para autodispararse de nuevo).
     *
     * @returns {Array<{
     *   id: string,
     *   subsidiaryId: string,
     *   locationFrom: string,
     *   locationTo: string,
     *   resolucionDetalle: string
     * }>}
     */
    const getPendientesCreacionOT = () => {
        const results = [];

        search.create({
            type: RECORD_TYPE,
            filters: [
                [FIELDS.STATUS, 'is', ESTADO_PENDIENTE_CREACION_OT],
                'AND',
                [FIELDS.RESOLUCION_DETALLE, 'isnotempty', '']
            ],
            columns: [
                'internalid',
                FIELDS.SUBSIDIARY,
                FIELDS.LOC_FROM,
                FIELDS.LOC_TO,
                FIELDS.RESOLUCION_DETALLE
            ]
        }).run().each((r) => {
            results.push({
                id               : r.getValue({ name: 'internalid' }),
                subsidiaryId     : r.getValue({ name: FIELDS.SUBSIDIARY }),
                locationFrom     : r.getValue({ name: FIELDS.LOC_FROM }),
                locationTo       : r.getValue({ name: FIELDS.LOC_TO }),
                resolucionDetalle: r.getValue({ name: FIELDS.RESOLUCION_DETALLE })
            });
            return true;
        });

        log.error('LogReposicionRepository.getPendientesCreacionOT',
            `Registros pendientes de creación de OT: ${results.length}`
        );

        return results;
    };

    /**
     * Recupera TODOS los logs que en algún momento pasaron por una resolución manual
     * confirmada en el Suitelet (es decir, donde el campo RESOLUCION_DETALLE no está
     * vacío), sin importar su estado actual ni cuándo se generaron. Es el historial
     * completo que muestra la pantalla de Resultados del Suitelet de Resolución de
     * Stock Limitado — no se filtra por una acción puntual porque, al crearse la OT
     * en segundo plano, ya no hay un conjunto fijo de IDs asociado a "lo que se acaba
     * de confirmar". Se ordena por fecha descendente (más reciente primero).
     *
     * El filtro OR sobre FIELDS.TO (sin valor, o mainline de la transacción enlazada)
     * evita que el join a la Orden de Traslado devuelva una fila por cada línea del
     * comprobante — nos quedamos solo con la línea principal (o ninguna, si no hay OT).
     *
     * @returns {Array<{
     *   id: string,
     *   tranid: string,
     *   date: string,
     *   locationFrom: string,
     *   locationTo: string,
     *   toId: string,
     *   status: string,
     *   message: string
     * }>}
     */
    const getConResolucion = () => {
        const results = [];

        search.create({
            type: RECORD_TYPE,
            filters: [
                [FIELDS.RESOLUCION_DETALLE, 'isnotempty', ''],
                'AND',
                [
                    [FIELDS.TO, 'anyof', "@NONE@"],
                    'OR',
                    [`${FIELDS.TO}.mainline`, 'is', 'T'],
                ]
            ],
            columns: [
                'internalid',
                search.createColumn({ name: FIELDS.DATE, sort: search.Sort.DESC }),
                FIELDS.LOC_FROM,
                FIELDS.LOC_TO,
                FIELDS.TO,
                FIELDS.STATUS,
                FIELDS.MESSAGE,
                search.createColumn({ name: 'tranid', join: FIELDS.TO }),
            ]
        }).run().each((r) => {
            results.push({
                id           : r.getValue({ name: 'internalid' }),
                tranid       : r.getValue({ name: 'tranid', join: FIELDS.TO }),
                date         : r.getValue({ name: FIELDS.DATE }),
                locationFrom : r.getText({ name: FIELDS.LOC_FROM }) || r.getValue({ name: FIELDS.LOC_FROM }),
                locationTo   : r.getText({ name: FIELDS.LOC_TO })   || r.getValue({ name: FIELDS.LOC_TO }),
                toId         : r.getValue({ name: FIELDS.TO }),
                status       : r.getValue({ name: FIELDS.STATUS }),
                message      : r.getValue({ name: FIELDS.MESSAGE })
            });
            return true;
        });

        log.error('LogReposicionRepository.getConResolucion',
            `Registros con resolución manual (historial completo): ${results.length}`
        );

        return results;
    };

    /**
     * Recupera un conjunto de logs de reposición por sus Internal IDs, en el orden
     * necesario para el listado de resultados del Suitelet de Resolución de Stock Limitado
     * (se muestra un resumen de qué se creó / registró tras confirmar una resolución).
     *
     * El filtro OR sobre FIELDS.TO (sin valor, o mainline de la transacción enlazada)
     * evita que el join a la Orden de Traslado devuelva una fila por cada línea del
     * comprobante — nos quedamos solo con la línea principal (o ninguna, si no hay OT).
     *
     * @param   {Array<string|number>} ids
     * @returns {Array<{
     *   id: string,
     *   tranid: string,
     *   date: string,
     *   locationFrom: string,
     *   locationTo: string,
     *   toId: string,
     *   status: string,
     *   message: string,
     *   linesDetail: string
     * }>}
     */
    const getByIds = (ids) => {
        if (!ids || !ids.length) return [];

        const results = [];

        search.create({
            type: RECORD_TYPE,
            filters: [
                ['internalid', 'anyof', ids],
                'AND',
                [
                    [FIELDS.TO, 'anyof', "@NONE@"],
                    'OR',
                    [`${FIELDS.TO}.mainline`, 'is', 'T'],
                ]
            ],
            columns: [
                'internalid',
                FIELDS.DATE,
                FIELDS.LOC_FROM,
                FIELDS.LOC_TO,
                FIELDS.TO,
                FIELDS.STATUS,
                FIELDS.MESSAGE,
                FIELDS.LINES_DETAIL,
                search.createColumn({ name: 'tranid', join: FIELDS.TO}),
            ]
        }).run().each((r) => {
            results.push({
                id           : r.getValue({ name: 'internalid' }),
                tranid       : r.getValue({ name: 'tranid', join: FIELDS.TO }),
                date         : r.getValue({ name: FIELDS.DATE }),
                locationFrom : r.getText({ name: FIELDS.LOC_FROM }) || r.getValue({ name: FIELDS.LOC_FROM }),
                locationTo   : r.getText({ name: FIELDS.LOC_TO })   || r.getValue({ name: FIELDS.LOC_TO }),
                toId         : r.getValue({ name: FIELDS.TO }),
                status       : r.getValue({ name: FIELDS.STATUS }),
                message      : r.getValue({ name: FIELDS.MESSAGE }),
                linesDetail  : r.getValue({ name: FIELDS.LINES_DETAIL })
            });
            return true;
        });

        log.error('LogReposicionRepository.getByIds', `Solicitados: ${ids.length} | Encontrados: ${results.length}`);

        return results;
    };

    return {
        save,
        getByIds,
        updateResultado,
        getPendientesCreacionOT,
        getConResolucion,
        FIELDS,
        RECORD_TYPE,
        ESTADO_PENDIENTE_CREACION_OT
    };
});
