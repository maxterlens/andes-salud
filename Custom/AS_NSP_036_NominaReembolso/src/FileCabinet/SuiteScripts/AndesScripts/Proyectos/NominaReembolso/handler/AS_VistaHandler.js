/**
 * AS_NSP_036 — Nomina de Reembolso al Cliente
 * @description Proceso de la vista de la nomina (User Event beforeLoad).
 *
 *              construirVista → al ver la nomina lee sus reembolsos y se los
 *                               pasa a AS_VistaForm, que pinta la ficha
 *                               Detalle y el boton Descargar TXT. El boton
 *                               siempre se ve: el archivo se puede volver a
 *                               bajar las veces que haga falta.
 *
 * CHANGELOG v1.1.0 (2026-11-11):
 * - [FEAT] Lee los reembolsos de la nomina para la ficha Detalle.
 *
 * CHANGELOG v1.0.0 (2026-11-11):
 * - [FEAT] construirVista.
 *
 * @NApiVersion 2.1
 * @NModuleScope Public
 * @author Andes Salud
 * @version 1.1.0
 *
 */
define(['../data/search/AS_NominaReembolsoSearch', '../form/AS_VistaForm'],
    (nominaSearch, vistaForm) => {

    // ─────────────────────────────────────────────────────────────────────────
    // Principales
    // ─────────────────────────────────────────────────────────────────────────

    function construirVista(context) {
        if (context.type !== context.UserEventType.VIEW) return;
        const reembolsos = nominaSearch.buscarReembolsosNomina(context.newRecord.id);
        vistaForm.ajustarVista(context.form, reembolsos);
    }

    return {
        construirVista: construirVista,
    };
});
