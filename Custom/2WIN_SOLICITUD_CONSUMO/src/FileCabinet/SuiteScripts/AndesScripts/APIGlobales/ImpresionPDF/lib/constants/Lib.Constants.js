/**
 * @NApiVersion 2.1
 * Constantes globales del módulo ImpresionPDF para AS_NSP_008.
 *
 * ORGANIZACIÓN DE REPORTS:
 *   - REPORTS_BASE: configuración compartida entre todas las subsidiarias.
 *   - REPORTS_BY_SUBSIDIARY: sobreescrituras o adiciones por subsidiaria.
 *   - Usa getReportConfig(subsidiaryId, reportName) para obtener la config final.
 */
define([], () => {

    // ─── Tipos de archivo soportados ────────────────────────────────────────────
    const FILE_TYPES = {
        PDF: 'pdf',
        XLS: 'xls'
    };

    // ─── Modos de entrega ───────────────────────────────────────────────────────
    const MODES = {
        VIEW:     'view',
        DOWNLOAD: 'download'
    };

    // ─── Tipos de registro relevantes ───────────────────────────────────────────
    const RECORD_TYPES = {
        TRANSFER_ORDER:       'transferorder',
        ITEM_RECEIPT:         'itemreceipt',
        ITEM_FULFILLMENT:     'itemfulfillment',
        SOLICITUD_CONSUMO:    'customrecord_2win_solicitud_consumo'
    };

    // ─── Definiciones de fuentes tipográficas ───────────────────────────────────
    const FONTS = {
        OPEN_SANS: {
            REGULAR: '/SuiteScripts/AndesScripts/Recursos/Fuentes/OpenSans-Regular.ttf',
            BOLD:    '/SuiteScripts/AndesScripts/Recursos/Fuentes/OpenSans-Bold.ttf',
            ITALIC:  '/SuiteScripts/AndesScripts/Recursos/Fuentes/OpenSans-Italic.ttf'
        },
        DEJAVU_SANS: {
            REGULAR:  '/SuiteScripts/AndesScripts/Recursos/Fuentes/dejavu-sans-condensed.ttf',
            BOLD:     '/SuiteScripts/AndesScripts/Recursos/Fuentes/dejavu-sans-condensedbold.ttf',
            OBLIQUE:  '/SuiteScripts/AndesScripts/Recursos/Fuentes/dejavu-sans.condensed-oblique.ttf'
        }
    };

    // ─── Base de configuración de reportes (compartida entre subsidiarias) ──────
    const REPORTS_BASE = {
        solicitudconsumo_pdf: {
            recordType:      RECORD_TYPES.SOLICITUD_CONSUMO,
            subsidiaryField: 'custrecord_2win_consumo_subsidiaria',
            templatePath:    '/SuiteScripts/AndesScripts/APIGlobales/ImpresionPDF/templates/AS.FTL.SolicitudConsumoPDF.ftl',
            fonts:           [],
            getFileName:     (data) => `SC-${data.header.name}`
        }
        /*recepcion_insumos_pdf: {
            recordType: RECORD_TYPES.ITEM_RECEIPT,
            templatePath: '../templates/AS.FTL.RecepcionInsumosPDF.ftl',
            fonts: ['DEJAVU_SANS'],
            getFileName: (data) => `RI-${data.header.numeroDocumento}`
        }*/
    };

    /**
     * Sobreescrituras o configuraciones exclusivas por subsidiaria.
     * Clave: subsidiaryId (string). Valor: objeto con los mismos campos que REPORTS_BASE.
     * Si una clave de reporte existe tanto aquí como en REPORTS_BASE,
     * la subsidiaria toma precedencia (override).
     */
    const REPORTS_BY_SUBSIDIARY = {
        // Ejemplo de override por subsidiaria:
        // '5': {
        //     solicitudconsumo_pdf: {
        //         recordType: RECORD_TYPES.TRANSFER_ORDER,
        //         templatePath: '../templates/AS.FTL.SolicitudConsumoAltPDF.ftl',
        //         fonts: ['OPEN_SANS'],
        //         getFileName: (data) => `ALT-SC-${data.header.numeroDocumento}`
        //     }
        // }
    };

    /**
     * Retorna la configuración del reporte para una subsidiaria dada.
     * Fusiona la config base con el override de la subsidiaria (si existe).
     *
     * @param {string} subsidiaryId
     * @param {string} reportName
     * @returns {Object|null} configuración del reporte, o null si no existe
     */
    const getReportConfig = (subsidiaryId, reportName) => {
        const base      = REPORTS_BASE[reportName] || null;
        const override  = (REPORTS_BY_SUBSIDIARY[subsidiaryId] || {})[reportName] || null;

        if (!base && !override) return null;
        return Object.assign({}, base, override);
    };

    return {
        FILE_TYPES,
        MODES,
        RECORD_TYPES,
        FONTS,
        REPORTS_BASE,
        REPORTS_BY_SUBSIDIARY,
        getReportConfig
    };
});
