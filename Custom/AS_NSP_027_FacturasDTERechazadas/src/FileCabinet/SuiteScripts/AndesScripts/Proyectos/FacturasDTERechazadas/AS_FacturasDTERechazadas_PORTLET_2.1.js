/**
 * AS_NSP_025 — Facturas DTE Rechazadas
 * @description Entry point del portlet. Llama al handler y registra el error; el
 *              armado del portlet vive en AS_FacturasDTERechazadasPortletHandler.
 *
 *              No se re-lanza el error: si el conteo falla, el portlet queda vacio
 *              en vez de tumbar el resto del dashboard del usuario.
 *
 * @NApiVersion 2.1
 * @NScriptType Portlet
 * @NScriptPortletType html
 * @NModuleScope Public
 * @scriptid     customscript_as_portlet_dte_rechazadas
 * @deploymentid customdeploy_as_portlet_dte_rechazadas
 */
define(['./lib/AS_FacturasDTERechazadasConstants', './handlers/AS_FacturasDTERechazadasPortletHandler'],
    (CONSTANTES, portletHandler) => {

    function render(params) {
        try {
            portletHandler.renderizarPortlet(params);
        } catch (fallo) {
            log.error({
                title  : CONSTANTES.LOGS.ERROR,
                details: 'portlet Facturas DTE Rechazadas | motivo: ' + (fallo.message || fallo),
            });
        }
    }

    return { render };
});
