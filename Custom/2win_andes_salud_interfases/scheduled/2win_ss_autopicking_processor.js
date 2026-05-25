/**
 * @NApiVersion 2.1
 * @NScriptType ScheduledScript
 * @description Script programado para procesar la cola de autopicking de órdenes de venta.
 */
define(["../dao/2win_dao_autopicking_queue", "../domain/2win_dom_autopicking", "N/record", "N/log", "N/runtime", "N/task"], function (
    daoAutopickingQueue,
    AutoPickingManager,
    record,
    nLog,
    runtime,
    task
) {
    const BATCH_SIZE = 20; // Máximo de registros a procesar por ejecución
    const SCRIPT_ID = "customscript_2win_ss_autopicking";
    const DEPLOY_ID = "customdeploy_2win_ss_autopicking";

    /**
     * @function execute - Punto de entrada del script programado.
     * @param {Object} context - Contexto de ejecución.
     */
    function execute(context) {
        nLog.audit("INICIO", "Iniciando procesamiento de cola de autopicking");

        try {
            // Obtener estadísticas iniciales
            const initialStats = daoAutopickingQueue.getQueueStats();
            nLog.audit("Estadísticas iniciales", initialStats);

            // Obtener registros pendientes
            const pendingRecords = daoAutopickingQueue.getPending(BATCH_SIZE);

            if (!pendingRecords || pendingRecords.length === 0) {
                nLog.audit("FIN", "No hay registros pendientes para procesar");
                return;
            }

            nLog.audit("Registros a procesar", `Se encontraron ${pendingRecords.length} registros pendientes`);

            // Crear instancia del manager de autopicking
            const autoPickingManager = new AutoPickingManager();

            let processedCount = 0;
            let errorCount = 0;

            // Procesar cada registro
            pendingRecords.forEach(function (queueRecord) {
                const queueRecordId = queueRecord.id;
                const salesOrderId = queueRecord.salesOrderId;
                const estadoActualizacion = queueRecord.estadoActualizacion || "CREATE";

                nLog.debug("Procesando registro", `Queue ID: ${queueRecordId}, Sales Order ID: ${salesOrderId}, Estado: ${estadoActualizacion}`);

                try {
                    // Cargar la orden de venta completa
                    const salesOrderRecord = record.load({
                        type: record.Type.SALES_ORDER,
                        id: salesOrderId,
                        isDynamic: true
                    });

                    // Ejecutar sincronización de autopicking con el estado de actualización
                    autoPickingManager.syncronize(salesOrderRecord, "afterSubmit", estadoActualizacion);

                    // Marcar como procesado
                    daoAutopickingQueue.markAsProcessed(queueRecordId);
                    processedCount++;

                    nLog.audit("Procesamiento exitoso", `OV ${salesOrderId} procesada correctamente (${estadoActualizacion})`);
                } catch (processingError) {
                    errorCount++;
                    const errorMessage = processingError.message || processingError.toString();

                    // Manejar error (incrementa reintentos y actualiza estado)
                    daoAutopickingQueue.handleError(queueRecordId, errorMessage);

                    nLog.error("Error procesando registro", {
                        queueRecordId: queueRecordId,
                        salesOrderId: salesOrderId,
                        error: errorMessage
                    });
                }
            });

            // Obtener estadísticas finales
            const finalStats = daoAutopickingQueue.getQueueStats();

            nLog.audit("Resumen de procesamiento", {
                procesados: processedCount,
                errores: errorCount,
                estadisticasFinales: finalStats
            });

            // Verificar si quedan registros pendientes y relanzar
            if (finalStats.pendientes > 0) {
                // Verificar que no haya otra ejecución en curso
                const isRunning = daoAutopickingQueue.verificarScheduledScriptActivo(DEPLOY_ID);

                if (!isRunning) {
                    nLog.audit("Relanzando", `Quedan ${finalStats.pendientes} registros pendientes, se relanza el script`);

                    const scheduledTask = task.create({
                        taskType: task.TaskType.SCHEDULED_SCRIPT,
                        scriptId: SCRIPT_ID,
                        deploymentId: DEPLOY_ID
                    });
                    const taskId = scheduledTask.submit();

                    nLog.audit("Script relanzado", `Task ID: ${taskId}`);
                } else {
                    nLog.debug("No se relanza", "Ya hay otra ejecución en curso");
                }
            }

            nLog.audit("FIN", "Procesamiento de cola completado");
        } catch (error) {
            nLog.error("Error fatal en procesamiento de cola", error);
        }
    }

    return {
        execute: execute
    };
});