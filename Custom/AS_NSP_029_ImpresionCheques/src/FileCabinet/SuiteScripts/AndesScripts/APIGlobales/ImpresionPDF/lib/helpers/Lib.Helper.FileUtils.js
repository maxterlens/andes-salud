/**
 * @NApiVersion 2.1
 * Helper: utilidades de archivos, fuentes y codificación.
 * Provee: carga de fuentes, conversión HTML→XLS, resolución de dominio, lookup de subsidiaria.
 */
define(['N/file', 'N/runtime', 'N/url', 'N/encode', 'N/search'],
    (file, runtime, url, encode, search) => {

    /**
     * Retorna el dominio de la cuenta (ej. "1234567.app.netsuite.com").
     * @returns {string}
     */
    const getAccountDomain = () => {
        return url.resolveDomain({
            hostType:  url.HostType.APPLICATION,
            accountId: runtime.accountId
        });
    };

    /**
     * Carga las URLs públicas de las fuentes definidas en Constants.FONTS
     * según las fuentes listadas en reportConfig.fonts.
     *
     * @param {Object} reportConfig - config del reporte (incluye propiedad fonts[])
     * @param {Object} Constants    - módulo Lib.Constants
     * @returns {Object} Mapa { FONT_NAME: { REGULAR: url, BOLD: url, ... } }
     */
    const loadFontsForReport = (reportConfig, Constants) => {
        const fontsData = {};
        const domain    = getAccountDomain();

        (reportConfig.fonts || []).forEach(fontName => {
            const fontDef = Constants.FONTS[fontName];
            if (!fontDef) {
                log.error('Lib.Helper.FileUtils | loadFontsForReport',
                    `Fuente "${fontName}" no está definida en Constants.FONTS`);
                return;
            }

            fontsData[fontName] = {};
            Object.keys(fontDef).forEach(variant => {
                try {
                    const fileObj = file.load({ id: fontDef[variant] });
                    fontsData[fontName][variant] = `https://${domain}${fileObj.url}`;
                } catch (e) {
                    log.error('Lib.Helper.FileUtils | loadFontsForReport',
                        `No se pudo cargar variante "${variant}" de fuente "${fontName}": ${e.message}`);
                }
            });
        });

        return fontsData;
    };

    /**
     * Convierte un string HTML en un archivo XLS en memoria (N/file).
     *
     * @param {string} htmlString
     * @param {string} fileName - Nombre del archivo con extensión .xls
     * @returns {N.file.File}
     */
    const htmlToXlsFile = (htmlString, fileName) => {
        const base64Content = encode.convert({
            string:          htmlString,
            inputEncoding:   encode.Encoding.UTF_8,
            outputEncoding:  encode.Encoding.BASE_64
        });

        return file.create({
            name:     fileName,
            fileType: file.Type.EXCEL,
            contents: base64Content,
            encoding: file.Encoding.UTF_8
        });
    };

    /**
     * Obtiene el internalId de la subsidiaria de un registro por tipo e id.
     *
     * @param {string} recordType      - Tipo de registro NetSuite
     * @param {string|number} id       - Id interno del registro
     * @param {string} subsidiaryField - Campo subsidiaria (default: 'subsidiary').
     *                                   Para custom records usar el fieldId específico
     *                                   (ej. 'custrecord_2win_consumo_subsidiaria').
     * @returns {string} subsidiaryId, o '' si no se encontró
     */
    const getSubsidiaryId = (recordType, id, subsidiaryField = 'subsidiary') => {
        try {
            const result      = search.lookupFields({
                type:    recordType,
                id:      id,
                columns: [subsidiaryField]
            });
            const fieldResult = result[subsidiaryField];
            return fieldResult?.length ? fieldResult[0].value : '';
        } catch (e) {
            log.error('Lib.Helper.FileUtils | getSubsidiaryId',
                `Error obteniendo subsidiaria para ${recordType}:${id} campo:${subsidiaryField} - ${e.message}`);
            return '';
        }
    };

    return {
        getAccountDomain,
        loadFontsForReport,
        htmlToXlsFile,
        getSubsidiaryId
    };
});
