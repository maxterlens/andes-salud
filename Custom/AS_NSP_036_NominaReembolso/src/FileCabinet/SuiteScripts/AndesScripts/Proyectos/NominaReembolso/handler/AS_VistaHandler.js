/**
 * AS_NSP_036 — Nomina de Reembolso al Cliente
 * @description Proceso de la vista de la nomina (User Event beforeLoad).
 *
 *              agregarDetalleYBotonTxt → al ver la nomina lee sus reembolsos
 *                               y devoluciones y se los pasa a AS_VistaForm,
 *                               que pinta la ficha Detalle y el boton
 *                               Descargar TXT. El boton siempre se ve: el
 *                               archivo se puede volver a bajar las veces
 *                               que haga falta.
 *
 * @NApiVersion 2.1
 * @NModuleScope Public
 * @author Andes Salud
 * @version 1.2.0
 *
 */
define(['../data/search/AS_NominaReembolsoSearch', '../data/query/AS_NominaReembolsoQuery', '../form/AS_VistaForm'],
    (nominaSearch, nominaQuery, vistaForm) => {

    // ─────────────────────────────────────────────────────────────────────────
    // Principales
    // ─────────────────────────────────────────────────────────────────────────

    function agregarDetalleYBotonTxt(context) {
        if (context.type !== context.UserEventType.VIEW) return;
        const reembolsos   = nominaSearch.buscarReembolsosNomina(context.newRecord.id);
        const devoluciones = nominaQuery.buscarDevolucionesNomina(context.newRecord.id);
        vistaForm.ajustarVista(context.form, reembolsos.concat(devoluciones));
    }

    return {
        agregarDetalleYBotonTxt: agregarDetalleYBotonTxt,
    };
});
