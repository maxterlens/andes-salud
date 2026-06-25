/**
 * @NApiVersion 2.1
 * @NModuleScope SameAccount
 *
 * Handler de eventos para el record Empleado.
 * Contiene la lógica de los eventos beforeSubmit y afterSubmit del
 * UserEventScript AS_Empleado_UE_2.1.js.
 */
define([
    '../services/EmpleadoService'
], (log, EmpleadoService) => {

    const FIELD_NIVEL_APROBACION = 'custentity_as_nivel_aprobacion';
    const FIELD_ISINACTIVE       = 'isinactive';

    /**
     * Al inactivar el empleado, limpia custentity_as_nivel_aprobacion antes
     * de guardar. El afterSubmit detectará el cambio valor → vacío y ejecutará
     * la remoción del registro de nivel de aprobación automáticamente.
     *
     * @param {Object} context
     * @param {Record} context.newRecord
     * @param {Record} context.oldRecord
     * @param {string} context.type
     */
    const limpiarNivelAprobacionAlInactivar = (context) => {
        try {
            const { newRecord, oldRecord, type, UserEventType } = context;

            if (type === UserEventType.DELETE) return;

            const esInactivo = newRecord.getValue({ fieldId: 'isinactive' }) === true;

            const debeControlar =
                type == UserEventType.CREATE || type == UserEventType.COPY
                    ? esInactivo
                    : esInactivo && oldRecord.getValue({ fieldId: 'isinactive' }) === false;

            if (!debeControlar) return;

            const nivelActual = newRecord.getValue({ fieldId: 'custentity_as_nivel_aprobacion' });
            if (!nivelActual) return;

            newRecord.setValue({ fieldId: 'custentity_as_nivel_aprobacion', value: '' });

            log.error({
                title: 'AS_Empleado_UE_2.1 | limpiarNivelAprobacionAlInactivar',
                details: `Empleado inactivo (${type}). Campo ${FIELD_NIVEL_APROBACION} limpiado (era ${nivelActual}).`
            });

        } catch (e) {
            log.error({
                title: 'AS_Empleado_UE_2.1 | limpiarNivelAprobacionAlInactivar',
                details: JSON.stringify({ message: e.message, stack: e.stack })
            });
            throw e;
        }
    };

    /**
     * Detecta cambios en custentity_as_nivel_aprobacion y delega al servicio.
     * También captura el caso de inactivación, ya que beforeSubmit habrá
     * limpiado el campo antes del guardado.
     *
     * @param {Object} context
     * @param {Record} context.newRecord
     * @param {Record} context.oldRecord
     * @param {string} context.type
     */
    const sincronizarNivelAprobacionAlCambiar = (context) => {
        try {
            const { newRecord, oldRecord, type, UserEventType } = context;

            if (type === UserEventType.DELETE) return;

            const nivelNuevo    = newRecord.getValue({ fieldId: 'custentity_as_nivel_aprobacion' });
            const nivelAnterior = oldRecord ? oldRecord.getValue({ fieldId: 'custentity_as_nivel_aprobacion' }) : null;

            if ((nivelAnterior || '') === (nivelNuevo || '')) return;

            EmpleadoService.actualizarNivelAprobacion(newRecord.id, nivelAnterior, nivelNuevo);

        } catch (e) {
            log.error({
                title: 'AS_Empleado_UE_2.1 | sincronizarNivelAprobacionAlCambiar',
                details: JSON.stringify({ message: e.message, stack: e.stack })
            });
            throw e;
        }
    };

    return { limpiarNivelAprobacionAlInactivar, sincronizarNivelAprobacionAlCambiar };
});
