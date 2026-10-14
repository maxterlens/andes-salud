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
        SOLICITUD_CONSUMO:    'customrecord_2win_solicitud_consumo',
        VENDOR_PAYMENT:       'vendorpayment'
    };

    // ─── AS_NSP_029: record de configuración de impresión de cheques ───────────
    // Una configuración por impresora (campo Nombre) y subsidiaria. Los campos vacíos
    // toman el valor del layout base de REPORTS_BASE.pagofactura_cheque_pdf.
    const CONFIG_CHEQUE = {
        RECORD_TYPE: 'customrecord_as_config_cheque',
        PREFIJO:     'custrecord_as_cchq_',
        CAMPOS: [
            'subsidiaria', 'predeterminada',
            'desp_x', 'desp_y', 'margen_sup', 'margen_izq', 'alto_cheque',
            'fuente', 'negrita', 'tam_fuente',
            'valor_x', 'valor_y', 'valor_ancho', 'valor_tam_fuente',
            'dia_x', 'dia_y', 'dia_ancho',
            'mes_x', 'mes_y', 'mes_ancho',
            'anio_x', 'anio_y', 'anio_ancho', 'fecha_tam_fuente',
            'nombre_x', 'nombre_y', 'nombre_ancho', 'nombre_tam_fuente',
            'cant_x', 'cant_y', 'cant_ancho', 'cant_tam_fuente', 'cant_max_lineas',
            'pref_valor', 'suf_valor', 'pref_letras', 'suf_letras'
        ]
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
        },

        // AS_NSP_029 - Cheque BCI de Pago de Factura (hoja carta, hasta 4 cheques de 7 cm).
        // Coordenadas en cm, medidas desde el diseño de cheques de la macro, que toma como
        // origen el cheque ya separado del talón. desplazamientoX = ancho del talón izquierdo
        // (~5,8 cm, medido en el formato de Puerto Montt). Calibrar con
        // customdata {"calibracion":true} y ajustar desplazamientoX / desplazamientoY.
        pagofactura_cheque_pdf: {
            recordType:   RECORD_TYPES.VENDOR_PAYMENT,
            templatePath: '/SuiteScripts/AndesScripts/APIGlobales/ImpresionPDF/templates/AS.FTL.ChequePagoFactura.ftl',
            fonts:        [],
            getFileName:  (data) => data.header.nombreArchivo,
            layout: {
                margenSuperior:  0.2,
                margenIzquierdo: 0.6,
                desplazamientoX: 5.8,   // ancho del talón
                desplazamientoY: 0.17,  // calibración 2 (08/10/2026, cheque 0060061)
                altoCheque:      7,
                maxPosiciones:   4,
                fontFamily:      'Courier',
                fontWeight:      'bold',
                fontSize:        '10pt',
                formato: {
                    prefijoValor:  '***',
                    sufijoValor:   '.*****',
                    prefijoLetras: '***',
                    sufijoLetras:  '.*******'
                },
                campos: {
                    // Calibradas con la prueba física del 08/10/2026 (cheque 0060057, Puerto Montt)
                    valor:    { x: 9.4,   y: 0.48, ancho: 4.9,  alto: 0.45 },
                    dia:      { x: 10.37, y: 1.35, ancho: 0.6,  alto: 0.45, align: 'center' },
                    mes:      { x: 10.85, y: 1.35, ancho: 2.3,  alto: 0.45, align: 'center' },
                    anio:     { x: 13.05, y: 1.35, ancho: 1.2,  alto: 0.45, align: 'center' },
                    nombre:   { x: 2.0,   y: 2.05, ancho: 12.7, alto: 0.45 },
                    cantidad: { x: 2.0,   y: 2.84, ancho: 12.0, alto: 0.95, fontSize: '9pt', maxLineas: 2 }
                }
            }
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
        CONFIG_CHEQUE,
        REPORTS_BASE,
        REPORTS_BY_SUBSIDIARY,
        getReportConfig
    };
});
