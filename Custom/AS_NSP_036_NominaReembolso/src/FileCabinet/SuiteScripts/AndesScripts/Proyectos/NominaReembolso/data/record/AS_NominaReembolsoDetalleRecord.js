/**
 * AS_NSP_036 — Nomina de Reembolso al Cliente
 * @description Crea el detalle AS Nomina Reembolso Detalle
 *              (customrecord_as_nom_reemb_det): una linea por reembolso. Tener
 *              un detalle es lo que saca al reembolso de la lista de pendientes.
 *
 * CHANGELOG v1.0.0 (2026-11-10):
 * - [FEAT] crearDetalles.
 *
 * @NApiVersion 2.1
 * @NModuleScope Public
 * @author Andes Salud
 * @version 1.0.0
 *
 */
define(['N/record', '../../constants/AS_NominaReembolsoConstants'],
    (record, CONSTANTES) => {

    // ─────────────────────────────────────────────────────────────────────────
    // Principales
    // ─────────────────────────────────────────────────────────────────────────

    function crearDetalles(nominaId, reembolsos) {
        const campos = CONSTANTES.DETALLE.CAMPOS;

        reembolsos.forEach((reembolso) => {
            const detalle = record.create({ type: CONSTANTES.DETALLE.TIPO });
            detalle.setValue({ fieldId: campos.NOMINA,      value: nominaId });
            detalle.setValue({ fieldId: campos.TRANSACCION, value: reembolso.id });
            detalle.setValue({ fieldId: campos.MONTO,       value: reembolso.monto });
            detalle.save();
        });
    }

    return {
        crearDetalles: crearDetalles,
    };
});
