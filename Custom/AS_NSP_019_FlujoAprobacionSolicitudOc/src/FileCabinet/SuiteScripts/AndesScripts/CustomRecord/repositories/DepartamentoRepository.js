/**
 * @NApiVersion 2.1
 * @NModuleScope SameAccount
 *
 * Repositorio de Departamentos.
 * Utilizable desde scripts de servidor y Client Scripts.
 *
 * Nota: el campo "Incluir subsidiarias hijas" (includechildren) NO está
 * disponible como columna/filtro en búsquedas guardadas de Departamento, por
 * lo que se resuelve con SuiteQL y, si este fallara, cargando el registro.
 */
define(['N/search', 'N/query', 'N/record'], (search, query, record) => {

    const esVerdadero = (valor) => valor === true || valor === 'T';

    /**
     * Devuelve, de la lista recibida, los IDs de departamentos que tienen
     * marcado "Incluir subsidiarias hijas".
     *
     * @param {string[]} departamentoIds
     * @returns {Set<string>}
     */
    const obtenerConIncluirHijas = (departamentoIds) => {
        const resultado = new Set();
        if (!departamentoIds.length) return resultado;

        try {
            const marcadores = departamentoIds.map(() => '?').join(',');
            query.runSuiteQL({
                query: `SELECT id FROM department WHERE includechildren = 'T' AND id IN (${marcadores})`,
                params: departamentoIds.map(Number)
            }).asMappedResults().forEach((fila) => resultado.add(String(fila.id)));
        } catch (e) {
            log.audit({
                title: 'DepartamentoRepository.obtenerConIncluirHijas - SuiteQL no disponible, se usa record.load',
                details: `${e.name}: ${e.message}`
            });
            departamentoIds.forEach((id) => {
                const dep = record.load({ type: record.Type.DEPARTMENT, id });
                if (esVerdadero(dep.getValue({ fieldId: 'includechildren' }))) resultado.add(String(id));
            });
        }

        return resultado;
    };

    /**
     * Busca los departamentos activos asignados a alguna de las subsidiarias
     * indicadas.
     *
     * @param {Array<number|string>} subsidiariaIds - Internal IDs de subsidiarias
     * @param {Object}  [opciones]
     * @param {boolean} [opciones.soloIncluyeHijas=false] - Si es true, solo devuelve
     *        los departamentos con "Incluir subsidiarias hijas" marcado
     * @returns {{id: string, nombre: string}[]} Departamentos sin duplicados
     */
    const buscarPorSubsidiarias = (subsidiariaIds, { soloIncluyeHijas = false } = {}) => {
        if (!subsidiariaIds || !subsidiariaIds.length) return [];

        const departamentos = {};

        search.create({
            type: search.Type.DEPARTMENT,
            filters: [
                ['subsidiary', 'anyof', subsidiariaIds],
                'AND',
                ['isinactive', 'is', 'F']
            ],
            columns: [
                search.createColumn({ name: 'name', sort: search.Sort.ASC })
            ]
        }).run().each((result) => {
            departamentos[String(result.id)] = {
                id: String(result.id),
                nombre: result.getValue({ name: 'name' })
            };
            return true;
        });

        if (!soloIncluyeHijas) return Object.values(departamentos);

        const conIncluirHijas = obtenerConIncluirHijas(Object.keys(departamentos));
        return Object.values(departamentos).filter((d) => conIncluirHijas.has(d.id));
    };

    return { buscarPorSubsidiarias };
});
