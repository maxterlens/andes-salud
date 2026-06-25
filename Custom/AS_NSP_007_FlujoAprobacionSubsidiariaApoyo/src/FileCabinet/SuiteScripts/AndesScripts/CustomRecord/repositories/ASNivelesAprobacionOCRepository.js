/**
 * @NApiVersion 2.1
 * @NModuleScope SameAccount
 *
 * Repositorio para customrecord_as_niveles_aprobacion.
 * Gestiona el campo MULTISELECT custrecord_as_nivel_aprb_aprobadores.
 */
define(['N/record', 'N/search', 'N/log'], (record, search, log) => {

    const RECORD_TYPE       = 'customrecord_as_niveles_aprobacion';
    const FIELD_APROBADORES = 'custrecord_as_nivel_aprb_aprobadores';
    const FIELD_SUBSIDIARIA = 'custrecord_as_nivel_aprb_subsidiaria';
    const FIELD_GRUPO       = 'custrecord_as_nivel_aprb_grupo_aprobacio';

    /**
     * Agrega un empleado al campo aprobadores de un nivel de aprobación.
     * No duplica si el empleado ya existe en la lista.
     * @param {number|string} nivelId  - Internal ID del customrecord
     * @param {number|string} empleadoId - Internal ID del empleado
     */
    const addAprobador = (nivelId, empleadoId) => {
        const nivelRecord = record.load({ type: RECORD_TYPE, id: nivelId });
        const aprobadores = nivelRecord.getValue({ fieldId: FIELD_APROBADORES }) || [];
        const empleadoIdStr = empleadoId;

        if (aprobadores.includes(empleadoIdStr)) {
            log.error({
                title: 'ASNivelesAprobacionOCRepository.addAprobador',
                details: `Empleado ${empleadoId} ya existe en nivel ${nivelId}, sin cambios.`
            });
            return;
        }

        aprobadores.push(empleadoIdStr);
        nivelRecord.setValue({ fieldId: FIELD_APROBADORES, value: aprobadores });
        nivelRecord.save();

        log.error({
            title: 'ASNivelesAprobacionOCRepository.addAprobador',
            details: `Empleado ${empleadoId} agregado al nivel ${nivelId}.`
        });
    };

    /**
     * Remueve un empleado del campo aprobadores de un nivel de aprobación.
     * No falla si el empleado no está en la lista.
     * @param {number|string} nivelId  - Internal ID del customrecord
     * @param {number|string} empleadoId - Internal ID del empleado
     */
    const removeAprobador = (nivelId, empleadoId) => {
        const nivelRecord = record.load({ type: RECORD_TYPE, id: nivelId });
        const aprobadores = nivelRecord.getValue({ fieldId: FIELD_APROBADORES }) || [];
        const empleadoIdStr = empleadoId;
        const aprobadoresFiltrados = aprobadores.filter(id => id != empleadoIdStr);

        if (aprobadoresFiltrados.length === aprobadores.length) {
            log.error({
                title: 'ASNivelesAprobacionOCRepository.removeAprobador',
                details: `Empleado ${empleadoId} no encontrado en nivel ${nivelId}, sin cambios.`
            });
            return;
        }

        nivelRecord.setValue({ fieldId: FIELD_APROBADORES, value: aprobadoresFiltrados });
        nivelRecord.save();

        log.error({
            title: 'ASNivelesAprobacionOCRepository.removeAprobador',
            details: `Empleado ${empleadoId} removido del nivel ${nivelId}.`
        });
    };

    /**
     * Devuelve todos los registros activos de niveles de aprobación con
     * sus campos de subsidiaria y grupo de aprobación.
     *
     * @returns {Array<{ id: string, subsidiariaId: string, subsidiariaNombre: string, grupoId: string, grupoNombre: string }>}
     */
    const obtenerTodosActivos = () => {
        const resultados = [];

        search.create({
            type: RECORD_TYPE,
            filters: [['isinactive', 'is', false]],
            columns: [
                search.createColumn({ name: FIELD_SUBSIDIARIA }),
                search.createColumn({ name: FIELD_GRUPO })
            ]
        }).run().each((result) => {
            resultados.push({
                id:                result.id,
                subsidiariaId:     result.getValue({ name: FIELD_SUBSIDIARIA }),
                subsidiariaNombre: result.getText({ name: FIELD_SUBSIDIARIA }),
                grupoId:           result.getValue({ name: FIELD_GRUPO }),
                grupoNombre:       result.getText({ name: FIELD_GRUPO })
            });
            return true;
        });

        return resultados;
    };

    return { addAprobador, removeAprobador, obtenerTodosActivos };
});
