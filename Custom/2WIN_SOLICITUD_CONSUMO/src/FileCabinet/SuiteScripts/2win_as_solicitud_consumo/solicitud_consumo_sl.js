/**
 * @NApiVersion 2.1
 * @NScriptType Suitelet
 * @NModuleScope Public
 */
define([
    "N/record", 
    "N/search", 
    "N/redirect", 
    "N/runtime",
    "N/log", 
    "N/ui/serverWidget",
    "./dao/2win_dao_ajuste_inventario",
    "./dao/2win_dao_balance_inventario",
    "./domain/2win_dom_solicitud_consumo",
    "./lib/2win_lib_email"
], function (
    record, 
    search, 
    redirect, 
    runtime,
    nLog, 
    serverWidget,
    daoAjusteInventario,
    daoBalanceInventario,
    domSolicitudConsumo,
    libEmail
) {

    /**
     * Entrada al Suitelet - GET y POST
     */
    function onRequest(context) {
        nLog.debug("onRequest - context", context);

        // Captura inicial
        let scriptObj = runtime.getCurrentScript();
        let startUnits = scriptObj.getRemainingUsage();
        let startTime = new Date().getTime();

        // Recuperar parametro de id registro solicitud
        const solicitudId = context.request.parameters.solicitud
        
        // Recuperar url de registro para redireccionar en caso de error
        const urlOrigen = libEmail.recuperarUrlRegistro({recordType: "customrecord_2win_solicitud_consumo", recordId: solicitudId});
        const urlOrigenHtml = encodeURIComponent(urlOrigen); // Url para usar en html
        nLog.debug("onRequest - urlOrigenHtml", {urlOrigenHtml: urlOrigenHtml});

        try {
            if (context.request.method === "GET") {
                // Procesar consumo
                domSolicitudConsumo.procesarConsumo(context);
            }
        } catch (error) {
            // Crear formulario para mostar error a usuario
            const form = serverWidget.createForm({
                title: "Error al procesar consumo"
            });

            const errorField = form.addField({
                id: "custpage_error",
                type: serverWidget.FieldType.INLINEHTML,
                label: " "
            });

            errorField.defaultValue = `
                <div style="color: red; padding: 20px; border: 1px solid red; background: #ffe0e0;">
                    <h2>Error</h2>
                    <p>${error.message}</p>
                    <br/>
                    <button type="button" onclick="window.location.href = decodeURIComponent('${urlOrigenHtml}')">Volver</button>
                </div>
            `;

            context.response.writePage(form);
        } finally {

            // Captura final
            let endTime = new Date().getTime();
            let endUnits = scriptObj.getRemainingUsage();

            // Calculo de unidades
            let unitsUsed = startUnits - endUnits;
            let executionTime = (endTime - startTime) / 1000; // En segundos
    
            log.audit("onRequest - metricas", {
                tiempoEjecucion: executionTime,
                unidadesUsadas: unitsUsed,
                unidadesRestantes: endUnits
            });
        }
        
    }

    return {
        onRequest: onRequest
    };
});
