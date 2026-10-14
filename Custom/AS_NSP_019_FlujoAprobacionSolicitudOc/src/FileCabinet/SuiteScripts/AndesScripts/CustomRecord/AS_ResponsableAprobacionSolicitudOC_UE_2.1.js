/**
 * @NApiVersion 2.1
 * @NScriptType UserEventScript
 * @NModuleScope SameAccount
 *
 * AS_ResponsableAprobacionSolicitudOC_UE_2.1.js
 * User Event de customrecord_as_respon_aprob_soli_oc (AS_NSP_019).
 * Agrega el listado de Departamentos filtrado por Subsidiaria.
 */
define(['N/ui/serverWidget', './handlers/ASResponsableAprobacionSoliOCHandler'],
    (serverWidget, ASResponsableAprobacionSoliOCHandler) => {

        const beforeLoad = (context) => {
            try {
                ASResponsableAprobacionSoliOCHandler.agregarCampoDepartamento(context, serverWidget);
            } catch (e) {
                log.error({ title: 'AS_ResponsableAprobacionSolicitudOC_UE - beforeLoad', details: `${e.name}: ${e.message}` });
            }
        };

        return { beforeLoad };
    }
);
