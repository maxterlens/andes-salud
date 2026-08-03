/**
 * @NApiVersion 2.1
 * @NModuleScope Public
 *
 * GSC_Form_Scripts — Inyección de scripts cliente inline y renderizado de error.
 *
 * Responsabilidades:
 *  - Generar el bloque <script> con todas las funciones JavaScript de lado cliente
 *    necesarias para el Suitelet (navegación, acciones de botones, gestión de filas
 *    de la tabla de detalle, sincronización de campos antes del submit).
 *  - Renderizar un formulario de error simple cuando ocurre una excepción.
 *
 * Las URLs de los Suitelets externos (consumir, PDF) se resuelven aquí con N/url
 * para que el script inline las tenga disponibles como constantes.
 */
define(['N/log', 'N/ui/serverWidget', 'N/url', '../lib/GSC_Lib_Utils'], function (
    nLog, serverWidget, url, utils
) {

    /**
     * Inyecta el bloque de scripts JavaScript cliente en el formulario.
     *
     * @param {serverWidget.Form} form       - Formulario serverWidget
     * @param {string|null}       solicitudId - Internal ID del registro (null en create)
     * @param {string}            modo        - 'view' | 'create' | 'edit'
     */
    function inyectarScriptsCliente(form, solicitudId, modo) {
        var baseUrl     = _resolveScript('customscript_as_solicitud_consumo_stlt', 'customdeploy_as_solicitud_consumo_stlt');
        var urlConsumir = _resolveScript('customscript_2win_sl_consumir',            'customdeploy_2win_sl_consumir');
        var urlPdf      = _resolveScript('customscript_as_impresion_pdf_stlt',       'customdeploy_as_impresion_pdf_stlt');

        // Solo constantes de URL y modo. Las funciones de acción viven en AS_ActionButtons_CLNT_2.1.js
        // y son resueltas por NetSuite como exports del módulo clientScriptModulePath.
        var script = '<script>'
            + 'var GS_BASE_URL=' + JSON.stringify(baseUrl)     + ';'
            + 'var GS_CONSUMIR=' + JSON.stringify(urlConsumir) + ';'
            + 'var GS_PDF='      + JSON.stringify(urlPdf)      + ';'
            + 'var GS_MODO='     + JSON.stringify(modo)        + ';'
            + '<\/script>';

        var fldScript = form.addField({
            id   : 'custpage_scripts_inline',
            type : serverWidget.FieldType.INLINEHTML,
            label: ' '
        });
        fldScript.defaultValue = script;
    }

    /**
     * Renderiza un formulario de error simple.
     * @param {object} response - context.response del Suitelet
     * @param {string} mensaje
     */
    function renderError(response, mensaje) {
        var form = serverWidget.createForm({ title: 'Error' });
        var fld  = form.addField({ id: 'custpage_err', type: serverWidget.FieldType.INLINEHTML, label: ' ' });
        fld.defaultValue = '<div style="color:red;padding:20px;border:1px solid red;background:#ffe0e0;border-radius:4px;">'
            + '<h3>Error</h3>'
            + '<p>' + utils.escHtml(mensaje) + '</p>'
            + '<br><button type="button" onclick="history.back()">Volver</button>'
            + '</div>';
        response.writePage(form);
    }

    /* ── privado ── */

    function _resolveScript(scriptId, deploymentId) {
        try {
            return url.resolveScript({ scriptId: scriptId, deploymentId: deploymentId, params: {} });
        } catch (e) {
            nLog.error('GSC_Form_Scripts._resolveScript - error', { scriptId: scriptId, error: e });
            return '';
        }
    }

    return {
        inyectarScriptsCliente,
        renderError
    };
});
