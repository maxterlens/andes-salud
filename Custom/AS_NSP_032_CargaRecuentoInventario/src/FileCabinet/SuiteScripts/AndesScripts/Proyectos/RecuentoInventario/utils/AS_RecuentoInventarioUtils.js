/**
 * AS_NSP_032 — Carga de Recuento de Inventario
 * @description Funciones genericas del modulo, sin negocio.
 * @NApiVersion 2.1
 * @NModuleScope Public
 * @author Andes Salud
 * @version 1.0.0
 */
define([], () => {

    // ─────────────────────────────────────────────────────────────────────────
    // Principales
    // ─────────────────────────────────────────────────────────────────────────

    function pasarAMayusculasSinEspaciosExtra(texto) {
        return String(texto || '').trim().replace(/\s+/g, ' ').toUpperCase();
    }

    return {
        pasarAMayusculasSinEspaciosExtra: pasarAMayusculasSinEspaciosExtra,
    };
});
