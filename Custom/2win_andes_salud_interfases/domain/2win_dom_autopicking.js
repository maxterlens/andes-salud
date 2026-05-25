/**
 * @NApiVersion 2.1
 * @NModuleScope SameAccount
 */
define(["../dao/2win_dao_itemfullfilment", "N/log", "N/query", "N/search"], function (ItemFulfillmentDao, nLog, query, search) {
    /**
     * Clase para manejar la creación y actualización de Item Fulfillments
     * de autopicking y picking manual asociados a una orden de venta
     */
    class AutoPickingManager {
        constructor() {
            this.itemFulfillmentDao = new ItemFulfillmentDao();
        }
        /**
         * Verifica la disponibilidad de stock para un conjunto de líneas.
         */
        #checkInventoryAvailability(lines) {
            if (!lines || lines.length === 0) return {};

            const itemIds = [...new Set(lines.map((l) => l.item))];
            const locationIds = [...new Set(lines.map((l) => l.inventorylocation))];

            if (itemIds.length === 0 || locationIds.length === 0) return {};

            const sql = `
                SELECT 
                    item, 
                    location, 
                    quantityavailable 
                FROM 
                    AggregateInventoryBalance 
                WHERE 
                    item IN (${itemIds.join(",")}) 
                    AND location IN (${locationIds.join(",")})
            `;

            try {
                const results = query.runSuiteQL({ query: sql }).asMappedResults();

                // Mapa: "ItemID_LocationID" -> Cantidad Disponible
                const availabilityMap = {};
                results.forEach((res) => {
                    const key = `${res.item}_${res.location}`;
                    availabilityMap[key] = parseFloat(res.quantityavailable || 0);
                });

                return availabilityMap;
            } catch (e) {
                nLog.error("Error Check Inventory", e);
                return {};
            }
        }

        /**
         * Filtra y ajusta las líneas basándose en el stock disponible.
         */
        #validateAndAdjustLines(lines) {
            const availabilityMap = this.#checkInventoryAvailability(lines);
            const validLines = [];

            // Agrupar líneas por Ítem+Ubicación para controlar consumo acumulado en la misma transacción
            const consumptionTracker = {};

            lines.forEach((line) => {
                const key = `${line.item}_${line.inventorylocation}`;

                // Si no hay registro de disponibilidad, asumimos 0
                let available = availabilityMap[key] || 0;

                // Restar lo que ya hemos "consumido" en líneas anteriores de este mismo proceso
                const alreadyConsumed = consumptionTracker[key] || 0;
                let currentAvailable = available - alreadyConsumed;

                if (currentAvailable <= 0) {
                    nLog.audit("Stock Insuficiente", `Línea omitida. Item ${line.item} en Loc ${line.inventorylocation}. Stock: 0`);
                    return; // Saltar línea
                }

                let quantityToFulfill = parseFloat(line.quantity);

                if (quantityToFulfill > currentAvailable) {
                    nLog.audit("Ajuste de Cantidad", `Item ${line.item}. Solicitado: ${quantityToFulfill}, Ajustado a: ${currentAvailable}`);
                    quantityToFulfill = currentAvailable;
                }

                // Actualizar tracker y línea
                consumptionTracker[key] = alreadyConsumed + quantityToFulfill;

                // Clonar objeto para no mutar el original inesperadamente y asignar nueva cantidad
                const validLine = { ...line, quantity: quantityToFulfill };
                validLines.push(validLine);
            });

            return validLines;
        }
        #getItemFulfillmentLines(idSalesOrder) {
            if (!idSalesOrder) return [];
            const fulfillmentSearch = query
                .runSuiteQL({
                    query: `
        SELECT
            tran.id AS transactionId,
            tran.tranid,
            tran.custbody_2win_auto_seleccion as isautopicking,
            tl.item,
            tl.quantity * -1 AS quantity,
            tl.inventorylocation,
            ntll.previousline,
            ntll.previousdoc AS salesOrderId
        FROM
            transaction AS tran
            INNER JOIN transactionline AS tl ON tl.transaction = tran.id
            INNER JOIN NextTransactionLineLink AS ntll ON ntll.nextdoc = tran.id
            AND ntll.nextLine = tl.id
        WHERE
            tran.type = 'ItemShip'
            AND ntll.previousdoc = ?`,
                    params: [idSalesOrder]
                })
                .asMappedResults();

            const fulfillmentResults = fulfillmentSearch.map((result) => {
                return {
                    id: result.transactionid,
                    tranid: result.tranid,
                    quantity: result.quantity,
                    item: result.item,
                    line: result.previousline,
                    createdFrom: result.salesorderid
                };
            });
            return fulfillmentResults;
        }
        #getSaleOrderLines(salesOrderRecord) {
            const lineCount = salesOrderRecord.getLineCount({ sublistId: "item" });
            const lineasOrdenVenta = [];

            // Tipos de ítems inventariables y sus derivados
            const inventoryItemTypes = ["InvtPart", "Assembly", "Kit"];

            for (let i = 0; i < lineCount; i++) {
                const itemType = salesOrderRecord.getSublistValue({ sublistId: "item", fieldId: "itemtype", line: i });
                const custcol_2win_flag_item_provisional = salesOrderRecord.getSublistValue({ sublistId: "item", fieldId: "custcol_2win_flag_item_provisional", line: i });
                if (custcol_2win_flag_item_provisional) continue;
                // Solo procesar ítems inventariables y sus derivados
                if (inventoryItemTypes.includes(itemType)) {
                    const line = salesOrderRecord.getSublistValue({ sublistId: "item", fieldId: "line", line: i });
                    const lineuniquekey = salesOrderRecord.getSublistValue({ sublistId: "item", fieldId: "lineuniquekey", line: i });
                    const item = salesOrderRecord.getSublistValue({ sublistId: "item", fieldId: "item", line: i });
                    const quantity = salesOrderRecord.getSublistValue({ sublistId: "item", fieldId: "quantity", line: i });
                    const inventorylocation = salesOrderRecord.getSublistValue({ sublistId: "item", fieldId: "inventorylocation", line: i });
                    // const inventoryDetail = salesOrderRecord.getSublistSubrecord({ sublistId: "item", fieldId: "inventorydetail", line: i });
                    const custcol_2win_as_identificador_fila = salesOrderRecord.getSublistValue({ sublistId: "item", fieldId: "custcol_2win_as_identificador_fila", line: i });
                    // Verificar si existe el inventorydetail antes de accederlo
                    let inventoryDetail = null;
                    try {
                        inventoryDetail = salesOrderRecord.getSublistSubrecord({
                            sublistId: "item",
                            fieldId: "inventorydetail",
                            line: i
                        });
                    } catch (e) {
                        // El inventorydetail no existe para esta línea
                        nLog.debug("inventorydetail no disponible", `Línea ${i}, Item: ${item}`);
                    }
                    lineasOrdenVenta.push({
                        line,
                        lineuniquekey,
                        item,
                        quantity,
                        inventorylocation,
                        inventoryDetail,
                        custcol_2win_as_identificador_fila,
                        // custcol_2win_flag_item_provisional,
                        itemType
                    });
                }
            }

            return lineasOrdenVenta;
        }
        #getLocationDetails(uniqueLocations) {
            if (uniqueLocations.length === 0) return {};
            const locationSearch = search.create({
                type: "location",
                filters: [["internalid", "anyof", uniqueLocations]],
                columns: ["internalid", "custrecord_2win_is_autopicking"]
            });

            const locationResults = locationSearch
                .run()
                .getRange({ start: 0, end: 1000 })
                .reduce((acc, e) => {
                    acc[e.getValue("internalid")] = {
                        id: e.getValue("internalid"),
                        isAutopicking: e.getValue("custrecord_2win_is_autopicking")
                    };
                    return acc;
                }, {});
            return locationResults;
        }
        #isEqual(arr1, arr2) {
            if (arr1.length !== arr2.length) {
                return false;
            }
            return arr1.every((obj1, index1) => {
                const obj2 = arr2[index1];
                const keys1 = Object.keys(obj1);
                const keys2 = Object.keys(obj2);
                if (keys1.length !== keys2.length) {
                    return false;
                }
                for (let i = 0; i < keys1.length; i++) {
                    const key = keys1[i];
                    if (obj1[key] !== obj2[key]) {
                        return false;
                    }
                }
                return true;
            });
        }
        #searchDeletedLines(oldlines, newlines) {
            const newLineIds = new Set(newlines.map((line) => line.custcol_2win_as_identificador_fila));
            const deletedLines = oldlines.filter((line) => !newLineIds.has(line.custcol_2win_as_identificador_fila));
            return deletedLines;
        }
        #searchNewLines(oldlines, newlines) {
            const oldLineIds = new Set(oldlines.map((line) => line.custcol_2win_as_identificador_fila));
            const newLines = newlines.filter((line) => !oldLineIds.has(line.custcol_2win_as_identificador_fila));
            return newLines;
        }
        #getUniqueLocationsFromLines(lines) {
            const locationSet = new Set();
            lines.forEach((line) => {
                locationSet.add(line.inventorylocation);
            });
            return Array.from(locationSet);
        }
        /**
         * Funcion de sincronización de Item Fulfillments de autopicking y picking manual
         * asociadas a una orden de venta.
         * @param {object} newRecord - Registro de la orden de venta
         * @param {string} triggerContext - Contexto del disparador (beforeSubmit, afterSubmit)
         * @param {string} estadoActualizacion - Estado de actualización (CREATE, UPDATE)
         * @returns
         */
        syncronize(newRecord, triggerContext, estadoActualizacion) {
            nLog.debug("AutoPickingManager - syncronize", `Contexto: ${triggerContext}, Estado Actualización: ${estadoActualizacion}`);

            if (triggerContext !== "beforeSubmit" && triggerContext !== "afterSubmit") return;

            const saleOrderLines = this.#getSaleOrderLines(newRecord);
            nLog.debug("AutoPickingManager - syncronize", `Líneas actuales: ${JSON.stringify(saleOrderLines)}`);

            const itemFulfillmentLines = this.#getItemFulfillmentLines(newRecord.id);
            nLog.debug("AutoPickingManager - syncronize", `Líneas de IF existentes: ${JSON.stringify(itemFulfillmentLines)}`);

            let existNewLine = estadoActualizacion === "CREATE";
            const uniqueLocations = this.#getUniqueLocationsFromLines(saleOrderLines);
            const locationDetails = this.#getLocationDetails(uniqueLocations);

            // Mapear líneas con información de locación y fulfillments relacionados
            const lineasConInfoLocacion = saleOrderLines.map((linea) => {
                const locationInfo = linea.inventorylocation ? locationDetails[linea.inventorylocation] : null;
                const relatedFulfillments = itemFulfillmentLines.filter((fulfillment) => Number(fulfillment.item) === Number(linea.item) && Number(fulfillment.line) === Number(linea.line));
                if (relatedFulfillments.length === 0) existNewLine = true;
                return { ...linea, locationInfo, fulfillments: relatedFulfillments };
            });

            // Agrupar por Ubicación y Tipo de Picking (Auto/Manual)
            const linesGroupedByKey = lineasConInfoLocacion.reduce((acc, line) => {
                const isAuto = line.locationInfo && line.locationInfo.isAutopicking ? "auto" : "manual";
                const loc = line.inventorylocation;
                const key = `${loc}_${isAuto}`; // Clave compuesta

                if (!acc[key]) {
                    acc[key] = {
                        isAutoPicking: isAuto === "auto",
                        locationId: loc,
                        lines: []
                    };
                }
                acc[key].lines.push(line);
                return acc;
            }, {});

            // Identificar Fulfillments Existentes por la misma clave
            const existingFulfillmentsMap = itemFulfillmentLines.reduce((acc, line) => {
                const matchingOrderLine = lineasConInfoLocacion.find((l) => Number(l.item) === Number(line.item) && Number(l.line) === Number(line.line));

                if (matchingOrderLine) {
                    const isAuto = matchingOrderLine.locationInfo && matchingOrderLine.locationInfo.isAutopicking ? "auto" : "manual";
                    const loc = matchingOrderLine.inventorylocation;
                    const key = `${loc}_${isAuto}`;
                    acc[key] = line.id; // Mapear la clave al ID del Item Fulfillment
                }
                return acc;
            }, {});

            nLog.debug("AutoPickingManager - syncronize", `Líneas agrupadas por Ubicación/Tipo: ${JSON.stringify(linesGroupedByKey)}`);

            // Iterar sobre cada grupo y ejecutar la creación o actualización
            for (const key in linesGroupedByKey) {
                const group = linesGroupedByKey[key];
                const existingFulfillmentId = existingFulfillmentsMap[key];

                if (existingFulfillmentId && !existNewLine) {
                    this.itemFulfillmentDao.updateLines(existingFulfillmentId, group.lines, newRecord.id, group.isAutoPicking);
                } else {
                    // Se ejecuta por cada combinación Ubicación-Tipo
                    this.itemFulfillmentDao.createPartialFulfillment(newRecord.id, group.lines, group.isAutoPicking);
                }

                // Removemos la clave del mapa para saber qué fulfillments quedaron huérfanos
                delete existingFulfillmentsMap[key];
            }

            // Eliminar Fulfillments que ya no tienen líneas válidas (Huérfanos)
            for (const key in existingFulfillmentsMap) {
                const fulfillmentIdToDelete = existingFulfillmentsMap[key];
                this.itemFulfillmentDao.deleteById(fulfillmentIdToDelete);
            }

            nLog.debug("AutoPickingManager - syncronize", "Sincronización completada.");
        }
        deleteFulfillment(salesOrderRecord) {
            const salesOrderId = salesOrderRecord.id;
            const itemFulfillmentLines = this.#getItemFulfillmentLines(salesOrderId);
            const fulfillmentIdsToDelete = [...new Set(itemFulfillmentLines.map((line) => line.id))];
            fulfillmentIdsToDelete.forEach((fulfillmentId) => {
                this.itemFulfillmentDao.deleteById(fulfillmentId);
                nLog.debug({
                    title: "Item Fulfillment Eliminado",
                    details: `Se ha eliminado el Item Fulfillment con ID ${fulfillmentId} asociado a la OV ID ${salesOrderId}.`
                });
            });
        }

        deleteLineOnFulfillments(orderId, orderLine) {
            const fulfillmentLines = this.#getItemFulfillmentLines(orderId);
            nLog.debug("fulfillmentLines", fulfillmentLines);
            let idFulfillment = null;
            fulfillmentLines.forEach((fulfillmentLines) => {
                if (Number(fulfillmentLines.line) === Number(orderLine)) {
                    nLog.debug("Ejecutando remocion de linea", {orderLine, fulfillmentLines });
                    idFulfillment = this.itemFulfillmentDao.removeLine(fulfillmentLines.id, orderLine);
                }
            });
            return idFulfillment;
        }
    }

    return AutoPickingManager;
});
