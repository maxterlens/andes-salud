/**
 * @NApiVersion 2.1
 * @NScriptType Suitelet
 * @NModuleScope Public
 */
define([
    "N/redirect",
    "N/runtime",
    "N/ui/serverWidget",
    "../domain/2win_dom_formulario_busqueda",
    "../domain/2win_dom_reinyeccion",
    "../domain/2win_dom_vista_registros_auditoria",
    "../domain/2win_dom_vista_registros_reinyeccion"
], function (
    redirect,
    runtime,
    serverWidget,
    domFormularioReinyeccion,
    domReinyeccion,
    domVistaRegistrosAuditoria,
    domVistaRegistrosReinyeccion
) {

    /**
     * Entrada al Suitelet - GET y POST
     */
    function onRequest(context) {
        log.debug("onRequest - context", context);

        // --- CAPTURA INICIAL DE DATOS PARA METRICAS DE EJECUCION ---
        let scriptObj = runtime.getCurrentScript();
        let startUnits = scriptObj.getRemainingUsage();
        let startTime = new Date().getTime();

        try {
            // --- MOSTAR FORMULARO DE BUSQUEDA ---
            if (
                context.request.method === "GET" &&
                !context.request.parameters.custpage_2win_reinyeccion_recaudaciones_fecha &&
                !context.request.parameters.custpage_resumen_reinyeccion
            ) {
                // Generar formulario para busqueda de registros auditoria
                const form = domFormularioReinyeccion.generarFormularioBusqueda();
                context.response.writePage(form);

            // --- VISTA DE SELECCION ---
            } else if (
                context.request.method === "POST" &&
                context.request.parameters.custpage_2win_reinyeccion_recaudaciones_fecha &&
                !context.request.parameters.custpage_2win_vista_auditoria_es_reinyeccion
            ) {
                // context.request.headers['Content-Type'] = 'application/json';

                // Ejecutar busqueda de registros
                const registrosAuditoria = domReinyeccion.recuperarRegistrosNetsuite(context.request.parameters.custpage_2win_reinyeccion_recaudaciones_fecha);

                const form = domVistaRegistrosAuditoria.generarVistaRegistrosAuditoria(registrosAuditoria);

                context.response.writePage(form);

            // --- PROCESAMIENTO ---
            }  else if (
                context.request.method === "POST" &&
                context.request.parameters.custpage_2win_vista_auditoria_es_reinyeccion
            ) {
            // Crear registros de reinyeccion necesarios
                // let uuidLoteReinyeccion = domReinyeccion.crearRegistrosReinyeccion(context.request);
                let uuidLoteReinyeccion = domReinyeccion.recuperarSeleccionParaReinyeccion(context.request);

                redirect.toSuitelet({
                    scriptId: context.request.parameters.script,
                    deploymentId: context.request.parameters.deploy,
                    parameters: {
                        custpage_resumen_reinyeccion: true,
                        custpage_uuid_lote_reinyeccion: uuidLoteReinyeccion
                    }
                });
            // --- MOSTRAR VISTA RESUMEN PROCESAMIENTO ---
            } else if (
                context.request.method === "GET" &&
                context.request.parameters.custpage_resumen_reinyeccion
            ) {
                let form = domVistaRegistrosReinyeccion.generarVistaRegistrosReinyeccion(context.request.parameters.custpage_uuid_lote_reinyeccion);
                context.response.writePage(form);
            }

        // --- MOSTRAR VISTA PARA ERRORES EN EJECUCION ---
        } catch (error) {
            log.audit("onRequest - error", error);

            // Crear formulario para mostar error a usuario
            const form = serverWidget.createForm({
                title: "Error al procesar"
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
                </div>
            `;

            context.response.writePage(form);

        // --- RESUMEN METRICAS DE EJECUCION ---
        } finally {

            // Captura final
            let endTime = new Date().getTime();
            let endUnits = scriptObj.getRemainingUsage();

            // Calculo de unidades
            let unitsUsed = startUnits - endUnits;
            // En segundos
            let executionTime = (endTime - startTime) / 1000;
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
