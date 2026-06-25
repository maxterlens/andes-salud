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
    './handlers/EmpleadoHandler'
], (EmpleadoHandler) => {

    const beforeSubmit = (context) => {
        try {
            EmpleadoHandler.limpiarNivelAprobacionAlInactivar(context);
        } catch (e) {
            log.error('An error was ocurred in [beforeSubmit]', e);
        }
    }

    const afterSubmit  = (context) => {
        try {
            EmpleadoHandler.sincronizarNivelAprobacionAlCambiar(context);
        } catch (e) {
            log.error('An error was ocurred in [afterSubmit]', e);
        }
    }

    return { beforeSubmit, afterSubmit };
});
