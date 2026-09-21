/**
 * AS_NSP_022 — Reclasificacion de Factura de Compra a Factoring
 * @NApiVersion 2.1
 * @NScriptType UserEventScript
 * @NModuleScope Public
 * @scriptid     customscript_as_ue_factura_factoring
 * @deploymentid customdeploy_as_ue_factura_factoring
 * @recordtype   vendorbill
 */
define(['./lib/AS_FactoringConstants', './handlers/AS_FacturaFactoringHandler', './handlers/FacturaCompraHandler'],
    (CONSTANTES, facturaFactoringHandler, facturaCompraHandler) => {

    const beforeLoad = (context) => {
        try {
            facturaFactoringHandler.construirVista(context);
            facturaCompraHandler.manejarAlertaFacturaPagada(context);
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
