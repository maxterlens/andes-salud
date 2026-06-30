/**
 *@NApiVersion 2.1
 *@NScriptType MapReduceScript
 */
define(["N/runtime", "N/task", "N/file", "N/log", "../domain/2win_dom_prefactura", "../dao/2win_dao_prefactura_queue", "../dao/2win_dao_file"],

    function (runtime, task, file, nLog, dom_prefactura, dao_prefactura_queue, dao_file) {

        function getInputData() {

            try {

                // Obtener registros pendientes de la cola para SEND^DEL
                const registrosPendientes = dao_prefactura_queue.getPending(50, "SEND^DEL");
                nLog.audit("getInputData - registros pendientes encontrados", registrosPendientes.length);

                if (registrosPendientes.length === 0) {
                    nLog.audit("getInputData", "No hay registros pendientes en la cola");
                    return [];
                }

                return registrosPendientes;

            } catch (error) {
                nLog.error("getInputData - error", error);
                throw error;
            }

        }

        function map(context) {

            let resultado = { procesado: false, error: null, datos: null, queueRecordId: null };

            try {

                // El context.value ahora es el registro de la cola
                const queueRecord = JSON.parse(context.value);
                resultado.queueRecordId = queueRecord.id;
                
                nLog.audit("map - queueRecord", queueRecord);

                // Cargar el archivo JSON desde el archivo ID
                const archivo = dao_file.cargarArchivo(queueRecord.archivoId);
                const contenido = JSON.parse(archivo.contenido);
                
                // Procesar cada prefactura en el archivo
                contenido.data.forEach(function(data) {
                    nLog.audit("map - data prefactura", data);
                    resultado.datos = data;

                    // Eliminar prefactura
                    const id_prefactura = dom_prefactura.eliminar(data);
                    nLog.audit("map - id_prefactura eliminada", id_prefactura);
                    resultado.procesado = true;

                    // Crear id unico por NumPrefactura y CuentaPaciente
                    const id_contexto = data.Prefactura.NumPrefactura + "-" + data.Prefactura.CuentaPaciente;

                    // Enviar resultado al summarize output
                    context.write(id_contexto, resultado);
                });

            } catch (error) {

                nLog.error("map - error", error);

                if (error.name === "VALIDATION_ERROR") {

                    // Errores controlados
                    resultado.error = error.message;

                    // Crear id unico (usar el queueRecordId como fallback)
                    const id_contexto = resultado.datos 
                        ? resultado.datos.Prefactura.NumPrefactura + "-" + resultado.datos.Prefactura.CuentaPaciente
                        : "queue-" + resultado.queueRecordId;

                    // Enviar resultado al summarize output
                    context.write(id_contexto, resultado);

                } else {

                    // Errores no controlados
                    throw error;
                }
            }
        }

        function summarize(summary) {

            // Recuperar pares key-value de salida del map
            const resultados = {};
            summary.output.iterator().each(function (key, value) {

                const resultado = JSON.parse(value);
                nLog.debug("summarize - output", { [key]: resultado });
                
                // Agrupar por queueRecordId para actualizar la cola
                if (resultado.queueRecordId) {
                    if (!resultados[resultado.queueRecordId]) {
                        resultados[resultado.queueRecordId] = [];
                    }
                    resultados[resultado.queueRecordId].push(resultado);
                }

                return true;
            });

            nLog.audit("summarize - resultados por queueRecordId", Object.keys(resultados).length);

            // Actualizar cada registro de la cola
            let procesados = 0;
            let conErrores = 0;
            
            Object.keys(resultados).forEach(function(queueRecordId) {
                const registros = resultados[queueRecordId];
                const hayErrores = registros.some(function(r) { return !r.procesado; });
                
                if (hayErrores) {
                    // Marcar como error
                    dao_prefactura_queue.handleError(queueRecordId, "Error al procesar una o más prefacturas");
                    conErrores++;
                    
                    // Crear archivo de casos no procesados y notificar
                    const registrosNoProcesados = registros.filter(function(r) { return !r.procesado; });
                    // Obtener el primer registro para extraer datos del archivo
                    if (registrosNoProcesados.length > 0) {
                        const queueRecord = dao_prefactura_queue.getPending(1, "SEND^DEL").find(function(r) { return r.id == queueRecordId; });
                        if (queueRecord) {
                            const archivo = dao_file.cargarArchivo(queueRecord.archivoId);
                            const contenido = JSON.parse(archivo.contenido);
                            
                            const notificacion = {
                                tipoMensaje: "SEND^DEL",
                                estado: "error",
                                codigo: 400,
                                mensaje: "Proceso de eliminación de prefacturas finalizado con errores",
                                tipo_proceso: "Eliminación Prefactura",
                                id_proceso: queueRecord.uuid,
                                data: registrosNoProcesados
                            };
                            
                            dom_prefactura.notificarResultados(notificacion);
                        }
                    }
                } else {
                    // Marcar como procesado
                    dao_prefactura_queue.markAsProcessed(queueRecordId);
                    procesados++;
                    
                    // Notificar éxito
                    const queueRecord = dao_prefactura_queue.getPending(1, "SEND^DEL").find(function(r) { return r.id == queueRecordId; });
                    if (queueRecord) {
                        const archivo = dao_file.cargarArchivo(queueRecord.archivoId);
                        const contenido = JSON.parse(archivo.contenido);
                        
                        const notificacion = {
                            tipoMensaje: "SEND^DEL",
                            estado: "success",
                            codigo: 200,
                            mensaje: "Proceso de eliminación de prefacturas finalizado correctamente",
                            tipo_proceso: "Eliminación Prefactura",
                            id_proceso: queueRecord.uuid,
                            data: registros
                        };
                        
                        dom_prefactura.notificarResultados(notificacion);
                    }
                }
            });

            nLog.audit("summarize - resumen", {
                procesados: procesados,
                conErrores: conErrores,
                total: procesados + conErrores
            });

            // Verificar si quedan pendientes y programar nueva ejecución
            const pendientes = dao_prefactura_queue.getPending(1, "SEND^DEL");
            if (pendientes.length > 0) {
                nLog.audit("summarize", "Quedan registros pendientes, programando nueva ejecución");
                try {
                    const nuevaTarea = task.create({
                        taskType: task.TaskType.MAP_REDUCE,
                        scriptId: "customscript_2win_mr_andes_salud_elim_pf",
                        deploymentId: "customdeploy_2win_mr_andes_salud_elim_pf",
                        params: {}
                    });
                    const taskId = nuevaTarea.submit();
                    nLog.audit("summarize - nueva tarea programada", taskId);
                } catch (error) {
                    nLog.error("summarize - error programando nueva tarea", error);
                }
            }

            nLog.debug('Summary Time', 'Total Seconds: ' + summary.seconds);
            nLog.debug('Summary Usage', 'Total Usage: ' + summary.usage);
            nLog.debug('Summary Yields', 'Total Yields: ' + summary.yields);

            // Summary Map errors
            summary.mapSummary.errors.iterator().each(function (key, value) {
                nLog.error(key, 'ERROR String: ' + value);
                return true;
            });
        }

        return {
            getInputData: getInputData,
            map: map,
            summarize: summarize
        }
    }
);
