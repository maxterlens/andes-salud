
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

        const obtenerCorreosNotificacion = ({ agrupar, subsidiaryId, vendorId, correoIndividual }) => {

            const individual = correoIndividual ? [correoIndividual] : [];
            if (!agrupar) return individual;
            const correos = [];

            search.create({
                type:    'customrecord_as_correo_notif_oc_subs',
                filters: [
                    ['custrecord_as_cn_subsidiaria', 'anyof',      subsidiaryId], 'AND',
                    ['custrecord_as_cn_vendedor',    'anyof',      vendorId],     'AND',
                    ['custrecord_as_cn_correo',      'isnotempty', ''],           'AND',
                    ['isinactive',                   'is',         'F']
                ],
                columns: ['custrecord_as_cn_correo']
            }).run().each((result) => {
                correos.push(result.getValue({ name: 'custrecord_as_cn_correo' }));
                return true;
            });

            if (!correos.length) {
                log.error({
                    title:   'obtenerCorreosNotificacion - Sin contactos configurados',
                    details: `No hay contactos para Subsidiaria ${subsidiaryId} / Proveedor ${vendorId}. Se usa el contacto individual de la OC.`
                });
                return individual;
            }

            return correos;
        };

        const onAction = (scriptContext) => {

            const { newRecord } = scriptContext;

            try {

                // ── 1. Leer parámetros del script ─────────────────────────────────
                const script          = runtime.getCurrentScript();
                const user            = runtime.getCurrentUser();
                const emailTemplateId = script.getParameter({ name: 'custscript_as_env_corr_apr_plantilla_c' });
                const pdfTemplateId   = script.getParameter({ name: 'custscript_as_env_corr_apr_plantilla_pdf' });

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

                const correoContactoNotificacion = poRecord.getValue({ fieldId: 'custbody_as_correo_notif_email' });
                const agruparContactos           = poRecord.getValue({ fieldId: 'custbody_as_agrupar_contacto_prov' });

                const correosAdicionales = obtenerCorreosNotificacion({
                    agrupar:          agruparContactos,
                    subsidiaryId:     subsidiaryId,
                    vendorId:         poRecord.getValue({ fieldId: 'entity' }),
                    correoIndividual: correoContactoNotificacion
                });

                log.debug({
                    title:   'Correos notificación',
                    details: `Modo: ${agruparContactos ? 'agrupado por proveedor' : 'contacto individual'} | Destinatarios: ${correosAdicionales.join(', ') || '(ninguno)'}`
                });

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

                // N/email.send admite 10 destinatarios como máximo (recipients + cc + bcc).
                const recipients = [createdBy, ...correosAdicionales].slice(0, 10);

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

                const recortado = recipients.length < correosAdicionales.length + 1;

                log.audit({
                    title:   'onAction - Correo enviado',
                    details: [
                        `OC:            ${recordId}`,
                        `Creador:       ${createdBy}`,
                        `Encontrados:   ${correosAdicionales.length}`,
                        `Enviados:      ${recipients.length}${recortado ? ' (tope de 10)' : ''}`,
                        `Destinatarios: ${recipients.join(', ')}`
                    ].join('\n')
                });

            } catch (e) {
                log.error({ title: 'onAction - Error inesperado', details: `${e.name}: ${e.message}` });
            }
        };

        return { onAction };

    }
);
