/**
 * AS_NSP_014 — Reporte Analítico de Cuentas Consolidado
 * @description Map Reduce que orquesta la generación del reporte analítico de cuentas.
 *              Genera un archivo XLS y un archivo CSV con los resultados de la búsqueda.
 *
 *  Responsabilidades por fase:
 *    getInputData → TransaccionReporteAnaliticoCuentasRepository.buildSearch()
 *    map          → ReporteAnaliticoCuentasCsvService.buildRow()  (emite array crudo en JSON)
 *    reduce       → pass-through (una fila por result.id)
 *    summarize    → 1. ReporteAnaliticoCuentasCsvService.crearArchivoXls()
 *                      LogReporteAnaliticoCuentasRepository.marcarXlsGenerado()
 *                   2. ReporteAnaliticoCuentasCsvService.crearArchivoCsv()
 *                      LogReporteAnaliticoCuentasRepository.marcarCompletado() / marcarError()
 *
 *  Parámetros del script:
 *    custscript_as_mr_param_subsidiar  — Internal ID de subsidiaria (opcional)
 *    custscript_as_mr_param_fecha      — Fecha de corte MM/DD/YYYY (opcional)
 *    custscript_as_mr_param_folder     — ID de carpeta File Cabinet destino
 *    custscript_as_mr_param_log_id     — Internal ID del custom record de log
 *
 * @NApiVersion 2.1
 * @NScriptType MapReduceScript
 * @NModuleScope Public
 */
