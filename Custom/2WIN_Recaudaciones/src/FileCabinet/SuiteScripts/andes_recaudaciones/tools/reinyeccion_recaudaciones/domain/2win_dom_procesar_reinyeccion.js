/**
 * @NApiVersion 2.1
 * @NModuleScope Public
 */
define([
    "N/runtime",
    "../dao/2win_dao_2w_reinyeccion_recaudacion",
    "../dao/2win_dao_auditoria",
    "../dao/2win_dao_archivo",
    "../dao/2win_dao_notas_sistema",
    "../dao/2win_dao_transacciones",
    "../libs/2win_lib_peticion"
], function (
    runtime,
    daoReinyeccionRecaudacion,
    daoAuditoria,
    daoArchivo,
    daoNotasSistema,
    daoTransacciones,
    libPeticion
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
            // proceso.tokenProceso = libAuditoria.obtenerToken(); // Generar token para auditoria

            let registros = [];

            if (parametro.custscript_2w_mr_reinyeccion_regist) {
                // reporte_procesados, archivos_respaldo
                registros = daoReinyeccionRecaudacion.busquedaRegistrosReinyeccion(parametro.custscript_2w_mr_reinyeccion_regist);
            } else {
                registros = daoReinyeccionRecaudacion.busquedaRegistrosReinyeccionPendientes();
            }

            // Recorrer cada registro para actualizar estado
            for (let index = 0; index < registros.length; index++) {
                let registro = registros[index];
                let camposParActualizar = {
                    custrecord_2w_rein_recaudacion_status: "🔃 PROCESANDO"
                };
                daoReinyeccionRecaudacion.actualizarRegistroReinyeccion(registro.internalid, camposParActualizar);
            }

            return registros;
        } catch (error) {
            log.error("recuperarRegistrosNetsuite - error", error);

            // Crear registro auditoria
            proceso.estado = "001";
            proceso.descripcionResultado = error.message;
            // libAuditoria.crearReporteAuditoria(proceso);

            throw error;
        }
    }

    /**
     * @function validarCampoTransacciones
     * @param {object} parametro - Datos requeridos para ejecucion
     * @returns {object} - Datos de ejecucion
     */
    function validarCampoTransacciones(parametro) {
        // Variable para almacenar id de log proceso
        try {
            // Iniciar registro de log
            // log.audit("validarCampoTransacciones - parametro", parametro);
            // Ajustar objeto proceso
            proceso.etapa = validarCampoTransacciones.name;
            proceso.scriptId = runtime.getCurrentScript().id;
            // proceso.tokenProceso = libAuditoria.obtenerToken(); // Generar token para auditoria

            // Recuperar detalle registro auditoria
            let registroAuditoria = daoAuditoria.busquedaDatosAuditoria(parametro.custrecord_2w_rein_recaudacion_identifi);

            // Aislar folios de mensaje
            const foliosConsulta = [];
            let descripcion = registroAuditoria[0].descripcion;

            // Busca todas las ocurrencias de uno o más dígitos
            let folios = descripcion.match(/\d+/g);
            log.audit("validarTransacciones - folios", {
                extension: folios.length,
                folios: folios
            })

            // Validar si se recuperaron folios de descripcion
            if (folios.length > 0) {
                for (let ind = 0; ind < folios.length; ind++) {
                    // Agrupar folios para consulta
                    let folio = folios[ind];
                    foliosConsulta.push(folio)
                }
            }

            log.audit("validarTransacciones - foliosConsulta", {
                extension: foliosConsulta.length,
                foliosConsulta: foliosConsulta
            })

            // Buscar transacciones usando folios recuperados de registro auditoria
            // let transaccion = daoTransacciones.busquedaTransaccionesPorFolios(foliosConsulta);
            let transaccion = daoTransacciones.consultarTransaccionesPorFolio(folios);
            parametro.recordtype = transaccion[0].recordtype;

            // Validar si la transaccion tuvo valor true para campo custbody_2win_created_from_income_flow
            // let notasSistemaTransaccion = daoNotasSistema.busquedaNotasDeSistemaParaTransacciones(transaccion[0].id);
            parametro.custrecord_2w_rein_recaudacion_registro = transaccion[0].id;

            return parametro;
        } catch (error) {
            log.error("validarCampoTransacciones - error", error);

            // Crear registro auditoria
            proceso.estado = "001";
            proceso.descripcionResultado = error.message;
            // libAuditoria.crearReporteAuditoria(proceso);

            throw error;
        }
    }

    /**
     * @function procesarReinyecciones
     * @param {object} parametro - Datos requeridos para ejecucion
     * @returns {object} - Datos de ejecucion
     */
    function procesarReinyecciones(parametro) {
        // Variable para almacenar id de log proceso
        try {
            // Iniciar registro de log
            log.audit("procesarReinyecciones - parametro", parametro);
            // Ajustar objeto proceso
            proceso.etapa = procesarReinyecciones.name;
            proceso.scriptId = runtime.getCurrentScript().id;
            // proceso.tokenProceso = libAuditoria.obtenerToken(); // Generar token para auditoria

            // Actualizar campo de transaccion
            let registroTransaccion = {};
            let registroAjustado = false;
            for (let i = 0; i < parametro.length; i++) {
                let elemento = parametro[i];

                if (!elemento.error && elemento.custrecord_2w_rein_recaudacion_registro) {
                    registroTransaccion.recordtype = elemento.recordtype;
                    registroTransaccion.internalid = elemento.custrecord_2w_rein_recaudacion_registro;
                    break;
                }
            }
            log.audit("procesarReinyecciones - registroTransaccion", {
                registroTransaccion: registroTransaccion
            });
            if (registroTransaccion !== "") {
                try {
                    daoTransacciones.actualizarCampoTransaccion(registroTransaccion);
                    registroAjustado = true;
                } catch (error) {
                    for (let index = 0; index < parametro.length; index++) {
                        parametro[index].procesado = false;
                        parametro[index].error = error;
                    }
                }
            }

            if (registroAjustado) {
                for (let ind = 0; ind < parametro.length; ind++) {
                    try {
                        if (!parametro[ind].omitir && !parametro[ind].error) {
                            // Recuperar JSON de file capinet
                            let nombreCarpeta;
                            let scriptId;
                            let deploymentId;
                            if (
                                parametro[ind].custrecord_2w_rein_recaudacion_proceso &&
                                parametro[ind].custrecord_2w_rein_recaudacion_proceso === "Recaudaciones Flujo Caja"
                            ) {
                                scriptId = "customscript_rl_recaudacione_f_caja"
                                deploymentId = "customdeploy_rl_recaudacione_f_caja"
                                nombreCarpeta = "Recaudaciones Caja"
                            } else if (
                                parametro[ind].custrecord_2w_rein_recaudacion_proceso &&
                                parametro[ind].custrecord_2w_rein_recaudacion_proceso === "Recaudaciones Flujo Facturacion"
                            ) {
                                scriptId = "customscript_rl_recaudacione_f_fac"
                                deploymentId = "customdeploy_rl_recaudacione_f_fac"
                                nombreCarpeta = "Recaudaciones Facturacion"
                            }
                            let nombreArchivo = parametro[ind].custrecord_2w_rein_recaudacion_identifi + ".json"
                            log.audit("procesarReinyecciones - parametros", {
                                nombreCarpeta: nombreCarpeta,
                                nombreArchivo: nombreArchivo,
                                scriptId: scriptId,
                                deploymentId: deploymentId
                            });
                            let idCarpeta = daoArchivo.getFolderIdByName(nombreCarpeta);
                            let internalidArchivo = daoArchivo.getFileIdByName(nombreArchivo, idCarpeta);
                            let objectoArchivo = daoArchivo.getFileObject(internalidArchivo);
                            let contenidoArchivo = objectoArchivo.getContents();

                            // Reinyectar JSON a restlet
                            let parametrosPeticionReinyeccion = {
                                scriptId: scriptId,
                                deploymentId: deploymentId,
                                body: contenidoArchivo
                            };
                            let respuesta = libPeticion.peticionReinyeccionRecaudacion(parametrosPeticionReinyeccion);
                            parametro[ind].procesado = true;
                            // parametro[ind].custrecord_2w_rein_recaudacion_detalle = JSON.stringify(respuesta);
                            parametro[ind].custrecord_2w_rein_recaudacion_detalle = respuesta;
                        }
                    } catch (e) {
                        parametro[ind].procesado = false;
                        parametro[ind].error = e.message;
                    }
                }
            }

            for (let index = 0; index < parametro.length; index++) {
                // Actualizar registro reinyeccion
                let paramemetroActaulizacionRegistro = {
                    custrecord_2w_rein_recaudacion_registro: parametro[index].custrecord_2w_rein_recaudacion_registro
                };
                if (parametro[index].error) {
                    paramemetroActaulizacionRegistro.custrecord_2w_rein_recaudacion_status = "⛔ FALLIDO";
                    paramemetroActaulizacionRegistro.custrecord_2w_rein_recaudacion_detalle = parametro[index].error;
                } else if (parametro[index].procesado === true) {
                    paramemetroActaulizacionRegistro.custrecord_2w_rein_recaudacion_status = "✅ REINYECTADO";
                    paramemetroActaulizacionRegistro.custrecord_2w_rein_recaudacion_reinyect = true;
                    paramemetroActaulizacionRegistro.custrecord_2w_rein_recaudacion_detalle = parametro[index].custrecord_2w_rein_recaudacion_detalle;
                }
                // Actualizar registro reinyeccion
                daoReinyeccionRecaudacion.actualizarRegistroReinyeccion(parametro[index].internalid, paramemetroActaulizacionRegistro);
            }

            return parametro;
        } catch (error) {
            log.error("procesarReinyecciones - error", error);

            // Crear registro auditoria
            proceso.estado = "001";
            proceso.descripcionResultado = error.message;
            // libAuditoria.crearReporteAuditoria(proceso);

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

                if (valueParseado.loteSalida && valueParseado.loteSalida.length > 0) {

                    // Recorrer cada elemanto del lote
                    for (let index = 0; index < valueParseado.loteSalida.length; index++) {
                        let elemento = valueParseado.loteSalida[index];
                        // Evaluar si el elemento fue procesado
                        if (elemento.procesado) {
                            resumenProceso.procesados += 1;
                        } else if (valueParseado.error && valueParseado.error !== "") {
                            resumenProceso.erroneos += 1;
                        }
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
        validarCampoTransacciones: validarCampoTransacciones,
        procesarReinyecciones: procesarReinyecciones,
        recuentoEjecucion: recuentoEjecucion
    };
});
