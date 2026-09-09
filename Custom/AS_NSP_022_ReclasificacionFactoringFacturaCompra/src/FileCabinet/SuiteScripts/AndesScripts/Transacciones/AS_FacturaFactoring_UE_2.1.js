/**
 * AS_NSP_022 — Reclasificacion de Factura de Compra a Factoring
 * @description Entry point del User Event sobre la Factura de Compra. Solo rutea:
 *              el hook lo resuelve AS_FacturaFactoringHandler.
 *
 *              beforeLoad → pinta el boton de reclasificacion y, cuando el boton
 *                           recarga la pagina con su marca, valida la factura y
 *                           encola la tarea que crea el diario.
 *
 * @NApiVersion 2.1
 * @NScriptType UserEventScript
 * @NModuleScope Public
 * @scriptid     customscript_as_ue_factura_factoring
 * @deploymentid customdeploy_as_ue_factura_factoring
 * @recordtype   vendorbill
 */
define(['./lib/AS_FactoringConstants', './handlers/AS_FacturaFactoringHandler'],
    (CONSTANTES, facturaFactoringHandler) => {

    const beforeLoad = (context) => {
        try {
            facturaFactoringHandler.construirVista(context);
        } catch (fallo) {
            log.error({
                title  : CONSTANTES.LOGS.ERROR,
                details: 'factura: ' + context.newRecord.id + ' | operacion: vista'
                       + ' | motivo: ' + (fallo.message || fallo),
            });

            throw fallo;
        }
    };

    return { beforeLoad };
});
