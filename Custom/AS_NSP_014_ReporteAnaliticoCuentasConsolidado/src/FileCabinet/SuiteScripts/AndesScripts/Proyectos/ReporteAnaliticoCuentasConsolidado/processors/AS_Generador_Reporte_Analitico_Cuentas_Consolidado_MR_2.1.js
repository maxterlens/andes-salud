/**
 * AS_NSP_014 — Reporte Analítico de Cuentas Consolidado
 * @description Map Reduce que orquesta la generación del reporte analítico de cuentas.
 *              V1: vuelca todos los resultados de la búsqueda unificada en un archivo CSV.
 *
 *  Responsabilidades por fase:
 *    getInputData → TransaccionReporteAnaliticoCuentasRepository.buildSearch()
 *    map          → ReporteAnaliticoCuentasCsvService.buildCsvRow()
 *    reduce       → pass-through (una fila por result.id)
 *    summarize    → ReporteAnaliticoCuentasCsvService.crearArchivoCsv()
 *                   LogReporteAnaliticoCuentasRepository.marcarCompletado() / marcarError()
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
    '../repositories/TransaccionReporteAnaliticoCuentasRepository',
    '../repositories/LogReporteAnaliticoCuentasRepository',
    '../services/ReporteAnaliticoCuentasCsvService',
], function (runtime, transaccionRepo, logRepo, csvService) {

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
     *  Convierte cada resultado de búsqueda en una fila CSV y la emite.
     *  La clave es result.id (internal ID de la transacción) para
     *  garantizar unicidad en la fase reduce.
     * ═══════════════════════════════════════════════════════════════════ */
    function map(context) {
        const result = JSON.parse(context.value);
        const row    = csvService.buildCsvRow(result);
        context.write({ key: result.id, value: row });
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
     *  2. Recolecta todas las filas emitidas por reduce.
     *  3. Crea el archivo CSV en el File Cabinet.
     *  4. Actualiza el registro de log con el resultado.
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

        /* ── 2. Recolectar filas ───────────────────────────────────── */
        const lines = [];
        summary.output.iterator().each(function (key, value) {
            lines.push(value);
            return true;
        });

        log.error({
            title  : 'summarize — Total filas recolectadas',
            details: lines.length,
        });

        /* ── 3. Crear archivo CSV ──────────────────────────────────── */
        try {
            const nombre = csvService.generarNombreArchivo(subsidiariaId, fechaCorte);
            log.error('nombre', nombre);
            const fileId = csvService.crearArchivoCsv({ lines: lines, nombre: nombre, folderId: folderId });
            const archivo = file.load({ id: fileId });
            const fileUrl = archivo.url;
            log.error({
                title  : 'summarize — Archivo guardado',
                details: 'ID: ' + fileId + ' | Nombre: ' + nombre,
            });

            /* ── 4. Actualizar log: éxito ────────────────────────── */
            logRepo.marcarCompletado(logId, { nombreArchivo: nombre, fileId: fileId, fileUrl: fileUrl });

        } catch (e) {
            log.error({ title: 'summarize — Error generando CSV', details: e.message || String(e) });

            /* ── 4. Actualizar log: error ────────────────────────── */
            logRepo.marcarError(logId, e.message || String(e));
        }
    }

    return { getInputData, map, reduce, summarize };
});
