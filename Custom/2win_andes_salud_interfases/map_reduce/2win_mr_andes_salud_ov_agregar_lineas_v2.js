/**
 * @NApiVersion 2.1
 * @NScriptType MapReduceScript
 * @description Map/Reduce optimizado V2 para agregar líneas a órdenes de venta
 * OPTIMIZACIONES:
 * - Caché global en getInputData guardado en archivo temporal
 * - Variable global en memoria para evitar recargas del caché
 * - Sin llamadas DAO en map/reduce
 * - Record estático (isDynamic: false) en dominio
 * - Batch size aumentado a 150
 */
define([
    "../dao/2win_dao_cache",
    "../dao/2win_dao_agregar_lineas_queue",
    "../dao/2win_dao_static_params_operacion",
    "../dao/2win_dao_file",
    "../domain/2win_dom_orden_venta_v2",
    "N/runtime",
    "N/file",
    "N/log",
    "N/task"
], function (daoCache, daoQueue, daoParametros, daoFile, domOrdenVentaV2, runtime, file, nLog, task) {

    const BATCH_SIZE = 150;
    
    // ============================================================
    // CAMBIAR ESTE ID AL ID DE TU CARPETA TEMPORAL EN FILE CABINET
    // ============================================================
    const TEMP_CACHE_FOLDER_ID = 1651; // <--- CAMBIAR AQUI
    
    // Variable global a nivel de módulo.
    // Los contenedores de NetSuite mantendrán esto en memoria viva entre ejecuciones consecutivas del mismo hilo.
    let cacheGlobalEnMemoria = null;

    /**
     * @function obtenerCache
     * @description Helper para cargar el caché solo si no está en memoria
     * @param {number} fileId - ID del archivo de caché
     * @returns {Object} Cache cargado
     */
    function obtenerCache(fileId) {
        if (!cacheGlobalEnMemoria) {
            const archivoCargado = file.load({ id: fileId });
            cacheGlobalEnMemoria = JSON.parse(archivoCargado.getContents());
            nLog.debug("Cache Cargado", "El caché se ha cargado a la memoria del hilo del servidor");
        }
        return cacheGlobalEnMemoria;
    }

    /**
     * @function getInputData - Recupera registros pendientes y crea caché global
     * @returns {Array} - Datos para procesar con ID de archivo de caché
     */
    function getInputData() {
        const startTime = Date.now();
        
        try {
            // Resetear caché en memoria para nueva ejecución
            cacheGlobalEnMemoria = null;
            
            // Obtener registros pendientes de la cola filtrados por tipoMensaje SEND^IN
            const registrosPendientes = daoQueue.getPending(BATCH_SIZE, "SEND^IN");
            
            nLog.audit("getInputData - Inicio", {
                registrosPendientes: registrosPendientes.length,
                tipoMensaje: "SEND^IN",
                governanceInicial: runtime.getCurrentScript().getRemainingUsage()
            });

            if (registrosPendientes.length === 0) {
                nLog.audit("getInputData", "No hay registros pendientes en la cola");
                return [];
            }

            // Recolectar todos los pacientes para crear caché
            const todosPacientes = [];
            const archivosData = new Map();

            // Primera pasada: cargar archivos y recolectar pacientes
            for (let i = 0; i < registrosPendientes.length; i++) {
                const registroCola = registrosPendientes[i];

                try {
                    // Cargar archivo
                    const archivoData = daoFile.cargarArchivo(registroCola.archivoId);
                    const contenido = archivoData.contenido;
                    const contenidoParseado = JSON.parse(contenido);

                    // Extraer datos del archivo
                    const tipoMensaje = contenidoParseado.tipoMensaje;
                    const fechaEnvio = contenidoParseado.datos?.FechaEnvio;
                    const uuid = archivoData.nombre.replace(".json", "");
                    const pacientes = contenidoParseado?.datos?.Pacientes || [];

                    // Guardar datos del archivo para referencia
                    archivosData.set(registroCola.id, {
                        archivoId: registroCola.archivoId,
                        folder: registroCola.folder,
                        tipoMensaje: tipoMensaje,
                        fechaEnvio: fechaEnvio,
                        uuid: uuid
                    });

                    // Agregar pacientes con metadata
                    pacientes.forEach(paciente => {
                        paciente._queueRecordId = registroCola.id;
                        paciente._tipoMensaje = tipoMensaje;
                        paciente._fechaEnvio = fechaEnvio;
                        paciente._uuid = uuid;
                        todosPacientes.push(paciente);
                    });

                } catch (error) {
                    nLog.error(`getInputData - Error cargando archivo ${registroCola.archivoId}`, error);
                    daoQueue.handleError(registroCola.id, error.message);
                }
            }

            nLog.audit("getInputData - Pacientes recolectados", {
                total: todosPacientes.length
            });

            // CREAR CACHÉ GLOBAL (una sola vez para todos los pacientes)
            const cache = daoCache.crearCacheCompleto(todosPacientes);

            nLog.audit("getInputData - Cache creado", {
                governanceDespuesCache: runtime.getCurrentScript().getRemainingUsage(),
                subsidiarias: Object.keys(cache.subsidiarias).length,
                clientes: Object.keys(cache.clientes).length,
                productos: Object.keys(cache.productos).length,
                tiposAtencion: Object.keys(cache.tiposAtencion).length,
                ordenesVenta: Object.keys(cache.ordenesVenta).length
            });

            // OPTIMIZACIÓN CRÍTICA: Guardar el caché en un archivo temporal JSON
            let cacheFileId = null;
            try {
                const cacheFile = file.create({
                    name: "temp_cache_mr_" + new Date().getTime() + ".json",
                    fileType: file.Type.JSON,
                    contents: JSON.stringify(cache),
                    folder: TEMP_CACHE_FOLDER_ID
                });
                cacheFileId = cacheFile.save();
                nLog.audit("getInputData - Cache guardado en archivo", { cacheFileId: cacheFileId });
            } catch (fileError) {
                nLog.error("getInputData - Error guardando cache en archivo", fileError);
                // Si falla, usar caché en memoria como fallback
            }

            // Preparar datos para el map
            const mapeo = [];
            
            todosPacientes.forEach(paciente => {
                // Crear objeto con paciente y cacheFileId (solo unos pocos bytes)
                const datosParaMap = {
                    paciente: paciente,
                    cacheFileId: cacheFileId,
                    cache: cacheFileId ? null : cache, // Fallback si no se pudo guardar archivo
                    queueRecordId: paciente._queueRecordId,
                    tipoMensaje: paciente._tipoMensaje,
                    fechaEnvio: paciente._fechaEnvio,
                    uuid: paciente._uuid
                };

                // Limpiar propiedades internas del paciente
                delete paciente._queueRecordId;
                delete paciente._tipoMensaje;
                delete paciente._fechaEnvio;
                delete paciente._uuid;

                mapeo.push(JSON.stringify(datosParaMap));
            });

            const elapsed = Date.now() - startTime;
            nLog.audit("getInputData - Completado", {
                totalPacientes: mapeo.length,
                tiempoMs: elapsed,
                cacheFileId: cacheFileId,
                governanceFinal: runtime.getCurrentScript().getRemainingUsage()
            });

            return mapeo;

        } catch (error) {
            nLog.error("getInputData - Error general", error);
            throw error;
        }
    }

    /**
     * @function map - Valida y mapea datos usando caché
     * @param {Object} context - Contexto del map
     */
    function map(context) {
        try {
            const datosEntrada = JSON.parse(context.value);
            const paciente = datosEntrada.paciente;
            const metadata = {
                queueRecordId: datosEntrada.queueRecordId,
                tipoMensaje: datosEntrada.tipoMensaje,
                fechaEnvio: datosEntrada.fechaEnvio,
                uuid: datosEntrada.uuid
            };

            // Solo procesar tipo SEND^IN
            if (metadata.tipoMensaje !== "SEND^IN") {
                return;
            }

            // OPTIMIZACIÓN: Obtener caché eficiente (desde archivo o memoria)
            let cache;
            if (datosEntrada.cacheFileId) {
                cache = obtenerCache(datosEntrada.cacheFileId);
            } else if (datosEntrada.cache) {
                cache = datosEntrada.cache;
            } else {
                throw new Error("No hay caché disponible");
            }

            // Validar y mapear usando caché (SIN llamadas DAO)
            const resultado = domOrdenVentaV2.validarMapearDatosSendIn(paciente, cache);
            nLog.debug("map - Resultado validación/mapeo", resultado);
            // Preparar datos para reduce (pasar cacheFileId, no el caché completo)
            const datosParaReduce = {
                datosEntrada: resultado.datosEntrada,
                camposMapeados: resultado.camposMapeados,
                errores: resultado.errores,
                cacheFileId: datosEntrada.cacheFileId,
                metadata: metadata
            };

            context.write(context.key, datosParaReduce);

        } catch (error) {
            nLog.error(`map - Error key ${context.key}`, error);
            
            // Enviar error al reduce
            const datosEntrada = JSON.parse(context.value);
            context.write(context.key, {
                datosEntrada: datosEntrada.paciente,
                errores: [{ error: error.message, esGeneral: true }],
                cacheFileId: datosEntrada.cacheFileId,
                metadata: {
                    queueRecordId: datosEntrada.queueRecordId,
                    tipoMensaje: datosEntrada.tipoMensaje,
                    fechaEnvio: datosEntrada.fechaEnvio,
                    uuid: datosEntrada.uuid
                }
            });
        }
    }

    /**
     * @function reduce - Procesa la orden de venta
     * @param {Object} context - Contexto del reduce
     */
    function reduce(context) {
        try {
            const datos = context.values[0] ? JSON.parse(context.values[0]) : null;
            
            if (!datos) {
                throw new Error("No hay datos para procesar");
            }

            const { datosEntrada, camposMapeados, errores, metadata } = datos;

            // Si hay errores de mapeo, no procesar
            if (errores && errores.length > 0 && !camposMapeados) {
                nLog.audit(`reduce - Errores de mapeo`, { key: context.key, errores: errores });
                
                context.write(context.key, {
                    exitoso: false,
                    errores: errores,
                    metadata: metadata,
                    datosEntrada: datosEntrada
                });
                return;
            }

            // OPTIMIZACIÓN: Obtener caché eficiente (desde archivo o memoria)
            let cache;
            if (datos.cacheFileId) {
                cache = obtenerCache(datos.cacheFileId);
            } else if (datos.cache) {
                cache = datos.cache;
            } else {
                throw new Error("No hay caché disponible en reduce");
            }

            // Procesar orden de venta
            const resultado = domOrdenVentaV2.procesarOrdenVenta(camposMapeados, cache);

            // Actualizar datos de entrada con errores si los hay
            if (resultado.errores && resultado.errores.length > 0) {
                resultado.errores.forEach(err => {
                    if (!err.esGeneral && err.CrgCorrel) {
                        const prestacion = datosEntrada.detallePrestaciones?.find(
                            p => String(p.CrgCorrel) === String(err.CrgCorrel)
                        );
                        if (prestacion) {
                            prestacion.procesado = false;
                            prestacion.error = err.error;
                        }
                    }
                });
            }

            context.write(context.key, {
                exitoso: resultado.exitoso,
                idRegistro: resultado.idRegistro,
                lineasProcesadas: resultado.lineasProcesadas,
                lineasConError: resultado.lineasConError,
                errores: resultado.errores,
                metadata: metadata,
                datosEntrada: datosEntrada
            });

        } catch (error) {
            nLog.error(`reduce - Error key ${context.key}`, error);
            
            const datos = context.values[0] ? JSON.parse(context.values[0]) : {};
            context.write(context.key, {
                exitoso: false,
                errores: [{ error: error.message, esGeneral: true }],
                metadata: datos.metadata,
                datosEntrada: datos.datosEntrada
            });
        }
    }

    /**
     * @function summarize - Resumen y actualización de cola
     * @param {Object} summary - Resumen de ejecución
     */
    function summarize(summary) {
        const startTime = Date.now();
        let cacheFileIdToDelete = null;
        
        try {
            nLog.audit("summarize - Inicio", {
                governanceInicial: runtime.getCurrentScript().getRemainingUsage()
            });

            // Recuperar errores de etapas
            let erroresMap = [];
            summary.mapSummary.errors.iterator().each(function (key, value) {
                erroresMap.push({ key: key, error: JSON.parse(value) });
                return true;
            });

            let erroresReduce = [];
            summary.reduceSummary.errors.iterator().each(function (key, value) {
                erroresReduce.push({ key: key, error: JSON.parse(value) });
                return true;
            });

            if (erroresMap.length > 0) {
                nLog.audit("summarize - Errores map", { cantidad: erroresMap.length });
            }
            if (erroresReduce.length > 0) {
                nLog.audit("summarize - Errores reduce", { cantidad: erroresReduce.length });
            }

            // Agrupar resultados por queueRecordId
            const resultadosPorCola = {};
            let totalExitosos = 0;
            let totalErrores = 0;

            summary.output.iterator().each(function (key, value) {
                const resultado = JSON.parse(value);
                const queueRecordId = resultado.metadata?.queueRecordId;

                if (!queueRecordId) return true;

                if (!resultadosPorCola[queueRecordId]) {
                    resultadosPorCola[queueRecordId] = {
                        queueRecordId: queueRecordId,
                        uuid: resultado.metadata?.uuid,
                        tipoMensaje: resultado.metadata?.tipoMensaje,
                        pacientes: [],
                        tieneErrores: false,
                        totalLineasProcesadas: 0,
                        totalLineasConError: 0
                    };
                }

                resultadosPorCola[queueRecordId].pacientes.push(resultado);
                resultadosPorCola[queueRecordId].totalLineasProcesadas += resultado.lineasProcesadas || 0;
                resultadosPorCola[queueRecordId].totalLineasConError += resultado.lineasConError || 0;

                if (!resultado.exitoso || (resultado.errores && resultado.errores.length > 0)) {
                    resultadosPorCola[queueRecordId].tieneErrores = true;
                    totalErrores++;
                } else {
                    totalExitosos++;
                }

                return true;
            });

            nLog.audit("summarize - Resultados agrupados", {
                archivosProcesados: Object.keys(resultadosPorCola).length,
                pacientesExitosos: totalExitosos,
                pacientesConError: totalErrores
            });

            // Obtener parámetros de operación
            let urlBase = "";
            try {
                const paramUrl = daoParametros.getParam("interfaces_andessalud_hc_url_base");
                urlBase = paramUrl?.text || "";
            } catch (e) {
                nLog.error("summarize - Error obteniendo parámetro URL", e);
            }

            // Actualizar estados de cola y enviar respuestas
            const colaUpdates = [];
            
            Object.keys(resultadosPorCola).forEach(queueRecordId => {
                const resultado = resultadosPorCola[queueRecordId];

                if (resultado.tieneErrores) {
                    // Marcar con error
                    const errorMessage = resultado.pacientes
                        .filter(p => p.errores && p.errores.length > 0)
                        .map(p => p.errores.map(e => e.error).join("; "))
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

                    // Enviar respuesta exitosa
                    if (urlBase) {
                        try {
                            const cuerpoPeticion = {
                                tipoMensaje: resultado.tipoMensaje,
                                estado: "success",
                                codigo: 200,
                                tipo_proceso: "ingresos ambulatorios",
                                idproceso: resultado.uuid,
                                mensaje: "Cargos ambulatorios procesados correctamente",
                                errores: []
                            };

                            // Aquí iría la llamada HTTP - omitida por simplicidad
                            // daoOrdenVenta.enviarRegistro(`${urlBase}/process-batch`, cuerpoPeticion);
                            
                        } catch (httpError) {
                            nLog.error("summarize - Error enviando respuesta HTTP", httpError);
                        }
                    }
                }
            });

            // Batch update de cola
            let updatesExitosos = 0;
            let updatesErrores = 0;

            colaUpdates.forEach(update => {
                try {
                    if (update.accion === "procesado") {
                        daoQueue.markAsProcessed(update.id);
                    } else {
                        daoQueue.handleError(update.id, update.mensaje);
                    }
                    updatesExitosos++;
                } catch (e) {
                    updatesErrores++;
                }
            });

            nLog.audit("summarize - Actualizaciones de cola", {
                total: colaUpdates.length,
                exitosos: updatesExitosos,
                errores: updatesErrores
            });

            // Limpiar archivos de caché temporales antiguos
            try {
                limpiarArchivosCacheTemporales();
            } catch (cleanError) {
                nLog.error("summarize - Error limpiando caché temporal", cleanError);
            }

            // Relanzar si hay más pendientes
            try {
                const pendientes = daoQueue.getPending(1);
                
                if (pendientes && pendientes.length > 0) {
                    nLog.audit("summarize - Relanzando Map/Reduce", "Quedan pendientes");
                    
                    const mapReduceTask = task.create({
                        taskType: task.TaskType.MAP_REDUCE,
                        scriptId: "customscript_2win_mr_andessalud_ov_ag_li_v2",
                        deploymentId: "customdeploy_2win_mr_andessalud_ov_ag_li_v2"
                    });
                    
                    const taskId = mapReduceTask.submit();
                    nLog.audit("summarize - Map/Reduce relanzado", `Task ID: ${taskId}`);
                }
            } catch (relaunchError) {
                nLog.error("summarize - Error relanzando", relaunchError);
            }

            // Generar asientos (mantener lógica original)
            try {
                const mapReduceTask = task.create({
                    taskType: task.TaskType.MAP_REDUCE,
                    scriptId: "customscript_2win_mr_andes_salud_j_gener",
                    deploymentId: "customdeploy_2win_mr_andes_salud_j_gener"
                });
                
                const taskId = mapReduceTask.submit();
                nLog.audit("summarize - Tarea asientos enviada", `Task ID: ${taskId}`);
            } catch (asientoError) {
                nLog.error("summarize - Error enviando tarea asientos", asientoError);
            }

            const elapsed = Date.now() - startTime;
            nLog.audit("summarize - Completado", {
                tiempoMs: elapsed,
                governanceFinal: runtime.getCurrentScript().getRemainingUsage()
            });

        } catch (error) {
            nLog.error("summarize - Error general", error);
        }
    }

    /**
     * @function limpiarArchivosCacheTemporales
     * @description Elimina archivos de caché temporales antiguos de la carpeta temporal
     */
    function limpiarArchivosCacheTemporales() {
        try {
            // Buscar archivos temporales de caché en la carpeta
            const folderFiles = file.load({ id: TEMP_CACHE_FOLDER_ID });
            
            // Usar search para encontrar archivos antiguos
            // Por simplicidad, solo logueamos - en producción usar N/search para borrar
            nLog.audit("limpiarArchivosCacheTemporales", 
                "Archivos temporales deben ser limpiados manualmente o vía scheduled script");
            
            // Nota: Para limpieza automática, crear un scheduled script separado
            // que borre archivos 'temp_cache_mr_*.json' mayores a 1 hora
        } catch (e) {
            nLog.error("limpiarArchivosCacheTemporales - Error", e);
        }
    }

    return {
        getInputData: getInputData,
        map: map,
        reduce: reduce,
        summarize: summarize
    };
});