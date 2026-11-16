/**
 * @NApiVersion 2.1
 * @NScriptType MapReduceScript
 */
define([
    "N/error",
    "N/runtime",
    "../domain/2win_dom_reinyeccion"
], function (
    nError,
    runtime,
    domReinyeccion
) {

    const ETAPA = {
        INPUT: "getInputData",
        MAP: "map",
        REDUCE: "reduce",
        SUMMARIZE: "summarize"
    };

    /**
     * @function getInputData - Recupera parametros necesarios para la ejecucion del proceso.
     * @returns {Array<object>} - Datos recuperados.
     */
    function getInputData() {
        try {
            log.audit("getInputData - inicio");
            const scriptObj = runtime.getCurrentScript();
            
            // Recuperar el valor del parámetro usando su ID
            const parametrosGetInputData = {
                custscript_2w_mr_reinyeccion_selecci: JSON.parse(scriptObj.getParameter({ name: "custscript_2w_mr_reinyeccion_selecci" }))
                // custscript_2w_mr_reinyeccion_selecci: scriptObj.getParameter({ name: "custscript_2w_mr_reinyeccion_selecci" })
            };
            
            // Recuperar datos de entrada para ejecucion de proceso
            const datosDeEntrada = parametrosGetInputData.custscript_2w_mr_reinyeccion_selecci
            log.audit("getInputData - datosDeEntrada", {
                extension: datosDeEntrada.length,
                datosDeEntrada: datosDeEntrada
            });

            // Recuento de unidades restantes para metricas
            log.audit("getInputData - unidadesRestantes", { unidadesRestantes: scriptObj.getRemainingUsage() });

            return datosDeEntrada;
        } catch (error) {
            log.error("getInputData - error", error);
            throw error;
        }
    }

    /**
     * @function map - Procesar los datos recuperados.
     * @param {Object} context - Datos recuperados del getInputData.
     * @param {String} context.value - Ariculo a mapear.
     */
    function map(context) {
        let salida = {
            etapa: ETAPA.MAP
        };
        let entrada;
        try {
            log.audit("map - context", { context: context });

            // Parsear value del getInputData
            entrada = JSON.parse(context.value);
            // log.audit("map - key: ${context.key}", {
            //     entrada: entrada
            // });

            // Validar si hay datos de entrada para procesar
            if (entrada) {
                // Definir salida de map
                salida.custrecord_2w_rein_recaudacion_auditoria = entrada.custrecord_2w_rein_recaudacion_auditoria;
                salida.custrecord_2w_rein_recaudacion_uuid = entrada.custrecord_2w_rein_recaudacion_uuid;

                // Crear registro para procesamiento reinyeccion
                try {
                    let paraProcesar = domReinyeccion.crearRegistroReinyeccion(entrada);
                    salida.procesado = true;
                    salida.internalid = paraProcesar;
                } catch (error) {
                    salida.error = error;
                }

                // Recuento de unidades restantes para metricas
                let scriptObj = runtime.getCurrentScript();
                log.debug("map - unidadesRestantes", { unidadesRestantes: scriptObj.getRemainingUsage() });

                context.write(context.key, JSON.stringify(salida));
            } else {
                log.audit("map - sin datos de entrada a procesar");
            }
        } catch (error) {
            log.error("map - error", error);

            // Definir salida
            salida.error = error.message;

            throw nError.create({
                name: "MAP_ERROR",
                message: JSON.stringify(salida)
            });
        }
    }

    /**
     * @function summarize - Resumen de la ejecucion.
     * @param {object} summary - Datos que resumen ejecucion del script.
     */
    function summarize(summary) {
        try {
            log.debug("summarize - summary", summary);

            // Generar recuento de ejecucion y ajustar valor parametros de operacion
            domReinyeccion.recuentoEjecucion(summary);

            // Metricas de ejecucion
            let scriptObj = runtime.getCurrentScript();
            log.audit("summarize - etapas", {
                getInputData: summary.inputSummary,
                map: summary.mapSummary,
                reduce: summary.reduceSummary
            });
            log.debug("summarize - unidades restantes: ", scriptObj.getRemainingUsage());
        } catch (error) {
            log.error("summarize - error", error);

            // Recuento de ejecucion
            let scriptObj = runtime.getCurrentScript();
            log.audit("summarize - etapas", {
                getInputData: summary.inputSummary,
                map: summary.mapSummary,
                reduce: summary.reduceSummary
            });
            log.debug("summarize - unidades restantes: ", scriptObj.getRemainingUsage());
        }
    }

    return {
        getInputData: getInputData,
        map: map,
        summarize: summarize
    };
});
