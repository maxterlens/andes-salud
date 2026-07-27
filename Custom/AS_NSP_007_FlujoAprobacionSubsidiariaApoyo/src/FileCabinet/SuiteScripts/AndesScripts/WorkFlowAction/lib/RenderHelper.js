/**
 * @NApiVersion 2.1
 * @NModuleScope SameAccount
 */

/**
 * RenderHelper.js
 *
 * Librería de utilidades para renderizado de plantillas en NetSuite.
 * Expone métodos para renderizar cuerpos de correo electrónico usando
 * plantillas de email y para generar archivos PDF usando plantillas
 * Advanced PDF/HTML.
 *
 * @author      Andes Salud
 * @version     2.1
 */

define(['N/render', 'N/record'], (render, record) => {

    /**
     * Renderiza el asunto y cuerpo de un correo electrónico a partir de una
     * plantilla de email de NetSuite (record type -120), fusionada con una
     * transacción y un destinatario.
     *
     * @param   {Object}        params
     * @param   {number|string} params.templateId    - Internal ID de la plantilla de correo
     * @param   {number|string} params.transactionId - Internal ID de la transacción (OC)
     * @param   {number|string} params.recipientId   - Internal ID del empleado destinatario
     * @returns {{ subject: string, body: string }}
     */
    const renderEmailTemplate = ({ templateId, transactionId, recipientId }) => {

        const mergedEmail = render.mergeEmail({
            templateId,
            transactionId
        });

        return {
            subject: mergedEmail.subject,
            body:    mergedEmail.body
        };
    };

    /**
     * Renderiza un registro de transacción como archivo PDF usando una plantilla
     * Advanced PDF/HTML de NetSuite (record type -387).
     *
     * @param   {Object}            params
     * @param   {number|string}     params.templateId - Internal ID de la plantilla PDF/HTML avanzada
     * @param   {N/record.Record}   params.rec        - Objeto record cargado de la transacción
     * @returns {N/file.File}       Archivo PDF renderizado en memoria
     */
    const renderTransactionPdf = ({ templateId, rec }) => {

        const renderer = render.create();
        renderer.setTemplateById({ id: templateId });
        renderer.addRecord({ templateName: 'record', record: rec });

        return renderer.renderAsPdf();
    };

    return {
        renderEmailTemplate,
        renderTransactionPdf
    };

});
