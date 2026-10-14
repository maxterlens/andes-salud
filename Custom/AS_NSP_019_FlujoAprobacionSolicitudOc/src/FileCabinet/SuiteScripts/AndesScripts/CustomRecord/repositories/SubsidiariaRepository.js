/**
 * @NApiVersion 2.1
 * @NModuleScope SameAccount
 *
 * Repositorio de Subsidiarias.
 * Utilizable desde scripts de servidor y Client Scripts.
 */
define(['N/search'], (search) => {

    /**
     * Devuelve la cadena de subsidiarias padre de una subsidiaria, desde el
     * padre directo hasta la raíz.
     *
     * @param {number|string} subsidiariaId - Internal ID de la subsidiaria
     * @returns {string[]} Internal IDs de los ancestros (vacío si es raíz)
     */
    const obtenerAncestros = (subsidiariaId) => {
        const padres = {};

        search.create({
            type: search.Type.SUBSIDIARY,
            filters: [],
            columns: ['parent']
        }).run().each((result) => {
            padres[String(result.id)] = String(result.getValue({ name: 'parent' }) || '');
            return true;
        });

        const ancestros = [];
        let actual = padres[String(subsidiariaId)];

        // Guardia contra ciclos o datos inconsistentes
        while (actual && !ancestros.includes(actual) && actual !== String(subsidiariaId)) {
            ancestros.push(actual);
            actual = padres[actual];
        }

        return ancestros;
    };

    return { obtenerAncestros };
});
