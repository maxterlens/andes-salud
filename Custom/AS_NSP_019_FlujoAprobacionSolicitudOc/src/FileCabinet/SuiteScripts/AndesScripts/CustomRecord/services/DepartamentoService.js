/**
 * @NApiVersion 2.1
 * @NModuleScope SameAccount
 *
 * Servicio de Departamentos.
 * Resuelve qué departamentos están disponibles para una subsidiaria,
 * considerando la opción "Incluir subsidiarias hijas" del departamento.
 */
define([
    '../repositories/DepartamentoRepository',
    '../repositories/SubsidiariaRepository'
], (DepartamentoRepository, SubsidiariaRepository) => {

    /**
     * Departamentos disponibles para una subsidiaria:
     *  - Los asignados directamente a la subsidiaria.
     *  - Los asignados a cualquier subsidiaria padre (cadena completa) que
     *    tengan marcado "Incluir subsidiarias hijas".
     *
     * @param {number|string} subsidiariaId - Internal ID de la subsidiaria
     * @returns {{id: string, nombre: string}[]} Ordenados por nombre, sin duplicados
     */
    const obtenerDepartamentosPorSubsidiaria = (subsidiariaId) => {
        if (!subsidiariaId) return [];

        const directos = DepartamentoRepository.buscarPorSubsidiarias([subsidiariaId]);

        const ancestros = SubsidiariaRepository.obtenerAncestros(subsidiariaId);
        const heredados = DepartamentoRepository.buscarPorSubsidiarias(ancestros, { soloIncluyeHijas: true });

        const unicos = {};
        [...directos, ...heredados].forEach((d) => { unicos[d.id] = d; });

        return Object.values(unicos).sort((a, b) =>
            String(a.nombre).localeCompare(String(b.nombre), 'es', { sensitivity: 'base' }));
    };

    return { obtenerDepartamentosPorSubsidiaria };
});
