/**
 * @NApiVersion 2.1
 * @NScriptType MapReduceScript
 */
define(["../dao/2win_dao_autopicking_queue", "../domain/2win_dom_autopicking", "N/record", "N/log","N/task"], function (daoAutopickingQueue, AutoPickingManager, record, nLog, task) {
    /**
     * FASE 1: retorna todos los pendientes tal cual
     */
    function getInputData() {
        const pending = daoAutopickingQueue.getPending(500);
        nLog.audit("getInputData", `Registros en cola: ${pending.length}`);
        return pending;
    }

    /**
     * FASE 2: map — solo reordena, no procesa
     * Agrupa por salesOrderId para que reduce reciba
     * TODOS los queue records de la misma OV juntos.
     */
    function map(context) {
        const queueRecord = JSON.parse(context.value);

        // key = salesOrderId → todos los duplicados van al mismo reduce()
        context.write({
            key: String(queueRecord.salesOrderId),
            value: JSON.stringify({
                queueRecordId: queueRecord.id,
                estadoActualizacion: queueRecord.estadoActualizacion || "CREATE"
            })
        });
    }

    /**
     * FASE 3: reduce — se ejecuta UNA VEZ por salesOrderId
     * context.key    = salesOrderId
     * context.values = iterator con TODOS los queue records de esa OV
     *
     * Si la OV tenía 3 entradas en la cola, llega aquí con 3 values
     * pero se procesa una sola vez.
     */
    function reduce(context) {
        const salesOrderId = context.key;
        const queueRecordIds = [];
        let estadoFinal = "UPDATE"; // default conservador

        // Recolectar todos los IDs de cola y determinar el estado a aplicar:
        // si ALGUNO es CREATE, se usa CREATE (es el más completo)
        context.values.forEach(function (raw) {
            const entry = JSON.parse(raw);
            queueRecordIds.push(entry.queueRecordId);
            if (entry.estadoActualizacion === "CREATE") {
                estadoFinal = "CREATE";
            }
        });

        nLog.debug("reduce", `OV ${salesOrderId} — ${queueRecordIds.length} entrada(s) en cola, estado: ${estadoFinal}`);

        try {
            const salesOrderRecord = record.load({
                type: record.Type.SALES_ORDER,
                id: salesOrderId,
                isDynamic: false
            });

            const manager = new AutoPickingManager();
            manager.syncronize(salesOrderRecord, "afterSubmit", estadoFinal);

            // Marcar TODOS los registros duplicados como procesados
            queueRecordIds.forEach(function (id) {
                daoAutopickingQueue.markAsProcessed(id);
            });

            context.write({
                key: "success",
                value: JSON.stringify({ salesOrderId, queueRecordIds, estadoFinal })
            });

            nLog.audit("reduce", `OV ${salesOrderId} OK — ${queueRecordIds.length} entradas cerradas`);
        } catch (error) {
            const errorMessage = error.message || error.toString();

            // Incrementar reintentos en TODOS los registros de cola
            queueRecordIds.forEach(function (id) {
                daoAutopickingQueue.handleError(id, errorMessage);
            });

            context.write({
                key: "error",
                value: JSON.stringify({ salesOrderId, queueRecordIds, error: errorMessage })
            });

            nLog.error("reduce - error", { salesOrderId, error: errorMessage });
        }
    }

    /**
     * FASE 4: summarize — igual que antes
     */
    function summarize(context) {
        let successCount = 0;
        let errorCount = 0;

        context.output.iterator().each(function (key, value) {
            if (key === "success") successCount++;
            else errorCount++;
            return true;
        });

        // Errores de governance/timeout a nivel MR
        context.reduceSummary.errors.iterator().each(function (key, error) {
            nLog.error("reduce - error MR", { key, error });
            return true;
        });

        const stats = daoAutopickingQueue.getQueueStats();
        nLog.audit("summarize", { procesados: successCount, errores: errorCount, stats });
        if(stats.pendientes > 0) {
            task.create({
                taskType: task.TaskType.MAP_REDUCE,
                scriptId: "customscript2877",
                deploymentId: "customdeploy1"
            }).submit();
        }
    }

    return { getInputData, map, reduce, summarize };
});
