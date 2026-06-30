/**
 * @NApiVersion 2.1
 * @NModuleScope SameAccount
 *
 * @name        ASLogReposicionAutomaticaInventarioRepository.js
 * @description Repositorio de escritura del log de reposición.
 *              Responsabilidad exclusiva: crear el record customrecord_as_log_repo_auto_inventario.
 */
define(['N/record', 'N/log'], (record, log) => {

    const RECORD_TYPE = 'customrecord_as_log_repo_auto_inventario';

    const FIELDS = {
        DATE         : 'custrecord_as_log_rep_aut_inv_fecha',
        SUBSIDIARY   : 'custrecord_as_log_rep_aut_inv_subsi',
        LOC_FROM     : 'custrecord_as_log_rep_aut_inv_ubi_desde',
        LOC_TO       : 'custrecord_as_log_rep_aut_inv_ubi_hasta',
        TO           : 'custrecord_as_log_rep_aut_inv_transac',
        STATUS       : 'custrecord_as_log_rep_aut_inv_estado',
        MESSAGE      : 'custrecord_as_log_rep_aut_inv_mensaje',
        LINES_DETAIL : 'custrecord_as_log_rep_aut_inv_detalle'
    };

    /**
     * Guarda un registro de log de reposición automática.
     *
     * @param {Object}         params
     * @param {string}         params.name          Nombre del registro
     * @param {Date}           params.date          Fecha y hora de la ejecución
     * @param {string|number}  params.subsidiaryId  Internal ID de la subsidiaria
     * @param {string|number}  params.locationFrom  Internal ID de la ubicación origen
     * @param {string|number}  params.locationTo    Internal ID de la ubicación destino
     * @param {number|null}    params.toId          Internal ID de la OT creada (null si hubo error)
     * @param {number}         params.itemsCount    Número de artículos procesados
     * @param {string}         params.status        'Éxito' | 'Error'
     * @param {string}         params.message       Mensaje descriptivo del resultado
     * @param {string}         params.executionId   ID del deployment del script MR
     * @param {string}         params.linesDetail   Detalle de artículos y cantidades de la OT
     */
    const save = ({
        name, date, subsidiaryId, locationFrom, locationTo,
        toId, status, message, linesDetail
    }) => {
        const logRec = record.create({ type: RECORD_TYPE });

        logRec.setValue({ fieldId: 'name',               value: name });
        logRec.setValue({ fieldId: FIELDS.DATE,          value: date });
        logRec.setValue({ fieldId: FIELDS.SUBSIDIARY,    value: parseInt(subsidiaryId, 10) });
        logRec.setValue({ fieldId: FIELDS.LOC_FROM,      value: parseInt(locationFrom, 10) });
        logRec.setValue({ fieldId: FIELDS.LOC_TO,        value: parseInt(locationTo,   10) });
        logRec.setValue({ fieldId: FIELDS.STATUS,        value: status });
        logRec.setValue({ fieldId: FIELDS.MESSAGE,       value: message });
        logRec.setValue({ fieldId: FIELDS.LINES_DETAIL,  value: linesDetail });

        if (toId) {
            logRec.setValue({ fieldId: FIELDS.TO, value: toId });
        }

        logRec.save();
        log.debug('LogReposicionRepository.save', `Log guardado: ${name}`);
    };

    return { save };
});
