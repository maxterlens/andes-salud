/**
 * @NApiVersion 2.1
 * @NScriptType MapReduceScript
 * @description Map/Reduce para ejecutar auto picking directamente desde búsqueda de Sales Orders.
 *              Ejecución manual para solventar errores - sin cola de procesamiento.
 */
define(["../domain/2win_dom_autopicking", "N/record", "N/log", "N/search"], function (AutoPickingManager, record, nLog, search) {
    /**
     * FASE 1: getInputData - Ejecuta búsqueda de Sales Orders pendientes de auto picking
     * @returns {Array} - Resultados de la búsqueda
     */
    function getInputData() {
        nLog.audit("getInputData", "Iniciando búsqueda de Sales Orders para auto picking directo");

        try {
            const salesorderSearchObj = search.create({
                type: "salesorder",
                settings: [
                    { "name": "consolidationtype", "value": "ACCTTYPE" },
                    { "name": "includeperiodendtransactions", "value": "F" }
                ],
                filters:  [ 
      ["mainline","is","F"], 
      "AND", 
      ["taxline","is","F"], 
      "AND", 
      ["item","noneof","7627"], 
      "AND", 
      ["item.type","anyof","InvtPart"], 
      "AND", 
      ["quantityshiprecv","equalto","0"]
   ],
                columns: [
                    "internalid",
                    "tranid",
                    "custbody_2win_nro_cuenta_paciente",
                    "custcol_2win_as_identificador_fila",
                    "item",
                    "unit",
                    "inventorylocation",
                    "quantity",
                    "quantityshiprecv",
                    search.createColumn({
                        name: "formulanumeric",
                        formula: "{quantity} - {quantityshiprecv}"
                    }),
                    search.createColumn({
                        name: "formulanumeric",
                        formula: "CASE WHEN {inventorylocation} = {itemnumber.location} THEN {itemnumber.quantityavailable} ELSE 0 END"
                    })
                ]
            });

            const results = [];
            const searchResults = salesorderSearchObj.run();
            let start = 0;
            let resultSet;

            // Paginar resultados para evitar límites
            do {
                resultSet = searchResults.getRange({ start: start, end: start + 1000 });
                resultSet.forEach(function (result) {
                    results.push({
                        salesOrderId: result.getValue("internalid"),
                        salesOrderTranId: result.getValue("tranid"),
                        cuentaPaciente: result.getValue("custbody_2win_nro_cuenta_paciente"),
                        identificadorFila: result.getValue("custcol_2win_as_identificador_fila"),
                        item: result.getValue("item"),
                        unit: result.getValue("unit"),
                        inventorylocation: result.getValue("inventorylocation"),
                        quantity: result.getValue("quantity"),
                        quantityshiprecv: result.getValue("quantityshiprecv"),
                        cantidadPendiente: result.getValue({
                            name: "formulanumeric",
                            formula: "{quantity} - {quantityshiprecv}"
                        }),
                        stockDisponible: result.getValue({
                            name: "formulanumeric",
                            formula: "CASE WHEN {inventorylocation} = {itemnumber.location} THEN {itemnumber.quantityavailable} ELSE 0 END"
                        })
                    });
                });
                start += 1000;
            } while (resultSet.length === 1000);

            nLog.audit("getInputData", `Total líneas encontradas: ${results.length}`);
            return results;

        } catch (error) {
            nLog.error("getInputData - Error", error);
            throw error;
        }
    }

    /**
     * FASE 2: map - Agrupa las líneas por Sales Order ID
     * @param {Object} context - Contexto del map
     */
    function map(context) {
        try {
            const lineData = JSON.parse(context.value);
            const salesOrderId = lineData.salesOrderId;

            if (!salesOrderId) {
                nLog.error("map", "Sales Order ID no encontrado en los datos");
                return;
            }

            // Key = salesOrderId, Value = datos de la línea
            context.write({
                key: String(salesOrderId),
                value: JSON.stringify({
                    salesOrderTranId: lineData.salesOrderTranId,
                    cuentaPaciente: lineData.cuentaPaciente,
                    item: lineData.item,
                    inventorylocation: lineData.inventorylocation,
                    quantity: lineData.quantity,
                    quantityshiprecv: lineData.quantityshiprecv,
                    cantidadPendiente: lineData.cantidadPendiente,
                    stockDisponible: lineData.stockDisponible
                })
            });

        } catch (error) {
            nLog.error("map - Error", error);
        }
    }

    /**
     * FASE 3: reduce - Procesa cada Sales Order con AutoPickingManager
     * @param {Object} context - Contexto del reduce
     */
    function reduce(context) {
        const salesOrderId = context.key;
        const lineasOV = [];

        nLog.audit("reduce", `Procesando OV ID: ${salesOrderId} - ${context.values.length} línea(s)`);

        // Recolectar todas las líneas de esta OV
        context.values.forEach(function (raw) {
            try {
                const entry = JSON.parse(raw);
                lineasOV.push(entry);
            } catch (e) {
                nLog.error("reduce - Error parseando línea", e);
            }
        });

        try {
            // Cargar el registro de Sales Order
            const salesOrderRecord = record.load({
                type: record.Type.SALES_ORDER,
                id: salesOrderId,
                isDynamic: false
            });

            // Ejecutar sincronización de auto picking
            const manager = new AutoPickingManager();
            manager.syncronize(salesOrderRecord, "afterSubmit", "UPDATE");

            // Registrar éxito
            context.write({
                key: "success",
                value: JSON.stringify({
                    salesOrderId: salesOrderId,
                    salesOrderTranId: lineasOV[0]?.salesOrderTranId || "N/A",
                    lineasProcesadas: lineasOV.length
                })
            });

            nLog.audit("reduce - Éxito", `OV ${salesOrderId} procesada correctamente - ${lineasOV.length} línea(s)`);

        } catch (error) {
            const errorMessage = error.message || error.toString();

            // Registrar error
            context.write({
                key: "error",
                value: JSON.stringify({
                    salesOrderId: salesOrderId,
                    salesOrderTranId: lineasOV[0]?.salesOrderTranId || "N/A",
                    lineasOV: lineasOV.length,
                    error: errorMessage
                })
            });

            nLog.error("reduce - Error", `OV ${salesOrderId}: ${errorMessage}`);
        }
    }

    /**
     * FASE 4: summarize - Resumen de la ejecución
     * @param {Object} context - Contexto del summarize
     */
    function summarize(context) {
        let successCount = 0;
        let errorCount = 0;
        const errores = [];
        const exitosos = [];

        nLog.audit("summarize", "Iniciando resumen de ejecución");

        // Iterar sobre los resultados de salida
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

        // Registrar errores de governance/timeout
        context.mapSummary.errors.iterator().each(function (key, error) {
            nLog.error("summarize - Error en map", { key: key, error: error });
            return true;
        });

        context.reduceSummary.errors.iterator().each(function (key, error) {
            nLog.error("summarize - Error en reduce (governance)", { key: key, error: error });
            return true;
        });

        // Log final
        nLog.audit("summarize - Resultado Final", {
            exitosos: successCount,
            errores: errorCount,
            totalProcesados: successCount + errorCount
        });

        // Detallar errores si los hay
        if (errores.length > 0) {
            nLog.audit("summarize - Detalle de Errores", errores);
        }

        // Detallar exitosos
        if (exitosos.length > 0) {
            nLog.audit("summarize - Detalle de Exitosos", exitosos);
        }

        nLog.audit("summarize", `Ejecución completada: ${successCount} exitosos, ${errorCount} errores`);
    }

    return {
        getInputData: getInputData,
        map: map,
        reduce: reduce,
        summarize: summarize
    };
});