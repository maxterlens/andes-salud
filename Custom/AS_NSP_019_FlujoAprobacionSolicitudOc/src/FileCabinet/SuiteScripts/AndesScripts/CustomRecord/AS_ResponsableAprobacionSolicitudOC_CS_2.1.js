/**
 * @NApiVersion 2.1
 * @NScriptType ClientScript
 * @NModuleScope SameAccount
 *
 * AS_ResponsableAprobacionSolicitudOC_CS_2.1.js
 * Client Script de customrecord_as_respon_aprob_soli_oc (AS_NSP_019).
 * Repuebla Departamentos según Subsidiaria y valida el registro al guardar.
 */
define(['N/ui/dialog', './handlers/ASResponsableAprobacionSoliOCHandler'],
    (dialog, ASResponsableAprobacionSoliOCHandler) => {

        const { CAMPOS } = ASResponsableAprobacionSoliOCHandler;

        const fieldChanged = (context) => {
            try {
                if (context.fieldId === CAMPOS.SUBSIDIARIA) {
                    ASResponsableAprobacionSoliOCHandler.repoblarDepartamentos(context);
                } else if (context.fieldId === CAMPOS.DEPARTAMENTO_UI) {
                    ASResponsableAprobacionSoliOCHandler.sincronizarDepartamento(context);
                }
            } catch (e) {
                console.error('AS_ResponsableAprobacionSolicitudOC_CS - fieldChanged', e);
            }
        };

        const saveRecord = (context) => {
            ASResponsableAprobacionSoliOCHandler.sincronizarDepartamento(context);

            return ASResponsableAprobacionSoliOCHandler.validarCamposObligatorios(context, dialog)
                && ASResponsableAprobacionSoliOCHandler.validarCombinacionDuplicada(context, dialog);
        };

        return { fieldChanged, saveRecord };
    }
);
