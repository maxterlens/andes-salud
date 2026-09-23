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

    /* ─────────────────────────────────────────────────────────────────── */
    /*  Botón "Ver Historial de Resoluciones" — pantalla inicial → va      */
    /*  directo a la vista de Resultados (historial completo), sin pasar   */
    /*  por Buscar/Confirmar.                                              */
    /* ─────────────────────────────────────────────────────────────────── */
    function verResultados() {
        window.location.href = url.resolveScript({
            scriptId    : SCRIPT_ID,
            deploymentId: DEPLOYMENT_ID,
            params      : { view: 'resultados' }
        });
    }

    /* ─────────────────────────────────────────────────────────────────── */
    /*  Botón "Poner todo en 0" — pantalla de Resolución → fija en 0 todas */
    /*  las cantidades a enviar de la grilla.                              */
    /*  Botón "Usar Cantidad Sugerida" — restaura en cada input el valor   */
    /*  sugerido original (guardado en data-sugerido al renderizar).       */
    /*  En ambos casos se refresca el saldo "Asignado" de cada ítem con    */
    /*  window.asrslRecalcTodos, expuesta por el <script> embebido en la   */
    /*  grilla (ui/forms/ResolucionStockLimitadoForm.js) — esa función vive */
    /*  ahí porque ya conoce el detalle de cómo se calcula cada saldo.      */
    /* ─────────────────────────────────────────────────────────────────── */
    function ponerTodoEnCero() {
        document.querySelectorAll('.asrsl-qty-input').forEach(function(inp) {
            inp.value = 0;
        });
        if (typeof window.asrslRecalcTodos === 'function') window.asrslRecalcTodos();
    }

    function ponerCantidadSugerida() {
        document.querySelectorAll('.asrsl-qty-input').forEach(function(inp) {
            inp.value = inp.getAttribute('data-sugerido') || 0;
        });
        if (typeof window.asrslRecalcTodos === 'function') window.asrslRecalcTodos();
    }

    return {
        pageInit,
        cancelar,
        buscarNuevamente,
        verResultados,
        ponerTodoEnCero,
        ponerCantidadSugerida
    };
});
