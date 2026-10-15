/**
 * AS_NSP_032 — Carga de Recuento de Inventario
 * @description Quien cierra el recuento.
 *
 *              ocultarCompletarRecuento → oculta el boton Completar recuento a
 *                                         todo rol fuera de ROLES_AUTORIZADOS
 *                                         (Administrador y Supervisor Contable).
 *
 *              El boton se busca por su id de NetSuite, igual en cualquier
 *              idioma.
 * @NApiVersion 2.1
 * @NModuleScope Public
 * @author Andes Salud
 * @version 1.1.0
 *
 */
define(['N/runtime', '../constants/AS_RecuentoInventarioConstants'], (runtime, CONSTANTES) => {

    // ─────────────────────────────────────────────────────────────────────────
    // Principales
    // ─────────────────────────────────────────────────────────────────────────

    function ocultarCompletarRecuento(form) {
        if (CONSTANTES.ROLES_AUTORIZADOS.includes(runtime.getCurrentUser().role)) return;
        const boton = form.getButton({ id: CONSTANTES.RECUENTO.BOTON_COMPLETAR });
        if (boton) boton.isHidden = true;
    }

    return {
        ocultarCompletarRecuento: ocultarCompletarRecuento,
    };
});
