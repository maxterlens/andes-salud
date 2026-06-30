/**
 * @NApiVersion 2.1
 * @NModuleScope SameAccount
 */
define(["N/record", "N/search", "N/log"], function (record, search, nLog) {
    /**
     * DAO para manejar la cola de procesamiento de agregar líneas
     */
    const QUEUE_RECORD_TYPE = "customrecord_2win_as_ag_lineas_queue";
    const MAX_RETRIES = 0;

    // Estados
    const ESTADOS = {
        PENDIENTE: 1,
        PROCESADO: 2,
        ERROR: 3
    };

    /**
     * Agrega un archivo a la cola de procesamiento
     * @param {object} archivoInfo - Información del archivo {id, folder, nombre, tipoMensaje}
     * @returns {object} - Resultado de la operación { success, id, message }
     */
    function addToQueue(archivoInfo) {
        try {
            if (!archivoInfo || !archivoInfo.id) {
                throw new Error("archivoInfo.id es requerido");
            }

            // Crear nuevo registro en la cola
            const queueRecord = record.create({
                type: QUEUE_RECORD_TYPE,
                isDynamic: true
            });

            queueRecord.setValue({
                fieldId: "custrecord_2win_alq_archivo_id",
                value: archivoInfo.id
            });

            queueRecord.setValue({
                fieldId: "custrecord_2win_alq_folder",
                value: archivoInfo.folder
            });

            queueRecord.setValue({
                fieldId: "custrecord_2win_alq_estado",
                value: ESTADOS.PENDIENTE
            });

            queueRecord.setValue({
                fieldId: "custrecord_2win_alq_reintentos",
                value: 0
            });

            // Guardar tipo de mensaje si está disponible
            if (archivoInfo.tipoMensaje) {
                queueRecord.setValue({
                    fieldId: "custrecord_2win_alq_tipo_mensaje",
                    value: archivoInfo.tipoMensaje
                });
            }

            const recordId = queueRecord.save();

            nLog.audit("addToQueue", `Archivo ${archivoInfo.id} agregado a la cola (Queue ID: ${recordId}, Tipo: ${archivoInfo.tipoMensaje || "N/A"})`);

            return {
                success: true,
                id: recordId,
                message: "Registro agregado a la cola"
            };
        } catch (error) {
            nLog.error("addToQueue - Error", error);
            return {
                success: false,
                id: null,
                message: error.message
            };
        }
    }

    /**
     * Obtiene los registros pendientes de la cola
     * @param {number} limit - Límite de registros a obtener (default: 50)
     * @param {string} tipoMensaje - Filtrar por tipo de mensaje (opcional: "SEND^IN", "SEND^REV")
     * @returns {Array} - Lista de registros pendientes
     */
    function getPending(limit = 50, tipoMensaje = null) {
        try {
            const pendingRecords = [];
            
            // Construir filtros dinámicamente
            const filters = [
                ["custrecord_2win_alq_estado", "anyof", ESTADOS.PENDIENTE],
                "AND",
                ["custrecord_2win_alq_reintentos", "lessthanorequalto", MAX_RETRIES],
                "AND",
                ["isinactive", "is", "F"]
            ];
            
            // Agregar filtro por tipoMensaje si se proporciona
            if (tipoMensaje) {
                filters.push("AND");
                filters.push(["custrecord_2win_alq_tipo_mensaje", "is", tipoMensaje]);
            }
            
            const searchObj = search.create({
                type: QUEUE_RECORD_TYPE,
                filters: filters,
                columns: [
                    "internalid",
                    "custrecord_2win_alq_archivo_id",
                    "custrecord_2win_alq_folder",
                    "custrecord_2win_alq_estado",
                    "custrecord_2win_alq_reintentos",
                    "custrecord_2win_alq_fecha_creacion",
                    "custrecord_2win_alq_tipo_mensaje",
                    "created"
                ]
            });

            const searchResults = searchObj.run().getRange({
                start: 0,
                end: limit
            });

            searchResults.forEach((result) => {
                pendingRecords.push({
                    id: result.id,
                    archivoId: result.getValue("custrecord_2win_alq_archivo_id"),
                    folder: result.getValue("custrecord_2win_alq_folder"),
                    estado: result.getValue("custrecord_2win_alq_estado"),
                    reintentos: parseInt(result.getValue("custrecord_2win_alq_reintentos") || "0", 10),
                    fechaCreacion: result.getValue("custrecord_2win_alq_fecha_creacion"),
                    tipoMensaje: result.getValue("custrecord_2win_alq_tipo_mensaje"),
                    created: result.getValue("created")
                });
            });

            nLog.debug("getPending", `Se encontraron ${pendingRecords.length} registros pendientes${tipoMensaje ? ` (tipo: ${tipoMensaje})` : ""}`);
            return pendingRecords;
        } catch (error) {
            nLog.error("getPending - Error", error);
            return [];
        }
    }

    /**
     * Marca un registro como procesado
     * @param {string|number} queueRecordId - ID del registro en la cola
     * @returns {boolean} - true si se actualizó correctamente
     */
    function markAsProcessed(queueRecordId) {
        try {
            record.submitFields({
                type: QUEUE_RECORD_TYPE,
                id: queueRecordId,
                values: {
                    custrecord_2win_alq_estado: ESTADOS.PROCESADO,
                    custrecord_2win_alq_fecha_procesado: new Date()
                }
            });

            nLog.audit("markAsProcessed", `Registro ${queueRecordId} marcado como procesado`);
            return true;
        } catch (error) {
            nLog.error("markAsProcessed - Error", error);
            return false;
        }
    }

    /**
     * Maneja un error en el procesamiento de un registro
     * @param {string|number} queueRecordId - ID del registro en la cola
     * @param {string} errorMessage - Mensaje de error
     * @returns {boolean} - true si se actualizó correctamente
     */
    function handleError(queueRecordId, errorMessage) {
        try {
            // Obtener reintentos actuales
            const currentRecord = search.lookupFields({
                type: QUEUE_RECORD_TYPE,
                id: queueRecordId,
                columns: ["custrecord_2win_alq_reintentos"]
            });

            const currentRetries = parseInt(currentRecord.custrecord_2win_alq_reintentos || "0", 10);
            const newRetries = currentRetries + 1;

            // Si se excede el máximo de reintentos, marcar como error permanente
            const newState = newRetries >= MAX_RETRIES ? ESTADOS.ERROR : ESTADOS.PENDIENTE;

            record.submitFields({
                type: QUEUE_RECORD_TYPE,
                id: queueRecordId,
                values: {
                    custrecord_2win_alq_estado: newState,
                    custrecord_2win_alq_reintentos: newRetries,
                    custrecord_2win_alq_error: errorMessage
                }
            });

            nLog.audit("handleError", `Registro ${queueRecordId} - Reintento ${newRetries}/${MAX_RETRIES} - Estado: ${newState === ESTADOS.ERROR ? "Error permanente" : "Pendiente"}`);
            return true;
        } catch (error) {
            nLog.error("handleError - Error", error);
            return false;
        }
    }

    /**
     * Obtiene estadísticas de la cola
     * @returns {object} - Estadísticas de la cola
     */
    function getQueueStats() {
        try {
            const stats = {
                pendientes: 0,
                procesados: 0,
                errores: 0,
                total: 0
            };

            const pendingSearch = search.create({
                type: QUEUE_RECORD_TYPE,
                filters: [["custrecord_2win_alq_estado", "anyof", ESTADOS.PENDIENTE], "AND", ["isinactive", "is", "F"]],
                columns: [search.createColumn({ name: "internalid", summary: "COUNT" })]
            });

            const processedSearch = search.create({
                type: QUEUE_RECORD_TYPE,
                filters: [["custrecord_2win_alq_estado", "anyof", ESTADOS.PROCESADO], "AND", ["isinactive", "is", "F"]],
                columns: [search.createColumn({ name: "internalid", summary: "COUNT" })]
            });

            const errorSearch = search.create({
                type: QUEUE_RECORD_TYPE,
                filters: [["custrecord_2win_alq_estado", "anyof", ESTADOS.ERROR], "AND", ["isinactive", "is", "F"]],
                columns: [search.createColumn({ name: "internalid", summary: "COUNT" })]
            });

            const pendingResult = pendingSearch.run().getRange({ start: 0, end: 1 });
            const processedResult = processedSearch.run().getRange({ start: 0, end: 1 });
            const errorResult = errorSearch.run().getRange({ start: 0, end: 1 });

            stats.pendientes = parseInt(pendingResult[0]?.getValue({ name: "internalid", summary: "COUNT" }) || "0", 10);
            stats.procesados = parseInt(processedResult[0]?.getValue({ name: "internalid", summary: "COUNT" }) || "0", 10);
            stats.errores = parseInt(errorResult[0]?.getValue({ name: "internalid", summary: "COUNT" }) || "0", 10);
            stats.total = stats.pendientes + stats.procesados + stats.errores;

            return stats;
        } catch (error) {
            nLog.error("getQueueStats - Error", error);
            return {
                pendientes: 0,
                procesados: 0,
                errores: 0,
                total: 0
            };
        }
    }

    /**
     * Verifica si hay un Map/Reduce Script activo (PENDING o PROCESSING)
     * @param {string} deployId - ID del deployment (ej: "customdeploy_2win_mr_andessalud_ov_ag_li")
     * @returns {boolean} - true si hay una ejecución activa
     */
    function verificarMapReduceActivo(deployId) {
        try {
            const taskSearch = search.create({
                type: "scheduledscriptinstance",
                columns: ["status", "taskid"],
                filters: [["formulatext: {scriptdeployment.scriptid}", "is", deployId], "AND", ["status", "anyof", "PENDING", "PROCESSING"]]
            });

            const searchResults = taskSearch.run().getRange({ start: 0, end: 10 });
            const tieneActivos = searchResults && searchResults.length > 0;

            nLog.debug(`verificarMapReduceActivo - ${deployId}`, {
                tieneActivos: tieneActivos,
                cantidad: searchResults ? searchResults.length : 0
            });

            return tieneActivos;
        } catch (error) {
            nLog.error("verificarMapReduceActivo - error", error);
            return false;
        }
    }


    function verificarMapReduceActivo(deployId) {
        try {
            const taskSearch = search.create({
                type: "scheduledscriptinstance",
                columns: ["status", "taskid"],
                filters: [
                    ["formulatext: {scriptdeployment.scriptid}", "is", deployId],
                    "AND",
                    ["status", "anyof", "PENDING", "PROCESSING"]
                ]
            });

            const searchResults = taskSearch.run().getRange({ start: 0, end: 10 });
            const tieneActivos = searchResults && searchResults.length > 0;

            nLog.debug(`verificarMapReduceActivo - ${deployId}`, {
                tieneActivos: tieneActivos,
                cantidad: searchResults ? searchResults.length : 0
            });

            return tieneActivos;
        } catch (error) {
            nLog.error("verificarMapReduceActivo - error", error);
            return false;
        }
    }


    /**
     * Limpia registros procesados antiguos (más de X días)
     * @param {number} daysOld - Días de antigüedad para eliminar
     * @returns {number} - Cantidad de registros eliminados
     */
    function cleanOldProcessed(daysOld = 30) {
        try {
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - daysOld);

            const searchObj = search.create({
                type: QUEUE_RECORD_TYPE,
                filters: [
                    ["custrecord_2win_alq_estado", "anyof", ESTADOS.PROCESADO],
                    "AND",
                    ["custrecord_2win_alq_fecha_procesado", "before", cutoffDate.toISOString().split("T")[0]],
                    "AND",
                    ["isinactive", "is", "F"]
                ],
                columns: ["internalid"]
            });

            const searchResults = searchObj.run().getRange({
                start: 0,
                end: 1000
            });

            let deletedCount = 0;
            searchResults.forEach((result) => {
                try {
                    record.delete({
                        type: QUEUE_RECORD_TYPE,
                        id: result.id
                    });
                    deletedCount++;
                } catch (deleteError) {
                    nLog.error("cleanOldProcessed - Error eliminando registro", deleteError);
                }
            });

            nLog.audit("cleanOldProcessed", `Se eliminaron ${deletedCount} registros procesados antiguos`);
            return deletedCount;
        } catch (error) {
            nLog.error("cleanOldProcessed - Error", error);
            return 0;
        }
    }

    return {
        addToQueue: addToQueue,
        getPending: getPending,
        markAsProcessed: markAsProcessed,
        handleError: handleError,
        getQueueStats: getQueueStats,
        verificarMapReduceActivo: verificarMapReduceActivo,
        cleanOldProcessed: cleanOldProcessed,
        ESTADOS: ESTADOS,
        MAX_RETRIES: MAX_RETRIES
    };
});
