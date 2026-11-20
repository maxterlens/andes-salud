/**
 * AS_NSP_036 — Nomina de Reembolso al Cliente
 * @description Crea el detalle AS Nomina Reembolso Detalle
 *              (customrecord_as_nom_reemb_det): una linea por reembolso o
 *              devolucion. Tener un detalle es lo que la saca de la lista de
 *              pendientes. La devolucion guarda tambien su linea del asiento.
 *
 * @NApiVersion 2.1
 * @NModuleScope Public
 * @author Andes Salud
 * @version 1.1.0
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
            if (reembolso.linea) detalle.setValue({ fieldId: campos.LINEA, value: Number(reembolso.linea) });
            detalle.save();
        });
    }

    return {
        crearDetalles: crearDetalles,
    };
});
