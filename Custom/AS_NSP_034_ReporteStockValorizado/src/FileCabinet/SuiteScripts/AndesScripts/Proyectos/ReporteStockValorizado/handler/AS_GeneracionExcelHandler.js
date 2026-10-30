/**
 * AS_NSP_035 — Reporte de Stock Valorizado
 * @description Proceso del Scheduled Script que cierra el reporte.
 *
 *              generarExcel → lee el CSV que dejo el SuiteQLTask, arma el Excel al
 *                             lado y deja los dos enlaces en el historial. Si algo
 *                             falla, el historial queda en Error con el motivo.
 * @NApiVersion 2.1
 * @NModuleScope Public
 * @author Andes Salud
 * @version 1.0.0
 *
 */
define(['../data/record/AS_ArchivoRecord', '../data/record/AS_StockValorizadoLogRecord'],
    (archivoRecord, stockValorizadoLogRecord) => {

    // ─────────────────────────────────────────────────────────────────────────
    // Principales
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Si la consulta fallo, NetSuite igual lanza este script con el CSV vacio:
     * sin filas no hay reporte que entregar.
     */
    function generarExcel(logId, csvId) {
        try {
            const csv = archivoRecord.leerCsv(csvId);
            if (!csv.filas.length) {
                stockValorizadoLogRecord.marcarError(logId, 'La consulta no devolvio filas');
                return;
            }
            const urlExcel = archivoRecord.crearExcel(csv.nombre.replace(/\.csv$/i, '.xls'), csv.carpeta, csv.filas);
            stockValorizadoLogRecord.marcarCompletado(logId, urlExcel, csv.url);

            log.audit({
                title  : 'STOCK VALORIZADO GENERADO',
                details: 'log: ' + logId + ' | filas: ' + csv.filas.length,
            });
        } catch (fallo) {
            stockValorizadoLogRecord.marcarError(logId, fallo.message || String(fallo));
            throw fallo;
        }
    }

    return {
        generarExcel: generarExcel,
    };
});
