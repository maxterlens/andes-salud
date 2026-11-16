/**
 * @NApiVersion 2.1
 * @NModuleScope Public
 */
define([
    "N/runtime",
    "../dao/2win_dao_2w_reinyeccion_recaudacion",
    "../dao/2win_dao_archivo",
    "../dao/2win_dao_auditoria",
    "../dao/2win_dao_notas_sistema",
    "../dao/2win_dao_tarea",
    "../dao/2win_dao_transacciones",
    "../dao/2win_dao_vista_registros_reinyeccion"
], function (
    runtime,
    daoReinyeccion,
    daoArchivo,
    daoAuditoria,
    daoNotasSistema,
    daoTarea,
    daoTransacciones,
    daoVistaRegistrosReinyeccion
) {
    // Variable para almacenar datos del proceso
    let proceso = {
        nombreProceso: "2win_respaldo",
        scriptId: "",
        etapa: "",
        estado: "000",
        tokenProceso: "",
        descripcionResultado: ""
    };

    /**
     * @function recuperarRegistrosNetsuite
     * @param {object} parametro - Datos requeridos para ejecucion
     * @returns {object} - Datos de ejecucion
     */
    function recuperarRegistrosNetsuite(parametro) {
        try {
            // Iniciar registro de log
            log.audit("recuperarRegistrosNetsuite - parametro", parametro);

            // Ajustar objeto proceso
            proceso.etapa = recuperarRegistrosNetsuite.name;
            proceso.scriptId = runtime.getCurrentScript().id;
            // proceso.tokenProceso = daoAuditoria.obtenerToken(); // Generar token para auditoria

            // Recuperar registros auditoria fallidos
            const registrosAuditoriaFallidos = daoAuditoria.busquedaRegistrosFallidos(parametro);

            return registrosAuditoriaFallidos;
        } catch (error) {
            log.error("recuperarRegistrosNetsuite - error", error);

            // Crear registro auditoria
            proceso.estado = "001";
            proceso.descripcionResultado = error.message;
            // daoAuditoria.crearReporteAuditoria(proceso);

            throw error;
        }
    }

    /**
     * @function crearRegistrosReinyeccion
     * @param {object} parametro - Datos requeridos para ejecucion
     * @returns {object} - Datos de ejecucion
     */
    function crearRegistrosReinyeccion(parametro) {
        try {
            // Iniciar registro de log
            log.audit("crearRegistrosReinyeccion - parametro", parametro);

            // Ajustar objeto proceso
            proceso.etapa = crearRegistrosReinyeccion.name;
            proceso.scriptId = runtime.getCurrentScript().id;
            // proceso.tokenProceso = daoAuditoria.obtenerToken(); // Generar token para auditoria

            // Recuperar registros seleccioneado
            let registrosSeleccionados = daoVistaRegistrosReinyeccion.recuperarSeleccion(parametro);

            // Generar identificador unico para lote a procesar
            let uuidLote = daoAuditoria.obtenerToken();

            // Iterar sobre seleccion para crear registros
            let registrosReinyeccionCreados = []
            if (registrosSeleccionados && registrosSeleccionados.length > 0) {
                for (let index = 0; index < registrosSeleccionados.length; index++) {
                    registrosSeleccionados[index].custrecord_2w_rein_recaudacion_uuid = uuidLote;
                    let registrpReinyeccion = daoReinyeccion.crearRegistroReinyeccion(registrosSeleccionados[index]);
                    registrosReinyeccionCreados.push(registrpReinyeccion);
                }
            } else (
                log.audit("crearRegistrosReinyeccion - seleccionados", "Sin seleccion para crear registros de reinyeccion")
            )

            log.audit("crearRegistrosReinyeccion - registrosReinyeccionCreados", {
                extension: registrosReinyeccionCreados.length,
                registrosReinyeccionCreados: registrosReinyeccionCreados
            });

            // Crear tarea a script map reduce para procesamiento
            let internalidScript = "customscript_2win_mr_reinyeccion_recauda"
            let internalidDeploy = "customdeploy_2win_mr_reinyeccion_recauda"
            let parametrosTarea = {
                custscript_2w_mr_reinyeccion_regist: uuidLote
                // custscript_2w_mr_reinyeccion_regist: registrosReinyeccionCreados
            };
            daoTarea.crearTareaScriptMapReduce(internalidScript, internalidDeploy, parametrosTarea);

            return uuidLote;
        } catch (error) {
            log.error("crearRegistrosReinyeccion - error", error);

            // Crear registro auditoria
            proceso.estado = "001";
            proceso.descripcionResultado = error.message;
            // daoAuditoria.crearReporteAuditoria(proceso);

            throw error;
        }
    }

    /**
     * @function recuperarSeleccionParaReinyeccion
     * @param {object} parametro - Datos requeridos para ejecucion
     * @returns {object} - Datos de ejecucion
     */
    function recuperarSeleccionParaReinyeccion(parametro) {
        try {
            // Iniciar registro de log
            log.audit("recuperarSeleccionParaReinyeccion - parametro", parametro);

            // Ajustar objeto proceso
            proceso.etapa = recuperarSeleccionParaReinyeccion.name;
            proceso.scriptId = runtime.getCurrentScript().id;
            // proceso.tokenProceso = daoAuditoria.obtenerToken(); // Generar token para auditoria

            // Recuperar registros seleccioneado
            let registrosSeleccionados = daoVistaRegistrosReinyeccion.recuperarSeleccion(parametro);

            // Generar identificador unico para lote a procesar
            let uuidLote = daoAuditoria.obtenerToken();

            // Iterar sobre seleccion para crear registros
            let registrosAuditoriaSeleccionados = []
            if (registrosSeleccionados && registrosSeleccionados.length > 0) {
                for (let index = 0; index < registrosSeleccionados.length; index++) {
                    registrosSeleccionados[index].custrecord_2w_rein_recaudacion_uuid = uuidLote;
                    registrosAuditoriaSeleccionados.push(registrosSeleccionados[index]);
                }
            } else (
                log.audit("recuperarSeleccionParaReinyeccion - seleccionados", "Sin seleccion para crear registros de reinyeccion")
            )

            log.audit("recuperarSeleccionParaReinyeccion - registrosAuditoriaSeleccionados", {
                extension: registrosAuditoriaSeleccionados.length,
                registrosAuditoriaSeleccionados: registrosAuditoriaSeleccionados
            });

            if (registrosAuditoriaSeleccionados.length > 0) {       
                // Crear tarea a script map reduce para procesamiento
                let internalidScript = "customscript_2win_mr_creacion_reinyeccio"
                let internalidDeploy = "customdeploy_2win_mr_creacion_reinyeccio"
                let parametrosTarea = {
                    custscript_2w_mr_reinyeccion_selecci: registrosAuditoriaSeleccionados
                    // custscript_2w_mr_reinyeccion_regist: registrosReinyeccionCreados
                };
                daoTarea.crearTareaScriptMapReduce(internalidScript, internalidDeploy, parametrosTarea);
            }


            return uuidLote;
        } catch (error) {
            log.error("recuperarSeleccionParaReinyeccion - error", error);

            // Crear registro auditoria
            proceso.estado = "001";
            proceso.descripcionResultado = error.message;
            // daoAuditoria.crearReporteAuditoria(proceso);

            throw error;
        }
    }

    /**
     * @function crearRegistroReinyeccion
     * @param {object} parametro - Datos requeridos para ejecucion
     * @returns {object} - Datos de ejecucion
     */
    function crearRegistroReinyeccion(parametro) {
        try {
            // Iniciar registro de log
            log.audit("crearRegistroReinyeccion - parametro", parametro);

            // Ajustar objeto proceso
            proceso.etapa = crearRegistroReinyeccion.name;
            proceso.scriptId = runtime.getCurrentScript().id;
            // proceso.tokenProceso = daoAuditoria.obtenerToken(); // Generar token para auditoria
            
            let registoReinyeccion = daoReinyeccion.crearRegistroReinyeccion(parametro);

            return registoReinyeccion;
        } catch (error) {
            log.error("crearRegistroReinyeccion - error", error);

            // Crear registro auditoria
            proceso.estado = "001";
            proceso.descripcionResultado = error.message;
            // daoAuditoria.crearReporteAuditoria(proceso);

            throw error;
        }
    }

    /**
     * @function recuentoEjecucion - Función para generar logs de recuento ejecucion.
     * @param {object} parametro - Parametro para ejecucion.
     * @param {{error: string }} parametro.inputSummary - Parametro para ejecucion.
     * @param {{errors: object }} parametro.mapSummary - Parametro para ejecucion.
     * @param {{errors: object }} parametro.reduceSummary - Parametro para ejecucion.
     * @returns {object} - Datos de ejecucion.
     */
    function recuentoEjecucion(parametro) {
        try {
            log.audit("recuentoEjecucion - parametro", parametro);

            // Ajustar objeto proceso
            proceso.etapa = recuentoEjecucion.name;
            proceso.scriptId = runtime.getCurrentScript().id;
            // proceso.tokenProceso = libAuditoria.obtenerToken(); // Generar token para auditoria

            // Objeto para almacenar datos de resumen proceso
            let uuidLote = "";
            let resumenProceso = {
                procesados: 0,
                erroneos: 0,
                errores: [],
            };

            // Recuperar error de etapa getInputData
            if (parametro.inputSummary && parametro.inputSummary.error) {
                log.error("recuentoEjecucion - inputSummaryerror", parametro.inputSummary.error);
                throw new Error(parametro.inputSummary.error);
            }

            /** @type {Object[]} */
            let resumenErrores = [];
            // Recuperar errores etapa map
            parametro.mapSummary.errors.iterator().each(function (key, value) {
                value = JSON.parse(value);
                resumenErrores.push(value);
                return true;
            });

            // Recuperar errores etapa reduce
            parametro.reduceSummary.errors.iterator().each(function (key, value) {
                value = JSON.parse(value);
                resumenErrores.push(value);
                return true;
            });

            // Recuperar pares key-value de salida
            parametro.output.iterator().each(function (key, value) {
                log.debug("recuentoEjecucion - key - " + key, {
                    extension: value.length,
                    tipo: typeof value,
                    value: value
                });

                // Parsear value
                let valueParseado = JSON.parse(value);
                log.debug("recuentoEjecucion - salida - " + key, {
                    extension: valueParseado.length,
                    valueParseado: valueParseado
                });

                if (valueParseado) {
                    // Aislar uuid de lote
                    uuidLote = valueParseado.custrecord_2w_rein_recaudacion_uuid;
                    if (valueParseado.procesado) {
                        resumenProceso.procesados += 1;
                    } else if (valueParseado.error && valueParseado.error !== "") {
                        resumenProceso.erroneos += 1;
                    }
                }

                return true;
            });

            // Validar errores
            if (resumenErrores.length > 0) {
                log.error("recuentoEjecucion - resumenProceso - errores", {
                    extension: resumenErrores.length,
                    errores: resumenErrores
                });
            }

            if (uuidLote !== "") {  
                // Crear tarea a script map reduce para procesamiento
                let internalidScript = "customscript_2win_mr_reinyeccion_recauda"
                let internalidDeploy = "customdeploy_2win_mr_reinyeccion_recauda"
                let parametrosTarea = {
                    custscript_2w_mr_reinyeccion_regist: uuidLote
                    // custscript_2w_mr_reinyeccion_regist: registrosReinyeccionCreados
                };
                daoTarea.crearTareaScriptMapReduce(internalidScript, internalidDeploy, parametrosTarea);
            } else {
                log.audit("recuentoEjecucion - tarea", "No se puedo crear tarea a script map reduce")
            }

            // Logs resumen registros procesados y no procesados
            log.audit("recuentoEjecucion - resumenProceso", {
                resumenProceso: resumenProceso
            });

            return parametro;
        } catch (error) {
            log.error("recuentoEjecucion - error", error);

            // Crear registro auditoria
            proceso.estado = "001";
            proceso.descripcionResultado = error.message;
            // libAuditoria.crearReporteAuditoria(proceso);

            throw error;
        }
    }

    return {
        recuperarRegistrosNetsuite: recuperarRegistrosNetsuite,
        crearRegistrosReinyeccion: crearRegistrosReinyeccion,
        recuperarSeleccionParaReinyeccion: recuperarSeleccionParaReinyeccion,
        crearRegistroReinyeccion: crearRegistroReinyeccion,
        recuentoEjecucion: recuentoEjecucion
    };
});
