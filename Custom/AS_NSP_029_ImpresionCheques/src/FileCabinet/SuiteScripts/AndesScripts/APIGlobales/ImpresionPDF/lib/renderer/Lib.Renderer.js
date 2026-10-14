/**
 * @NApiVersion 2.1
 * Renderer: encapsula la generación de PDF y HTML a partir de plantillas FTL
 * y de plantillas Advanced PDF/HTML nativas de NetSuite.
 *
 * Modos soportados:
 *   1. FTL personalizado  → renderAsString / renderAsPdf
 *      Usa templateContent + addCustomDataSource con JSON serializado.
 *
 *   2. Advanced PDF/HTML  → renderWithAdvancedTemplate
 *      Usa setTemplateById + addRecord: el registro nativo alimenta
 *      la plantilla configurada en NetSuite (Setup > Advanced PDF/HTML Templates).
 */
define(['N/render', 'N/file', 'N/record'], (render, file, record) => {

    class Renderer {

        // ─── Modo 1: FTL personalizado ───────────────────────────────────────────

        /**
         * Carga el contenido de una plantilla FreeMarker desde el File Cabinet.
         * @param {string} templatePath - Ruta interna en el File Cabinet
         * @returns {string} Contenido FTL
         */
        _loadTemplate(templatePath) {
            const templateFile = file.load({ id: templatePath });
            return templateFile.getContents();
        }

        /**
         * Crea un TemplateRenderer con la plantilla FTL y los datos JSON inyectados.
         * El alias del data source es 'jsonString' (compatible con plantillas FTL existentes).
         *
         * @param {Object} data         - Datos a inyectar
         * @param {string} templatePath - Ruta de la plantilla FTL
         * @returns {render.TemplateRenderer}
         */
        _buildFtlRenderer(data, templatePath) {
            const renderer = render.create();
            renderer.templateContent = this._loadTemplate(templatePath);
            renderer.addCustomDataSource({
                format: render.DataSource.OBJECT,
                alias:  'jsonString',
                data:   { text: JSON.stringify(data).replace(/&/g, '&amp;') }
            });
            return renderer;
        }

        /**
         * Renderiza una plantilla FTL y retorna el resultado como string HTML.
         * Útil para: response.renderPdf(string) y conversión a XLS.
         *
         * @param {Object} data         - Datos para la plantilla
         * @param {string} templatePath - Ruta de la plantilla FTL
         * @returns {string} HTML renderizado
         */
        renderAsString(data, templatePath) {
            log.error('Lib.Renderer | renderAsString', { templatePath });
            try {
                return this._buildFtlRenderer(data, templatePath).renderAsString();
            } catch (e) {
                log.error('Lib.Renderer | renderAsString', e);
                throw e;
            }
        }

        /**
         * Renderiza una plantilla FTL y retorna un objeto File PDF.
         *
         * @param {Object} data         - Datos para la plantilla
         * @param {string} templatePath - Ruta de la plantilla FTL
         * @param {string} fileName     - Nombre del archivo PDF (con extensión)
         * @returns {N.file.File} Archivo PDF
         */
        renderAsPdf(data, templatePath, fileName) {
            log.error('Lib.Renderer | renderAsPdf', { templatePath, fileName });
            try {
                const pdfFile = this._buildFtlRenderer(data, templatePath).renderAsPdf();
                pdfFile.name  = fileName;
                return pdfFile;
            } catch (e) {
                log.error('Lib.Renderer | renderAsPdf', e);
                throw e;
            }
        }

        // ─── Modo 2: Advanced PDF/HTML Template ─────────────────────────────────

        /**
         * Renderiza usando una plantilla Advanced PDF/HTML de NetSuite (setTemplateById).
         * El registro nativo se carga y se adjunta como fuente de datos 'record',
         * igual que en las impresiones estándar de NetSuite.
         *
         * Equivalente al patrón:
         *   renderer.setTemplateById(templateId)
         *   renderer.addRecord('record', record.load({ type, id }))
         *   renderer.renderAsString()  → response.renderPdf(html)
         *
         * @param {string}        recordType  - Tipo de registro NetSuite (ej. 'transferorder')
         * @param {string|number} id          - Id interno del registro
         * @param {string|number} templateId  - Id de la plantilla Advanced PDF/HTML
         * @returns {string} HTML listo para pasarse a response.renderPdf()
         */
        renderWithAdvancedTemplate(recordType, id, templateId) {
            log.error('Lib.Renderer | renderWithAdvancedTemplate', { recordType, id, templateId });
            try {
                const renderer = render.create();
                renderer.setTemplateById(templateId);
                renderer.addRecord('record', record.load({ type: recordType, id }));
                return renderer.renderAsString().replace(/&/g, '&amp;');
            } catch (e) {
                log.error('Lib.Renderer | renderWithAdvancedTemplate', e);
                throw e;
            }
        }

        /**
         * Renderiza con una plantilla Advanced PDF/HTML y retorna un objeto File PDF.
         * Usar cuando se necesita descargar el PDF (mode = download).
         *
         * @param {string}        recordType - Tipo de registro NetSuite
         * @param {string|number} id         - Id interno del registro
         * @param {string|number} templateId - Id de la plantilla Advanced PDF/HTML
         * @param {string}        fileName   - Nombre del archivo con extensión .pdf
         * @returns {N.file.File} Archivo PDF listo para response.writePage()
         */
        renderWithAdvancedTemplateAsPdf(recordType, id, templateId, fileName) {
            log.error('Lib.Renderer | renderWithAdvancedTemplateAsPdf', { recordType, id, templateId, fileName });
            try {
                const renderer = render.create();
                renderer.setTemplateById(templateId);
                renderer.addRecord('record', record.load({ type: recordType, id }));
                const pdfFile  = renderer.renderAsPdf();
                pdfFile.name   = fileName;
                return pdfFile;
            } catch (e) {
                log.error('Lib.Renderer | renderWithAdvancedTemplateAsPdf', e);
                throw e;
            }

        }
    }
    return Renderer;
});
