/**
 * @NApiVersion 2.1
 * @NScriptType Suitelet
 * @NModuleScope Public
 */
define([
    "N/record",
    "N/log",
    "./domain/2win_dom_solicitud_consumo",
], function (
    record,
    nLog,
    domSolicitudConsumo
) {

    /**
     * Entrada al Suitelet - GET y POST
     */
    function onRequest(context) {
        try {
            nLog.debug("onRequest - context", context)
            let registroId = context.request.parameters.registroId;
            if (!registroId) {
                context.response.write('Falta parámetro registroId');
                return;
            }
    
            // Cargar registro principal recuperando id desde parametro
            let objetoRegistro = record.load({ type: 'customrecord_2win_solicitud_consumo', id: registroId });

            // Generar PDF mediante dominio
            let archivoPdf = domSolicitudConsumo.eventoGeneracionPdf(objetoRegistro);

            // Enviar PDF como respuesta inline
            context.response.writeFile({ file: archivoPdf, isInline: true });
            
        } catch (error) {
            nLog.error("onRequest - error", error);
            throw error;
        }
    }

    return {
        onRequest: onRequest
    };
});
