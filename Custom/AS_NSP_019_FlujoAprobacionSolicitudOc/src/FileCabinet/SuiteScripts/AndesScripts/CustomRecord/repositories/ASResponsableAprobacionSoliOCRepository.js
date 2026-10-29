/**
 * @NApiVersion 2.1
 * @NModuleScope SameAccount
 *
 * Repositorio para customrecord_as_respon_aprob_soli_oc.
 * Gestiona la búsqueda del responsable de aprobación de Solicitud de Compra
 * por combinación Subsidiaria + Departamento.
 *
 * Reglas de configuración:
 *  - Un registro por cada combinación Subsidiaria + Departamento, con un único
 *    responsable. Un mismo departamento habilitado en varias subsidiarias se
 *    configura con un registro por subsidiaria.
 *  - Un registro con Subsidiaria y Departamento VACÍO define el aprobador por
 *    defecto de la subsidiaria. Se usa cuando la solicitud no tiene
 *    departamento o cuando su combinación no tiene configuración específica.
 */
define(['N/search'], (search) => {

    const RECORD_TYPE = 'customrecord_as_respon_aprob_soli_oc';
    const FIELD_SUBSIDIARIA = 'custrecord_as_resp_apb_sol_oc_subsidiari';
    const FIELD_DEPARTAMENTO = 'custrecord_as_resp_apb_sol_oc_departamen';
    const FIELD_RESPONSABLE = 'custrecord_as_resp_apb_sol_oc_responsabl';

    /** Valor de filtro para "Departamento vacío" (aprobador por defecto). */
    const SIN_DEPARTAMENTO = '@NONE@';

    /**
     * Filtro de departamento: el ID recibido o, si viene vacío, registros sin
     * departamento (aprobador por defecto de la subsidiaria).
     *
     * @param {number|string} departamentoId
     * @returns {string}
     */
    const valorFiltroDepartamento = (departamentoId) => departamentoId || SIN_DEPARTAMENTO;

    /**
     * Busca el responsable configurado para una Subsidiaria + Departamento exactos.
     * Si hay más de un registro activo, toma el de menor internal ID y deja una
     * advertencia en el log.
     *
     * @param {number|string} subsidiariaId
     * @param {number|string} departamentoId - Vacío para buscar el aprobador por defecto
     * @returns {string} Internal ID del responsable, o '' si no hay configuración
     */
    const buscarPorCombinacion = (subsidiariaId, departamentoId) => {
        const responsables = [];

        search.create({
            type: RECORD_TYPE,
            filters: [
                [FIELD_SUBSIDIARIA, 'anyof', subsidiariaId],
                'AND',
                [FIELD_DEPARTAMENTO, 'anyof', valorFiltroDepartamento(departamentoId)],
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
                title: 'ASResponsableAprobacionSoliOCRepository.buscarPorCombinacion - Configuración duplicada',
                details: `Subsidiaria: ${subsidiariaId} | Departamento: ${departamentoId || '(por defecto)'} | ` +
                    `Registros: ${responsables.map(r => r.registroId).join(', ')}. Se usa el registro ${responsables[0].registroId}.`
            });
        }

        return responsables.length ? responsables[0].responsable : '';
    };

    /**
     * Busca el responsable de aprobación para la solicitud:
     *  1. Configuración específica Subsidiaria + Departamento (si hay departamento).
     *  2. Si no existe, el aprobador por defecto de la subsidiaria
     *     (registro con Departamento vacío).
     *
     * @param {number|string} subsidiariaId  - Internal ID de la subsidiaria
     * @param {number|string} [departamentoId] - Internal ID del departamento
     * @returns {{responsable: string, porDefecto: boolean}}
     *          responsable = '' si no hay configuración ni aprobador por defecto
     */
    const buscarResponsable = (subsidiariaId, departamentoId) => {
        if (departamentoId) {
            const especifico = buscarPorCombinacion(subsidiariaId, departamentoId);
            if (especifico) return { responsable: especifico, porDefecto: false };
        }

        return { responsable: buscarPorCombinacion(subsidiariaId, ''), porDefecto: true };
    };

    /**
     * Indica si ya existe otro registro activo con la misma combinación
     * Subsidiaria + Departamento. Con departamento vacío valida que exista un
     * solo aprobador por defecto activo por subsidiaria.
     *
     * @param {number|string} subsidiariaId  - Internal ID de la subsidiaria
     * @param {number|string} departamentoId - Internal ID del departamento (vacío = por defecto)
     * @param {number|string} [excluirId]    - Internal ID del registro actual (edición)
     * @returns {string|null} Internal ID del registro duplicado, o null si no existe
     */
    const buscarCombinacionExistente = (subsidiariaId, departamentoId, excluirId) => {
        const filtros = [
            [FIELD_SUBSIDIARIA, 'anyof', subsidiariaId],
            'AND',
            [FIELD_DEPARTAMENTO, 'anyof', valorFiltroDepartamento(departamentoId)],
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
