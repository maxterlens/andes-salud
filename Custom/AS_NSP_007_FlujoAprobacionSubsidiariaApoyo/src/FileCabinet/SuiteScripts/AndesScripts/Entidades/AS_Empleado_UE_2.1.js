/**
 * @NApiVersion 2.1
 * @NScriptType UserEventScript
 * @NModuleScope SameAccount
 *
 * User Event Script — Empleado
 * Gestiona la sublista de niveles de aprobación OC por subsidiaria y
 * sincroniza el campo custentity_as_nivel_aprobacion con los registros
 * customrecord_as_niveles_aprobacion correspondientes.
 *
 * Triggers: beforeLoad / beforeSubmit / afterSubmit (CREATE / EDIT / VIEW)
 */
define([
    './handlers/EmpleadoHandler'
], (EmpleadoHandler) => {

    const beforeLoad = (context) => {
        try {
            EmpleadoHandler.renderizarSublistaDeNivelesAprobacion(context);
        } catch (e) {
            log.error('An error occurred in [beforeLoad]', e);
        }
    };

    const beforeSubmit = (context) => {
        try {
            EmpleadoHandler.procesarNivelesAprobacionAntesDeGuardar(context);
        } catch (e) {
            log.error('An error occurred in [beforeSubmit]', e);
        }
    };

    const afterSubmit = (context) => {
        try {
            EmpleadoHandler.sincronizarAprobadoresEnNivelesAprobacion(context);
        } catch (e) {
            log.error('An error occurred in [afterSubmit]', e);
        }
    };

    return { beforeLoad, beforeSubmit, afterSubmit };
});
