/**
 * @NApiVersion 2.1
 * @NScriptType MapReduceScript
 */
define([
    "../lib/2win_lib_auditoria",
    "../lib/2win_lib_formato",
    "../lib/2win_lib_custodia",
    "N/runtime",
    "N/file",
    "N/log",
    "N/task",
    "../domain/2win_dom_orden_venta",
    "../dao/2win_dao_file",
    "../dao/2win_dao_orden_venta",
    "../dao/2win_dao_static_params_operacion",
    "../dao/2win_dao_agregar_lineas_queue"
], function (libAuditoria, libFormato, libCustodia, runtime, file, nLog, task, domOrdenVenta, daoFile, daoOrdenVenta, daoParametrosOperacion, daoAgregarLineasQueue) {
    /**
     * @function getInputData - Recupera registros pendientes de la cola filtrados por SEND^REV
     * @returns {Array} - Datos recuperados.
     */
    function getInputData() {
        try {
            // Obtener registros pendientes de la cola filtrados por tipoMensaje SEND^REV
            const registrosPendientes = daoAgregarLineasQueue.getPending(50, "SEND^REV");
            
            nLog.audit("getInputData - Inicio", {
                registrosPendientes: registrosPendientes.length,
                tipoMensaje: "SEND^REV",
                governanceInicial: runtime.getCurrentScript().getRemainingUsage()
            });

            if (registrosPendientes.length === 0) {
                nLog.audit("getInputData", "No hay registros pendientes de SEND^REV en la cola");
                return [];
            }

            // Preparar datos para el map
            const mapeo = [];

            for (let i = 0; i < registrosPendientes.length; i++) {
                const registroCola = registrosPendientes[i];

                try {
                    // Cargar archivo
                    const archivoData = daoFile.cargarArchivo(registroCola.archivoId);
                    const contenido = archivoData.contenido;
                    const contenidoParseado = JSON.parse(contenido);

                    // Aislar valores de contenido
                    const tipoMensaje = contenidoParseado.tipoMensaje;
                    const FechaEnvioA = contenidoParseado.datos.FechaEnvio;

                    // Validar que sea SEND^REV
                    if (tipoMensaje !== "SEND^REV") {
                        nLog.error("getInputData - Tipo de mensaje incorrecto", {
                            queueRecordId: registroCola.id,
                            tipoMensaje: tipoMensaje
                        });
                        daoAgregarLineasQueue.handleError(registroCola.id, "Tipo de mensaje incorrecto: " + tipoMensaje);
                        continue;
                    }

                    // Aislar pacientes
                    const pacientes = contenidoParseado?.datos?.Pacientes || [];
                    nLog.debug("getInputData - pacientes", {
                        extension: pacientes.length,
                        queueRecordId: registroCola.id
                    });

                    // Agregar metadata y convertir a string
                    pacientes.forEach(function (p) {
                        p.tipoMensaje = tipoMensaje;
                        p.FechaEnvioA = FechaEnvioA;
                        p._queueRecordId = registroCola.id;
                        mapeo.push(JSON.stringify(p));
                    });

                } catch (error) {
                    nLog.error(`getInputData - Error cargando archivo ${registroCola.archivoId}`, error);
                    daoAgregarLineasQueue.handleError(registroCola.id, error.message);
                }
            }

            nLog.audit("getInputData - Completado", {
                totalPacientes: mapeo.length,
                governanceFinal: runtime.getCurrentScript().getRemainingUsage()
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
            if (datosEntrada.tipoMensaje === "SEND^REV" ) {
                // Validar y mapear estructura de datos recibida
                let datos = domOrdenVenta.validarMapearDatosSendRev(datosEntrada);
                datosEntrada = datos.datosEntrada
                nLog.debug("map - datosEntrada", {
                    datosEntrada: datosEntrada
                });

                contextParaEnvio.datosEntrada = datosEntrada
                if (datos.hasOwnProperty("camposMapeados")) {
                    contextParaEnvio.camposMapeados = datos.camposMapeados
                };
                nLog.debug("map - contextParaEnvio", {contextParaEnvio: contextParaEnvio});
                context.write(context.key, contextParaEnvio);
            }

        } catch (error) {
            nLog.error("map - error", error);
            datosEntrada.procesado = false; // Marcar como no procesado
            datosEntrada.error = error.message;
            contextParaEnvio.datosEntrada = datosEntrada
            nLog.debug("map - contextParaEnvio", {contextParaEnvio: contextParaEnvio});
            context.write(context.key, contextParaEnvio);
            throw error; // Lanzar error para que se capture en el resumen
        }
    }

    /**
     * @function reduce - Procesar los datos recuperados.
     * @param {Object} context - Datos recuperados del getInputData.
     */
    function reduce(context) {
        let datosEntrada = {};
        try {
            nLog.audit(`reduce - key: ${context.key}`, {
                extension: context.values.length,
                values: context.values
            });

            // Parsear value del getInputData
            let datos = JSON.parse(context.values[0]);
            nLog.audit(`reduce - key: ${context.key}`, {
                datos: datos
            });
            datosEntrada = datos.datosEntrada
            nLog.audit("reduce - datosEntrada", {
                datosEntrada: datosEntrada
            });

            if (datos.hasOwnProperty("camposMapeados")) {           
                let camposMapeados = datos.camposMapeados
                nLog.audit("reduce - camposMapeados", {
                    camposMapeados: camposMapeados
                });
    
                datos = domOrdenVenta.eliminarLineasRegistroNetsuite(datos);
                datosEntrada = datos.datosEntrada
            };

            nLog.debug("reduce - datosEntrada", {
                datosEntrada: datosEntrada
            });
            context.write(context.key, datosEntrada);
            // context.write({ key: String(context.key), value: datosEntrada })
        } catch (error) {
            nLog.error("reduce - error", error);
            datosEntrada.procesado = false; // Marcar como no procesado
            datosEntrada.error = error.message;
            context.write(context.key, datosEntrada);
            throw error; // Lanzar error para que se capture en el resumen
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
        
        let uuid = ""

        let cuerpoPeticion = {
            tipoMensaje: "",
            estado: "success",
            codigo: 200,
            tipo_proceso: "ingresos ambulatorios",
            idproceso: "",
            mensaje: "Actualización de cargos se ha procesado correctamente",
            errores: []
        };

        try {
            nLog.debug("summarize - summary", summary);
            // Ajustar datos del proceso
            proceso.scriptId = runtime.getCurrentScript().id;
            proceso.tokenProceso = libAuditoria.obtenerToken(); // Generar token para auditoria
            custodia.custrecord_2win_as_tiempo_proceso = Date.now(); // Marca de inicio
            custodia.custrecord_2win_as_interface = cuerpoPeticion.tipo_proceso; // "ingresos ambulatorios"
            custodia.datosEntrada = runtime.getCurrentScript().getParameter({ name: "custscript_mr_as_eliminar_datos_entrada" });
            
            // Validar si se recibio el parametro
            if (!custodia.datosEntrada) {
                throw new Error("Falta parametro custscript_mr_as_eliminar_datos_entrada");
            }

            // Parsear parametro
            const datosEntradaParseados = JSON.parse(custodia.datosEntrada);
            nLog.debug("summarize - datosEntradaParseados", {
                datosEntradaParseados: datosEntradaParseados
            });

            // Recuperar parametros de operacion
            let nombresParmetrosOperacion = ["id_carpeta_archivos_ingresos_ambulatorios_hospitalizados", "interfaces_andessalud_hc_url_base"];

            // Recuperar cada parametro de operacion
            nombresParmetrosOperacion.forEach(function (nombreParametro) {
                let parametroOperacion = daoParametrosOperacion.getParam(nombreParametro);
                nLog.debug("summarize - parametroOperacion", parametroOperacion);
                valoresParametrosOperacion.push(parametroOperacion);
            });
            nLog.debug("summarize - valoresParametrosOperacion", valoresParametrosOperacion);

            // Recuperar datos de parametro
            uuid = datosEntradaParseados.nombre.replace(/\.json$/i, ""); // elimina ".json" al final - se recupera el uuid del nombre del archivo para identificar el proceso
            carpeta = datosEntradaParseados.folder

            /**@description - Se usa el uuid como parte del externalid para el registro de custodia */
            custodia.externalid = `ingresos_ambulatorios_${uuid}`; // `ingresos_ambulatorios_${fecha.getFullYear()}-${(fecha.getMonth() + 1).toString().padStart(2, "0")}-${fecha.getDate().toString().padStart(2, "0")}`;
            cuerpoPeticion.idproceso = uuid;

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

            // Recuperar pares key-value de salida
            summary.output.iterator().each(function (key, value) {
                value = JSON.parse(value);
                nLog.debug("summarize - output", {
                    [key]: value
                });
                
                tipoMensaje = value.tipoMensaje;
                fechaEnvioA = value.FechaEnvioA;
                delete value.tipoMensaje;
                delete value.FechaEnvioA;

                for (let index = 0; index < value.detallePrestaciones.length; index++) {
                    if (value.detallePrestaciones[index].hasOwnProperty("procesado") && value.detallePrestaciones[index].procesado === false && value.detallePrestaciones[index].hasOwnProperty("error")) {
                        value.procesado = false;
                        value.error = value.detallePrestaciones[index].error;
                        break;
                    };
                };
                
                // Validar si el registro fue procesado
                if (value.hasOwnProperty("procesado") && value.procesado === false) {
                    // delete value.procesado;
                    // delete value.error;
                    contenido.datos.Pacientes.push(value);
                };
                
                return true;
            });

            contenido.tipoMensaje = tipoMensaje;
            contenido.datos.FechaEnvio = fechaEnvioA;
            cuerpoPeticion.tipoMensaje = tipoMensaje;
            nLog.debug("summarize - contenido", {
                contenido: contenido
            });

            // Ajustar objeto custodia
            custodia.custrecord_2win_as_interface = tipoMensaje === "SEND^IN" ? "ingresos ambulatorios send in mr" : "ingresos ambulatorios send rev mr";
            custodia.externalid = tipoMensaje === "SEND^IN" ? `ingresos_ambulatorios_send_in_mr_${uuid}` : `ingresos_ambulatorios_send_rev_mr_${uuid}`; // "SEND^IN" ? `ingresos_ambulatorios_send_in_mr_${fechaEnvioA}` : `ingresos_ambulatorios_send_rev_mr_${fechaEnvioA}`

            // Ejecutar busqueda para validar existencia de registro custodia para el mensaje
            custodia.registroExistente = libCustodia.busquedaRegistroPorExternalid(custodia.externalid);

            nLog.debug("summarize - contenido", {
                extension: contenido.datos.Pacientes.length,
                contenido: contenido
            });

            // Validar si existen registros no procesados
            if (contenido.datos.Pacientes.length > 0) {
                cuerpoPeticion.errores = contenido.datos.Pacientes;
                throw new Error(contenido.datos.Pacientes[0].error || "Error al procesar registros");
            } else {
                // Enviar reporte a servicio externo
                let respuesta = daoOrdenVenta.enviarRegistro(`${valoresParametrosOperacion[1].text}/process-batch`, cuerpoPeticion);
                peticionEnviada = true;
                
                // Validar codigo de respuesta
                if (respuesta.code !== 200) {
                    throw new Error(`Error peticion - codigo: ${respuesta.code} - cuerpo: ${JSON.stringify(respuesta.body)}`);
                } else {
                    // Validar que el body no esté vacío antes de parsear
                    if (!respuesta.body || respuesta.body.trim() === "") {
                        throw new Error(`Respuesta del servicio vacía o inválida - codigo: ${respuesta.code}`);
                    }

                    // Parsear cuerpo respuesta
                    let bodyParseado;
                    try {
                        bodyParseado = JSON.parse(respuesta.body);
                    } catch (parseError) {
                        nLog.error("summarize - Error parseando respuesta", { body: respuesta.body, error: parseError.message });
                        throw new Error(`Error parseando respuesta del servicio: ${parseError.message} - body: ${respuesta.body}`);
                    }
                    nLog.debug("summarize - bodyParseado", bodyParseado);

                    // Validar que el cuerpo de la respuesta contenga datos
                    if (bodyParseado.length > 0) {
                        // Validar propiedades en cuerpo de respuesta
                        if (bodyParseado[0].tipoMensaje !== "RECEPCION^EXITOSA" || !bodyParseado[0].estado.success || bodyParseado[0].estado.codigo !== 200) {
                            throw new Error(`Error respuesta - codigo: ${respuesta.code} - cuerpo: ${JSON.stringify(respuesta.body)}`);
                        };
                    } else {
                        throw new Error(`Error respuesta - codigo: ${respuesta.code} - cuerpo: ${JSON.stringify(respuesta.body)}`);
                    };
                };

                proceso.descripcionResultado = "Registros editados correctamente";
                custodia.respuesta = cuerpoPeticion.mensaje // "Actualización de cargos procesados con éxito";
            }

            // Crear registro auditoria
            libAuditoria.crearReporteAuditoria(proceso);
            custodia.codigoRespuesta = proceso.estado;

            // Validar si existe registro de custodia
            if (custodia.registroExistente && custodia.registroExistente.length > 0 && custodia.registroExistente[0].codigoRespuesta !== "000") {
                custodia.internalid = custodia.registroExistente[0].internalid;
                // Crear registro de custodia
                proceso.registroCustodia = libCustodia.guardarOActualizarRegistro(custodia);

                // Actualizar archivo de datos no procesados
                let datosArchivo = {
                    nombre: datosEntradaParseados.nombre,
                    contenido: JSON.stringify(contenido, null, 2),
                    folder: carpeta, // valoresParametrosOperacion[0].text - ID de carpeta para ingresos ambulatorios
                    tipo: file.Type.JSON,
                    encoding: file.Encoding.UTF8
                };

                // Crear archivo con datos definidos
                const actualizado = daoFile.crearArchivo(datosArchivo);
                nLog.debug("summarize - actualizado", {
                    actualizado: actualizado
                });
            }

            // Recuento de ejecucion
            let scriptObj = runtime.getCurrentScript();
            nLog.audit("summarize - etapas", {
                getInputData: summary.inputSummary,
                map: summary.mapSummary,
                reduce: summary.reduceSummary
            });
            nLog.debug("summarize - unidades restantes: ", scriptObj.getRemainingUsage());
            nLog.debug("summarize - cuerpoPeticion", cuerpoPeticion);
            
            // NUEVA LOGICA: Actualizar estados de cola y relanzar si es necesario
            try {
                // Agrupar resultados por queueRecordId
                const resultadosPorCola = {};
                let totalExitosos = 0;
                let totalErrores = 0;

                summary.output.iterator().each(function (key, value) {
                    const paciente = JSON.parse(value);
                    const queueRecordId = paciente._queueRecordId;

                    if (!queueRecordId) return true;

                    if (!resultadosPorCola[queueRecordId]) {
                        resultadosPorCola[queueRecordId] = {
                            queueRecordId: queueRecordId,
                            pacientes: [],
                            tieneErrores: false
                        };
                    }

                    resultadosPorCola[queueRecordId].pacientes.push(paciente);

                    // Verificar si hay errores en el paciente
                    let pacienteConError = false;
                    if (paciente.detallePrestaciones && paciente.detallePrestaciones.length > 0) {
                        for (let i = 0; i < paciente.detallePrestaciones.length; i++) {
                            if (paciente.detallePrestaciones[i].hasOwnProperty("procesado") && 
                                paciente.detallePrestaciones[i].procesado === false) {
                                pacienteConError = true;
                                break;
                            }
                        }
                    }

                    if (pacienteConError) {
                        resultadosPorCola[queueRecordId].tieneErrores = true;
                        totalErrores++;
                    } else {
                        totalExitosos++;
                    }

                    return true;
                });

                nLog.audit("summarize - Resultados agrupados por cola", {
                    archivosProcesados: Object.keys(resultadosPorCola).length,
                    pacientesExitosos: totalExitosos,
                    pacientesConError: totalErrores
                });

                // Actualizar estados de cola
                const colaUpdates = [];
                
                Object.keys(resultadosPorCola).forEach(queueRecordId => {
                    const resultado = resultadosPorCola[queueRecordId];

                    if (resultado.tieneErrores) {
                        // Marcar con error
                        const erroresPacientes = resultado.pacientes.filter(p => {
                            if (p.detallePrestaciones) {
                                return p.detallePrestaciones.some(dp => 
                                    dp.hasOwnProperty("procesado") && dp.procesado === false && dp.hasOwnProperty("error")
                                );
                            }
                            return false;
                        });

                        const errorMessage = erroresPacientes
                            .map(p => p.detallePrestaciones
                                .filter(dp => dp.hasOwnProperty("error"))
                                .map(dp => dp.error)
                                .join("; "))
                            .join(" | ")
                            .substring(0, 300);

                        colaUpdates.push({
                            id: queueRecordId,
                            accion: "error",
                            mensaje: errorMessage
                        });

                    } else {
                        // Marcar como procesado
                        colaUpdates.push({
                            id: queueRecordId,
                            accion: "procesado"
                        });
                    }
                });

                // Batch update de cola
                let updatesExitosos = 0;
                let updatesErrores = 0;

                colaUpdates.forEach(update => {
                    try {
                        if (update.accion === "procesado") {
                            daoAgregarLineasQueue.markAsProcessed(update.id);
                        } else {
                            daoAgregarLineasQueue.handleError(update.id, update.mensaje);
                        }
                        updatesExitosos++;
                    } catch (e) {
                        updatesErrores++;
                        nLog.error("summarize - Error actualizando cola", e);
                    }
                });

                nLog.audit("summarize - Actualizaciones de cola", {
                    total: colaUpdates.length,
                    exitosos: updatesExitosos,
                    errores: updatesErrores
                });

                // Relanzar si hay más pendientes
                const pendientes = daoAgregarLineasQueue.getPending(1, "SEND^REV");
                
                if (pendientes && pendientes.length > 0) {
                    nLog.audit("summarize - Relanzando Map/Reduce", "Quedan pendientes SEND^REV");
                    
                    const mapReduceTask = task.create({
                        taskType: task.TaskType.MAP_REDUCE,
                        scriptId: "customscript_2win_mr_andessalud_ov_el_li",
                        deploymentId: "customdeploy_2win_mr_andessalud_ov_el_li"
                    });
                    
                    const taskId = mapReduceTask.submit();
                    nLog.audit("summarize - Map/Reduce relanzado", `Task ID: ${taskId}`);
                }
            } catch (colaError) {
                nLog.error("summarize - Error en actualizacion de cola", colaError);
            }
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

            // Crear archivo de salida solo si hay datos no procesados
            if (contenido.datos.Pacientes.length > 0 && !peticionEnviada) {
                // Definir datos para archivo JSON para no procesados
                // let nombreArchivo = `${fecha.getFullYear()}-${(fecha.getMonth() + 1).toString().padStart(2, "0")}-${fecha.getDate().toString().padStart(2, "0")}.json`; // tipoMensaje === "SEND^IN" ? `no_procesados_ingresos_ambulatorios_send_in_${fechaEnvioA}.json` : `no_procesados_ingresos_ambulatorios_send_rev_${fechaEnvioA}.json`;
                let datosArchivo = {
                    nombre: `no_procesados_${uuid}.json`, // nombreArchivo
                    contenido: JSON.stringify(contenido, null, 2),
                    folder: carpeta, // valoresParametrosOperacion[0].text - ID de carpeta para ingresos ambulatorios
                    tipo: file.Type.JSON,
                    encoding: file.Encoding.UTF8
                };

                // Usar el DAO de archivos para crear el archivo
                let archivoCreado = daoFile.crearArchivo(datosArchivo);
                nLog.debug("summarize - archivoCreado", {
                    archivoCreado: archivoCreado
                });
                custodia.datosEntrada = archivoCreado;

                // Enviar reporte a servicio externo
                let respuesta = daoOrdenVenta.enviarRegistro(`${valoresParametrosOperacion[1].text}/process-batch`, cuerpoPeticion);

                // Validar codigo de respuesta
                if (respuesta.code !== 200) {
                    // throw new Error(`Error peticion - codigo: ${respuesta.code} - cuerpo: ${JSON.stringify(respuesta.body)}`);
                    nLog.error("summarize - error", `Error peticion - codigo: ${respuesta.code} - cuerpo: ${JSON.stringify(respuesta.body)}`);
                } else {
                    // Validar que el body no esté vacío antes de parsear
                    if (!respuesta.body || respuesta.body.trim() === "") {
                        nLog.error("summarize - Respuesta vacía", { code: respuesta.code, body: respuesta.body });
                    } else {
                        // Parsear cuerpo respuesta
                        let bodyParseado;
                        try {
                            bodyParseado = JSON.parse(respuesta.body);
                        } catch (parseError) {
                            nLog.error("summarize - Error parseando respuesta", { body: respuesta.body, error: parseError.message });
                            bodyParseado = [];
                        }
                        nLog.debug("summarize - bodyParseado", bodyParseado);
                        
                        // Validar que el cuerpo de la respuesta contenga datos
                        if (bodyParseado.length > 0) {
                            // Validar propiedades en cuerpo de respuesta
                            if (bodyParseado[0].tipoMensaje !== "RECEPCION^EXITOSA" || !bodyParseado[0].estado.success || bodyParseado[0].estado.codigo !== 200) {
                                nLog.error("summarize - error", `Error respuesta - codigo: ${respuesta.code} - cuerpo: ${JSON.stringify(respuesta.body)}`);
                                // throw new Error(`Error respuesta - codigo: ${respuesta.code} - cuerpo: ${JSON.stringify(respuesta.body)}`);
                            };
                        } else {
                            nLog.error("summarize - error", `Error respuesta - codigo: ${respuesta.code} - cuerpo: ${JSON.stringify(respuesta.body)}`);
                            // throw new Error(`Error respuesta - codigo: ${respuesta.code} - cuerpo: ${JSON.stringify(respuesta.body)}`);
                        };
                    };
                };
            }

            // Validar si existe registro de custodia
            if (custodia.registroExistente && custodia.registroExistente.length > 0) {
                custodia.internalid = custodia.registroExistente[0].internalid;
                // Actualizar registro de custodia
                proceso.registroCustodia = libCustodia.actualizarRegistro(custodia);
            } else {
                custodia.reintentos = 0;
                // Crear registro de custodia
                proceso.registroCustodia = libCustodia.guardarOActualizarRegistro(custodia);
            }

            // Recuento de ejecucion
            let scriptObj = runtime.getCurrentScript();
            nLog.audit("summarize - etapas", {
                getInputData: summary.inputSummary,
                map: summary.mapSummary,
                reduce: summary.reduceSummary
            });
            nLog.debug("summarize - unidades restantes: ", scriptObj.getRemainingUsage());
            // nLog.debug("summarize - cuerpoPeticion", cuerpoPeticion);

            // Actualizar registros de cola como ERROR (para evitar bucle infinito)
            try {
                // Marcar registros de cola con error basados en el output del summarize
                summary.output.iterator().each(function (key, value) {
                    try {
                        const paciente = JSON.parse(value);
                        const queueRecordId = paciente._queueRecordId;

                        if (queueRecordId) {
                            // Verificar si el paciente tiene errores en sus prestaciones
                            let tieneError = false;
                            let mensajeError = error.message;

                            if (paciente.detallePrestaciones && paciente.detallePrestaciones.length > 0) {
                                for (let i = 0; i < paciente.detallePrestaciones.length; i++) {
                                    if (paciente.detallePrestaciones[i].hasOwnProperty("procesado") && 
                                        paciente.detallePrestaciones[i].procesado === false) {
                                        tieneError = true;
                                        mensajeError = paciente.detallePrestaciones[i].error || error.message;
                                        break;
                                    }
                                }
                            }

                            if (tieneError) {
                                daoAgregarLineasQueue.handleError(queueRecordId, mensajeError);
                                nLog.error("summarize - Registro de cola marcado con error", {
                                    queueRecordId: queueRecordId,
                                    error: mensajeError
                                });
                            } else {
                                daoAgregarLineasQueue.markAsProcessed(queueRecordId);
                                nLog.audit("summarize - Registro de cola marcado como procesado (en catch)", {
                                    queueRecordId: queueRecordId
                                });
                            }
                        }
                    } catch (parseError) {
                        nLog.error("summarize - Error parseando output en catch", parseError);
                    }
                    return true;
                });

                // Relanzar solo si quedan pendientes válidos
                const pendientes = daoAgregarLineasQueue.getPending(1, "SEND^REV");
                if (pendientes && pendientes.length > 0) {
                    nLog.audit("summarize - Relanzando Map/Reduce desde catch", "Quedan pendientes SEND^REV");

                    const mapReduceTask = task.create({
                        taskType: task.TaskType.MAP_REDUCE,
                        scriptId: "customscript_2win_mr_andessalud_ov_el_li",
                        deploymentId: "customdeploy_2win_mr_andessalud_ov_el_li"
                    });

                    const taskId = mapReduceTask.submit();
                    nLog.audit("summarize - Map/Reduce relanzado desde catch", `Task ID: ${taskId}`);
                }
            } catch (colaError) {
                nLog.error("summarize - Error actualizando cola en catch", colaError);
            }
        }
    }

    return {
        getInputData: getInputData,
        map: map,
        reduce: reduce,
        summarize: summarize
    };
});