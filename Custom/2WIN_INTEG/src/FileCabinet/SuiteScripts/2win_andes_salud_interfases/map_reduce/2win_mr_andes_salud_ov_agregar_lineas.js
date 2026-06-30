/**
 * @NApiVersion 2.1
 * @NScriptType MapReduceScript
 */
define([
    "../lib/2win_lib_auditoria",
    "../lib/2win_lib_formato",
    "../lib/2win_lib_custodia",
    "../dao/2win_dao_agregar_lineas_queue",
    "N/runtime",
    "N/file",
    "N/log",
    "../domain/2win_dom_orden_venta",
    "../dao/2win_dao_file",
    "../dao/2win_dao_orden_venta",
    "../dao/2win_dao_static_params_operacion",
    "N/task"
], function (libAuditoria, libFormato, libCustodia, daoAgregarLineasQueue, runtime, file, nLog, domOrdenVenta, daoFile, daoOrdenVenta, daoParametrosOperacion, task) {
    /**
     * @function getInputData - Recupera registros pendientes de la cola de procesamiento.
     * @returns {Array} - Datos recuperados para procesamiento.
     */
    function getInputData() {
        try {
            // Obtener registros pendientes de la cola filtrados por tipoMensaje SEND^IN
            const registrosPendientes = daoAgregarLineasQueue.getPending(1, "SEND^IN");
            nLog.audit("getInputData - Registros pendientes encontrados", {
                cantidad: registrosPendientes.length,
                tipoMensaje: "SEND^IN"
            });

            if (registrosPendientes.length === 0) {
                nLog.audit("getInputData", "No hay registros pendientes en la cola");
                return [];
            }

            let mapeo = [];

            // Procesar cada registro de la cola
            for (let i = 0; i < registrosPendientes.length; i++) {
                const registroCola = registrosPendientes[i];

                try {
                    // Cargar archivo
                    const archivoData = daoFile.cargarArchivo(registroCola.archivoId);
                    const contenido = archivoData.contenido;
                    nLog.debug(`getInputData - Archivo ${registroCola.archivoId}`, {
                        contenido: contenido
                    });

                    // Parsear contenido
                    const contenidoParseado = JSON.parse(contenido);
                    nLog.debug("getInputData - contenidoParseado", {
                        contenidoParseado: contenidoParseado
                    });

                    // Aislar valores de contenido
                    const tipoMensaje = contenidoParseado.tipoMensaje;
                    const FechaEnvioA = contenidoParseado.datos.FechaEnvio;

                    // Aislar pacientes
                    const pacientes = contenidoParseado?.datos?.Pacientes || [];
                    nLog.debug("getInputData - pacientes", {
                        extension: pacientes.length,
                        pacientes: pacientes
                    });

                    // Extraer uuid del nombre del archivo (sin extensión .json)
                    const uuid = archivoData.nombre.replace(".json", "");

                    // Agregar información de la cola y tipoMensaje/FechaEnvio a cada paciente
                    pacientes.forEach(function (p) {
                        p.queueRecordId = registroCola.id;
                        p.archivoId = registroCola.archivoId;
                        p.folder = registroCola.folder;
                        p.tipoMensaje = tipoMensaje;
                        p.FechaEnvioA = FechaEnvioA;
                        p.uuid = uuid;

                        // Agregar al mapeo como string para el Map/Reduce
                        mapeo.push(JSON.stringify(p));
                    });
                } catch (error) {
                    nLog.error(`getInputData - Error procesando registro de cola ${registroCola.id}`, error);
                    // Marcar el registro de cola con error
                    daoAgregarLineasQueue.handleError(registroCola.id, error.message);
                }
            }

            nLog.audit("getInputData - Total pacientes para procesar", {
                total: mapeo.length
            });

            return mapeo;
        } catch (error) {
            nLog.error("getInputData - error", error);
            throw error;
        }
    }

    /**
     * @function map - Procesar los datos recuperados.
     * @param {Object} context - Datos recuperados del getInputData.
     */
    function map(context) {
        let datosEntrada = {};
        let contextParaEnvio = {};
        try {
            // Parsear value del getInputData
            datosEntrada = JSON.parse(context.value);
            nLog.audit(`map - key: ${context.key}`, {
                extension: datosEntrada.detallePrestaciones.length,
                datosEntrada: datosEntrada
            });

            // Validar tipo de mensaje y ejecutar operacion requerida
            if (datosEntrada.tipoMensaje === "SEND^IN") {
                // Validar y mapear estructura de datos recibida
                let datos = domOrdenVenta.validarMapearDatosSendIn(datosEntrada);
                datosEntrada = datos.datosEntrada;
                nLog.debug("map - datosEntrada", {
                    datosEntrada: datosEntrada
                });

                contextParaEnvio.datosEntrada = datosEntrada;
                if (datos.hasOwnProperty("camposMapeados")) {
                    contextParaEnvio.camposMapeados = datos.camposMapeados;
                }
                nLog.debug("map - contextParaEnvio", { contextParaEnvio: contextParaEnvio });
                context.write(datosEntrada.CuentaPaciente, contextParaEnvio);
            } else {
                throw new Error(`Tipo de Mensaje Incorrecto: ${datosEntrada.tipoMensaje}`);
            }
            if (datosEntrada.detallePrestaciones.length) return;
            nLog.debug("Send-Rev", datosEntrada.tipoMensaje);
        } catch (error) {
            nLog.error("map - error", error);
            datosEntrada.procesado = false; // Marcar como no procesado
            datosEntrada.error = error.message;
            contextParaEnvio.datosEntrada = datosEntrada;
            nLog.debug("map - contextParaEnvio", { contextParaEnvio: contextParaEnvio });
            context.write(context.key, contextParaEnvio);
            // throw error; // Lanzar error para que se capture en el resumen
        }
    }

    /**
     * @function reduce - Procesar los datos recuperados secuencialmente por CuentaPaciente.
     * @param {Object} context - Datos recuperados del map, agrupados por CuentaPaciente.
     */
    function reduce(context) {
        try {
            nLog.audit(`reduce - Inicio procesamiento CuentaPaciente: ${context.key}`, {
                cantidadPayloads: context.values.length
            });

            for (let i = 0; i < context.values.length; i++) {
                let datos = JSON.parse(context.values[i]);
                let datosEntrada = datos.datosEntrada;

                nLog.audit(`reduce - Procesando subsidiaria (RutEmpresa): ${datosEntrada.RutEmpresa}`, {
                    indice: i + 1,
                    total: context.values.length
                });

                try {
                    if (datos.hasOwnProperty("camposMapeados")) {
                        datos = domOrdenVenta.agregarLineasRegistroNetsuite(datos);
                        datosEntrada = datos.datosEntrada;
                    }

                    context.write(context.key, datosEntrada);
                } catch (errorOperacion) {
                    nLog.error(`reduce - error en lógica de dominio para RutEmpresa ${datosEntrada.RutEmpresa}`, errorOperacion);

                    datosEntrada.procesado = false;
                    datosEntrada.error = errorOperacion.message;

                    context.write(context.key, datosEntrada);
                }
            }
        } catch (errorCritico) {
            nLog.error(`reduce - Error crítico procesando cuenta ${context.key}`, errorCritico);

            if (context.values && context.values.length > 0) {
                for (let i = 0; i < context.values.length; i++) {
                    try {
                        let d = JSON.parse(context.values[i]);
                        if (d.datosEntrada) {
                            d.datosEntrada.procesado = false;
                            d.datosEntrada.error = errorCritico.message;
                            context.write(context.key, d.datosEntrada);
                        }
                    } catch (e) {}
                }
            }
        }
    }

    /**
     * @function summarize - Resumen de la ejecucion.
     * @param {object} summary - Datos que resumen ejecucion del script.
     */
    function summarize(summary) {
        let proceso = {
            nombreProceso: "Interfaces andes salud",
            scriptId: "",
            etapa: summarize.name,
            estado: "000",
            tokenProceso: "",
            descripcionResultado: ""
        };

        // Variable para almacenar datos requeridos
        let custodia = {};
        let tipoMensaje = "";
        let carpeta = "";
        let fechaEnvioA = "";
        let peticionEnviada = false;
        let valoresParametrosOperacion = [];
        let contenido = {
            tipoMensaje: "",
            datos: {
                FechaEnvio: "",
                Pacientes: []
            }
        };

        let uuid = "";

        let cuerpoPeticion = {
            tipoMensaje: "",
            estado: "success",
            codigo: 200,
            tipo_proceso: "ingresos ambulatorios",
            idproceso: "",
            mensaje: "Cargos ambulatorios se ha procesado correctamente",
            errores: []
        };

        try {
            nLog.debug("summarize - summary", summary);
            // Ajustar datos del proceso
            proceso.scriptId = runtime.getCurrentScript().id;
            proceso.tokenProceso = libAuditoria.obtenerToken(); // Generar token para auditoria
            custodia.custrecord_2win_as_tiempo_proceso = Date.now(); // Marca de inicio
            custodia.custrecord_2win_as_interface = cuerpoPeticion.tipo_proceso; // ingresos ambulatorios

            // Recuperar parametros de operacion
            let nombresParmetrosOperacion = ["id_carpeta_archivos_ingresos_ambulatorios_hospitalizados", "interfaces_andessalud_hc_url_base"];

            // Recuperar cada parametro de operacion
            nombresParmetrosOperacion.forEach(function (nombreParametro) {
                let parametroOperacion = daoParametrosOperacion.getParam(nombreParametro);
                nLog.debug("summarize - parametroOperacion", parametroOperacion);
                valoresParametrosOperacion.push(parametroOperacion);
            });
            nLog.debug("summarize - valoresParametrosOperacion", valoresParametrosOperacion);

            // Recuperar error de etapa getInputData
            if (summary.inputSummary && summary.inputSummary.error) {
                nLog.error("summarize - inputSummaryerror", summary.inputSummary.error);
                throw new Error(summary.inputSummary.error);
            }

            // Recuperar errores etapa map
            let erroresMap = [];
            summary.mapSummary.errors.iterator().each(function (key, value) {
                value = JSON.parse(value);
                erroresMap.push({ [key]: value });
                return true;
            });
            nLog.error("summarize - erroresMap", {
                extension: erroresMap.length,
                erroresMap: erroresMap
            });

            // Recuperar errores etapa reduce
            let erroresReduce = [];
            summary.reduceSummary.errors.iterator().each(function (key, value) {
                value = JSON.parse(value);
                erroresReduce.push({ [key]: value });
                return true;
            });
            nLog.error("summarize - erroresReduce", {
                extension: erroresReduce.length,
                erroresReduce: erroresReduce
            });

            // Agrupar resultados por queueRecordId para actualizar estados de la cola
            let resultadosPorCola = {};

            // Recuperar pares key-value de salida
            summary.output.iterator().each(function (key, value) {
                value = JSON.parse(value);

                // Extraer información de la cola
                let queueRecordId = value.queueRecordId;
                let archivoId = value.archivoId;
                let folder = value.folder;

                tipoMensaje = value.tipoMensaje;
                fechaEnvioA = value.FechaEnvioA;

                // Capturar uuid del paciente
                const uuidPaciente = value.uuid;

                // Inicializar agrupación si no existe
                if (!resultadosPorCola[queueRecordId]) {
                    resultadosPorCola[queueRecordId] = {
                        queueRecordId: queueRecordId,
                        archivoId: archivoId,
                        folder: folder,
                        tipoMensaje: tipoMensaje,
                        fechaEnvioA: fechaEnvioA,
                        uuid: uuidPaciente,
                        pacientes: [],
                        tieneErrores: false
                    };
                }

                // Eliminar campos de control del paciente
                delete value.queueRecordId;
                delete value.archivoId;
                delete value.folder;
                delete value.tipoMensaje;
                delete value.FechaEnvioA;
                delete value.uuid;

                let erroresPrestaciones = [];

                if (value.hasOwnProperty("procesado") && value.procesado === false && value.hasOwnProperty("error")) {
                    erroresPrestaciones.push(value.error);
                }

                if (value.detallePrestaciones && Array.isArray(value.detallePrestaciones)) {
                    for (let index = 0; index < value.detallePrestaciones.length; index++) {
                        const prestacion = value.detallePrestaciones[index];
                        if (prestacion.hasOwnProperty("procesado") && prestacion.procesado === false && prestacion.hasOwnProperty("error")) {
                            erroresPrestaciones.push(prestacion.error);
                        }
                    }
                }

                // Si hubo errores (ya sea a nivel general o de detalle), marcar el paciente
                if (erroresPrestaciones.length > 0) {
                    value.procesado = false;
                    value.errores = erroresPrestaciones;
                    value.error = erroresPrestaciones[0];

                    // Mantener solo las prestaciones fallidas (con precaución por si el array no existe o está vacío)
                    if (value.detallePrestaciones && Array.isArray(value.detallePrestaciones)) {
                        value.detallePrestaciones = value.detallePrestaciones.filter(function (p) {
                            return (p.hasOwnProperty("procesado") && p.procesado === false) || (value.hasOwnProperty("procesado") && value.procesado === false && value.hasOwnProperty("error"));
                        });
                    }

                    resultadosPorCola[queueRecordId].tieneErrores = true;
                }

                if (value.hasOwnProperty("procesado") && value.procesado === false) {
                    resultadosPorCola[queueRecordId].pacientes.push(value);
                    contenido.datos.Pacientes.push(value);
                }

                return true;
            });

            contenido.tipoMensaje = tipoMensaje;
            contenido.datos.FechaEnvio = fechaEnvioA;

            nLog.debug("summarize - contenido", {
                contenido: contenido
            });

            // ACTUALIZAR ESTADOS DE LA COLA Y ENVIAR PETICIONES POR ARCHIVO
            nLog.audit("summarize - Actualizando estados de la cola", {
                totalRegistros: Object.keys(resultadosPorCola).length
            });

            let totalRegistrosProcesados = Object.keys(resultadosPorCola).length;
            let registrosExitosos = 0;
            let registrosConErrores = 0;

            Object.keys(resultadosPorCola).forEach(function (queueRecordId) {
                const resultado = resultadosPorCola[queueRecordId];

                if (resultado.tieneErrores) {
                    // Hay errores en este registro de cola - manejar error
                    const errorMessage = resultado.pacientes[0]?.error || "Error al procesar pacientes";
                    daoAgregarLineasQueue.handleError(queueRecordId, errorMessage);
                    nLog.audit("summarize - Registro de cola con errores", {
                        queueRecordId: queueRecordId,
                        error: errorMessage
                    });
                    registrosConErrores++;

                    // Enviar petición con errores
                    let cuerpoPeticionErrores = {
                        tipoMensaje: resultado.tipoMensaje,
                        estado: "error",
                        codigo: 400,
                        tipo_proceso: "ingresos ambulatorios",
                        idproceso: resultado.uuid,
                        mensaje: errorMessage,
                        errores: resultado.pacientes
                    };

                    daoOrdenVenta.enviarRegistro(`${valoresParametrosOperacion[1].text}/process-batch`, cuerpoPeticionErrores);
                } else {
                    // Todo procesó correctamente - marcar como procesado y enviar petición
                    daoAgregarLineasQueue.markAsProcessed(queueRecordId);
                    nLog.audit("summarize - Registro de cola procesado exitosamente", {
                        queueRecordId: queueRecordId
                    });

                    // Construir cuerpo de petición específico para este archivo
                    let cuerpoPeticionArchivo = {
                        tipoMensaje: resultado.tipoMensaje,
                        estado: "success",
                        codigo: 200,
                        tipo_proceso: "ingresos ambulatorios",
                        idproceso: resultado.uuid,
                        mensaje: "Cargos ambulatorios se ha procesado correctamente",
                        errores: []
                    };

                    // Enviar petición para este archivo específico
                    let respuesta = daoOrdenVenta.enviarRegistro(`${valoresParametrosOperacion[1].text}/process-batch`, cuerpoPeticionArchivo);

                    // Validar codigo de respuesta
                    if (respuesta.code !== 200) {
                        nLog.error("summarize - Error en petición externa", {
                            archivo: resultado.archivoId,
                            codigo: respuesta.code,
                            body: respuesta.body,
                            url: `${valoresParametrosOperacion[1].text}/process-batch`,
                            cuerpoPeticionArchivo: cuerpoPeticionArchivo
                        });
                    } else {
                        // Parsear cuerpo respuesta
                        let bodyParseado = JSON.parse(respuesta.body);
                        nLog.debug("summarize - bodyParseado", {
                            archivo: resultado.archivoId,
                            bodyParseado: bodyParseado
                        });

                        // Validar que el cuerpo de la respuesta contenga datos
                        if (bodyParseado.length > 0) {
                            // Validar propiedades en cuerpo de respuesta
                            if (bodyParseado[0].tipoMensaje !== "RECEPCION^EXITOSA" || !bodyParseado[0].estado.success || bodyParseado[0].estado.codigo !== 200) {
                                nLog.error("summarize - Respuesta no exitosa", {
                                    archivo: resultado.archivoId,
                                    codigo: respuesta.code,
                                    cuerpoPeticionArchivo: cuerpoPeticionArchivo
                                });
                            }
                        }
                    }

                    registrosExitosos++;
                }
            });

            // Construir mensaje de resultado
            proceso.descripcionResultado = `${registrosExitosos} de ${totalRegistrosProcesados} archivos procesados correctamente`;
            if (registrosConErrores > 0) {
                proceso.descripcionResultado += `, ${registrosConErrores} con errores`;
            }
            custodia.respuesta = proceso.descripcionResultado;

            // Crear registro auditoria
            libAuditoria.crearReporteAuditoria(proceso);
            custodia.codigoRespuesta = proceso.estado;

            // Recuento de ejecucion
            let scriptObj = runtime.getCurrentScript();
            nLog.audit("summarize - etapas", {
                getInputData: summary.inputSummary,
                map: summary.mapSummary,
                reduce: summary.reduceSummary
            });
            nLog.debug("summarize - unidades restantes: ", scriptObj.getRemainingUsage());
            nLog.debug("summarize - cuerpoPeticion", cuerpoPeticion);
        } catch (error) {
            nLog.error("summarize - error", error);

            // Crear registro auditoria
            proceso.estado = "001";
            proceso.descripcionResultado = error.message;
            custodia.respuesta = error.message;
            custodia.codigoRespuesta = proceso.estado;
            cuerpoPeticion.codigo = 400;
            cuerpoPeticion.mensaje = error.message;
            cuerpoPeticion.estado = "error";

            // Crear registro auditoria
            libAuditoria.crearReporteAuditoria(proceso);

            // Recuento de ejecucion
            let scriptObj = runtime.getCurrentScript();
            nLog.audit("summarize - etapas", {
                getInputData: summary.inputSummary,
                map: summary.mapSummary,
                reduce: summary.reduceSummary
            });
            nLog.debug("summarize - unidades restantes: ", scriptObj.getRemainingUsage());
        }

        
        try {
            const pendientes = daoAgregarLineasQueue.getPending(1);

            if (pendientes && pendientes.length > 0) {
                nLog.audit("summarize - Relanzando Map/Reduce", `Quedan ${pendientes.length} o más pendientes`);

                const mapReduceTask = task.create({
                    taskType: task.TaskType.MAP_REDUCE,
                    scriptId: "customscript_2win_mr_andessalud_ov_ag_li",
                    deploymentId: "customdeploy_2win_mr_andessalud_ov_ag_li"
                });

                const taskId = mapReduceTask.submit();
                nLog.audit("summarize - Map/Reduce relanzado", `Task ID: ${taskId}`);
            } else {
                nLog.audit("summarize", "No hay más pendientes en la cola");
            }
        } catch (error) {
            nLog.error("summarize - error relanzando", error);
        }
    }

    return {
        getInputData: getInputData,
        map: map,
        reduce: reduce,
        summarize: summarize
    };
});
