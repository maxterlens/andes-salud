/**
 * @NApiVersion 2.1
 * @NModuleScope SameAccount
 * @file InformeGastoService.js
 * @description Lógica de negocio para operaciones sobre el Informe de Gasto
 *              dentro del Ejecutor de Acciones.
 *              Valida parámetros y delega al repositorio.
 *              No accede directamente a N/record ni N/search.
 */
define([
    '../repositories/InformeGastoRepository'
], (InformeGastoRepository) => {

    /**
     * Actualiza el motivo de rechazo del Informe de Gasto.
     *
     * @param {Object} params
     * @param {string|number} params.recordId     - ID interno del Informe de Gasto
     * @param {string}        params.motivoRechazo - Texto del motivo de rechazo
     * @returns {{ ok: boolean, recordId: number|null, error: string|null }}
     */
    const actualizarMotivoRechazo = ({ recordId, motivoRechazo }) => {
        try {
            const idActualizado = InformeGastoRepository.actualizarMotivoRechazo({ recordId, motivoRechazo });

            log.error({
                title  : 'InformeGastoService.actualizarMotivoRechazo',
                details: `Informe de Gasto ${recordId} actualizado correctamente.`
            });

            return { ok: true, recordId: idActualizado, error: null };

        } catch (e) {
            log.error({
                title  : 'InformeGastoService.actualizarMotivoRechazo',
                details: `recordId=${recordId} | ${e.name}: ${e.message}`
            });
            return { ok: false, recordId: null, error: e.toString() };
        }
    };

    return { actualizarMotivoRechazo };
});
