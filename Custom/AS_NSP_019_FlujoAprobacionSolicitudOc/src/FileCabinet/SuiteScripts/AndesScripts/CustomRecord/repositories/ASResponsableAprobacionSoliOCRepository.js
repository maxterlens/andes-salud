/**
 * @NApiVersion 2.1
 * @NModuleScope SameAccount
 *
 * Repositorio para customrecord_as_respon_aprob_soli_oc.
 * Gestiona la búsqueda del responsable de aprobación de Solicitud de Compra
 * por combinación Subsidiaria + Departamento.
 *
 * Regla de configuración: un registro por cada combinación Subsidiaria +
 * Departamento, con un único responsable. Un mismo departamento habilitado en
 * varias subsidiarias se configura con un registro por subsidiaria.
 */
define(['N/search'], (search) => {

    const RECORD_TYPE = 'customrecord_as_respon_aprob_soli_oc';
    const FIELD_SUBSIDIARIA = 'custrecord_as_resp_apb_sol_oc_subsidiari';
    const FIELD_DEPARTAMENTO = 'custrecord_as_resp_apb_sol_oc_departamen';
    const FIELD_RESPONSABLE = 'custrecord_as_resp_apb_sol_oc_responsabl';

    /**
     * Busca el responsable de aprobación configurado para la combinación
     * Subsidiaria + Departamento.
     *
     * Si existe más de un registro activo para la misma combinación, se toma
     * el primero (menor internal ID) y se deja una advertencia en el log para
     * que se corrija la configuración.
     *
     * @param {number|string} subsidiariaId  - Internal ID de la subsidiaria
     * @param {number|string} departamentoId - Internal ID del departamento
     * @returns {string} Internal ID del responsable, o '' si no hay configuración
     */
    const buscarResponsable = (subsidiariaId, departamentoId) => {
        const responsables = [];

        search.create({
            type: RECORD_TYPE,
            filters: [
                [FIELD_SUBSIDIARIA, 'anyof', subsidiariaId],
                'AND',
                [FIELD_DEPARTAMENTO, 'anyof', departamentoId],
                'AND',
                ['isinactive', 'is', 'F']
            ],
            columns: [
                search.createColumn({ name: 'internalid', sort: search.Sort.ASC }),
                FIELD_RESPONSABLE
            ]
        }).run().each((result) => {
            // Defensivo: si el campo aún fuera multiselect, se toma el primer valor
            const valor = String(result.getValue({ name: FIELD_RESPONSABLE }) || '').split(',')[0].trim();
            if (valor) responsables.push({ registroId: result.id, responsable: valor });
            return true;
        });

        if (responsables.length > 1) {
            log.audit({
                title: 'ASResponsableAprobacionSoliOCRepository.buscarResponsable - Configuración duplicada',
                details: `Subsidiaria: ${subsidiariaId} | Departamento: ${departamentoId} | ` +
                    `Registros: ${responsables.map(r => r.registroId).join(', ')}. Se usa el registro ${responsables[0].registroId}.`
            });
        }

        return responsables.length ? responsables[0].responsable : '';
    };

    /**
     * Indica si ya existe otro registro activo con la misma combinación
     * Subsidiaria + Departamento.
     *
     * @param {number|string} subsidiariaId  - Internal ID de la subsidiaria
     * @param {number|string} departamentoId - Internal ID del departamento
     * @param {number|string} [excluirId]    - Internal ID del registro actual (edición)
     * @returns {string|null} Internal ID del registro duplicado, o null si no existe
     */
    const buscarCombinacionExistente = (subsidiariaId, departamentoId, excluirId) => {
        const filtros = [
            [FIELD_SUBSIDIARIA, 'anyof', subsidiariaId],
            'AND',
            [FIELD_DEPARTAMENTO, 'anyof', departamentoId],
            'AND',
            ['isinactive', 'is', 'F']
        ];

        if (excluirId) {
            filtros.push('AND', ['internalid', 'noneof', excluirId]);
        }

        const resultado = search.create({
            type: RECORD_TYPE,
            filters: filtros,
            columns: ['internalid']
        }).run().getRange({ start: 0, end: 1 });

        return resultado && resultado.length ? String(resultado[0].id) : null;
    };

    return { buscarResponsable, buscarCombinacionExistente };
});
