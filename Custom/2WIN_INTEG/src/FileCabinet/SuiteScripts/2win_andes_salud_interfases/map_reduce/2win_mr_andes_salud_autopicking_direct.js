/**
 * @NApiVersion 2.1
 * @NScriptType MapReduceScript
 * @description Map/Reduce para ejecutar auto picking directamente desde búsqueda de Sales Orders.
 * Ejecución manual para solventar errores - sin cola de procesamiento.
 * Incorpora parámetro de degradación de estado para saneamiento in-place.
 */
define(["../domain/2win_dom_autopicking", "N/record", "N/log", "N/query"], function (AutoPickingManager, record, nLog, query) {
    /**
     * FASE 1: getInputData - Ejecuta búsqueda de Sales Orders con desbalances de cantidades
     * @returns {Array} - Resultados de la búsqueda estructurados para la fase de MAP
     */
    function getInputData() {
        nLog.audit("getInputData", "Iniciando búsqueda avanzada de Sales Orders desbalanceadas para saneamiento");

        try {
            const results = query.runSuiteQL({
                query: `
                    SELECT
                        t.id AS internalid,
                        t.tranid AS documentnumber,
                        t.trandate AS transactiondate
                    FROM
                        Transaction t
                    WHERE
                        t.type = 'SalesOrd'
                        AND EXISTS (
                            SELECT
                            1
                            FROM
                            TransactionLine tl
                            INNER JOIN Location lt ON (lt.id = tl.inventorylocation)
                            WHERE
                            tl.transaction = t.id
                            AND tl.mainline = 'F'
                            AND tl.itemtype = 'InvtPart'
                            AND NVL (tl.quantityshiprecv, 0) = 0
                            AND NVL (lt.isinactive, 'F') = 'F'
                        )
                    ORDER BY
                        t.trandate DESC,
                        t.id DESC
                `
            });

            return results.asMappedResults();
        } catch (error) {
            nLog.error("getInputData - Error", error);
            throw error;
        }
    }

    /**
     * FASE 2: map — solo reordena, no procesa.
     * Pasa los datos de la OV al reduce agrupando por internalid.
     */
    function map(context) {
        const data = JSON.parse(context.value);

        context.write({
            key: String(data.internalid),
            value: JSON.stringify({
                internalid: data.internalid,
                documentnumber: data.documentnumber
            })
        });
    }

    /**
     * FASE 3: reduce — ejecuta el auto picking sobre la Sales Order.
     * context.key    = internalid de la Sales Order
     * context.values = iterator con los datos emitidos en map
     */
    function reduce(context) {
        const salesOrderId = context.key;
        let documentnumber = null;

        context.values.forEach(function (raw) {
            const entry = JSON.parse(raw);
            if (entry.documentnumber) {
                documentnumber = entry.documentnumber;
            }
        });

        uncommitAndClearInventoryDetail(salesOrderId);

        try {
            const salesOrderRecord = record.load({
                type: record.Type.SALES_ORDER,
                id: salesOrderId,
                isDynamic: false
            });

            const manager = new AutoPickingManager();

            manager.syncronize(salesOrderRecord, "afterSubmit", "UPDATE", true);

            context.write({
                key: "success",
                value: JSON.stringify({
                    salesOrderId: salesOrderId,
                    tranid: documentnumber
                })
            });
        } catch (error) {
            nLog.error("reduce", error);
            context.write({
                key: "error",
                value: JSON.stringify({
                    salesOrderId: salesOrderId,
                    error: error.message
                })
            });
        }
    }

    /**
     * FASE 4: summarize - Resumen y auditoría final de la ejecución masiva
     * @param {Object} context - Contexto del summarize
     */
    function summarize(context) {
        let successCount = 0;
        let errorCount = 0;
        const errores = [];
        const exitosos = [];

        nLog.audit("summarize", "Iniciando resumen de ejecución del saneamiento");

        // Iterar sobre las claves de salida generadas en el reduce
        context.output.iterator().each(function (key, value) {
            try {
                const result = JSON.parse(value);

                if (key === "success") {
                    successCount++;
                    exitosos.push(result);
                } else if (key === "error") {
                    errorCount++;
                    errores.push(result);
                }
            } catch (e) {
                nLog.error("summarize - Error parseando resultado", e);
            }
            return true;
        });

        // Registrar errores de gobernación o caídas de infraestructura en la fase de Map
        context.mapSummary.errors.iterator().each(function (key, error) {
            nLog.error("summarize - Error crítico en fase MAP", { key: key, error: error });
            return true;
        });

        // Registrar errores de gobernación (Usage Units excedidos) o caídas en la fase de Reduce
        context.reduceSummary.errors.iterator().each(function (key, error) {
            nLog.error("summarize - Error crítico en fase REDUCE (Gobernación/Timeout)", { key: key, error: error });
            return true;
        });

        // Auditoría final del proceso en sitio
        nLog.audit("summarize - Resultado Final del Saneamiento", {
            exitosos: successCount,
            errores: errorCount,
            totalProcesados: successCount + errorCount
        });

        if (errores.length > 0) {
            nLog.audit("summarize - Detalle de Registros con Errores", errores);
        }

        if (exitosos.length > 0) {
            nLog.audit("summarize - Detalle de Registros Exitosos", exitosos);
        }

        nLog.audit("summarize", `Ejecución de Map/Reduce completada: ${successCount} exitosos, ${errorCount} errores`);
    }
    /**
     * Libera compromisos y elimina Inventory Detail
     * de líneas no fulfillmentadas.
     *
     * @param {number|string} salesOrderId
     * @returns {boolean}
     */
    function uncommitAndClearInventoryDetail(salesOrderId) {
        try {
            const soRecord = record.load({
                type: record.Type.SALES_ORDER,
                id: salesOrderId,
                isDynamic: false
            });

            const lineCount = soRecord.getLineCount({
                sublistId: "item"
            });

            nLog.audit("UNCOMMIT", `Procesando SO ${salesOrderId}. Líneas: ${lineCount}`);

            for (let i = 0; i < lineCount; i++) {
                try {
                    const itemId = soRecord.getSublistValue({
                        sublistId: "item",
                        fieldId: "item",
                        line: i
                    });

                    const qty = Number(
                        soRecord.getSublistValue({
                            sublistId: "item",
                            fieldId: "quantity",
                            line: i
                        }) || 0
                    );

                    const qtyFulfilled = Number(
                        soRecord.getSublistValue({
                            sublistId: "item",
                            fieldId: "quantityfulfilled",
                            line: i
                        }) || 0
                    );

                    const isClosed = soRecord.getSublistValue({
                        sublistId: "item",
                        fieldId: "isclosed",
                        line: i
                    });

                    // Saltar líneas cerradas
                    if (isClosed === true || isClosed === "T") {
                        continue;
                    }

                    // Saltar líneas ya fulfillmentadas
                    if (qtyFulfilled > 0) {
                        // nLog.audit("UNCOMMIT", `Línea ${i} Item ${itemId} omitida. Qty Fulfilled: ${qtyFulfilled}`);
                        continue;
                    }

                    // 1. Liberar compromiso
                    try {
                        soRecord.setSublistValue({
                            sublistId: "item",
                            fieldId: "commitinventory",
                            line: i,
                            value: 1 // Do Not Commit 3
                        });

                        // nLog.audit("UNCOMMIT", `Línea ${i} Item ${itemId} -> commitinventory = 3`);
                    } catch (e) {
                        nLog.error("UNCOMMIT - commitinventory", `Línea ${i}: ${e.message}`);
                    }

                    // 2. Eliminar Inventory Detail
                    try {
                        const hasInventoryDetail = soRecord.hasSublistSubrecord({
                            sublistId: "item",
                            fieldId: "inventorydetail",
                            line: i
                        });

                        if (hasInventoryDetail) {
                            soRecord.removeSublistSubrecord({
                                sublistId: "item",
                                fieldId: "inventorydetail",
                                line: i
                            });

                            // nLog.audit("UNCOMMIT", `Línea ${i} Item ${itemId} Inventory Detail eliminado`);
                        }
                    } catch (e) {
                        nLog.error("UNCOMMIT - inventorydetail", `Línea ${i}: ${e.message}`);
                    }
                } catch (lineError) {
                    nLog.error("UNCOMMIT - línea", `Línea ${i}: ${lineError.message}`);
                }
            }

            const recordId = soRecord.save({
                //enableSourcing: false,
                ignoreMandatoryFields: true
            });

            nLog.audit("UNCOMMIT", `Sales Order guardada correctamente. ID: ${recordId}`);

            return true;
        } catch (e) {
            nLog.error("UNCOMMIT ERROR", `${salesOrderId} -> ${e.message}`);

            return false;
        }
    }
    return {
        getInputData: getInputData,
        map: map,
        reduce: reduce,
        summarize: summarize
    };
});
