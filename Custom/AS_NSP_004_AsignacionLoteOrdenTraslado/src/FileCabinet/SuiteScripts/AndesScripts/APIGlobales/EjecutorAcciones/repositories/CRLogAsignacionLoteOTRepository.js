/**
 * @NApiVersion 2.1
 * @NModuleScope SameAccount
 * @file CRLogAsignacionLoteOTRepository.js
 * @description Acceso a datos exclusivo del custom record customrecord_as_to_lot_assign_log.
 *              Responsable de crear y (en el futuro) consultar los registros de log
 *              de ejecución del proceso de asignación de lotes.
 */
define([
    'N/record'
], (record) => {

    // ─── Tipo de record ───────────────────────────────────────────────────────
    const TIPO_LOG = 'customrecord_as_log_asignacion_lote_ot';

    // ─── Fields del custom record ─────────────────────────────────────────────
    const LOG_FIELD_OT       = 'custrecord_as_log_asig_lot_orden_traslad';
    const LOG_FIELD_DATE     = 'custrecord_as_log_asig_lot_fecha_ejecuc';
    const LOG_FIELD_USER     = 'custrecord_as_log_asig_lot_usuario';
    const LOG_FIELD_STATUS   = 'custrecord_as_log_asig_lot_status';
    const LOG_FIELD_TOTAL    = 'custrecord_as_log_asig_lot_total_lineas';
    const LOG_FIELD_COMPLETE = 'custrecord_as_log_asig_lot_lineas_comple';
    const LOG_FIELD_PARTIAL  = 'custrecord_as_log_asig_lot_lineas_parcia';
    const LOG_FIELD_NO_STOCK = 'custrecord_as_log_asig_lot_linea_nostock';
    const LOG_FIELD_SKIPPED  = 'custrecord_as_log_asig_lot_linea_omitida';
    const LOG_FIELD_DETAIL   = 'custrecord_as_log_asig_lot_linea_detalle';
    const LOG_FIELD_ERROR    = 'custrecord_as_log_asig_lot_error';

    // ─────────────────────────────────────────────────────────────────────────
    // ESCRITURA
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Crea un registro de log para una ejecución del proceso de asignación.
     * Un único record por ejecución; el detalle de líneas va en un campo Long Text.
     *
     * @param {{
     *   ordenTrasladoId : string|number,
     *   userId          : string|number,
     *   status          : string,
     *   counters        : { total, complete, partial, noStock, skipped },
     *   detalle         : string|null,
     *   error           : string|null
     * }} params
     * @returns {number} Internal ID del registro creado
     */
    const crearLog = ({ ordenTrasladoId, userId, status, counters, detalle, error }) => {
        const logRec = record.create({ type: TIPO_LOG });

        logRec.setValue({ fieldId: LOG_FIELD_OT,       value: ordenTrasladoId        });
        logRec.setValue({ fieldId: LOG_FIELD_DATE,     value: new Date()             });
        logRec.setValue({ fieldId: LOG_FIELD_USER,     value: userId                 });
        logRec.setValue({ fieldId: LOG_FIELD_STATUS,   value: status                 });
        logRec.setValue({ fieldId: LOG_FIELD_TOTAL,    value: counters.total    || 0 });
        logRec.setValue({ fieldId: LOG_FIELD_COMPLETE, value: counters.complete || 0 });
        logRec.setValue({ fieldId: LOG_FIELD_PARTIAL,  value: counters.partial  || 0 });
        logRec.setValue({ fieldId: LOG_FIELD_NO_STOCK, value: counters.noStock  || 0 });
        logRec.setValue({ fieldId: LOG_FIELD_SKIPPED,  value: counters.skipped  || 0 });

        if (detalle) logRec.setValue({ fieldId: LOG_FIELD_DETAIL, value: detalle });
        if (error)   logRec.setValue({ fieldId: LOG_FIELD_ERROR,  value: error   });

        return logRec.save();
    };

    // ─────────────────────────────────────────────────────────────────────────
    // EXPORTS
    // ─────────────────────────────────────────────────────────────────────────

    return { crearLog };
});
