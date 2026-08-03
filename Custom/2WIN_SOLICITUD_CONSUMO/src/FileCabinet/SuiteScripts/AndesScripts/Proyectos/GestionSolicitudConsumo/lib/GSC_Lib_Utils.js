/**
 * @NApiVersion 2.1
 * @NModuleScope Public
 *
 * GSC_Lib_Utils — Utilidades compartidas del módulo Gestión Solicitud de Consumo.
 * Sin dependencias de NetSuite; funciones puras reutilizables en cualquier capa.
 */
define([], function () {

    /**
     * Formatea una fecha como DD/MM/YYYY.
     * @param {Date|string} d
     * @returns {string}
     */
    function formatDate(d) {
        if (!d) return '';
        const dt = d instanceof Date ? d : new Date(d);
        if (isNaN(dt.getTime())) return '';
        const dd = String(dt.getDate()).padStart(2, '0');
        const mm = String(dt.getMonth() + 1).padStart(2, '0');
        return dd + '/' + mm + '/' + dt.getFullYear();
    }

    /**
     * Escapa caracteres especiales para uso seguro dentro de HTML.
     * @param {*} str
     * @returns {string}
     */
    function escHtml(str) {
        return String(str || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    /**
     * Escapa comillas dobles para uso seguro en atributos HTML.
     * @param {*} str
     * @returns {string}
     */
    function escAtr(str) {
        return String(str || '').replace(/"/g, '&quot;');
    }

    return {
        formatDate,
        escHtml,
        escAtr
    };
});
