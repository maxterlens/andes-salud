/**
 * DAO para gestionar la cola de procesamiento de Map/Reduce
 * @NApiVersion 2.1
 * @NModuleScope SameAccount
 */
define(["N/record", "N/search", "N/task", "N/log"], function (record, search, task, nLog) {
    /**
     * Estados de la cola
     */
    const ESTADO_COLA = {
        PENDIENTE: 1,
        EN_PROCESO: 2,
        COMPLETADO: 3,
        ERROR: 4
    };

    const FLUJO = {
        CAJA: 1,
        FACTURACION: 2,
        OTRO: 3
    };

    /**
     * Crea un nuevo registro en la cola de procesamiento
     * @param {Object} datos - Datos para crear el registro
     * @param {string} datos.idArchivo - ID del archivo JSON
     * @param {string} datos.nombreArchivo - Nombre del archivo JSON
     * @param {string} datos.flujo - Tipo de flujo (CAJA, FACTURACION, OTRO)
     * @param {string} datos.scriptId - Script ID del Map/Reduce
     * @param {string} datos.deploymentId - Deployment ID del Map/Reduce
     * @param {string} datos.parameterName - Nombre del parámetro del Map/Reduce
     * @returns {number} - ID del registro creado
     */
    function crearRegistroCola(datos) {
        try {
            nLog.debug("crearRegistroCola - datos", datos);

            const recordCola = record.create({
                type: "customrecord_2w_as_cola_procesamiento"
            });

            recordCola.setValue({
                fieldId: "custrecord_2w_as_nombre_archivo",
                value: datos.nombreArchivo
            });

            recordCola.setValue({
                fieldId: "custrecord_2w_as_estado_cola",
                value: ESTADO_COLA.PENDIENTE
            });

            recordCola.setValue({
                fieldId: "custrecord_2w_as_flujo",
                value: FLUJO[datos.flujo]
            });

            recordCola.setValue({
                fieldId: "custrecord_2w_as_script_id_mr",
                value: datos.scriptId
            });

            recordCola.setValue({
                fieldId: "custrecord_2w_as_deployment_id_mr",
                value: datos.deploymentId
            });

            recordCola.setValue({
                fieldId: "custrecord_2w_as_parameter_name",
                value: datos.parameterName
            });

            recordCola.setValue({
                fieldId: "custrecord_2w_as_intentos",
                value: 0
            });

            const idCola = recordCola.save();
            nLog.audit("crearRegistroCola - exito", `Registro de cola creado: ${idCola}`);

            return idCola;
        } catch (error) {
            nLog.error("crearRegistroCola - error", error);
            throw error;
        }
    }

    /**
     * Verifica si hay un Map/Reduce activo para el script especificado
     * @param {string} deployId - Deployment ID del Map/Reduce
     * @returns {boolean} - True si hay un Map/Reduce activo
     */
    function verificarMapReduceActivo(deployId) {
        try {
            const taskSearch = search.create({
                type: "scheduledscriptinstance",
                columns: ["status", "taskid"],
                filters: [["formulatext: {scriptdeployment.scriptid}", "is", deployId], "AND", ["status", "anyof", "PENDING", "PROCESSING"]]
            });

            const mapReduceStatus = taskSearch.run().getRange({ start: 0, end: 10 });
            const tieneActivos = mapReduceStatus && mapReduceStatus.length > 0;

            nLog.debug(`verificarMapReduceActivo - ${deployId}`, {
                tieneActivos: tieneActivos,
                cantidad: mapReduceStatus ? mapReduceStatus.length : 0
            });

            return tieneActivos;
        } catch (error) {
            nLog.error("verificarMapReduceActivo - error", error);
            throw error;
        }
    }

    /**
     * Obtiene el siguiente registro pendiente de la cola para un flujo específico
     * @param {string} flujo - Tipo de flujo (CAJA, FACTURACION, OTRO)
     * @returns {Object|null} - Datos del registro pendiente o null
     */
    function obtenerSiguientePendiente(flujo) {
        try {
            const searchCola = search.create({
                type: "customrecord_2w_as_cola_procesamiento",
                filters: [["custrecord_2w_as_estado_cola", "is", ESTADO_COLA.PENDIENTE], "AND", ["custrecord_2w_as_flujo", "is", flujo]],
                columns: [
                    "internalid",
                    "custrecord_2w_as_nombre_archivo",
                    "custrecord_2w_as_flujo",
                    "custrecord_2w_as_script_id_mr",
                    "custrecord_2w_as_deployment_id_mr",
                    "custrecord_2w_as_parameter_name",
                    "custrecord_2w_as_intentos",
                    search.createColumn({
                        name: "created",
                        sort: search.Sort.ASC
                    })
                ]
            });

            const resultSet = searchCola.run();
            const resultRange = resultSet.getRange({
                start: 0,
                end: 1
            });

            if (resultRange.length > 0) {
                const result = resultRange[0];
                const datos = {
                    id: result.getValue("internalid"),
                    nombreArchivo: result.getValue("custrecord_2w_as_nombre_archivo"),
                    flujo: result.getValue("custrecord_2w_as_flujo"),
                    scriptId: result.getValue("custrecord_2w_as_script_id_mr"),
                    deploymentId: result.getValue("custrecord_2w_as_deployment_id_mr"),
                    parameterName: result.getValue("custrecord_2w_as_parameter_name"),
                    intentos: parseInt(result.getValue("custrecord_2w_as_intentos") || 0)
                };

                nLog.debug("obtenerSiguientePendiente - encontrado", datos);
                return datos;
            }

            nLog.debug("obtenerSiguientePendiente - no encontrado", {
                flujo: flujo
            });
            return null;
        } catch (error) {
            nLog.error("obtenerSiguientePendiente - error", error);
            throw error;
        }
    }

    /**
     * Actualiza el estado de un registro de la cola
     * @param {number} idCola - ID del registro de la cola
     * @param {string} estado - Nuevo estado (PENDIENTE, EN_PROCESO, COMPLETADO, ERROR)
     */
    function actualizarEstadoCola(idCola, estado) {
        try {
            nLog.debug("actualizarEstadoCola", {
                idCola: idCola,
                estado: estado
            });

            record.submitFields({
                type: "customrecord_2w_as_cola_procesamiento",
                id: idCola,
                values: {
                    custrecord_2w_as_estado_cola: estado
                }
            });

            nLog.audit("actualizarEstadoCola - exito", `Estado actualizado a ${estado}`);
        } catch (error) {
            nLog.error("actualizarEstadoCola - error", error);
            throw error;
        }
    }

    /**
     * Actualiza el estado y los intentos de un registro de la cola
     * @param {number} idCola - ID del registro de la cola
     * @param {string} estado - Nuevo estado (PENDIENTE, EN_PROCESO, COMPLETADO, ERROR)
     * @param {number} intentos - Número de intentos
     */
    function actualizarEstadoEIntentos(idCola, estado, intentos) {
        try {
            nLog.debug("actualizarEstadoEIntentos", {
                idCola: idCola,
                estado: estado,
                intentos: intentos
            });

            record.submitFields({
                type: "customrecord_2w_as_cola_procesamiento",
                id: idCola,
                values: {
                    custrecord_2w_as_estado_cola: estado,
                    custrecord_2w_as_intentos: intentos
                }
            });

            nLog.audit("actualizarEstadoEIntentos - exito", `Estado: ${estado}, Intentos: ${intentos}`);
        } catch (error) {
            nLog.error("actualizarEstadoEIntentos - error", error);
            throw error;
        }
    }

    /**
     * Obtiene el ID del archivo de un registro de la cola
     * @param {number} idCola - ID del registro de la cola
     * @returns {string|null} - ID del archivo o null
     */
    function obtenerIdArchivo(idCola) {
        try {
            const searchCola = search.create({
                type: "customrecord_2w_as_cola_procesamiento",
                filters: [["internalid", "is", idCola]],
                columns: ["custrecord_2w_as_nombre_archivo"]
            });

            const resultSet = searchCola.run();
            const resultRange = resultSet.getRange({
                start: 0,
                end: 1
            });

            if (resultRange.length > 0) {
                const nombreArchivo = resultRange[0].getValue("custrecord_2w_as_nombre_archivo");

                // Buscar el archivo por nombre
                const fileSearch = search.create({
                    type: "file",
                    filters: [["name", "is", nombreArchivo]],
                    columns: ["internalid"]
                });

                const fileResult = fileSearch.run().getRange({
                    start: 0,
                    end: 1
                });

                if (fileResult.length > 0) {
                    return fileResult[0].getValue("internalid");
                }
            }

            return null;
        } catch (error) {
            nLog.error("obtenerIdArchivo - error", error);
            throw error;
        }
    }

    /**
     * Ejecuta un Map/Reduce con los datos de la cola
     * @param {Object} datosCola - Datos del registro de la cola
     * @returns {number} - ID de la tarea creada
     */
    function ejecutarMapReduce(datosCola) {
        try {
            const idArchivo = obtenerIdArchivo(datosCola.id);

            if (!idArchivo) {
                throw new Error(`No se encontró el archivo para el registro ${datosCola.id}`);
            }

            nLog.debug("ejecutarMapReduce", {
                datosCola: datosCola,
                idArchivo: idArchivo
            });

            const params = {};
            params[datosCola.parameterName] = idArchivo;

            const mapReduceTask = task.create({
                taskType: task.TaskType.MAP_REDUCE,
                scriptId: datosCola.scriptId,
                deploymentId: datosCola.deploymentId,
                params: params
            });

            const taskId = mapReduceTask.submit();
            nLog.audit("ejecutarMapReduce - exito", `Tarea creada: ${taskId}`);

            return taskId;
        } catch (error) {
            nLog.error("ejecutarMapReduce - error", error);
            throw error;
        }
    }

    return {
        ESTADO_COLA: ESTADO_COLA,
        FLUJO: FLUJO,
        crearRegistroCola: crearRegistroCola,
        verificarMapReduceActivo: verificarMapReduceActivo,
        obtenerSiguientePendiente: obtenerSiguientePendiente,
        actualizarEstadoCola: actualizarEstadoCola,
        actualizarEstadoEIntentos: actualizarEstadoEIntentos,
        ejecutarMapReduce: ejecutarMapReduce
    };
});
