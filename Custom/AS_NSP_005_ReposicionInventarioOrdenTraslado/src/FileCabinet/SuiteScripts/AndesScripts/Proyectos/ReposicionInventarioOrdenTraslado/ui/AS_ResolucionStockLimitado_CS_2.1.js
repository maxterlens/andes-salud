/**
 * AS_NSP_005 — Reposición de Inventario por Orden de Traslado (módulo M2)
 * @description Client Script adjunto a los formularios del Suitelet de Resolución de
 *              Stock Limitado. La recalculación en vivo de los totales "Asignado" por
 *              ítem (dentro de la grilla de resolución) NO se maneja aquí: esos inputs
 *              viven dentro de un bloque custpage addField(INLINEHTML) y no son un
 *              sublist nativo, por lo que no disparan eventos fieldChanged de NetSuite.
 *              Esa recalculación va embebida como <script> dentro del propio HTML que
 *              genera ui/forms/ResolucionStockLimitadoForm.js.
 *              Este Client Script se ocupa únicamente de la navegación entre pantallas
 *              a través de los botones nativos que no son el submit principal.
 *
 * @NApiVersion 2.1
 * @NScriptType ClientScript
 * @NModuleScope Public
 */
define(['N/url'], (url) => {

    const SCRIPT_ID     = 'customscript_as_res_stock_limit_sl';
    const DEPLOYMENT_ID = 'customdeploy_as_res_stock_limit_sl';

    /* ─────────────────────────────────────────────────────────────────── */
    /*  pageInit — Se ejecuta al cargar cualquiera de los 3 formularios    */
    /* ─────────────────────────────────────────────────────────────────── */
    function pageInit(scriptContext) {
        // TODO: agregar lógica de inicialización adicional si se requiere.
    }

    /* ─────────────────────────────────────────────────────────────────── */
    /*  Botón "Cancelar" — pantalla de Resolución → vuelve a la pantalla   */
    /*  inicial sin crear nada ni recalcular.                              */
    /* ─────────────────────────────────────────────────────────────────── */
    function cancelar() {
        window.location.href = url.resolveScript({
            scriptId    : SCRIPT_ID,
            deploymentId: DEPLOYMENT_ID,
            params      : { view: 'landing' }
        });
    }

    /* ─────────────────────────────────────────────────────────────────── */
    /*  Botón "Buscar Nuevamente" — pantalla de Resultados → vuelve a la   */
    /*  pantalla inicial.                                                   */
    /* ─────────────────────────────────────────────────────────────────── */
    function buscarNuevamente() {
        window.location.href = url.resolveScript({
            scriptId    : SCRIPT_ID,
            deploymentId: DEPLOYMENT_ID,
            params      : { view: 'landing' }
        });
    }

    return {
        pageInit,
        cancelar,
        buscarNuevamente
    };
});
