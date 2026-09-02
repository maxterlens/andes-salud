/**
 * AS_NSP_014 — Reporte Analítico de Cuentas Consolidado
 * @description Scheduled Script que genera los archivos XLS y CSV del reporte
 *              a partir del archivo CSV temporal exportado por el SearchTask.
 *              Se ejecuta automáticamente como inboundDependency del SearchTask
 *              lanzado por el Handler.
 *
 *  Flujo de execute():
 *    1. Carga el CSV temporal con file.load() y lo recorre con lines.iterator().
 *    2. Omite el encabezado (primera línea).
 *    3. Parsea TODAS las líneas con _parseCsvLine() y construye el array de 17 valores
 *       con csvService.buildRowFromCsv() (sin filtrar por fecha aquí).
 *    4. Genera el archivo XLS via csvService.crearArchivoXls(), que internamente:
 *         a. Agrupa/neta filas por folio (_compensarFilas).
 *         b. Filtra filas cuya fecha < fechaInicio (después de agrupar).
 *       → logRepo.marcarXlsGenerado().
 *    5. Registra el CSV temporal (ya persistido por el SearchTask) en el log
 *       → logRepo.marcarCompletado() / marcarError().
 *       El archivo CSV temporal NO se elimina; queda como el CSV del reporte.
 *
 *  Parámetros del script (definir en el script record de NetSuite):
 *    custscript_as_rpt_anlt_cta_ss_subsi      — Internal ID de subsidiaria
 *    custscript_as_rpt_anlt_cta_ss_fecha_ini  — Fecha de inicio MM/DD/YYYY (opcional)
 *    custscript_as_rpt_anlt_cta_ss_fecha_cort — Fecha de corte MM/DD/YYYY
 *    custscript_as_rpt_anlt_cta_ss_cta_cont   — ID de cuenta contable (opcional)
 *    custscript_as_rpt_anlt_cta_ss_log_id     — Internal ID del custom record de log
 *    custscript_as_rpt_anlt_cta_ss_folderid   — ID de carpeta File Cabinet destino
 *    custscript_as_rpt_anlt_cta_ss_archtempid — ID del archivo CSV temporal (del SearchTask)
 *    custscript_as_rpt_anlt_cta_ss_omit_n0   — Omitir filas con neto = 0 ("T" = sí, cualquier otro valor = no)
 *    custscript_as_rpt_anlt_cta_ss_usar_ql  — Usar modo SuiteQL (default T); F = modo SearchTask (auditoría)
 *
 * @NApiVersion 2.1
 * @NScriptType ScheduledScript
 * @NModuleScope Public
 */
