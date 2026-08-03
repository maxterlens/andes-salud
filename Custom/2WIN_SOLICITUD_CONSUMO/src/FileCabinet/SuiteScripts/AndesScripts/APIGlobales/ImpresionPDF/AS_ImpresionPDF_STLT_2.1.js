/**
 * @NApiVersion 2.1
 * @NScriptType Suitelet
 *
 * AS_NSP_008 - Impresión de Solicitud de Consumo
 * ─────────────────────────────────────────────────────────────────────────────
 * Soporta dos modos de impresión:
 *
 * MODO A — Advanced PDF/HTML Template (nativo NetSuite)
 *   Usa setTemplateById + addRecord. No requiere servicio ni FTL propio.
 *   Parámetros requeridos: id, recordtype, templateid
 *   Parámetros opcionales: mode (view | download), filename
 *
 * MODO B — FTL personalizado (con servicio y repositorio)
 *   Usa plantillas FTL del File Cabinet con datos JSON inyectados.
 *   Parámetros requeridos: id, recordtype, reportname, filetype, mode
 *   Parámetros opcionales: customdata
 *
 * El Suitelet detecta el modo por la presencia del parámetro "templateid".
 *
 * Parámetros de script:
 *   custscript_as_sl_imp_sc_logo - URL del logo principal
 *
 * @NScriptParameter custscript_as_sl_imp_sc_logo {string} URL del logo
 */
