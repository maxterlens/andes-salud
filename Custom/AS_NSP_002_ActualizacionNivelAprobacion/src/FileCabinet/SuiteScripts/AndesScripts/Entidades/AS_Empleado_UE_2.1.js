/**
 * @NApiVersion 2.1
 * @NScriptType UserEventScript
 * @NModuleScope SameAccount
 *
 * User Event Script — Empleado
 * Detecta cambios en custentity_as_nivel_aprobacion y actualiza el record
 * customrecord_as_niveles_aprobacion correspondiente.
 *
 * Triggers: beforeSubmit / afterSubmit (CREATE / EDIT)
 */
define([
    './services/EmpleadoService',
    'N/log'
], (EmpleadoService, log) => {

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
    const beforeSubmit = (context) => {
        try {
            const { newRecord, oldRecord, type, UserEventType } = context;

            if (type === UserEventType.DELETE) return;

            const esInactivo = newRecord.getValue({ fieldId: FIELD_ISINACTIVE }) === true;

            // En CREATE: inactivo desde el inicio
            // En EDIT: transición activo → inactivo
            const debeControlar =
                type == UserEventType.CREATE || type == UserEventType.COPY
                    ? esInactivo
                    : esInactivo && oldRecord.getValue({ fieldId: FIELD_ISINACTIVE }) === false;

            if (!debeControlar) return;

            const nivelActual = newRecord.getValue({ fieldId: FIELD_NIVEL_APROBACION });
            if (!nivelActual) return;

            newRecord.setValue({ fieldId: FIELD_NIVEL_APROBACION, value: '' });

            log.error({
                title: 'AS_Empleado_UE_2.1 | beforeSubmit',
                details: `Empleado inactivo (${type}). Campo ${FIELD_NIVEL_APROBACION} limpiado (era ${nivelActual}).`
            });

        } catch (e) {
            log.error({
                title: 'AS_Empleado_UE_2.1 | beforeSubmit',
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
    const afterSubmit = (context) => {
        try {
            const { newRecord, oldRecord, type, UserEventType } = context;

            if (type === UserEventType.DELETE) return;

            const nivelNuevo    = newRecord.getValue({ fieldId: FIELD_NIVEL_APROBACION });
            const nivelAnterior = oldRecord ? oldRecord.getValue({ fieldId: FIELD_NIVEL_APROBACION }) : null;

            // Sin cambio, nada que hacer
            if ((nivelAnterior || '') === (nivelNuevo || '')) return;

            const empleadoId = newRecord.id;
            EmpleadoService.actualizarNivelAprobacion(empleadoId, nivelAnterior, nivelNuevo);

        } catch (e) {
            log.error({
                title: 'AS_Empleado_UE_2.1 | afterSubmit',
                details: JSON.stringify({ message: e.message, stack: e.stack })
            });
            throw e;
        }
    };

    return { beforeSubmit, afterSubmit };
});
