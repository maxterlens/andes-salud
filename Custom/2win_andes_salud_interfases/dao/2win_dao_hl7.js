/**
 * @NApiVersion 2.1
 * @module ./2win_dao_hl7.js
 * @NModuleScope Public
 */
define(["../lib/2win_lib_hl7/index"], function ({ Hl7Parser }) {
    /**
     * Corrige caracteres mal codificados (Latin-1 interpretado como UTF-8)
     * @param {string} text - Texto con caracteres mal codificados
     * @returns {string} - Texto corregido en UTF-8
     * @description Esta función corrige problemas de codificación comunes donde
     * caracteres UTF-8 son interpretados como Latin-1/ISO-8859-1
     */
    const fixEncoding = (text) => {
        if (!text || typeof text !== "string") return text;

        return text.replace(/Ã¡/g, "á")
            .replace(/Ã©/g, "é")
            .replace(/Ã­/g, "í")
            .replace(/Ã³/g, "ó")
            .replace(/Ãº/g, "ú")
            .replace(/Ã±/g, "ñ")
            .replace(/Ã‘/g, "Ñ")
            .replace(/Ã€/g, "À")
            .replace(/Ã¨/g, "È")
            .replace(/Ã¬/g, "Ì")
            .replace(/Ã²/g, "Ò")
            .replace(/Ã¹/g, "Ù")
            .replace(/ÃƒÂ¡/g, "á")
            .replace(/ÃƒÂ©/g, "é")
            .replace(/ÃƒÂ­/g, "í")
            .replace(/ÃƒÂ³/g, "ó")
            .replace(/ÃƒÂº/g, "ú")
            .replace(/ÃƒÂ±/g, "ñ")
            .replace(/ÃƒÂ‘/g, "Ñ");
    };

    /**
     * Funcion de parseo de mensaje en hl7 a objeto javascript
     * @param {string} RawMessage Cadena de texto en formato HL7 2.6
     * @returns {object} Objeto javascript con la estructura del mensaje HL7
     * @description Esta funcion recibe un mensaje en formato HL7 2.6 y lo convierte a un objeto javascript
     */
    const getMessageFromRawMessage = (RawMessage) => {
        // Corregir codificación de caracteres antes de parsear
        const correctedMessage = fixEncoding(RawMessage);
        const t = new Hl7Parser();
        const message = t.getHl7Model(correctedMessage, true);
        return message;
    };

    return { getMessageFromRawMessage };
});
