/**
 * @NApiVersion 2.1
 * @NModuleScope SameAccount
 * @file InformeGastoRepository.js
 * @description Acceso a datos para el Informe de Gasto dentro del Ejecutor de Acciones.
 *              Centraliza las operaciones de escritura sobre el record expensereport.
 */
define([
    'N/record'
], (record) => {

    /**
     * Actualiza el campo custbody_as_motivo_rechazo del Informe de Gasto.
     * Usa submitFields para evitar cargar el record completo.
     *
     * @param {Object} params
     * @param {string|number} params.recordId     - ID interno del Informe de Gasto
     * @param {string}        params.motivoRechazo - Texto del motivo de rechazo
     * @returns {number} ID del record actualizado
     */
    const actualizarMotivoRechazo = ({ recordId, motivoRechazo }) => {
        return record.submitFields({
            type   : record.Type.EXPENSE_REPORT,
            id     : recordId,
            values : { custbody_as_motivo_rechazo: motivoRechazo },
            options: { enableSourcing: false, ignoreMandatoryFields: true }
        });
    };

    return { actualizarMotivoRechazo };
});
