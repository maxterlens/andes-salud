/**
 * @NApiVersion 2.1
 * @NModuleScope SameAccount
 */
define(['N/search', 'N/email', 'N/render', 'N/record', 'N/runtime', 'N/log'],
    (search, email, render, record, runtime, log) => {

        //Dentro del deploy se debe configurar los siguientes parametros:
        // N/email.send admite 10 destinatarios como maximo (recipients + cc + bcc).
        const MAX_DESTINATARIOS = 10;

        const obtenerParametros = () => {
            const script = runtime.getCurrentScript();

            return {
                autorCorreo:     script.getParameter({ name: 'custscript_as_aopr_autor_correo' }),
                plantillaCorreo: Number(script.getParameter({ name: 'custscript_as_aopr_plantilla_correo' })),
                plantillaPdf:    script.getParameter({ name: 'custscript_as_aopr_plantilla_pdf' })
            };
        };


        const buscarOrdenesPendientesRecepcion = () => {
            const ordenes = {};

            search.create({
                type:    search.Type.PURCHASE_ORDER,
                filters: [
                    ['mainline', 'is',    'T'],          'AND',
                    ['status',   'anyof', 'PurchOrd:B'], 'AND',
                    ['formulanumeric: TRUNC({today}) - TRUNC({custbody_as_ultimo_fecha_aprobador})', 'greaterthanorequalto', 5]
                ],
                columns: [
                    'tranid',
                    'entity',
                    'subsidiary',
                    'custbody_as_correo_notif_email',
                    'custbody_as_agrupar_contacto_prov',
                    search.createColumn({
                        name:    'formulanumeric',
                        formula: 'TRUNC({today}) - TRUNC({custbody_as_ultimo_fecha_aprobador})'
                    })
                ]
            }).run().each((resultado) => {
                ordenes[resultado.id] = {
                    id:            resultado.id,
                    tranid:        resultado.getValue({ name: 'tranid' }),
                    proveedor:     resultado.getText({ name: 'entity' }),
                    vendorId:      resultado.getValue({ name: 'entity' }),
                    subsidiariaId: resultado.getValue({ name: 'subsidiary' }),
                    correoOC:      resultado.getValue({ name: 'custbody_as_correo_notif_email' }),
                    agrupar:       resultado.getValue({ name: 'custbody_as_agrupar_contacto_prov' }),
                    dias:          resultado.getValue({ name: 'formulanumeric' })
                };
                return true;
            });

            log.debug({
                title:   'buscarOrdenesPendientesRecepcion',
                details: `OC en Pending Receipt con 5 o mas dias desde la ultima aprobacion: ${Object.keys(ordenes).length}`
            });

            return ordenes;
        };

        const buscarContactosProveedor = (oc) => {
            const correos = [];

            search.create({
                type:    'customrecord_as_correo_notif_oc_subs',
                filters: [
                    ['custrecord_as_cn_subsidiaria', 'anyof',      oc.subsidiariaId], 'AND',
                    ['custrecord_as_cn_vendedor',    'anyof',      oc.vendorId],      'AND',
                    ['custrecord_as_cn_correo',      'isnotempty', ''],               'AND',
                    ['isinactive',                   'is',         'F']
                ],
                columns: ['custrecord_as_cn_correo']
            }).run().each((resultado) => {
                correos.push(resultado.getValue({ name: 'custrecord_as_cn_correo' }));
                return true;
            });

            return correos;
        };

        const correoDelProveedor = (oc) => {
            const proveedor = search.lookupFields({
                type:    search.Type.VENDOR,
                id:      oc.vendorId,
                columns: ['email']
            });

            return proveedor.email ? [proveedor.email] : [];
        };

        const obtenerDestinatarios = (oc) => {
            if (oc.agrupar) {
                const contactos = buscarContactosProveedor(oc);

                if (contactos.length) return { correos: contactos, origen: 'contactos del proveedor (masiva)' };

                log.debug({
                    title:   `Masiva sin contactos | ${oc.tranid}`,
                    details: `Subsidiaria ${oc.subsidiariaId} / Proveedor ${oc.vendorId} sin contactos activos con correo. Se cae al Correo de Notificacion de la OC.`
                });
            }

            if (oc.correoOC) return { correos: [oc.correoOC], origen: 'Correo de Notificacion de la OC' };

            return { correos: correoDelProveedor(oc), origen: 'email del proveedor' };
        };


        const generarPdf = (oc, plantillaPdfId) => {
            const poRecord  = record.load({ type: record.Type.PURCHASE_ORDER, id: oc.id });
            const direccion = search.lookupFields({
                type:    'subsidiary',
                id:      oc.subsidiariaId,
                columns: ['address.address', 'taxidnum']
            });

            const renderer = render.create();
            renderer.setTemplateById({ id: plantillaPdfId });
            renderer.addRecord({ templateName: 'record', record: poRecord });
            renderer.addCustomDataSource({
                format: render.DataSource.OBJECT,
                alias:  'subsidiary',
                data:   {
                    mainaddress_text: direccion['address.address'].replace(/\r\n|\r|\n/g, '<br/>'),
                    taxidnum:         direccion['taxidnum']
                }
            });

            const pdfFile = renderer.renderAsPdf();
            pdfFile.name  = `${oc.tranid}.pdf`;

            return pdfFile;
        };

        const procesarOrdenCompra = (context) => {
            const oc         = JSON.parse(context.value);
            const parametros = obtenerParametros();

            const { correos, origen } = obtenerDestinatarios(oc);
            const destinatarios       = correos.slice(0, MAX_DESTINATARIOS);

            if (!destinatarios.length) {
                log.debug({
                    title:   `OC sin correo | ${oc.tranid}`,
                    details: `id ${oc.id} | Proveedor ${oc.proveedor} (id ${oc.vendorId}) | `
                             + `Sin contactos configurados, sin Correo de Notificacion y sin correo en el proveedor. Se omite el envio.`
                });
                context.write({ key: oc.id, value: 'SIN_CORREO' });
                return;
            }

            const { subject, body } = render.mergeEmail({
                templateId:    parametros.plantillaCorreo,
                transactionId: Number(oc.id)
            });

            const pdf = generarPdf(oc, parametros.plantillaPdf);

            email.send({
                author:         parametros.autorCorreo,
                recipients:     destinatarios,
                subject:        subject.replace(/{{DIAS}}/g, oc.dias),
                body:           body.replace(/{{DIAS}}/g, oc.dias),
                attachments:    [pdf],
                relatedRecords: { transactionId: oc.id }
            });

            const recorte = correos.length > destinatarios.length
                          ? ` (recortado de ${correos.length}, tope ${MAX_DESTINATARIOS})`
                          : '';

            log.debug({
                title:   `Alerta enviada | ${oc.tranid}`,
                details: `id ${oc.id} | ${oc.dias} dias | Para: ${destinatarios.join(', ')} | Origen: ${origen}${recorte} | Adjunto: ${pdf.name}`
            });

            context.write({ key: oc.id, value: 'ENVIADO' });
        };

        const resumirEjecucion = (context) => {
            if (context.inputSummary.error) {
                log.error({
                    title:   'Alerta OC pendiente de recepcion - Fallo la busqueda',
                    details: context.inputSummary.error
                });
            }

            const porEstado = { ENVIADO: [], SIN_CORREO: [], ERROR: [] };

            context.output.iterator().each((clave, estado) => {
                porEstado[estado].push(clave);
                return true;
            });

            const detalles = [
                `OC procesadas: ${porEstado.ENVIADO.length + porEstado.SIN_CORREO.length + porEstado.ERROR.length}`,
                `Alertas enviadas: ${porEstado.ENVIADO.length}`,
                `Sin correo: ${porEstado.SIN_CORREO.length}`,
                `Con error: ${porEstado.ERROR.length}`
            ];

            if (porEstado.SIN_CORREO.length) detalles.push(`OC sin correo (id): ${porEstado.SIN_CORREO.join(', ')}`);
            if (porEstado.ERROR.length)      detalles.push(`OC con error (id): ${porEstado.ERROR.join(', ')}`);

            log.audit({
                title:   'Alerta OC pendiente de recepcion - Resumen',
                details: detalles.join(' | ')
            });
        };


        return {
            buscarOrdenesPendientesRecepcion,
            procesarOrdenCompra,
            resumirEjecucion
        };
    }
);
