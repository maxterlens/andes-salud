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
    /**
     * @function execute - Punto de entrada del script programado.
     * @param {Object} context - Contexto de ejecución.
     */
    function execute(context) {
        const autoPickingManager = new AutoPickingManager();

        try {
            // Cargar la orden de venta completa
            const salesOrderRecord = record.load({
                type: record.Type.SALES_ORDER,
                id: "25420",
                isDynamic: false
            });

            // Ejecutar sincronización de autopicking con el estado de actualización
            autoPickingManager.syncronize(salesOrderRecord, "afterSubmit");
        } catch (processingError) {
            const errorMessage = processingError.message || processingError.toString();

            nLog.error("Error procesando registro", {
                error: errorMessage
            });
        }
    }

    return {
        execute: execute
    };
});
