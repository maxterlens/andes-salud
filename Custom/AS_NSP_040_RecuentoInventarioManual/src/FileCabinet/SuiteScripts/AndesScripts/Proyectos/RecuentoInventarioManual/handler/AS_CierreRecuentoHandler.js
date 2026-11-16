/**
 * AS_NSP_040 — Recuento de Inventario Manual
 * @description Quien cierra el recuento.
 *
 *              Cada estado tiene su rol:
 *                Iniciado (B)             → Completar recuento: lo ven todos,
 *                                           Farmacia (1370) cuenta y completa.
 *                Aprobacion pendiente (C) → Aprobar y Rechazar: solo
 *                                           ROLES_AUTORIZADOS (Administrador y
 *                                           Supervisor Contable); al resto,
 *                                           Farmacia incluida, se le ocultan.
 *
 *              Los botones se buscan por su id de NetSuite, igual en cualquier
 *              idioma.
 *
 * CHANGELOG v1.2.0 (2026-11-15):
 * - [FEAT] Pasa del AS_NSP_032 al AS_NSP_040 sin cambios de logica: el 032 se retira.
 *
 * @NApiVersion 2.1
 * @NModuleScope Public
 * @author Andes Salud
 * @version 1.2.0
 */
define(['N/runtime', '../constants/AS_RecuentoInventarioManualConstants'], (runtime, CONSTANTES) => {

    // ─────────────────────────────────────────────────────────────────────────
    // Principales
    // ─────────────────────────────────────────────────────────────────────────

    function ocultarAprobarRechazar(form, recuento) {
        if (recuento.getValue({ fieldId: 'statuskey' }) !== CONSTANTES.RECUENTO.ESTADO_PENDIENTE_APROBACION) return;
        if (CONSTANTES.ROLES_AUTORIZADOS.includes(runtime.getCurrentUser().role)) return;
        const botonAprobar  = form.getButton({ id: CONSTANTES.RECUENTO.BOTON_APROBAR });
        const botonRechazar = form.getButton({ id: CONSTANTES.RECUENTO.BOTON_RECHAZAR });
        if (botonAprobar) botonAprobar.isHidden = true;
        if (botonRechazar) botonRechazar.isHidden = true;
    }

    return {
        ocultarAprobarRechazar: ocultarAprobarRechazar,
    };
});
