/**
 * @NApiVersion 2.1
 * @NScriptType UserEventScript
 * @NModuleScope SameAccount
 *
 * AS_NSP_029 - AS Configuración Impresión Cheque (customrecord_as_config_cheque)
 * ─────────────────────────────────────────────────────────────────────────────
 * beforeSubmit: impide guardar una configuración predeterminada si otra configuración
 * activa ya es predeterminada para alguna de sus subsidiarias.
 */
define(['./services/ConfiguracionChequeService'], (ConfiguracionChequeService) => {

    const beforeSubmit = (context) => {
        const { type, UserEventType } = context;
        if (![UserEventType.CREATE, UserEventType.EDIT, UserEventType.XEDIT, UserEventType.COPY].includes(type)) return;

        // Los errores de validación se propagan para que NetSuite no guarde el registro
        const config = ConfiguracionChequeService.leerDesdeContexto(context);
        ConfiguracionChequeService.validarPredeterminada(config);
    };

    return { beforeSubmit };
});
