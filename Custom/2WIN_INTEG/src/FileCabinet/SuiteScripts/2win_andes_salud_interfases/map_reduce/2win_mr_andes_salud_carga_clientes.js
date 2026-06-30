/**
 * @NApiVersion 2.1
 * @NScriptType MapReduceScript
 * @description Script Map/Reduce para procesamiento masivo de clientes desde mensajes HL7
 */

define([
    "../lib/2win_lib_auditoria",
    "../lib/2win_lib_cliente",
    "../lib/2win_lib_custodia",
    "../dao/2win_dao_file",
    "N/runtime",
    "N/log",
    "N/task"
], function (libAuditoria, libCliente, libCustodia, daoFile, runtime, nLog, task) {
    
    /**
     * @function getInputData - Recupera los mensajes HL7 del archivo
     * @returns {Array} - Arreglo de mensajes HL7 a procesar
     */
    function getInputData() {
        try {
            // Recuperar parametro con ID del archivo
            const idArchivo = runtime.getCurrentScript().getParameter({
                name: "custscript_mr_as_carga_clientes_archivo"
            });

            if (!idArchivo) {
                throw new Error("Falta parametro custscript_mr_as_carga_clientes_archivo");
            }

            nLog.audit("getInputData - Iniciando carga de archivo", {
                idArchivo: idArchivo
            });

            // Cargar archivo
            const archivo = daoFile.cargarArchivo(idArchivo);
            const contenido = archivo.contenido;
            
            nLog.debug("getInputData - Contenido del archivo", {
                longitudContenido: contenido ? contenido.length : 0
            });

            // Parsear contenido
            const datosProceso = JSON.parse(contenido);
            nLog.audit("getInputData - Datos del proceso", {
                tipoOperacion: datosProceso.tipoOperacion,
                cantidadMensajes: datosProceso.mensajes ? datosProceso.mensajes.length : 0,
                nombreProceso: datosProceso.nombreProceso
            });

            // Retornar los mensajes HL7
            // Cada elemento del array será procesado individualmente en el map
            return datosProceso.mensajes.map((mensaje, index) => {
                return {
                    messageRaw: mensaje,
                    index: index,
                    nombreProceso: datosProceso.nombreProceso,
                    fechaCreacion: datosProceso.fechaCreacion
                };
            });
        } catch (error) {
            nLog.error("getInputData - error", error);
            throw error;
        }
    }

    /**
     * @function map - Procesa cada mensaje HL7 individualmente
     * @param {Object} context - Contexto con los datos a procesar
     */
    function map(context) {
        let resultado = {
            index: 0,
            estado: "pendiente",
            error: null,
            respuesta: null
        };

        try {
            // Parsear los datos
            const datos = JSON.parse(context.value);
            resultado.index = datos.index;

            nLog.audit(`map - Procesando mensaje ${datos.index}`, {
                nombreProceso: datos.nombreProceso,
                longitudMensaje: datos.messageRaw ? datos.messageRaw.length : 0
            });

            // Crear el contexto para llamar a la función existente
            const contextoCliente = {
                messageRaw: datos.messageRaw
            };

            // Llamar a la función existente de creación de cliente
            // Esto reutiliza toda la lógica de negocio existente
            const respuesta = libCliente.crearRegistro(contextoCliente);

            resultado.estado = "exitoso";
            resultado.respuesta = respuesta;

            nLog.debug(`map - Mensaje ${datos.index} procesado exitosamente`, {
                respuesta: respuesta
            });

            // Escribir resultado exitoso
            context.write({
                key: `exito_${datos.index}`,
                value: JSON.stringify(resultado)
            });

        } catch (error) {
            nLog.error(`map - Error procesando mensaje`, {
                index: resultado.index,
                error: error.message,
                stack: error.stack
            });

            resultado.estado = "error";
            resultado.error = {
                mensaje: error.message,
                nombre: error.name
            };

            // Escribir resultado con error
            context.write({
                key: `error_${resultado.index}`,
                value: JSON.stringify(resultado)
            });
        }
    }

    /**
     * @function summarize - Resumen de la ejecución del Map/Reduce
     * @param {Object} summary - Resumen de la ejecución
     */
    function summarize(summary) {
        let proceso = {
            nombreProceso: "Carga Masiva Clientes - Andes Salud",
            scriptId: "2win_mr_andes_salud_carga_clientes",
            etapa: "summarize",
            estado: "000",
            tokenProceso: libAuditoria.obtenerToken(),
            descripcionResultado: "",
            estadisticas: {
                total: 0,
                exitosos: 0,
                errores: 0
            },
            errores: []
        };

        try {
            nLog.audit("summarize - Iniciando resumen", {
                inputSummary: summary.inputSummary,
                mapSummary: summary.mapSummary
            });

            // Recuperar información del archivo
            const idArchivo = runtime.getCurrentScript().getParameter({
                name: "custscript_mr_as_carga_clientes_archivo"
            });
            
            let nombreProceso = "proceso_desconocido";
            if (idArchivo) {
                try {
                    const archivo = daoFile.cargarArchivo(idArchivo);
                    const datos = JSON.parse(archivo.contenido);
                    nombreProceso = datos.nombreProceso || nombreProceso;
                } catch (e) {
                    nLog.warn("summarize - No se pudo recuperar nombre del proceso", e);
                }
            }

            // Procesar resultados
            let totalProcesados = 0;
            let totalExitosos = 0;
            let totalErrores = 0;
            let listaErrores = [];

            summary.output.iterator().each(function (key, value) {
                totalProcesados++;
                const resultado = JSON.parse(value);

                if (resultado.estado === "exitoso") {
                    totalExitosos++;
                } else {
                    totalErrores++;
                    listaErrores.push({
                        index: resultado.index,
                        error: resultado.error
                    });
                }
                return true;
            });

            // Actualizar estadísticas
            proceso.estadisticas.total = totalProcesados;
            proceso.estadisticas.exitosos = totalExitosos;
            proceso.estadisticas.errores = totalErrores;
            proceso.errores = listaErrores;

            // Construir descripción del resultado
            if (totalErrores === 0) {
                proceso.descripcionResultado = `Proceso completado exitosamente. ${totalExitosos} clientes creados.`;
            } else {
                proceso.descripcionResultado = `Proceso completado con ${totalErrores} errores de ${totalProcesados} registros. ${totalExitosos} clientes creados exitosamente.`;
                proceso.estado = "001"; // Estado con advertencia
            }

            nLog.audit("summarize - Estadísticas finales", {
                total: totalProcesados,
                exitosos: totalExitosos,
                errores: totalErrores,
                nombreProceso: nombreProceso
            });

            // Crear reporte de auditoría
            libAuditoria.crearReporteAuditoria(proceso);

            // Mostrar resumen en logs
            nLog.audit("=== RESUMEN CARGA MASIVA CLIENTES ===", {
                Proceso: nombreProceso,
                Total_Procesado: totalProcesados,
                Exitosos: totalExitosos,
                Errores: totalErrores,
                Tasa_Exito: totalProcesados > 0 ? ((totalExitosos / totalProcesados) * 100).toFixed(2) + "%" : "0%"
            });

            // Si hay errores, listarlos
            if (listaErrores.length > 0) {
                nLog.warn("summarize - Errores encontrados", {
                    cantidadErrores: listaErrores.length,
                    errores: listaErrores.slice(0, 10) // Mostrar primeros 10 errores
                });
            }

            // Actualizar registro de custodia si existe
            if (idArchivo) {
                try {
                    // Crear archivo de resultados
                    const nombreArchivoResultado = `${nombreProceso}_resultados.json`;
                    const contenidoResultado = JSON.stringify({
                        nombreProceso: nombreProceso,
                        fechaProceso: new Date().toISOString(),
                        estadisticas: proceso.estadisticas,
                        errores: listaErrores
                    }, null, 2);

                    daoFile.crearArchivo(nombreArchivoResultado, contenidoResultado);
                    
                    nLog.audit("summarize - Archivo de resultados creado", {
                        nombreArchivo: nombreArchivoResultado
                    });
                } catch (e) {
                    nLog.warn("summarize - Error creando archivo de resultados", e);
                }
            }

            // Verificar governance points
            let scriptObj = runtime.getCurrentScript();
            nLog.debug("summarize - Governance points restantes", {
                remainingUsage: scriptObj.getRemainingUsage()
            });

        } catch (error) {
            nLog.error("summarize - error", error);
            
            proceso.estado = "001";
            proceso.descripcionResultado = `Error durante el resumen: ${error.message}`;
            libAuditoria.crearReporteAuditoria(proceso);
        }
    }

    return {
        getInputData: getInputData,
        map: map,
        summarize: summarize
    };
});