/**
 *@NApiVersion 2.1
 *@NScriptType ScheduledScript
 */
define(["N/query", "N/record", "N/log", "N/task", "N/runtime"], function (query, record, nLog, task, runtime) {
    const obtenerOrdenConLineaTemporalesMayoresAUnaHora = () => {
        const sql = `
        SELECT DISTINCT
            tl.transaction AS salesOrderId,
            --tl.id AS transactionLineId,
            --tl.lineSequenceNumber
        FROM
            TransactionLine AS tl
        INNER JOIN Transaction AS tran ON tran.id = tl.transaction
        LEFT JOIN NextTransactionLineLink AS ntll ON ntll.previousdoc = tl.transaction
        AND ntll.previousline = tl.id
        WHERE
            tran.type = 'SalesOrd'
            AND tl.custcol_2win_flag_item_provisional = 'T'
            AND tl.lineLastModifiedDate <= (CURRENT_DATE - 1 / 24)
            AND ntll.previousdoc IS NULL
                `;

        // lanzar consulta paginada
        const pagedQuery = query.runSuiteQLPaged({
            query: sql,
            pageSize: 1000 // puedes ajustar el tamaño de página (máximo soportado)
        });

        // este objeto te da acceso al número de páginas
        const pageCount = pagedQuery.pageRanges.length;
        const allResults = [];

        for (let i = 0; i < pageCount; i++) {
            const page = pagedQuery.fetch({ index: i });
            allResults.push(...page.data.asMappedResults());
        }

        return allResults;
    };
    function execute(context) {
        nLog.debug("Inicio", "Autoclean temp lines");
        const ordenesVentaConLineasTemporales = obtenerOrdenConLineaTemporalesMayoresAUnaHora();
        nLog.debug("ordenesVentaConLineasTemporales", ordenesVentaConLineasTemporales.length);
        ordenesVentaConLineasTemporales.forEach((ov, index) => {
            nLog.debug("Procesando OV", ov.idsalesorder);
            if (index > 150) return;
            try {
                const salesOrder = record.load({
                    type: record.Type.SALES_ORDER,
                    id: ov.idsalesorder,
                    isDynamic: true
                });
                const lineCount = salesOrder.getLineCount({ sublistId: "item" });
                let initialLineCount = lineCount;
                for (let i = lineCount; i >= 0; i--) {
                    salesOrder.selectLine({
                        sublistId: "item",
                        line: i
                    });
                    const isLineaTemporal = salesOrder.getCurrentSublistValue({
                        sublistId: "item",
                        fieldId: "custcol_2win_flag_item_provisional"
                    });
                    if (isLineaTemporal) {
                        salesOrder.removeLine({
                            sublistId: "item",
                            line: i,
                            ignoreRecalc: false
                        });
                    }
                }
                let finalLineCount = salesOrder.getLineCount({ sublistId: "item" });
                nLog.debug("OV procesada", `OV: ${ov.idsalesorder} - Lineas eliminadas: ${initialLineCount - finalLineCount}`);
                salesOrder.save();
            } catch (error) {
                nLog.error("Error al procesar OV", `OV: ${ov.idsalesorder} - Error: ${error.message}`);
            }
        });

        if (ordenesVentaConLineasTemporales.length > 150) {
            let scriptTask = task.create({ taskType: task.TaskType.SCHEDULED_SCRIPT });
            scriptTask.scriptId = runtime.getCurrentScript().id;
            scriptTask.deploymentId = runtime.getCurrentScript().deploymentId;

            scriptTask.submit();
        }
        const remainingUsage = runtime.getCurrentScript().getRemainingUsage();
        nLog.debug("Uso restante", remainingUsage);
        nLog.debug("Fin", "Autoclean temp lines");
    }
    return {
        execute: execute
    };
});
