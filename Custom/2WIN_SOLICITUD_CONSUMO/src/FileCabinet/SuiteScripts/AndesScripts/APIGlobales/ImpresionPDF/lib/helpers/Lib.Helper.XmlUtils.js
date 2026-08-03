/**
 * @NApiVersion 2.1
 * Helper: utilidades para procesamiento de archivos XML firmados (SUNAT).
 * Extrae el DigestValue del XML de respuesta SUNAT para incluirlo en el PDF.
 */
define(['N/https', 'N/encode', 'N/xml'], (https, encode, xml) => {

    /**
     * Descarga el XML desde una URL y extrae el valor del tag indicado.
     * Usado para obtener el hash (ds:DigestValue) de guías firmadas.
     *
     * @param {string} xmlUrl   - URL del archivo XML (http o https)
     * @param {string} [tagName='ds:DigestValue'] - Nombre del tag a extraer
     * @returns {string} Valor del tag, o '' si no se encontró o hubo error
     */
    const extractTagValueFromXml = (xmlUrl, tagName = 'ds:DigestValue') => {
        if (!xmlUrl) return '';

        try {
            const safeUrl = xmlUrl.replace(/^http:/, 'https:');
            const response = https.get({
                url: safeUrl,
                headers: { 'Accept-Language': 'en-us' }
            });

            if (response.code !== 200 || !response.body) return '';

            const xmlString = encode.convert({
                string: response.body,
                inputEncoding:  encode.Encoding.BASE_64,
                outputEncoding: encode.Encoding.UTF_8
            });

            const xmlDoc  = xml.Parser.fromString(xmlString);
            const tagNode = xmlDoc.getElementsByTagName(tagName)[0];

            return tagNode ? tagNode.textContent : '';

        } catch (e) {
            log.error('Lib.Helper.XmlUtils | extractTagValueFromXml', e);
            return '';
        }
    };

    return { extractTagValueFromXml };
});
