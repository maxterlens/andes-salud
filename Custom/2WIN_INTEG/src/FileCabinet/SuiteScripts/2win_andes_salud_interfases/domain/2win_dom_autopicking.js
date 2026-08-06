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
                        // nLog.debug("inventorydetail no disponible", `Línea ${i}, Item: ${item}`);
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
         * @param {boolean} forceStatusDowngrade - (Opcional) Fuerza el cambio de estado de Shipped a Packed en actualizaciones in-place
         * @returns
         */
        syncronize(newRecord, triggerContext, estadoActualizacion, forceStatusDowngrade = false) {
            nLog.debug("AutoPickingManager - syncronize", `Contexto: ${triggerContext}, Estado Actualización: ${estadoActualizacion}`);

            if (triggerContext !== "beforeSubmit" && triggerContext !== "afterSubmit") return;

            const saleOrderLines = this.#getSaleOrderLines(newRecord);
            nLog.debug("AutoPickingManager - syncronize", `Líneas actuales: ${JSON.stringify(saleOrderLines)}`);

            const itemFulfillmentLines = this.#getItemFulfillmentLines(newRecord.id);
            nLog.debug("AutoPickingManager - syncronize", `Líneas de IF existentes: ${JSON.stringify(itemFulfillmentLines)}`);

            const uniqueLocations = this.#getUniqueLocationsFromLines(saleOrderLines);
            const locationDetails = this.#getLocationDetails(uniqueLocations);

            // Mapear líneas con información de locación y fulfillments relacionados sin bandera global
            const lineasConInfoLocacion = saleOrderLines.map((linea) => {
                const locationInfo = linea.inventorylocation ? locationDetails[linea.inventorylocation] : null;
                const relatedFulfillments = itemFulfillmentLines.filter((fulfillment) => Number(fulfillment.item) === Number(linea.item) && Number(fulfillment.line) === Number(linea.line));
                const isNew = relatedFulfillments.length === 0;
                const filteredFulfillments = relatedFulfillments.filter((fulfillment) => Number(fulfillment.quantity) !== Number(linea.quantity));
                return { ...linea, locationInfo, isNew, fulfillments: filteredFulfillments };
            });

            // Agrupar por Ubicación y Tipo de Picking (Auto/Manual)
            const linesGroupedByKey = lineasConInfoLocacion.reduce((acc, line) => {
                const isAuto = line.locationInfo && line.locationInfo.isAutopicking ? "auto" : "manual";
                const loc = line.inventorylocation;
                const key = `${loc}_${isAuto}`;

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
                const matchingOrderLine = lineasConInfoLocacion.find((l) => Number(l.item) === Number(line.item) && Number(l.line) === Number(line.line) && l.fulfillments.some((f) => f.id === line.id));
                if (matchingOrderLine) {
                    const isAuto = matchingOrderLine.locationInfo && matchingOrderLine.locationInfo.isAutopicking ? "auto" : "manual";
                    const loc = matchingOrderLine.inventorylocation;
                    const key = `${loc}_${isAuto}`;
                    if (!acc[key]) acc[key] = new Set();
                    acc[key].add(line.id);
                }
                return acc;
            }, {});

            nLog.debug("AutoPickingManager - syncronize", `Líneas agrupadas por Ubicación/Tipo: ${JSON.stringify(linesGroupedByKey)}`);

            // ── Preparar contexto de asignación a nivel de OV (1 sola consulta SQL) ──
            // Cache de stock + tracker de consumo compartidos entre TODOS los IFs
            // (creados y actualizados) para evitar sobreconsumo del mismo lote.
            const ctxItemIds = [...new Set(lineasConInfoLocacion.map((l) => Number(l.item)))];
            const ctxLocationIds = [...new Set(lineasConInfoLocacion.map((l) => Number(l.inventorylocation)).filter(Boolean))];
            const fechaReferencia = newRecord.getValue({ fieldId: "trandate" }) || null;
            const ctxAsignacion = this.itemFulfillmentDao.prepararContextoAsignacion(ctxItemIds, ctxLocationIds, fechaReferencia);

            const resultado = {
                grupos: [],
                ifsActualizados: [],
                ifsCreados: [],
                ifsEliminados: []
            };

            // Iterar sobre cada grupo y ejecutar de manera independiente
            for (const key in linesGroupedByKey) {
                const group = linesGroupedByKey[key];
                const existingFulfillmentIds = existingFulfillmentsMap[key];

                // Evaluamos si el grupo específico contiene líneas que nunca han sido despachadas
                const tieneLineasNuevasElGrupo = group.lines.some((l) => l.isNew);

                const detalleGrupo = { grupo: key, tipo: group.isAutoPicking ? "auto" : "manual", lineas: group.lines.length, accion: null, detalle: null };

                if (existingFulfillmentIds && existingFulfillmentIds.size > 0) {
                    const idArray = [...existingFulfillmentIds];
                    nLog.debug("Sincronización", `Actualizando IFs existentes [${idArray.join(", ")}] para el grupo: ${key}`);

                    // Actualizar cada IF del grupo — updateLines desmarcara las líneas
                    // que ya no aplican y eliminara el IF solo si quedan 0 líneas válidas.
                    for (const ifId of idArray) {
                        try {
                            const res = this.itemFulfillmentDao.updateLines(ifId, group.lines, newRecord.id, group.isAutoPicking, forceStatusDowngrade, ctxAsignacion, fechaReferencia);
                            if (res && res.updated) {
                                resultado.ifsActualizados.push(res.updated);
                            } else {
                                resultado.ifsEliminados.push(ifId);
                            }
                        } catch (e) {
                            nLog.error("Sincronización", `Error actualizando IF ${ifId} en grupo ${key}: ${e.message}`);
                        }
                    }

                    detalleGrupo.accion = "actualizado";

                    // Si el grupo además contiene líneas nuevas que no estaban en el IF original, las forzamos en un flujo parcial
                    if (tieneLineasNuevasElGrupo) {
                        const lineasNuevasDeEsteGrupo = group.lines.filter((l) => l.isNew);
                        nLog.debug("Sincronización", `Detectadas líneas nuevas en grupo existente. Creando parcial para: ${JSON.stringify(lineasNuevasDeEsteGrupo)}`);
                        try {
                            const creados = this.itemFulfillmentDao.createPartialFulfillment(newRecord.id, lineasNuevasDeEsteGrupo, group.isAutoPicking, ctxAsignacion, fechaReferencia);
                            if (creados && creados.length > 0) {
                                resultado.ifsCreados.push(...creados);
                            }
                        } catch (e) {
                            nLog.error("Sincronización", `Error creando parcial en grupo ${key}: ${e.message}`);
                        }
                    }
                } else if (tieneLineasNuevasElGrupo) {
                    nLog.debug("Sincronización", `Creando nuevo IF para el grupo: ${key}`);
                    detalleGrupo.accion = "creado";
                    try {
                        const creados = this.itemFulfillmentDao.createPartialFulfillment(newRecord.id, group.lines, group.isAutoPicking, ctxAsignacion, fechaReferencia);
                        if (creados && creados.length > 0) {
                            resultado.ifsCreados.push(...creados);
                        }
                    } catch (e) {
                        nLog.error("Sincronización", `Error creando IF en grupo ${key}: ${e.message}`);
                    }
                }

                resultado.grupos.push(detalleGrupo);

                // Removemos la clave del mapa para saber qué fulfillments quedaron huérfanos
                delete existingFulfillmentsMap[key];
            }

            // Eliminar Fulfillments que ya no tienen líneas válidas (Huérfanos)
            for (const key in existingFulfillmentsMap) {
                const orphanIds = existingFulfillmentsMap[key];
                orphanIds.forEach((fulfillmentId) => {
                    try {
                        this.itemFulfillmentDao.deleteById(fulfillmentId);
                        resultado.ifsEliminados.push(fulfillmentId);
                    } catch (e) {
                        nLog.error("Sincronización", `Error eliminando IF huérfano ${fulfillmentId}: ${e.message}`);
                    }
                });
            }

            nLog.audit("AutoPickingManager - syncronize", `Sincronización completada. OV ${newRecord.id} | Líneas OV: ${saleOrderLines.length} | Grupos: ${resultado.grupos.length} | IFs actualizados: ${resultado.ifsActualizados.length} [${resultado.ifsActualizados.join(", ")}] | IFs creados: ${resultado.ifsCreados.length} [${resultado.ifsCreados.join(", ")}] | IFs eliminados: ${resultado.ifsEliminados.length} [${resultado.ifsEliminados.join(", ")}]`);
            nLog.audit("AutoPickingManager - syncronize - Detalle grupos", JSON.stringify(resultado.grupos));
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
            let idFulfillment = null;
            fulfillmentLines.forEach((fulfillmentLines) => {
                if (Number(fulfillmentLines.line) === Number(orderLine)) {
                    nLog.debug("Ejecutando remocion de linea", { orderLine, fulfillmentLines });
                    idFulfillment = this.itemFulfillmentDao.removeLine(fulfillmentLines.id, orderLine);
                }
            });
            return idFulfillment;
        }
    }

    return AutoPickingManager;
});