/**
 * @NApiVersion 2.1
 * @NModuleScope SameAccount
 *
 * Repositorio para customrecord_as_respon_aprob_soli_oc.
 * Gestiona la búsqueda de responsables de aprobación de Solicitud de Compra
 * por subsidiaria.
 */
define(['N/search'], (search) => {

    const RECORD_TYPE = 'customrecord_as_respon_aprob_soli_oc';
    const FIELD_SUBSIDIARIA = 'custrecord_as_resp_apb_sol_oc_subsidiari';
    const FIELD_RESPONSABLE = 'custrecord_as_resp_apb_sol_oc_responsabl';

    /**
     * Busca los responsables de aprobación configurados para una subsidiaria.
     * El campo custrecord_as_resp_apb_sol_oc_responsabl es MULTISELECT, por lo
     * que un mismo registro puede traer más de un responsable; si además hay
     * más de un registro customrecord_as_respon_aprob_soli_oc para la misma
     * subsidiaria, se acumulan los responsables de todos.
     *
     * @param {number|string} subsidiariaId - Internal ID de la subsidiaria
     * @returns {string[]} Internal IDs de los responsables encontrados (sin duplicados)
     */
    const buscarResponsablesPorSubsidiaria = (subsidiariaId) => {
        let responsable = '';

        const busqueda = search.create({
            type: RECORD_TYPE,
            filters: [
                [FIELD_SUBSIDIARIA, 'anyof', subsidiariaId]
            ],
            columns: [FIELD_RESPONSABLE]
        });

        busqueda.run().each((result) => {
            responsable = result.getValue({ name: FIELD_RESPONSABLE });
            return true;
        });

        log.error({
            title: 'ASResponsableAprobacionSoliOCRepository.buscarResponsablesPorSubsidiaria',
            details: `Subsidiaria: ${subsidiariaId} | Responsable encontrado: ${responsable}`
        });

        return responsable;
    };

    return { buscarResponsablesPorSubsidiaria };
});
