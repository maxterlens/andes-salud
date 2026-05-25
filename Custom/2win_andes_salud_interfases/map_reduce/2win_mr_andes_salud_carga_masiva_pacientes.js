/**
 *@NApiVersion 2.1
 *@NScriptType MapReduceScript
 *@description Map/Reduce para carga masiva de pacientes
 */
define(["N/runtime", "N/log", "../lib/2win_lib_cliente", "../lib/2win_lib_auditoria", "../dao/2win_dao_file", "../lib/2win_lib_custodia"], function (runtime, nLog, libCliente, libAuditoria, daoFile, libCustodia) {
    /**
     * @function getInputData - Recupera los datos del archivo
     * @returns {Array} - Array de pacientes a procesar
     */
    function getInputData() {
        try {
            nLog.audit("getInputData - inicio", "Recuperando datos de carga masiva");

            // Recuperar ID del archivo desde el parámetro del script
            const archivoId = runtime.getCurrentScript().getParameter({ 
                name: "custscript_mr_pacientes_data" 
            });

            nLog.debug("getInputData - archivoId", archivoId);

            // Validar que se haya recibido el parámetro
            if (!archivoId) {
                throw new Error("Falta parámetro custscript_mr_pacientes_data");
            }

            // Cargar archivo
            const archivo = daoFile.cargarArchivo(archivoId);
            const contenido = archivo.contenido;
            const nombreArchivo = archivo.nombre;

            nLog.debug("getInputData - archivo cargado", {
                nombreArchivo: nombreArchivo,
                contenidoLength: contenido.length
            });

            // Parsear contenido JSON
            const datosCarga = JSON.parse(contenido);

            nLog.audit("getInputData - datosCarga", {
                totalRegistros: datosCarga.length,
                nombreArchivo: nombreArchivo
            });

            // Retornar array de pacientes para el mapa
            return datosCarga;
        } catch (error) {
            nLog.error("getInputData - error", error);
            throw error;
        }
    }

    /**
     * @function map - Procesa cada paciente individualmente
     * @param {object} context - Contexto de ejecución del Map
     */
    function map(context) {
        let resultadoProcesamiento = {
            procesado: false,
            error: null,
            datos: null
        };

        // Variables para custodia
        let custodiaId = null;
        let custodiaExternalId = null;

        try {
            // Parsear datos del paciente
            const paciente = JSON.parse(context.value);

            // Extraer información de custodia
            custodiaId = paciente._custodiaId;
            custodiaExternalId = paciente._custodiaExternalId;

            nLog.audit("map - paciente recibido", {
                messageRawLength: paciente.messageRaw ? paciente.messageRaw.length : 0,
                custodiaId: custodiaId,
                custodiaExternalId: custodiaExternalId
            });

            resultadoProcesamiento.datos = paciente;

            // Actualizar estado de custodia a PROCESANDO
            if (custodiaId) {
                try {
                    libCustodia.actualizarRegistro({
                        internalid: custodiaId,
                        externalid: custodiaExternalId,
                        custrecord_2win_as_emisor: "ANDES_SALUD",
                        custrecord_2win_as_receptor: "NETSUITE",
                        custrecord_2win_as_fecha_mensaje: new Date(),
                        custrecord_2win_as_tiempo_proceso: Date.now(),
                        custrecord_2win_as_interface: "carga masiva pacientes",
                        codigoRespuesta: "PROCESANDO",
                        datosEntrada: JSON.stringify(paciente),
                        respuesta: "Procesando paciente...",
                        reintentos: 0
                    });
                    nLog.debug("map - custodia actualizada a PROCESANDO", custodiaId);
                } catch (custodiaError) {
                    nLog.error("map - error actualizando custodia a PROCESANDO", custodiaError);
                    // No detenemos el procesamiento por error en custodia
                }
            }

            // Crear objeto de contexto para la librería de cliente
            const contextoCreacion = {
                messageRaw: paciente.messageRaw
            };

            // Crear paciente usando la librería existente
            const respuesta = libCliente.crearRegistro(contextoCreacion);

            nLog.audit("map - paciente creado", {
                idNetSuite: respuesta.idRegistroCreado,
                custodiaId: custodiaId
            });

            resultadoProcesamiento.procesado = true;
            resultadoProcesamiento.respuesta = respuesta;

            // Actualizar estado de custodia a EXITOSO (000)
            if (custodiaId) {
                try {
                    libCustodia.actualizarRegistro({
                        internalid: custodiaId,
                        externalid: custodiaExternalId,
                        custrecord_2win_as_emisor: "ANDES_SALUD",
                        custrecord_2win_as_receptor: "NETSUITE",
                        custrecord_2win_as_fecha_mensaje: new Date(),
                        custrecord_2win_as_tiempo_proceso: Date.now(),
                        custrecord_2win_as_interface: "carga masiva pacientes",
                        codigoRespuesta: "000",
                        datosEntrada: JSON.stringify(paciente),
                        respuesta: `Paciente creado exitosamente. ID: ${respuesta.idRegistroCreado}`,
                        reintentos: 0
                    });
                    nLog.debug("map - custodia actualizada a EXITOSO", custodiaId);
                } catch (custodiaError) {
                    nLog.error("map - error actualizando custodia a EXITOSO", custodiaError);
                    // No detenemos el procesamiento por error en custodia
                }
            }

            // Crear key usando el índice del contexto
            const keyContexto = context.key;

            // Enviar resultado al summarize output
            context.write(keyContexto, JSON.stringify(resultadoProcesamiento));
        } catch (error) {
            nLog.error("map - error", error);

            resultadoProcesamiento.procesado = false;
            resultadoProcesamiento.error = {
                nombre: error.name,
                mensaje: error.message,
                stack: error.stack
            };

            // Actualizar estado de custodia a ERROR (001)
            if (custodiaId) {
                try {
                    libCustodia.actualizarRegistro({
                        internalid: custodiaId,
                        externalid: custodiaExternalId,
                        custrecord_2win_as_emisor: "ANDES_SALUD",
                        custrecord_2win_as_receptor: "NETSUITE",
                        custrecord_2win_as_fecha_mensaje: new Date(),
                        custrecord_2win_as_tiempo_proceso: Date.now(),
                        custrecord_2win_as_interface: "carga masiva pacientes",
                        codigoRespuesta: "001",
                        datosEntrada: JSON.stringify(resultadoProcesamiento.datos),
                        respuesta: `Error: ${error.message}`,
                        reintentos: 0
                    });
                    nLog.debug("map - custodia actualizada a ERROR", custodiaId);
                } catch (custodiaError) {
                    nLog.error("map - error actualizando custodia a ERROR", custodiaError);
                    // No detenemos el procesamiento por error en custodia
                }
            }

            // Crear key usando el índice del contexto
            const keyContexto = context.key;

            // Enviar resultado al summarize output (incluso si falló)
            context.write(keyContexto, JSON.stringify(resultadoProcesamiento));
        }
    }

    /**
     * @function summarize - Resume el procesamiento y genera reporte final
     * @param {object} summary - Resumen de ejecución del Map/Reduce
     */
    function summarize(summary) {
        try {
            nLog.audit("summarize - inicio", "Generando reporte final de carga masiva");

            // Recuperar pares key-value de salida del map
            const resultados = [];
            summary.output.iterator().each(function (key, value) {
                const resultado = JSON.parse(value);
                resultados.push(resultado);

                return true;
            });

            nLog.audit("summarize - resultados", {
                totalProcesados: resultados.length,
                detalle: resultados
            });

            // Calcular estadísticas
            const exitosos = resultados.filter(function (item) {
                return item.procesado === true;
            });

            const fallidos = resultados.filter(function (item) {
                return item.procesado === false;
            });

            const resumen = {
                totalProcesados: resultados.length,
                exitosos: exitosos.length,
                fallidos: fallidos.length,
                porcentajeExito: resultados.length > 0 ? ((exitosos.length / resultados.length) * 100).toFixed(2) + "%" : "0%",
                porcentajeFalla: resultados.length > 0 ? ((fallidos.length / resultados.length) * 100).toFixed(2) + "%" : "0%"
            };

            nLog.audit("summarize - resumen", resumen);

            // Crear proceso de auditoría
            let proceso = {
                nombreProceso: "Carga Masiva Pacientes",
                scriptId: runtime.getCurrentScript().id,
                etapa: summary.name,
                estado: "000",
                tipoRegistroCreado: "Cliente",
                descripcionResultado: fallidos.length === 0 ? "Carga masiva de pacientes finalizada exitosamente" : "Carga masiva de pacientes finalizada con errores"
            };

            // Crear reporte de auditoría
            libAuditoria.crearReporteAuditoria(proceso);

            nLog.audit("summarize - rendimiento", {
                totalSegundos: summary.seconds,
                totalUsage: summary.usage,
                totalYields: summary.yields
            });

            // Log de errores del mapa (errores críticos que no fueron capturados)
            summary.mapSummary.errors.iterator().each(function (key, error) {
                nLog.error("summarize - error critico", {
                    key: key,
                    error: error
                });
                return true;
            });
        } catch (error) {
            nLog.error("summarize - error", error);
            throw error;
        }
    }

    return {
        getInputData: getInputData,
        map: map,
        summarize: summarize
    };
});
