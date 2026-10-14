/**
 * AS_NSP_032 — Carga de Recuento de Inventario
 * @description Funciones genericas del modulo, sin negocio.
 * @NApiVersion 2.1
 * @NModuleScope Public
 * @author Andes Salud
 * @version 1.0.0
 *
 * CHANGELOG v1.0.0 (2026-10-13):
 *   - [FEAT] pasarAMayusculasSinEspaciosExtra.
 */
define([], () => {

    // ─────────────────────────────────────────────────────────────────────────
    // Principales
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * 'Sonda  versaflex ' → 'SONDA VERSAFLEX': para comparar nombres escritos a
     * mano contra los de NetSuite.
     */
    function pasarAMayusculasSinEspaciosExtra(texto) {
        return String(texto || '').trim().replace(/\s+/g, ' ').toUpperCase();
    }

    return {
        pasarAMayusculasSinEspaciosExtra: pasarAMayusculasSinEspaciosExtra,
    };
});