define([
    'N/runtime',
    'N/file',
    '../repositories/TransaccionReporteAnaliticoCuentasRepository',
    '../repositories/LogReporteAnaliticoCuentasRepository',
    '../services/ReporteAnaliticoCuentasCsvService',
], function (runtime, file, transaccionRepo, logRepo, csvService) {

    /* ─── IDs de parámetros del script ──────────────────────────────── */
    const PARAM = {
        SUBSIDIARIA     : 'custscript_as_rpt_anlt_cta_cons_subsidia',
        FECHA_CORTE     : 'custscript_as_rpt_anlt_cta_cons_fechacor',
        FOLDER_ID       : 'custscript_as_rpt_anlt_cta_cons_folderid',
        LOG_ID          : 'custscript_as_rpt_anlt_cta_cons_logid',
        TIPO_REGISTRO   : 'custscript_as_rpt_anlt_cta_cons_tipregis',
        CUENTA_CONTABLE : 'custscript_as_rpt_anlt_cta_cons_cuentaid'
    };

    /* ═══════════════════════════════════════════════════════════════════
     *  GET INPUT DATA
     *  Devuelve la búsqueda unificada al motor MR.
     *  El motor pagina automáticamente sin cargar todos los resultados
     *  en memoria — apto para 300K+ transacciones por subsidiaria.
     * ═══════════════════════════════════════════════════════════════════ */
    function getInputData() {
        const script = runtime.getCurrentScript();
        const params = {
            subsidiaria: script.getParameter({ name: PARAM.SUBSIDIARIA }),
            fechaCorte : script.getParameter({ name: PARAM.FECHA_CORTE }),
            cuentaContable: script.getParameter( { name: PARAM.CUENTA_CONTABLE }),
            tipoRegistro: script.getParameter({ name: PARAM.TIPO_REGISTRO })
        };

        log.error({
            title  : 'getInputData — Parámetros',
            details: JSON.stringify(params),
        });

        return transaccionRepo.buildSearch(params);
    }

    /* ═══════════════════════════════════════════════════════════════════
     *  MAP
     *  Convierte cada resultado de búsqueda en un array crudo de valores
     *  y lo emite como JSON. El formato final (CSV / XLS) se aplica en
     *  summarize, donde ya se conoce el tipo de archivo destino.
     *  La clave es result.id (internal ID de la transacción) para
     *  garantizar unicidad en la fase reduce.
     * ═══════════════════════════════════════════════════════════════════ */
    function map(context) {
        const result = JSON.parse(context.value);
        const row    = csvService.buildRow(result);
        context.write({ key: result.id, value: JSON.stringify(row) });
    }

    /* ═══════════════════════════════════════════════════════════════════
     *  REDUCE — Pass-through
     *  Una transacción puede generar múltiples filas (una por línea
     *  de la búsqueda). Se emiten todas preservando el orden de llegada.
     * ═══════════════════════════════════════════════════════════════════ */
    function reduce(context) {
        context.values.forEach(function (value) {
            context.write({ key: context.key, value: value });
        });
    }

    /* ═══════════════════════════════════════════════════════════════════
     *  SUMMARIZE
     *  1. Registra errores de fases previas.
     *  2. Recolecta todos los arrays de datos emitidos por reduce.
     *  3. Genera el archivo XLS y actualiza el log (estado: "Generando CSV").
     *  4. Genera el archivo CSV y actualiza el log (estado: "Completado").
     * ═══════════════════════════════════════════════════════════════════ */
    function summarize(summary) {

        /* ── 1. Errores de map ─────────────────────────────────────── */
        summary.mapSummary.errors.iterator().each(function (key, err) {
            log.error({ title: 'map.error | key: ' + key, details: err });
            return true;
        });

        /* ── Errores de reduce ─────────────────────────────────────── */
        summary.reduceSummary.errors.iterator().each(function (key, err) {
            log.error({ title: 'reduce.error | key: ' + key, details: err });
            return true;
        });

        const script        = runtime.getCurrentScript();
        const folderId      = script.getParameter({ name: PARAM.FOLDER_ID });
        const logId         = script.getParameter({ name: PARAM.LOG_ID });
        const fechaCorte    = script.getParameter({ name: PARAM.FECHA_CORTE });
        const subsidiariaId = script.getParameter({ name: PARAM.SUBSIDIARIA });

        /* ── 2. Recolectar arrays de datos ────────────────────────── */
        const rows = [];
        summary.output.iterator().each(function (key, value) {
            rows.push(JSON.parse(value));
            return true;
        });

        log.error({
            title  : 'summarize — Total filas recolectadas',
            details: rows.length,
        });

        try {
            /* ── 3. Generar archivo XLS ────────────────────────────── */
            const nombreXls = csvService.generarNombreArchivo(subsidiariaId, fechaCorte, 'xls');
            log.error('summarize — Generando XLS', nombreXls);

            const xlsId    = csvService.crearArchivoXls({ rows: rows, nombre: nombreXls, folderId: folderId });
            const archivoXls = file.load({ id: xlsId });
            log.error({
                title  : 'summarize — XLS guardado',
                details: 'ID: ' + xlsId + ' | Nombre: ' + nombreXls,
            });

            /* Actualizar log con XLS — estado pasa a "Generando CSV" */
            logRepo.marcarXlsGenerado(logId, { nombreArchivo: nombreXls, fileId: xlsId, fileUrl: archivoXls.url });

            /* ── 4. Generar archivo CSV ────────────────────────────── */
            const nombreCsv = csvService.generarNombreArchivo(subsidiariaId, fechaCorte, 'csv');
            log.error('summarize — Generando CSV', nombreCsv);

            const csvId    = csvService.crearArchivoCsv({ rows: rows, nombre: nombreCsv, folderId: folderId });
            const archivoCsv = file.load({ id: csvId });
            log.error({
                title  : 'summarize — CSV guardado',
                details: 'ID: ' + csvId + ' | Nombre: ' + nombreCsv,
            });

            /* Actualizar log con CSV — estado pasa a "Completado" */
            logRepo.marcarCompletado(logId, { nombreArchivo: nombreCsv, fileId: csvId, fileUrl: archivoCsv.url });

        } catch (e) {
            log.error({ title: 'summarize — Error generando archivos', details: e.message || String(e) });

            /* Actualizar log: error */
            logRepo.marcarError(logId, e.message || String(e));
        }
    }

    return { getInputData, map, reduce, summarize };
});
