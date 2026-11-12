/**
 * AS_NSP_036 — Nomina de Reembolso al Cliente
 * @description Crea la cabecera AS Nomina Reembolso (customrecord_as_nom_reemb).
 *
 * CHANGELOG v1.0.0 (2026-11-10):
 * - [FEAT] crearNomina.
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

    /**
     * La fecha llega del formulario como texto en el formato del usuario: se
     * escribe con setText para que NetSuite la interprete igual.
     */
    function crearNomina(cabecera, total) {
        const campos = CONSTANTES.NOMINA.CAMPOS;
        const nomina = record.create({ type: CONSTANTES.NOMINA.TIPO });

        nomina.setValue({ fieldId: campos.SUBSIDIARIA,  value: cabecera.subsidiaria });
        nomina.setValue({ fieldId: campos.BANCO,        value: cabecera.banco });
        nomina.setValue({ fieldId: campos.CUENTA_BANCO, value: cabecera.cuentaBanco });
        nomina.setText({ fieldId: campos.FECHA,         text: cabecera.fecha });
        nomina.setValue({ fieldId: campos.DESCRIPCION,  value: cabecera.descripcion || '' });
        nomina.setValue({ fieldId: campos.TOTAL,        value: total });

        return nomina.save();
    }

    return {
        crearNomina: crearNomina,
    };
});
