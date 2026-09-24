/**
 * AS_NSP_025 — Facturas DTE Rechazadas
 * @description Muestra los rechazos pendientes de aviso en una tarjeta con acceso
 *              directo a la bandeja filtrada.
 *
 * @NApiVersion 2.1
 * @NModuleScope Public
 */
define(['N/url', '../lib/AS_FacturasDTERechazadasConstants', '../repositories/AS_FacturasDTERechazadasRepository'],
    (url, CONSTANTES, repository) => {

    function renderizarPortlet(params) {
        const total   = repository.contarPendientes();
        const portlet = params.portlet;
        const destino = construirUrlBandeja().replace(/&/g, '&amp;');

        portlet.title = 'Facturas DTE Rechazadas';
        portlet.html = '<a href="' + destino + '" target="_top" style="display:block;text-decoration:none;'
            + 'font-family:Arial,sans-serif;color:#24364b;">'
            + '<div style="border:1px solid #d8e2ed;border-radius:10px;background:#f7faff;'
            + 'padding:16px 18px;">'
            + '<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;">'
            + '<div><div style="font-size:14px;font-weight:bold;">Pendientes de aviso</div>'
            + '<div style="font-size:12px;color:#66788a;margin-top:5px;">DTE rechazados por revisar</div></div>'
            + '<span style="display:inline-block;min-width:38px;padding:8px 10px;border-radius:24px;'
            + 'background:#b54708;color:#fff;text-align:center;font-size:22px;font-weight:bold;">'
            + total + '</span></div>'
            + '<div style="font-size:12px;color:#2b618b;margin-top:16px;font-weight:bold;">'
            + 'Ver bandeja de pendientes &rsaquo;</div>'
            + '</div></a>';
    }

    function construirUrlBandeja() {
        return url.resolveScript({
            scriptId         : CONSTANTES.SUITELET.SCRIPT,
            deploymentId     : CONSTANTES.SUITELET.DEPLOYMENT,
            params           : { custpage_seguimiento: 'pendiente' },
            returnExternalUrl: false,
        });
    }

    return {
        renderizarPortlet: renderizarPortlet,
    };
});
