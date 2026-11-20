/**
 * AS_NSP_036 — Nomina de Reembolso al Cliente
 * @description Entry point del User Event sobre la nomina. Solo rutea:
 *
 *              beforeLoad → AS_VistaHandler: la ficha Detalle y el boton
 *                           Descargar TXT.
 *
 * @NApiVersion 2.1
 * @NScriptType UserEventScript
 * @NModuleScope Public
 * @scriptid     customscript_as_nom_reemb_vista_ue
 * @deploymentid customdeploy_as_nom_reemb_vista_ue
 * @recordtype   customrecord_as_nom_reemb
 * @author Andes Salud
 * @version 1.0.1
 *
 */
define(['./handler/AS_VistaHandler'],
    (vistaHandler) => {

    function beforeLoad(context) {
        try {
            vistaHandler.agregarDetalleYBotonTxt(context);
        } catch (fallo) {
            log.error({
                title  : 'NOMINA REEMBOLSO ERROR',
                details: 'nomina: ' + context.newRecord.id + ' | operacion: vista'
                       + ' | motivo: ' + (fallo.message || fallo),
            });

            throw fallo;
        }
    }

    return { beforeLoad };
});
