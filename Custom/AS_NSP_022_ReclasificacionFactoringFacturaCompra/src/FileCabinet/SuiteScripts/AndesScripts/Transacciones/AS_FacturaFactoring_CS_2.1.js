/**
 * AS_NSP_022 — Reclasificacion de Factura de Compra a Factoring
 * @description Lo unico que hace el boton: recargar la misma factura con la marca
 *              que el User Event lee para encolar la reclasificacion. Toda la
 *              decision vive del lado del servidor.
 *
 * @NApiVersion 2.1
 * @NScriptType ClientScript
 * @NModuleScope Public
 */
define(['./lib/AS_FactoringConstants'],
    (CONSTANTES) => {

    const pageInit = () => {
    };

    const reclasificarFactoring = () => {
        const boton = document.getElementById(CONSTANTES.BOTON.ID);

        if (boton) {
            boton.disabled = true;
        }

        const marca = CONSTANTES.BOTON.PARAMETRO + '=' + CONSTANTES.BOTON.MARCA;

        window.location.href = window.location.href.split('&' + marca).join('') + '&' + marca;
    };

    return {
        pageInit             : pageInit,
        reclasificarFactoring: reclasificarFactoring,
    };
});
