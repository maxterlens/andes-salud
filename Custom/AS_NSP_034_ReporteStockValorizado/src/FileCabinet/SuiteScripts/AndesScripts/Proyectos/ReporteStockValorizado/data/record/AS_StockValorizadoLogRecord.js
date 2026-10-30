/**
 * AS_NSP_035 — Reporte de Stock Valorizado
 * @description El registro del historial (AS Stock Valorizado): uno por reporte
 *              pedido.
 *
 *              crearLog          → al pedir el reporte, En proceso.
 *              marcarCompletado  → con los enlaces del Excel y del CSV.
 *              marcarError       → con el motivo.
 * @NApiVersion 2.1
 * @NModuleScope Public
 * @author Andes Salud
 * @version 1.1.0
 *
 * CHANGELOG v1.1.0:
 * - [FEAT] El log guarda las ubicaciones del reporte.
 *
 */
define(['N/record', '../../constants/AS_StockValorizadoConstants'],
    (record, CONSTANTES) => {

    // ─────────────────────────────────────────────────────────────────────────
    // Principales
    // ─────────────────────────────────────────────────────────────────────────

    function crearLog(subsidiaria, ubicaciones, fechaCorte) {
        const campos   = CONSTANTES.LOG.CAMPOS;
        const registro = record.create({ type: CONSTANTES.LOG.TIPO });

        registro.setValue({ fieldId: campos.SUBSIDIARIA, value: subsidiaria });
        registro.setValue({ fieldId: campos.UBICACIONES, value: ubicaciones });
        registro.setValue({ fieldId: campos.FECHA_CORTE, value: fechaCorte });
        registro.setValue({ fieldId: campos.ESTADO,      value: CONSTANTES.LOG.ESTADOS.EN_PROCESO });

        return registro.save();
    }

    function marcarCompletado(logId, urlExcel, urlCsv) {
        const campos  = CONSTANTES.LOG.CAMPOS;
        const valores = {};

        valores[campos.ESTADO]    = CONSTANTES.LOG.ESTADOS.COMPLETADO;
        valores[campos.URL_EXCEL] = urlExcel;
        valores[campos.URL_CSV]   = urlCsv;
        record.submitFields({ type: CONSTANTES.LOG.TIPO, id: logId, values: valores });
    }

    function marcarError(logId, mensaje) {
        const campos  = CONSTANTES.LOG.CAMPOS;
        const valores = {};

        valores[campos.ESTADO] = CONSTANTES.LOG.ESTADOS.ERROR;
        valores[campos.ERROR]  = mensaje.substring(0, 3999);
        record.submitFields({ type: CONSTANTES.LOG.TIPO, id: logId, values: valores });
    }

    return {
        crearLog        : crearLog,
        marcarCompletado: marcarCompletado,
        marcarError     : marcarError,
    };
});
