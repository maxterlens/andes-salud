/**
 * @NApiVersion 2.1
 * @NModuleScope SameAccount
 * @file CRLogAsignacionLoteOTRepository.js
 * @description Acceso a datos exclusivo del custom record customrecord_as_log_asignacion_lote_ot.
 *              Responsable de crear y (en el futuro) consultar los registros de log
 *              de ejecución del proceso de asignación de lotes.
 */
define([
    'N/record'
], (record) => {

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
        const logRec = record.create({ type: 'customrecord_as_log_asignacion_lote_ot' });

        logRec.setValue({ fieldId: 'custrecord_as_log_asig_lot_orden_traslad',       value: ordenTrasladoId        });
        logRec.setValue({ fieldId: 'custrecord_as_log_asig_lot_fecha_ejecuc',     value: new Date()             });
        logRec.setValue({ fieldId: 'custrecord_as_log_asig_lot_usuario',     value: userId                 });
        logRec.setValue({ fieldId: 'custrecord_as_log_asig_lot_status',   value: status                 });
        logRec.setValue({ fieldId: 'custrecord_as_log_asig_lot_total_lineas',    value: counters.total    || 0 });
        logRec.setValue({ fieldId: 'custrecord_as_log_asig_lot_lineas_comple', value: counters.complete || 0 });
        logRec.setValue({ fieldId: 'custrecord_as_log_asig_lot_lineas_parcia',  value: counters.partial  || 0 });
        logRec.setValue({ fieldId: 'custrecord_as_log_asig_lot_linea_nostock', value: counters.noStock  || 0 });
        logRec.setValue({ fieldId: 'custrecord_as_log_asig_lot_linea_omitida',  value: counters.skipped  || 0 });

        if (detalle) logRec.setValue({ fieldId: 'custrecord_as_log_asig_lot_linea_detalle', value: detalle });
        if (error)   logRec.setValue({ fieldId: 'custrecord_as_log_asig_lot_error',  value: error   });

        return logRec.save();
    };

    // ─────────────────────────────────────────────────────────────────────────
    // EXPORTS
    // ─────────────────────────────────────────────────────────────────────────

    return { crearLog };
});