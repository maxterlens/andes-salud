/**
 * @NApiVersion 2.1
 * @NScriptType WorkflowActionScript
 * @NModuleScope SameAccount
 */

/**
 * AS_EnviarCorreoAprobacionOrdenCompra_WF_2.1.js
 *
 * Workflow Action: Enviar Correo de Aprobación - Orden de Compra
 *
 * Envía un correo electrónico al usuario que creó la Orden de Compra
 * adjuntando el PDF de la misma. El cuerpo del correo se genera a partir
 * de la plantilla configurada en custscript_as_env_corr_apr_plantilla_c
 * y el PDF se renderiza usando la plantilla Advanced PDF/HTML configurada
 * en custscript_as_env_corr_apr_plantilla_pdf.
 *
 * Parámetros del script:
 *   custscript_as_env_corr_apr_plantilla_c   → Plantilla de correo (record type -120)
 *   custscript_as_env_corr_apr_plantilla_pdf → Plantilla PDF/HTML avanzada (record type -387)
 *
 * @author      Andes Salud
 * @version     2.1
 */

define(['N/runtime', 'N/record', 'N/email', 'N/search', './lib/RenderHelper'],
    (runtime, record, email, search, RenderHelper) => {

        /**
         * @param {Object}              scriptContext
         * @param {N/record.Record}     scriptContext.newRecord - Registro actual de la transacción
         * @param {N/record.Record}     scriptContext.oldRecord - Registro anterior
         * @param {Object}              scriptContext.workflow  - Contexto del workflow
         */
        const onAction = (scriptContext) => {

            const { newRecord } = scriptContext;

            try {

                // ── 1. Leer parámetros del script ─────────────────────────────────
                const script          = runtime.getCurrentScript();
                const user            = runtime.getCurrentUser();
                const emailTemplateId = script.getParameter({ name: 'custscript_as_env_corr_apr_plantilla_c' });
                const pdfTemplateId   = script.getParameter({ name: 'custscript_as_env_corr_apr_plantilla_pdf' });
                const aditionalEmails = (script.getParameter({ name: 'custscript_as_env_corr_apr_correo_adi' }) || '').split(',');

                if (!emailTemplateId) {
                    log.error({
                        title:   'onAction - Parámetro faltante',
                        details: 'custscript_as_env_corr_apr_plantilla_c no tiene valor configurado.'
                    });
                    return;
                }

                if (!pdfTemplateId) {
                    log.error({
                        title:   'onAction - Parámetro faltante',
                        details: 'custscript_as_env_corr_apr_plantilla_pdf no tiene valor configurado.'
                    });
                    return;
                }

                // ── 2. Obtener datos de la OC ──────────────────────────────────────
                const recordId = newRecord.id;

                const ocFields  = search.lookupFields({
                    type:    record.Type.PURCHASE_ORDER,
                    id:      recordId,
                    columns: ['createdby']
                });
                const createdBy = ocFields.createdby?.[0]?.value;

                if (!createdBy) {
                    log.error({
                        title:   'onAction - Creador no encontrado',
                        details: `La OC ${recordId} no tiene usuario creador registrado.`
                    });
                    return;
                }

                log.audit({
                    title:   'onAction - Datos obtenidos',
                    details: `OC ID: ${recordId} | Creador ID: ${createdBy}`
                });

                // ── 3. Cargar el record completo para el render del PDF ────────────
                const poRecord = record.load({
                    type: record.Type.PURCHASE_ORDER,
                    id:   recordId
                });

                // ── 3.5. Obtener datos de la subsidiaria ──────────────────────────
                const subsidiaryId     = poRecord.getValue({ fieldId: 'subsidiary' });
                const subsidiaryLookup = search.lookupFields({
                    type:    'subsidiary',
                    id:      subsidiaryId,
                    columns: ['address.address', 'taxidnum']
                });

                const jsonSubsidiary = {
                    mainaddress_text: subsidiaryLookup['address.address'].replace(/\r\n|\r|\n/g, '<br/>'),
                    taxidnum:         subsidiaryLookup['taxidnum']
                };

                // ── 4. Renderizar cuerpo del correo ───────────────────────────────
                const { subject, body } = RenderHelper.renderEmailTemplate({
                    templateId:    emailTemplateId,
                    transactionId: recordId,
                    recipientId:   createdBy
                });
                
                // ── 5. Renderizar PDF de la OC ────────────────────────────────────
                const pdfFile = RenderHelper.renderTransactionPdf({
                    templateId:        pdfTemplateId,
                    rec:               poRecord,
                    subsidiary:        jsonSubsidiary
                });

                const tranid  = poRecord.getValue({ fieldId: 'tranid' });
                //const vendor  = poRecord.getText({ fieldId: 'entity' });
                pdfFile.name  = `${tranid}.pdf`;

                // ── 6. Enviar correo al creador de la OC ──────────────────────────
                let recipients = [createdBy, ... aditionalEmails]
                email.send({
                    author:     user.id,
                    recipients: recipients,
                    subject,
                    body,
                    attachments: [pdfFile],
                    relatedRecords: {
                        transactionId: recordId
                    }
                });

                log.audit({
                    title:   'onAction - Correo enviado',
                    details: `Correo enviado exitosamente al creador (ID: ${createdBy}) de la OC ${recordId}.`
                });

            } catch (e) {
                log.error({ title: 'onAction - Error inesperado', details: `${e.name}: ${e.message}` });
            }
        };

        return { onAction };

    }
);