define([
    'N/runtime',
    './lib/constants/Lib.Constants',
    './services/ServiceManager',
    './lib/renderer/Lib.Renderer',
    './lib/helpers/Lib.Helper.FileUtils'
], (runtime, Constants, ServiceManager, Renderer, FileUtils) => {

    // ─── Helpers internos ────────────────────────────────────────────────────────

    /**
     * Escribe una respuesta de error estructurada.
     * @param {Object} response
     * @param {string} code    - Código corto del error (ej. 'INVALID_PARAM')
     * @param {string} message - Descripción legible
     */
    const _respondError = (response, code, message) => {
        log.error(`AS.Suitelet | ${code}`, message);
        response.write(JSON.stringify({ error: code, message }));
    };

    /**
     * Valida y extrae los parámetros para el MODO A (Advanced PDF/HTML).
     * @param {Object} params - request.parameters
     * @returns {{ valid: boolean, error?: string, data?: Object }}
     */
    const _parseAdvancedParams = (params) => {
        const { id, recordtype, templateid, mode = 'view', filename } = params;

        if (!id)         return { valid: false, error: 'Parámetro "id" es requerido.' };
        if (!recordtype) return { valid: false, error: 'Parámetro "recordtype" es requerido.' };
        if (!templateid) return { valid: false, error: 'Parámetro "templateid" es requerido.' };

        const validModes = [Constants.MODES.VIEW, Constants.MODES.DOWNLOAD];
        if (!validModes.includes(mode)) {
            return { valid: false, error: `Parámetro "mode" inválido: "${mode}". Use: view | download` };
        }

        return {
            valid: true,
            data: {
                id:         id.trim(),
                recordType: recordtype,
                templateId: templateid,
                mode,
                fileName:   filename || null
            }
        };
    };

    /**
     * Valida y extrae los parámetros para el MODO B (FTL personalizado).
     * @param {Object} params - request.parameters
     * @returns {{ valid: boolean, error?: string, data?: Object }}
     */
    const _parseFtlParams = (params) => {
        const { id, recordtype, reportname, filetype, mode, customdata } = params;

        if (!id)         return { valid: false, error: 'Parámetro "id" es requerido.' };
        if (!recordtype) return { valid: false, error: 'Parámetro "recordtype" es requerido.' };
        if (!reportname) return { valid: false, error: 'Parámetro "reportname" es requerido.' };
        if (!filetype)   return { valid: false, error: 'Parámetro "filetype" es requerido.' };
        if (!mode)       return { valid: false, error: 'Parámetro "mode" es requerido.' };

        let customData = {};
        if (customdata) {
            try {
                customData = JSON.parse(customdata);
            } catch (e) {
                return { valid: false, error: `JSON inválido en "customdata": ${e.message}` };
            }
        }

        return {
            valid: true,
            data: {
                ids:        id.split(',').map(s => s.trim()),
                recordType: recordtype,
                reportName: reportname,
                fileType:   filetype,
                mode,
                customData
            }
        };
    };

    // ─── Modo A: Advanced PDF/HTML Template ──────────────────────────────────────

    /**
     * Imprime usando una plantilla Advanced PDF/HTML configurada en NetSuite.
     * El registro nativo se pasa directamente al renderer (sin servicio ni FTL).
     *
     * Parámetros GET:
     *   id         - Id interno del registro
     *   recordtype - Tipo de registro (ej. transferorder)
     *   templateid - Id de la plantilla Advanced PDF/HTML
     *   mode       - view (default) | download
     *   filename   - (opcional) nombre del archivo sin extensión
     */
    const _handleAdvancedPdf = (response, params) => {
        const parsed = _parseAdvancedParams(params);
        if (!parsed.valid) {
            _respondError(response, 'INVALID_PARAMS', parsed.error);
            return;
        }

        const { id, recordType, templateId, mode, fileName } = parsed.data;
        log.error('AS.Suitelet | Advanced PDF', { id, recordType, templateId, mode });

        try {
            const renderer  = new Renderer();
            const htmlString = renderer.renderWithAdvancedTemplate(recordType, id, templateId);

            if (mode === Constants.MODES.VIEW) {
                response.renderPdf(htmlString);

            } else {
                // DOWNLOAD: re-renderizar como File PDF con nombre explícito
                const pdfName   = fileName ? `${fileName}.pdf` : `${recordType}_${id}.pdf`;
                const pdfFile   = renderer.renderWithAdvancedTemplateAsPdf(recordType, id, templateId, pdfName);
                response.writePage(pdfFile);
            }

        } catch (e) {
            log.error('AS.Suitelet | _handleAdvancedPdf | Error', e);
            _respondError(response, 'INTERNAL_ERROR', e.message || String(e));
        }
    };

    // ─── Modo B: FTL personalizado ───────────────────────────────────────────────

    /**
     * Imprime usando plantillas FTL del File Cabinet con datos del servicio.
     *
     * Parámetros GET:
     *   id         - Id(s) del registro, separados por coma
     *   recordtype - Tipo de registro
     *   reportname - Nombre del reporte (clave en Constants)
     *   filetype   - pdf | xls
     *   mode       - view | download
     *   customdata - (opcional) JSON adicional para el servicio
     */
    const _handleFtlPdf = (response, params) => {
        const parsed = _parseFtlParams(params);
        if (!parsed.valid) {
            _respondError(response, 'INVALID_PARAMS', parsed.error);
            return;
        }

        const { ids, recordType, reportName, fileType, mode, customData } = parsed.data;
        log.error('AS.Suitelet | FTL PDF', { ids, recordType, reportName, fileType, mode });

        try {
            // 1. Obtener subsidiaria y configuración del reporte.
            //    Pre-lookup de la config base para determinar el campo subsidiaria
            //    correcto (custom records usan un fieldId distinto a 'subsidiary').
            const baseConfig      = Constants.REPORTS_BASE[reportName];
            const subsidiaryField = baseConfig?.subsidiaryField || 'subsidiary';
            const subsidiaryId    = FileUtils.getSubsidiaryId(recordType, ids[0], subsidiaryField);
            if (!subsidiaryId) {
                _respondError(response, 'SUBSIDIARY_NOT_FOUND',
                    `No se encontró subsidiaria para ${recordType} ID: ${ids[0]}`);
                return;
            }

            const reportConfig = Constants.getReportConfig(subsidiaryId, reportName);
            if (!reportConfig) {
                _respondError(response, 'REPORT_NOT_FOUND',
                    `Reporte "${reportName}" no existe para subsidiaria ${subsidiaryId}.`);
                return;
            }

            if (reportConfig.recordType !== recordType) {
                _respondError(response, 'RECORD_TYPE_MISMATCH',
                    `El reporte "${reportName}" no es válido para recordtype "${recordType}".`);
                return;
            }

            // 2. Obtener datos desde el servicio
            const data = new ServiceManager().fetchData(reportName, reportConfig, ids, customData);

            // 3. Enriquecer con logo y fuentes
            const logoUrl = runtime.getCurrentScript().getParameter({ name: 'custscript_as_sl_imp_sc_logo' });
            data.logoUrl  = logoUrl || '';
            data.fonts    = FileUtils.loadFontsForReport(reportConfig, Constants);

            // 4. Nombre de archivo
            const fileName = reportConfig.getFileName(data);

            // 5. Renderizar y responder
            const renderer = new Renderer();

            if (fileType === Constants.FILE_TYPES.PDF) {

                if (mode === Constants.MODES.VIEW) {
                    response.renderPdf(renderer.renderAsString(data, reportConfig.templatePath));

                } else if (mode === Constants.MODES.DOWNLOAD) {
                    response.writePage(renderer.renderAsPdf(data, reportConfig.templatePath, `${fileName}.pdf`));

                } else {
                    _respondError(response, 'INVALID_MODE',
                        `Modo "${mode}" no válido para PDF. Use: view | download`);
                }

            } else if (fileType === Constants.FILE_TYPES.XLS) {

                const htmlString = renderer.renderAsString(data, reportConfig.templatePath);
                const xlsFile    = FileUtils.htmlToXlsFile(htmlString, `${fileName}.xls`);

                response.setHeader({ name: 'Content-Type',        value: 'application/vnd.ms-excel' });
                response.setHeader({ name: 'Content-Disposition', value: `attachment; filename="${xlsFile.name}"` });
                response.write({ output: xlsFile.getContents() });

            } else {
                _respondError(response, 'INVALID_FILETYPE',
                    `Tipo "${fileType}" no soportado. Use: pdf | xls`);
            }

        } catch (e) {
            log.error('AS.Suitelet | _handleFtlPdf | Error', e);
            _respondError(response, 'INTERNAL_ERROR', e.message || String(e));
        }
    };

    // ─── Handler principal ───────────────────────────────────────────────────────

    const onRequest = (context) => {
        const { request, response } = context;

        if (request.method !== 'GET') {
            _respondError(response, 'METHOD_NOT_ALLOWED', 'Solo se aceptan requests GET.');
            return;
        }

        const params = request.parameters;
        log.error('onRequest', params);

        // Detección de modo: si viene "templateid" → Advanced PDF/HTML; si no → FTL
        if (params.templateid) {
            _handleAdvancedPdf(response, params);
        } else {
            _handleFtlPdf(response, params);
        }
    };

    return { onRequest };
});
