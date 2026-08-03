/**
 * @desc Librería para enviar emails.
 * @NApiVersion 2.1
 * @NModuleScope Public
 */
define([
    "N/email",
    "N/log",
    "N/record",
    "N/runtime",
    "N/search",
    "N/ui/serverWidget",
    "N/url"
], function (
    email,
    nLog,
    record,
    runtime,
    search,
    serverWidget,
    url
) {

    /**
     * @function recuperarUrlRegistro - Contruir url para visualizacion de registro
     * @param {object} parametro - Datos de registro para construccion url
     * @returns {string} - Url construida
     */
    function recuperarUrlRegistro(parametro) {
        try {
            nLog.debug("recuperarUrlRegistro - parametro", { parametro: parametro });

            // URL relativa del registro (view mode)
            let relativeUrl = url.resolveRecord({
                recordType: parametro.recordType,
                recordId: parametro.recordId,
                isEditMode: false
            });

            // Dominio de la cuenta (sin 'https://')
            let host = url.resolveDomain({
                hostType: url.HostType.APPLICATION  
            });

            // Construir URL absoluta
            let urlRegistro = 'https://' + host + relativeUrl;
            nLog.debug("recuperarUrlRegistro - urlRegistro", { urlRegistro: urlRegistro });

            return urlRegistro
        } catch (error) {
            nLog.error("recuperarUrlRegistro - error", error);
            throw error;
        }
    }

    function enviarEmailBodega(solicitudId, ubicacionId, tipoRegistro) {
        try {
            nLog.debug("enviarEmailBodega - parametros", {
                solicitudId: solicitudId,
                ubicacionId: ubicacionId,
                tipoRegistro: tipoRegistro
            });

            // Recuperar datos ubicacion
            const ubicacionInfo = search.lookupFields({
                type: search.Type.LOCATION,
                id: ubicacionId,
                columns: ["custrecord_2win_responsable_ubicacion"]
            });

            if (!ubicacionInfo.custrecord_2win_responsable_ubicacion || ubicacionInfo.custrecord_2win_responsable_ubicacion.length === 0) {
                nLog.audit("No hay responsable de ubicación configurado", `Ubicación ID: ${ubicacionId}`);
                return;
            }

            // Recuperar datos responsable
            const responsableId = ubicacionInfo.custrecord_2win_responsable_ubicacion[0].value;
            const responsable = search.lookupFields({
                type: search.Type.EMPLOYEE,
                id: responsableId,
                columns: ["email", "firstname", "lastname"]
            });

            // Recuperar url (view mode) registro
            const solicitudUrl = recuperarUrlRegistro({ recordType: tipoRegistro, recordId: solicitudId});

            // Definir cuerpo mensaje
            const cuerpo = `
                <p>Estimado(a) ${responsable.firstname} ${responsable.lastname},</p>

                <p>Tiene una nueva solicitud de consumo lista para preparar.</p>

                <p>Para revisar los artículos y confirmar el consumo, haz clic en el siguiente enlace:</p>
                <p><a href="${solicitudUrl}" target="_blank">Ver Solicitud: #${solicitudId}</a></p>

                <p>Si el enlace no lo redirecciona, copie la siguiente URL en su navegador:</p>
                <p>${solicitudUrl}</p>

                <p>Saludos cordiales.</p>
            `;

            // Enviar email
            email.send({
                author: runtime.getCurrentUser().id,
                recipients: responsable.email,
                subject: `Nueva Solicitud para Bodega - #${solicitudId}`,
                body: cuerpo
            });

            nLog.audit("enviarEmailBodega - enviado", `Notificación a bodega enviada a ${responsable.email}`);
        } catch (error) {
            nLog.error("enviarEmailBodega - error", error);
        }
    }

    function enviarEmailConsumida(solicitudId, solicitanteId, ajustesIds, tipoRegistro) {
        try {
            nLog.debug("enviarEmailConsumida - parametros", {
                solicitudId: solicitudId,
                solicitanteId: solicitanteId,
                ajustesIds: ajustesIds,
                tipoRegistro: tipoRegistro
            });

            // Recuperar datos solicitante
            const solicitante = search.lookupFields({
                type: search.Type.EMPLOYEE,
                id: solicitanteId,
                columns: ["email", "firstname", "lastname"]
            });

            // Recuperar url (view mode) registro
            const solicitudUrl = recuperarUrlRegistro({ recordType: tipoRegistro, recordId: solicitudId});

            // Definir cuerpo mensaje
            const cuerpo = `
                <p>Estimado(a) ${solicitante.firstname} ${solicitante.lastname},</p>
                
                <p>Su solicitud de consumo #${solicitudId} ha sido procesada exitosamente.</p>
                
                <p>Ajustes de inventario generados:${ajustesIds || "N/A"}.</p>

                <p>Ver solicitud:</p>
                <p><a href="${solicitudUrl}" target="_blank">Ver Solicitud: #${solicitudId}</a></p>

                <p>Si el enlace no lo redirecciona, copie la siguiente URL en su navegador:</p>
                <p>${solicitudUrl}</p>

                Saludos cordiales
            `;

            // Enviar email
            email.send({
                author: runtime.getCurrentUser().id,
                recipients: solicitante.email,
                subject: `Solicitud de Consumo Procesada - #${solicitudId}`,
                body: cuerpo
            });

            nLog.audit("enviarEmailConsumida - enviado", `Notificación de consumo enviada a ${solicitante.email}`);
        } catch (error) {
            nLog.error("enviarEmailConsumida - error", error);
        }
    }

    return {
        recuperarUrlRegistro: recuperarUrlRegistro,
        enviarEmailBodega: enviarEmailBodega,
        enviarEmailConsumida: enviarEmailConsumida
    };
});
