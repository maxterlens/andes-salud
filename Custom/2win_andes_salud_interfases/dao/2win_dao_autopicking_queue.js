/**
 * @NApiVersion 2.1
 * @NModuleScope SameAccount
 */
define(["N/record", "N/search", "N/log"], function (record, search, nLog) {
    /**
     * DAO para manejar la cola de procesamiento de autopicking
     */
    const QUEUE_RECORD_TYPE = "customrecord_2win_autopicking_queue";
    const MAX_RETRIES = 3;

    // Estados
    const ESTADOS = {
        PENDIENTE: 1,
        PROCESADO: 2,
        ERROR: 3
    };

    /**
     * Agrega una orden de venta a la cola de procesamiento
     * @param {string|number} salesOrderId - ID de la orden de venta
     * @param {string} estadoActualizacion - Estado de actualización (CREATE, UPDATE)
     * @returns {object} - Resultado de la operación { success, id, message }
     */
    function addToQueue(salesOrderId, estadoActualizacion = "CREATE") {
        try {
            if (!salesOrderId) {
                throw new Error("salesOrderId es requerido");
            }

            // Verificar si ya existe un registro pendiente para esta OV
            const existingPending = getPendingBySalesOrder(salesOrderId);
            if (existingPending) {
                nLog.debug("addToQueue", `OV ${salesOrderId} ya tiene un registro pendiente en la cola (ID: ${existingPending.id})`);
                return {
                    success: true,
                    id: existingPending.id,
                    message: "Registro ya existe en la cola",
                    isNew: false
                };
            }

            // Crear nuevo registro en la cola
            const queueRecord = record.create({
                type: QUEUE_RECORD_TYPE,
                isDynamic: true
            });

            queueRecord.setValue({
                fieldId: "custrecord_2win_apq_sales_order",
                value: salesOrderId
            });

            queueRecord.setValue({
                fieldId: "custrecord_2win_apq_estado",
                value: ESTADOS.PENDIENTE
            });

            queueRecord.setValue({
                fieldId: "custrecord_2win_apq_reintentos",
                value: 0
            });

            // Guardar el estado de actualización
            queueRecord.setValue({
                fieldId: "custrecord_2win_apq_estado_actualizacion",
                value: estadoActualizacion
            });

            const recordId = queueRecord.save();

            nLog.audit("addToQueue", `OV ${salesOrderId} agregada a la cola (ID: ${recordId}, Estado: ${estadoActualizacion})`);

            return {
                success: true,
                id: recordId,
                message: "Registro agregado a la cola",
                isNew: true,
                estadoActualizacion: estadoActualizacion
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
     * @returns {Array} - Lista de registros pendientes
     */
    function getPending(limit = 50) {
        try {
            const pendingRecords = [];
            const searchObj = search.create({
                type: QUEUE_RECORD_TYPE,
                filters: [
                    ["custrecord_2win_apq_estado", "anyof", ESTADOS.PENDIENTE],
                    "AND",
                    ["custrecord_2win_apq_reintentos", "lessthanorequalto", MAX_RETRIES],
                    "AND",
                    ["isinactive", "is", "F"]
                ],
                columns: [
                    "internalid",
                    "custrecord_2win_apq_sales_order",
                    "custrecord_2win_apq_estado",
                    "custrecord_2win_apq_reintentos",
                    "custrecord_2win_apq_estado_actualizacion",
                    "custrecord_2win_apq_fecha_creacion",
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
                    salesOrderId: result.getValue("custrecord_2win_apq_sales_order"),
                    estado: result.getValue("custrecord_2win_apq_estado"),
                    reintentos: parseInt(result.getValue("custrecord_2win_apq_reintentos") || "0", 10),
                    estadoActualizacion: result.getValue("custrecord_2win_apq_estado_actualizacion") || "CREATE",
                    fechaCreacion: result.getValue("custrecord_2win_apq_fecha_creacion"),
                    created: result.getValue("created")
                });
            });

            nLog.debug("getPending", `Se encontraron ${pendingRecords.length} registros pendientes`);
            return pendingRecords;
        } catch (error) {
            nLog.error("getPending - Error", error);
            return [];
        }
    }

    /**
     * Obtiene un registro pendiente por ID de orden de venta
     * @param {string|number} salesOrderId - ID de la orden de venta
     * @returns {object|null} - Registro encontrado o null
     */
    function getPendingBySalesOrder(salesOrderId) {
        try {
            const searchObj = search.create({
                type: QUEUE_RECORD_TYPE,
                filters: [
                    ["custrecord_2win_apq_sales_order", "anyof", salesOrderId],
                    "AND",
                    ["custrecord_2win_apq_estado", "anyof", ESTADOS.PENDIENTE],
                    "AND",
                    ["isinactive", "is", "F"]
                ],
                columns: [
                    "internalid",
                    "custrecord_2win_apq_sales_order",
                    "custrecord_2win_apq_estado",
                    "custrecord_2win_apq_reintentos"
                ]
            });

            const searchResults = searchObj.run().getRange({
                start: 0,
                end: 1
            });

            if (searchResults.length > 0) {
                const result = searchResults[0];
                return {
                    id: result.id,
                    salesOrderId: result.getValue("custrecord_2win_apq_sales_order"),
                    estado: result.getValue("custrecord_2win_apq_estado"),
                    reintentos: parseInt(result.getValue("custrecord_2win_apq_reintentos") || "0", 10)
                };
            }

            return null;
        } catch (error) {
            nLog.error("getPendingBySalesOrder - Error", error);
            return null;
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
                    custrecord_2win_apq_estado: ESTADOS.PROCESADO,
                    custrecord_2win_apq_fecha_procesado: new Date()
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
                columns: ["custrecord_2win_apq_reintentos"]
            });

            const currentRetries = parseInt(currentRecord.custrecord_2win_apq_reintentos || "0", 10);
            const newRetries = currentRetries + 1;

            // Si se excede el máximo de reintentos, marcar como error permanente
            const newState = newRetries >= MAX_RETRIES ? ESTADOS.ERROR : ESTADOS.PENDIENTE;

            record.submitFields({
                type: QUEUE_RECORD_TYPE,
                id: queueRecordId,
                values: {
                    custrecord_2win_apq_estado: newState,
                    custrecord_2win_apq_reintentos: newRetries,
                    custrecord_2win_apq_error: errorMessage
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

            // const searchObj = search.create({
            //     type: QUEUE_RECORD_TYPE,
            //     filters: [["isinactive", "is", "F"]],
            //     columns: [
            //         "custrecord_2win_apq_estado",
            //         search.createColumn({
            //             name: "internalid",
            //             summary: "COUNT"
            //         })
            //     ]
            // });

            // // Agrupar por estado
            // const searchResults = searchObj.run().getRange({
            //     start: 0,
            //     end: 1000
            // });

            // Obtener conteos por búsqueda separada para evitar complejidad
            const pendingSearch = search.create({
                type: QUEUE_RECORD_TYPE,
                filters: [
                    ["custrecord_2win_apq_estado", "anyof", ESTADOS.PENDIENTE],
                    "AND",
                    ["isinactive", "is", "F"]
                ],
                columns: [search.createColumn({ name: "internalid", summary: "COUNT" })]
            });

            const processedSearch = search.create({
                type: QUEUE_RECORD_TYPE,
                filters: [
                    ["custrecord_2win_apq_estado", "anyof", ESTADOS.PROCESADO],
                    "AND",
                    ["isinactive", "is", "F"]
                ],
                columns: [search.createColumn({ name: "internalid", summary: "COUNT" })]
            });

            const errorSearch = search.create({
                type: QUEUE_RECORD_TYPE,
                filters: [
                    ["custrecord_2win_apq_estado", "anyof", ESTADOS.ERROR],
                    "AND",
                    ["isinactive", "is", "F"]
                ],
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
     * Verifica si hay un Scheduled Script activo (PENDING o PROCESSING)
     * @param {string} deployId - ID del deployment (ej: "customdeploy_2win_ss_autopicking")
     * @returns {boolean} - true si hay una ejecución activa
     */
    function verificarScheduledScriptActivo(deployId) {
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

            nLog.debug(`verificarScheduledScriptActivo - ${deployId}`, {
                tieneActivos: tieneActivos,
                cantidad: searchResults ? searchResults.length : 0
            });

            return tieneActivos;
        } catch (error) {
            nLog.error("verificarScheduledScriptActivo - error", error);
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
                    ["custrecord_2win_apq_estado", "anyof", ESTADOS.PROCESADO],
                    "AND",
                    ["custrecord_2win_apq_fecha_procesado", "before", cutoffDate.toISOString().split("T")[0]],
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
        getPendingBySalesOrder: getPendingBySalesOrder,
        markAsProcessed: markAsProcessed,
        handleError: handleError,
        getQueueStats: getQueueStats,
        verificarScheduledScriptActivo: verificarScheduledScriptActivo,
        cleanOldProcessed: cleanOldProcessed,
        ESTADOS: ESTADOS,
        MAX_RETRIES: MAX_RETRIES
    };
});