define([
    'N/runtime',
    'N/file',
    '../repositories/LogReporteAnaliticoCuentasRepository',
    '../repositories/EntidadRepository',
    '../services/ReporteAnaliticoCuentasCsvService',
], function (runtime, file, logRepo, entidadRepo, csvService) {

    /* ─── IDs de parámetros del script ──────────────────────────────── */
    const PARAM = {
        SUBSIDIARIA      : 'custscript_as_rpt_anlt_cta_ss_subsi',
        FECHA_INICIO     : 'custscript_as_rpt_anlt_cta_ss_fecha_ini',
        FECHA_CORTE      : 'custscript_as_rpt_anlt_cta_ss_fecha_cort',
        CUENTA_CONTABLE  : 'custscript_as_rpt_anlt_cta_ss_cta_cont',
        LOG_ID           : 'custscript_as_rpt_anlt_cta_ss_log_id',
        FOLDER_ID        : 'custscript_as_rpt_anlt_cta_ss_folderid',
        CSV_FILE_ID      : 'custscript_as_rpt_anlt_cta_ss_archtempid',
        OMITIR_NETO_CERO : 'custscript_as_rpt_anlt_cta_ss_omit_n0',
        USAR_QL          : 'custscript_as_rpt_anlt_cta_ss_usar_ql',
        DEPARTAMENTO     : 'custscript_as_rpt_anlt_cta_ss_departamen',
        RUT              : 'custscript_as_rpt_anlt_cta_ss_rut',
    };

    /* ═══════════════════════════════════════════════════════════════════
     *  EXECUTE
     * ═══════════════════════════════════════════════════════════════════ */
    function execute(context) {
        const script          = runtime.getCurrentScript();
        const subsidiariaId   = script.getParameter({ name: PARAM.SUBSIDIARIA });
        const fechaInicio     = script.getParameter({ name: PARAM.FECHA_INICIO });
        const fechaCorte      = script.getParameter({ name: PARAM.FECHA_CORTE });
        const folderId        = script.getParameter({ name: PARAM.FOLDER_ID });
        const logId           = script.getParameter({ name: PARAM.LOG_ID });
        const csvFileId       = script.getParameter({ name: PARAM.CSV_FILE_ID });
        const omitirNetoCero  = script.getParameter({ name: PARAM.OMITIR_NETO_CERO }) === 'T' || script.getParameter({ name: PARAM.OMITIR_NETO_CERO })  == true;
        const departamento    = script.getParameter({ name: PARAM.DEPARTAMENTO }) || '';
        const rut             = script.getParameter({ name: PARAM.RUT })          || '';

        /* Modo SuiteQL (default T en deployment) vs. SearchTask (auditoría F) */
        const usarQL = script.getParameter({ name: PARAM.USAR_QL }) !== false
                    && script.getParameter({ name: PARAM.USAR_QL }) !== 'F';
        const colsMin    = 26; /* ambos modos (SuiteQL y SearchTask) exportan 24 columnas con RUT en [7] */
        const buildRowFn = usarQL ? csvService.buildRowFromSuiteQL : csvService.buildRowFromCsv;

        log.error({
            title  : 'execute — Parámetros recibidos',
            details: JSON.stringify({ subsidiariaId, fechaInicio, fechaCorte, folderId, logId, csvFileId, omitirNetoCero, departamento, rut, usarQL }),
        });

        try {
            /* ── 1. Cargar CSV y recorrer con iterator ───────────────── */
            const csvFile  = file.load({ id: csvFileId });
            const iterator = csvFile.lines.iterator();

            /* Omitir la primera línea (encabezado) */
            iterator.each(function () { return false; });

            /* ── 2. Parsear cada línea y construir filas ─────────────── */
            const rows = [];

            iterator.each(function (line) {
                if (!line.value || line.value.trim() === '') return true;

                const cols = _parseCsvLine(line.value);

                if (!cols || cols.length < colsMin) {
                    /*log.error({
                        title  : 'execute — Línea con columnas insuficientes',
                        details: 'cols: ' + (cols ? cols.length : 0) + ' | se esperan ' + colsMin + ' | línea: ' + line.value,
                    });*/
                    return true;
                }

                rows.push(buildRowFn(cols));

                return true;
            });

            log.error({
                title  : 'execute — Total filas parseadas',
                details: 'total: ' + rows.length,
            });

            /* ── 4. Generar archivo XLS ──────────────────────────────── */
            const nombreXls  = csvService.generarNombreArchivo(subsidiariaId, fechaCorte, 'xls');
            const xlsId      = csvService.crearArchivoXls({ rows, nombre: nombreXls, folderId, fechaInicio, omitirNetoCero, departamento, rut });
            const archivoXls = file.load({ id: xlsId });

            log.error({
                title  : 'execute — XLS guardado',
                details: 'ID: ' + xlsId + ' | Nombre: ' + nombreXls,
            });

            logRepo.marcarXlsGenerado(logId, {
                nombreArchivo: nombreXls,
                fileId       : xlsId,
                fileUrl      : archivoXls.url,
            });

            /* ── 4. Registrar CSV temporal como CSV del reporte ─────── */
            log.error({
                title  : 'execute — CSV temporal registrado como reporte',
                details: 'ID: ' + csvFileId + ' | Nombre: ' + csvFile.name,
            });

            logRepo.marcarCompletado(logId, {
                nombreArchivo: csvFile.name,
                fileId       : csvFileId,
                fileUrl      : csvFile.url,
            });

        } catch (e) {
            log.error({ title: 'execute — Error generando archivos', details: e.message || String(e) });
            logRepo.marcarError(logId, e.message || String(e));
        }
    }
    
    /* ═══════════════════════════════════════════════════════════════════
     *  _parseCsvLine
     *  Parser CSV que respeta campos entre comillas dobles,
     *  comillas escapadas ("") y comas dentro de campos.
     * ═══════════════════════════════════════════════════════════════════ */
    function _parseCsvLine(line) {
        var cols = [], cur = '', inQuote = false;
        for (var i = 0; i < line.length; i++) {
            var ch = line[i];
            if (inQuote) {
                if (ch === '"') {
                    if (i + 1 < line.length && line[i + 1] === '"') {
                        cur += '"'; i++; /* comilla escapada */
                    } else {
                        inQuote = false;
                    }
                } else {
                    cur += ch;
                }
            } else {
                if (ch === '"')      { inQuote = true; }
                else if (ch === ',') { cols.push(cur); cur = ''; }
                else                 { cur += ch; }
            }
        }
        cols.push(cur);
        return cols;
    }

    return { execute };
});
