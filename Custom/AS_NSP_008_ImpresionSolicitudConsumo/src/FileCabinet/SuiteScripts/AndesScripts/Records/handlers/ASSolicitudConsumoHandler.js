/**
 * @NApiVersion 2.1
 * @NModuleScope SameAccount
 * @file ASSolicitudConsumoHandler.js
 * @description Handler del User Event para Solicitud de Consumo.
 *              Contiene la lógica de cada hook del UE, separada del entry point.
 */
define(['N/ui/serverWidget', 'N/runtime', 'N/redirect'], (serverWidget, runtime, redirect) => {

    // ─────────────────────────────────────────────────────────────────────────
    // Constantes
    // ─────────────────────────────────────────────────────────────────────────

    /** Client Script para modo VIEW (botón de impresión) */
    const CS_ACTION_BUTTONS = '../clients/AS_ActionButtons_CLNT_2.1.js';

    const ROLE_CENTRO_EMPLEADOS          = 15;
    const STLT_SOLICITUD_CONSUMO_SCRIPT  = 'customscript_as_solicitud_consumo_stlt';
    const STLT_SOLICITUD_CONSUMO_DEPLOY  = 'customdeploy_as_solicitud_consumo_stlt';

    // ─────────────────────────────────────────────────────────────────────────
    // beforeLoad — todos los modos
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Si el usuario tiene el rol Centro de Empleados (ID 15), redirige al
     * Suitelet de Solicitud de Consumo con los parámetros de operación:
     *   CREATE → op=create
     *   VIEW   → op=view&recid={id}
     *   EDIT   → op=edit&recid={id}
     * @param {Object} context
     */
    const redirigirSuiteletSolicitudConsumo = (context) => {
        const { type, newRecord } = context;
        const { CREATE, VIEW, EDIT } = context.UserEventType;

        if (![CREATE, VIEW, EDIT].includes(type)) return;

        const userRole = runtime.getCurrentUser().role;
        if (userRole !== ROLE_CENTRO_EMPLEADOS) return;

        const params = { op: type };
        if (type === VIEW || type === EDIT) params.recid = newRecord.id;
        log.error('params', params);
        redirect.toSuitelet({
            scriptId:     STLT_SOLICITUD_CONSUMO_SCRIPT,
            deploymentId: STLT_SOLICITUD_CONSUMO_DEPLOY,
            parameters:   params
        });
    };

    // ─────────────────────────────────────────────────────────────────────────
    // beforeLoad — solo VIEW
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Agrega el botón "Impresión PDF" al formulario.
     * Solo actúa en modo VIEW.
     * @param {Object} context
     */
    const agregarBotonImpresion = (context) => {
        const { form, type } = context;

        if (type !== context.UserEventType.VIEW) return;

        form.addButton({
            id:           'custpage_btn_impresion',
            label:        'Impresion Solicitud',
            functionName: 'imprimirSolicitudConsumo'
        });
        form.clientScriptModulePath = CS_ACTION_BUTTONS;        
    };

    // ─────────────────────────────────────────────────────────────────────────
    // Exports
    // ─────────────────────────────────────────────────────────────────────────

    return {
        redirigirSuiteletSolicitudConsumo,
        agregarBotonImpresion
    };
});
