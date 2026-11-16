/**
 * @NApiVersion 2.1
 * @NScriptType MapReduceScript
 */
define([
    "N/error",
    "N/runtime",
    "../domain/2win_dom_procesar_reinyeccion"
], function (
    nError,
    runtime,
    domProcesarReinyeccion
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
                // custscript_2w_mr_reinyeccion_regist: JSON.parse(scriptObj.getParameter({ name: "custscript_2w_mr_reinyeccion_regist" }))
                custscript_2w_mr_reinyeccion_regist: scriptObj.getParameter({ name: "custscript_2w_mr_reinyeccion_regist" })
            };

            // Recuperar datos de entrada para ejecucion de proceso
            const datosDeEntrada = domProcesarReinyeccion.recuperarRegistrosNetsuite(parametrosGetInputData);

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
                // Definir salida de map a reduce
                salida.internalid = entrada.internalid;
                salida.custrecord_2w_rein_recaudacion_identifi = entrada.custrecord_2w_rein_recaudacion_identifi
                salida.custrecord_2w_rein_recaudacion_proceso = entrada.custrecord_2w_rein_recaudacion_proceso

                // Validar campo en transacciones
                try {
                    let paraProcesar = domProcesarReinyeccion.validarCampoTransacciones(entrada);
                    salida.custrecord_2w_rein_recaudacion_registro = paraProcesar.custrecord_2w_rein_recaudacion_registro;
                    salida.recordtype = paraProcesar.recordtype;
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
     * @function reduce - Procesar los datos recuperados.
     * @param {Object} context - Datos recuperados del map.
     */
    function reduce(context) {
        let loteEntrada = [];
        let loteRegistrosIds = [];

        // Definir salida de reduce a summarize
        let salida = {
            etapa: ETAPA.REDUCE,
            error: "",
            loteRegistrosIds: [],
        };

        try {
            // log.audit("reduce - key " + context.key, {
            //     extension: context.values.length,
            //     values: context.values
            // });
            // Validar si existen datos de entrada a procesar
            if (context.values.length > 0 ) {
                // Parsear cada elemento del array de values para su procesamiento
                context.values.forEach(function (value) {
                    let entrada = JSON.parse(value);
                    loteEntrada.push(entrada);
                    loteRegistrosIds.push(entrada.custrecord_2w_rein_recaudacion_registro);
                });
                log.debug("reduce - loteEntrada", {
                    extension: loteEntrada.length,
                    loteEntrada: loteEntrada
                });

                // Procesar articulos
                let procesados = domProcesarReinyeccion.procesarReinyecciones(loteEntrada);

                // Recuento de unidades restantes para metricas
                let scriptObj = runtime.getCurrentScript();
                log.debug("reduce - unidadesRestantes", { unidadesRestantes: scriptObj.getRemainingUsage() });

                // Definir salida de reduce a summarize
                salida.loteSalida = procesados;
                salida.loteRegistrosIds = loteRegistrosIds;

                context.write(context.key, JSON.stringify(salida));
            } else {
                log.audit("reduce - sin datos de entrada a procesar");
                context.write(context.key, context.values);
            }

        } catch (error) {
            log.error("reduce - error", error);

            // Definir salida de reduce a summarize
            salida.loteSalida = loteEntrada;
            salida.error = error.message;
            salida.loteRegistrosIds = loteRegistrosIds;
            throw nError.create({
                name: "REDUCE_ERROR",
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
            domProcesarReinyeccion.recuentoEjecucion(summary);

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
        reduce: reduce,
        summarize: summarize
    };
});
