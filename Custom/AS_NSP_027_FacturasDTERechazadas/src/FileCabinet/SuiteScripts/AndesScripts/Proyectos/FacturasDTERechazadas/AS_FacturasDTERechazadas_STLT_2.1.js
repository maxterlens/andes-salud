/**
 * AS_NSP_025 — Facturas DTE Rechazadas
 * @description Bandeja de consulta y seguimiento manual de los rechazos copiados
 *              a customrecord_as_dte_rechazado. POST registra avisos al proveedor.
 *
 *              El catch es el unico lugar que emite FACTURAS DTE RECHAZADAS ERROR:
 *              por aqui entra todo, asi que cualquier fallo sale con el motivo, sin
 *              que el handler loguee nada de eso.
 *
 * @NApiVersion 2.1
 * @NScriptType Suitelet
 * @NModuleScope Public
 * @scriptid     customscript_as_stlt_dte_rechazadas
 * @deploymentid customdeploy_as_stlt_dte_rechazadas
 */
define(['./lib/AS_FacturasDTERechazadasConstants', './handlers/AS_FacturasDTERechazadasBandejaHandler'],
    (CONSTANTES, bandejaHandler) => {

    function onRequest(context) {
        try {
            if (context.request.method === 'POST') {
                bandejaHandler.registrarAvisos(context);
            } else {
                bandejaHandler.renderizarBandeja(context);
            }
        } catch (fallo) {
            log.error({
                title  : CONSTANTES.LOGS.ERROR,
                details: 'motivo: ' + (fallo.message || fallo),
            });

            throw fallo;
        }
    }

    return { onRequest };
});
