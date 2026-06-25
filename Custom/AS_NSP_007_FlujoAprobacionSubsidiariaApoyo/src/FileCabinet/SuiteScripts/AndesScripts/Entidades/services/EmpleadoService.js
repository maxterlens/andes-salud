/**
 * @NApiVersion 2.1
 * @NModuleScope SameAccount
 *
 * Servicio de lógica de negocio para el record Empleado.
 * Orquesta los cambios sobre el nivel de aprobación asignado.
 */
define([
    'N/log',
    '../../CustomRecord/repositories/ASNivelesAprobacionOCRepository'
], (log, ASNivelesAprobacionOCRepository) => {

    /**
     * Devuelve la estructura de niveles de aprobación agrupada por subsidiaria,
     * necesaria para renderizar la sublista en el formulario del empleado.
     *
     * @returns {{
     *   grupoOptions: Array<{ id: string, text: string }>,
     *   subsidiarias: Array<{ id: string, text: string, nivelIdPorGrupo: Object<string, string> }>
     * }}
     */
    const obtenerEstructuraNivelesPorSubsidiaria = () => {
        const todosLosNiveles = ASNivelesAprobacionOCRepository.obtenerTodosActivos();

        const grupoOptionsMap  = {};
        const subsidiariasMap  = {};

        for (const nivel of todosLosNiveles) {
            if (nivel.grupoId && !grupoOptionsMap[nivel.grupoId]) {
                grupoOptionsMap[nivel.grupoId] = nivel.grupoNombre;
            }

            if (nivel.subsidiariaId) {
                if (!subsidiariasMap[nivel.subsidiariaId]) {
                    subsidiariasMap[nivel.subsidiariaId] = {
                        id:              nivel.subsidiariaId,
                        text:            nivel.subsidiariaNombre,
                        nivelIdPorGrupo: {}
                    };
                }
                if (nivel.grupoId) {
                    subsidiariasMap[nivel.subsidiariaId].nivelIdPorGrupo[nivel.grupoId] = nivel.id;
                }
            }
        }

        return {
            grupoOptions: Object.entries(grupoOptionsMap).map(([id, text]) => ({ id, text })),
            subsidiarias: Object.values(subsidiariasMap)
        };
    };

    /**
     * Dado un arreglo de selecciones {subsidiariaId, grupoId} de la sublista,
     * devuelve los internal IDs de los registros customrecord_as_niveles_aprobacion
     * que coinciden con cada combinación.
     *
     * @param {Array<{ subsidiariaId: string, grupoId: string }>} selecciones
     * @returns {string[]}
     */
    const resolverNivelIdsPorSelecciones = (selecciones) => {
        if (!selecciones || selecciones.length === 0) return [];

        const todosLosNiveles = ASNivelesAprobacionOCRepository.obtenerTodosActivos();

        const nivelMap = {};
        for (const nivel of todosLosNiveles) {
            const key = `${nivel.subsidiariaId}_${nivel.grupoId}`;
            nivelMap[key] = nivel.id;
        }

        const ids = [];
        for (const { subsidiariaId, grupoId } of selecciones) {
            const key = `${subsidiariaId}_${grupoId}`;
            if (nivelMap[key]) ids.push(nivelMap[key]);
        }

        log.debug({
            title: 'EmpleadoService.resolverNivelIdsPorSelecciones',
            details: `Selecciones: ${JSON.stringify(selecciones)} → IDs resueltos: ${JSON.stringify(ids)}`
        });

        return ids;
    };

    /**
     * Compara el estado anterior y nuevo de custentity_as_nivel_aprobacion y
     * ejecuta add/remove del empleado en los registros de nivel de aprobación
     * que hayan cambiado.
     *
     * @param {number|string}  empleadoId    - Internal ID del empleado
     * @param {string[]}       anterioresIds - IDs previos del multiselect
     * @param {string[]}       nuevosIds     - IDs nuevos del multiselect
     */
    const actualizarAprobadoresPorCambioDeNiveles = (empleadoId, anterioresIds, nuevosIds) => {
        const anterioresSet = new Set(anterioresIds.map(String));
        const nuevosSet     = new Set(nuevosIds.map(String));

        log.debug({
            title: 'EmpleadoService.actualizarAprobadoresPorCambioDeNiveles',
            details: `empleadoId=${empleadoId} | anteriores=${JSON.stringify(anterioresIds)} | nuevos=${JSON.stringify(nuevosIds)}`
        });

        for (const id of anterioresSet) {
            if (!nuevosSet.has(id)) {
                ASNivelesAprobacionOCRepository.removeAprobador(id, empleadoId);
            }
        }

        for (const id of nuevosSet) {
            if (!anterioresSet.has(id)) {
                ASNivelesAprobacionOCRepository.addAprobador(id, empleadoId);
            }
        }
    };

    return {
        obtenerEstructuraNivelesPorSubsidiaria,
        resolverNivelIdsPorSelecciones,
        actualizarAprobadoresPorCambioDeNiveles
    };
});
