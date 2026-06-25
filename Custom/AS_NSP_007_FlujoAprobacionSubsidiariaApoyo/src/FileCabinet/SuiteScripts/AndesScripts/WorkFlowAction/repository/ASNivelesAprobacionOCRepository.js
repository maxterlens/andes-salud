/**
 * @NApiVersion 2.1
 * @NModuleScope SameAccount
 */

/**
 * ASNivelesAprobacionOCRepository.js
 *
 * Repositorio de acceso a datos para el custom record
 * customrecord_as_niveles_aprobacion en el contexto de Órdenes de Compra.
 *
 * @author  Andes Salud
 * @version 2.1
 */

define(['N/search'], (search) => {

    /**
     * Busca el registro de nivel de aprobación para una subsidiaria y grupo de
     * aprobación dados.
     *
     * @param   {number|string} subsidiaria      - Internal ID de la subsidiaria
     * @param   {number|string} grupoAprobacion  - Internal ID del grupo de aprobación
     * @returns {{ id: string, name: string } | null}
     */
    const buscarPorSubsidiariaYGrupo = (subsidiaria, grupoAprobacion) => {

        const resultSearch = search.create({
            type: 'customrecord_as_niveles_aprobacion',
            filters: [
                ['custrecord_as_nivel_aprb_subsidiaria', 'anyof', subsidiaria],
                'AND',
                ['custrecord_as_nivel_aprb_grupo_aprobacio', 'anyof', grupoAprobacion]
            ],
            columns: [
                search.createColumn('name')
            ]
        }).run().getRange(0, 1);

        if (!resultSearch || resultSearch.length === 0) return null;

        return {
            id:   resultSearch[0].id,
            name: resultSearch[0].getValue('name')
        };
    };

    return { buscarPorSubsidiariaYGrupo };

});
