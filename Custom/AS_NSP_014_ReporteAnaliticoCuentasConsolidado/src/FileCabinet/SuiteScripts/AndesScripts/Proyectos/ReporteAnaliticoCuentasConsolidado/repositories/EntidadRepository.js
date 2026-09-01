/**
 * AS_NSP_014 — Reporte Analítico de Cuentas Consolidado
 * @description Repositorio de consultas sobre entidades (clientes, proveedores, etc.).
 *              Encapsula la búsqueda de RUT por internal ID de entidad.
 *
 * @NApiVersion 2.1
 * @NModuleScope Public
 */
define(['N/search'], function (search) {

    /* ══════════════════════════════════════════════════════════════════════
     *  getRutsPorEntidades
     * ══════════════════════════════════════════════════════════════════════ */
    /**
     * Obtiene el RUT de cada entidad a partir de sus internal IDs.
     * Si el array llega vacío, retorna {} sin ejecutar la búsqueda.
     *
     * @param   {string[]|number[]} entityIds  Internal IDs de entidad (puede tener duplicados)
     * @returns {Object}  Mapa { internalId(string) : rut(string) }
     */
    function getRutsPorEntidades(entityIds) {
        if (!entityIds || entityIds.length === 0) return {};

        var resultado = {};

        /*let newSearch = search.create({
            type   : 'entity',
            filters: [['internalid', 'anyof', entityIds], 'AND', ['internalid', 'anyof', '544616']],
            columns: [search.createColumn({ name: 'custentity_2wrut', label: 'RUT' })],
        })
        
        const pagedData = newSearch.runPaged({ pageSize: 1000 });
        pagedData.pageRanges.forEach(function (pageRange) {
            const page = pagedData.fetch({
                index: pageRange.index
            });
            page.data.forEach(function (result) {
                let rut = result.getValue({ name: 'custentity_2wrut' }) || '';
                resultado[result.id] = rut;
            })
        })*/

        log.error({
            title  : 'EntidadRepository.getRutsPorEntidades',
            details: 'IDs consultados: ' + entityIds.length + ' | RUTs encontrados: ' + Object.keys(resultado).length,
        });

        return resultado;
    }

    return { getRutsPorEntidades: getRutsPorEntidades };
});
