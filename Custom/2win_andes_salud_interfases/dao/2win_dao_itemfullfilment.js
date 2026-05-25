/**
 * @NApiVersion 2.1
 * @NModuleScope SameAccount
 * @description DAO para interactuar con los registros de Item Fulfillment. Implementa arquitectura "Tabula Rasa" (Limpiar y Forzar Asignación).
 */
define(["N/record", "N/search", "N/log", "N/query"], (record, search, nLog, query) => {
    // ─── Constantes ────────────────────────────────────────────────────────────
    const EPSILON = 0.00001;
    const CHUNK_SIZE = 500;
    const SUBLIST_ITEM = "item";
    const SUBLIST_INV = "inventoryassignment";
    const FIELD_INV_DETAIL = "inventorydetail";

    class ItemFulfillmentDao {
        constructor() {
            this.recordType = record.Type.ITEM_FULFILLMENT;
            this._inventarioCache = new Map();
        }

        // ══════════════════════════════════════════════════════════════════════
        // MÉTODOS PRIVADOS DE INVENTARIO Y ASIGNACIÓN
        // ══════════════════════════════════════════════════════════════════════

        _precargarInventario(lineas) {
            const itemIds = [...new Set(lineas.filter((l) => l.item).map((l) => Number(l.item)))];
            const locationIds = [...new Set(lineas.map((l) => Number(l.inventorylocation || l.locationInfo?.id)))].filter(Boolean);

            if (itemIds.length === 0 || locationIds.length === 0) {
                this._inventarioCache.clear();
                return;
            }

            this._inventarioCache.clear();

            for (let i = 0; i < itemIds.length; i += CHUNK_SIZE) {
                const itemChunk = itemIds.slice(i, i + CHUNK_SIZE);

                for (let j = 0; j < locationIds.length; j += CHUNK_SIZE) {
                    const locChunk = locationIds.slice(j, j + CHUNK_SIZE);

                    // const suiteQL = `
                    //     SELECT
                    //         ib.item,
                    //         ib.location,
                    //         /* Aplicamos la tasa de conversión solicitada al stock físico del lote específico */
                    //         (ib.quantityonhand / NVL(uom.conversionRate, 1)) AS quantityavailable,
                    //         ib.inventorynumber,
                    //         ib.binnumber,
                    //         ib.inventorystatus
                    //     FROM InventoryBalance ib
                    //     INNER JOIN Item i ON ib.item = i.id
                    //     LEFT JOIN unitsTypeUom uom ON i.saleunit = uom.internalid
                    //     INNER JOIN InventoryStatus st ON ib.inventorystatus = st.id

                    //     /* Subconsulta con la lógica exacta del cliente: (Stock Bueno - Comprometido) */
                    //     INNER JOIN (
                    //         SELECT
                    //             ail.item,
                    //             ail.location,
                    //             (CASE
                    //                 WHEN (COALESCE(GoodStock.total_on_hand, 0) - NVL(ail.quantitycommitted, 0)) > 0
                    //                 THEN (COALESCE(GoodStock.total_on_hand, 0) - NVL(ail.quantitycommitted, 0))
                    //                 ELSE 0
                    //             END) AS loc_available
                    //         FROM AggregateItemLocation ail
                    //         LEFT JOIN (
                    //             SELECT
                    //                 iib.item,
                    //                 iib.location,
                    //                 SUM(iib.quantityonhand) AS total_on_hand
                    //             FROM ItemInventoryBalance iib
                    //             INNER JOIN InventoryStatus ist ON iib.inventoryStatus = ist.id
                    //             WHERE ist.name NOT IN ('Bloqueado', 'En Inspección', 'Damaged')
                    //               AND iib.item IN (${itemChunk.join(",")})
                    //               AND iib.location IN (${locChunk.join(",")})
                    //             GROUP BY iib.item, iib.location
                    //         ) GoodStock ON ail.item = GoodStock.item AND ail.location = GoodStock.location
                    //         WHERE ail.item IN (${itemChunk.join(",")})
                    //           AND ail.location IN (${locChunk.join(",")})
                    //     ) ValidLoc ON ib.item = ValidLoc.item AND ib.location = ValidLoc.location

                    //     WHERE
                    //         ib.item IN (${itemChunk.join(",")})
                    //         AND ib.location IN (${locChunk.join(",")})
                    //         AND st.name NOT IN ('Bloqueado', 'En Inspección', 'Damaged')
                    //         AND ib.quantityonhand > 0
                    //         /* Aseguramos que la locación tenga disponibilidad general según la fórmula */
                    //         AND ValidLoc.loc_available > 0
                    //     ORDER BY ib.item, ib.location, ib.lastmodifieddate ASC
                    // `;
                    const suiteQL = `
                        SELECT
                            ib.item,
                            ib.location,
                            ib.quantityonhand AS quantityavailable,
                            ib.inventorynumber,
                            ib.binnumber,
                            ib.inventorystatus
                        FROM InventoryBalance ib
                        INNER JOIN Item i ON ib.item = i.id
                        INNER JOIN InventoryStatus st ON ib.inventorystatus = st.id
                        WHERE
                            ib.item IN (${itemChunk.join(",")})
                            AND ib.location IN (${locChunk.join(",")})
                            AND st.name NOT IN ('Bloqueado', 'En Inspección', 'Damaged')
                            AND ib.quantityonhand > 0
                        ORDER BY ib.item, ib.location, ib.lastmodifieddate ASC
                    `;
                    const results = query.runSuiteQL({ query: suiteQL }).asMappedResults();

                    for (const r of results) {
                        const key = `${r.item}|${r.location}`;
                        if (!this._inventarioCache.has(key)) {
                            this._inventarioCache.set(key, []);
                        }
                        this._inventarioCache.get(key).push({
                            inventorynumber: r.inventorynumber,
                            binnumber: r.binnumber,
                            inventorystatus: r.inventorystatus,
                            disponible: parseFloat(r.quantityavailable)
                        });
                    }
                }
            }
        }

        _asignarInventarioDinamicamente(subrec, itemId, locationId, quantityRequired) {
            const key = `${itemId}|${locationId}`;
            const lotesDisponibles = (this._inventarioCache.get(key) || []).filter((l) => l.disponible > 0);

            if (lotesDisponibles.length === 0) {
                throw new Error(`Sin stock físico en caché para AutoPicking: Artículo ${itemId} en Locación ${locationId}.`);
            }

            let cantidadAsignada = 0;

            for (const lote of lotesDisponibles) {
                if (cantidadAsignada >= quantityRequired) break;
                if (lote.disponible <= 0) continue;

                const pendiente = quantityRequired - cantidadAsignada;
                const aAsignar = Math.min(lote.disponible, pendiente);
                if (aAsignar <= 0) continue;

                try {
                    subrec.selectNewLine({ sublistId: SUBLIST_INV });

                    if (lote.inventorynumber) subrec.setCurrentSublistValue({ sublistId: SUBLIST_INV, fieldId: "issueinventorynumber", value: lote.inventorynumber });
                    if (lote.binnumber) subrec.setCurrentSublistValue({ sublistId: SUBLIST_INV, fieldId: "binnumber", value: lote.binnumber });
                    if (lote.inventorystatus) subrec.setCurrentSublistValue({ sublistId: SUBLIST_INV, fieldId: "inventorystatus", value: lote.inventorystatus });

                    subrec.setCurrentSublistValue({ sublistId: SUBLIST_INV, fieldId: "quantity", value: aAsignar });
                    subrec.commitLine({ sublistId: SUBLIST_INV });

                    lote.disponible -= aAsignar;
                    cantidadAsignada += aAsignar;
                } catch (e) {
                    lote.disponible = 0;
                }
            }

            if (cantidadAsignada < quantityRequired - EPSILON) {
                throw new Error(`Stock insuficiente: Artículo ${itemId}. Requerido: ${quantityRequired}, Asignado: ${cantidadAsignada}.`);
            }
        }

        _leerInventarioAsignado(inventoryDetail) {
            const count = inventoryDetail.getLineCount({ sublistId: SUBLIST_INV });
            const lineas = [];
            for (let j = 0; j < count; j++) {
                inventoryDetail.selectLine({ sublistId: SUBLIST_INV, line: j });
                lineas.push({
                    inventorynumber: inventoryDetail.getCurrentSublistValue({ sublistId: SUBLIST_INV, fieldId: "issueinventorynumber" }),
                    binnumber: inventoryDetail.getCurrentSublistValue({ sublistId: SUBLIST_INV, fieldId: "binnumber" }),
                    inventorystatus: inventoryDetail.getCurrentSublistValue({ sublistId: SUBLIST_INV, fieldId: "inventorystatus" }),
                    qty: parseFloat(inventoryDetail.getCurrentSublistValue({ sublistId: SUBLIST_INV, fieldId: "quantity" }) || 0)
                });
            }
            return lineas;
        }

        /**
         * Utilidad para vaciar completamente un subregistro de inventario
         */
        _vaciarSubregistro(fulfillmentRecord) {
            if (fulfillmentRecord.hasCurrentSublistSubrecord({ sublistId: SUBLIST_ITEM, fieldId: FIELD_INV_DETAIL })) {
                const invDetail = fulfillmentRecord.getCurrentSublistSubrecord({ sublistId: SUBLIST_ITEM, fieldId: FIELD_INV_DETAIL });
                const count = invDetail.getLineCount({ sublistId: SUBLIST_INV });
                for (let j = count - 1; j >= 0; j--) {
                    invDetail.removeLine({ sublistId: SUBLIST_INV, line: j, ignoreRecalc: true });
                }
                return invDetail;
            }
            return null;
        }

        _procesarInventoryDetail(fulfillmentRecord, lineToProcess, itemId, locationId, qtyToFulfill, isAutoPicking) {
            // const hasInventoryDetail = fulfillmentRecord.hasCurrentSublistSubrecord({ sublistId: SUBLIST_ITEM, fieldId: FIELD_INV_DETAIL });
            // if (!hasInventoryDetail) return;

            const inventoryDetail = fulfillmentRecord.getCurrentSublistSubrecord({ sublistId: SUBLIST_ITEM, fieldId: FIELD_INV_DETAIL });

            // 1. Tomamos una foto (snapshot) de lo que NetSuite sugería por si lo necesitamos
            const lineasActuales = this._leerInventarioAsignado(inventoryDetail);

            // 2. ENFOQUE TABULA RASA: Limpiamos absolutamente todo el subregistro
            const count = inventoryDetail.getLineCount({ sublistId: SUBLIST_INV });
            for (let j = count - 1; j >= 0; j--) {
                inventoryDetail.removeLine({ sublistId: SUBLIST_INV, line: j, ignoreRecalc: true });
            }

            // 3. Forzamos la nueva asignación desde cero
            if (isAutoPicking) {
                this._asignarInventarioDinamicamente(inventoryDetail, itemId, locationId, qtyToFulfill);
                return;
            }

            const soInventoryDetail = lineToProcess.inventoryDetail;
            const soDetailLineCount = soInventoryDetail ? soInventoryDetail.getLineCount({ sublistId: SUBLIST_INV }) : 0;

            if (soInventoryDetail && soDetailLineCount > 0) {
                for (let j = 0; j < soDetailLineCount; j++) {
                    inventoryDetail.selectNewLine({ sublistId: SUBLIST_INV });

                    const issueinventorynumber = soInventoryDetail.getSublistValue({ sublistId: SUBLIST_INV, fieldId: "issueinventorynumber", line: j });
                    const binnumber = soInventoryDetail.getSublistValue({ sublistId: SUBLIST_INV, fieldId: "binnumber", line: j });
                    const invQuantity = soInventoryDetail.getSublistValue({ sublistId: SUBLIST_INV, fieldId: "quantity", line: j });

                    if (issueinventorynumber) inventoryDetail.setCurrentSublistValue({ sublistId: SUBLIST_INV, fieldId: "issueinventorynumber", value: issueinventorynumber });
                    if (binnumber) inventoryDetail.setCurrentSublistValue({ sublistId: SUBLIST_INV, fieldId: "binnumber", value: binnumber });

                    inventoryDetail.setCurrentSublistValue({ sublistId: SUBLIST_INV, fieldId: "quantity", value: invQuantity });
                    inventoryDetail.commitLine({ sublistId: SUBLIST_INV });
                }
                return;
            }

            if (lineasActuales.length > 0) {
                let remaining = parseFloat(qtyToFulfill);

                for (let j = 0; j < lineasActuales.length; j++) {
                    const lote = lineasActuales[j];
                    const esUltimo = j === lineasActuales.length - 1;
                    const assignedQty = esUltimo ? remaining : Math.min(lote.qty, remaining);

                    if (assignedQty <= EPSILON) continue;

                    inventoryDetail.selectNewLine({ sublistId: SUBLIST_INV });

                    if (lote.inventorynumber) inventoryDetail.setCurrentSublistValue({ sublistId: SUBLIST_INV, fieldId: "issueinventorynumber", value: lote.inventorynumber });
                    if (lote.binnumber) inventoryDetail.setCurrentSublistValue({ sublistId: SUBLIST_INV, fieldId: "binnumber", value: lote.binnumber });
                    if (lote.inventorystatus) inventoryDetail.setCurrentSublistValue({ sublistId: SUBLIST_INV, fieldId: "inventorystatus", value: lote.inventorystatus });

                    inventoryDetail.setCurrentSublistValue({ sublistId: SUBLIST_INV, fieldId: "quantity", value: assignedQty });
                    inventoryDetail.commitLine({ sublistId: SUBLIST_INV });

                    remaining -= assignedQty;
                    if (remaining <= EPSILON) break;
                }
                return;
            }

            throw new Error(`Detalle de inventario faltante para el artículo ID ${itemId}.`);
        }

        // ══════════════════════════════════════════════════════════════════════
        // MÉTODOS PÚBLICOS — CRUD
        // ══════════════════════════════════════════════════════════════════════

        createPartialFulfillment(salesOrderId, linesToFulfill, isAutoPicking = false) {
            try {
                const pendingLines = linesToFulfill.filter((l) => l.fulfillments.length === 0);
                if (pendingLines.length === 0) return null;

                if (isAutoPicking) this._precargarInventario(pendingLines);

                const defaultInventoryLocation = pendingLines.find((line) => line.locationInfo?.id)?.locationInfo?.id;

                const fulfillmentRecord = record.transform({
                    fromType: record.Type.SALES_ORDER,
                    fromId: salesOrderId,
                    toType: this.recordType,
                    isDynamic: true,
                    defaultValues: { inventorylocation: defaultInventoryLocation }
                });

                if (isAutoPicking) {
                    fulfillmentRecord.setValue({ fieldId: "shipstatus", value: "C" });
                    fulfillmentRecord.setValue({ fieldId: "custbody_2win_auto_seleccion", value: true });
                }

                const lineCount = fulfillmentRecord.getLineCount({ sublistId: SUBLIST_ITEM }) || 0;
                const linesMap = new Map(pendingLines.map((l) => [String(l.line), l]));
                let asignadas = 0;

                for (let i = 0; i < lineCount; i++) {
                    fulfillmentRecord.selectLine({ sublistId: SUBLIST_ITEM, line: i });
                    const orderline = fulfillmentRecord.getCurrentSublistValue({ sublistId: SUBLIST_ITEM, fieldId: "orderline" });
                    const lineToProcess = linesMap.get(String(orderline));

                    if (lineToProcess) {
                        fulfillmentRecord.setCurrentSublistValue({ sublistId: SUBLIST_ITEM, fieldId: "itemreceive", value: true });
                        if (lineToProcess.quantity) {
                            fulfillmentRecord.setCurrentSublistValue({ sublistId: SUBLIST_ITEM, fieldId: "quantity", value: lineToProcess.quantity });
                        }

                        const itemId = fulfillmentRecord.getCurrentSublistValue({ sublistId: SUBLIST_ITEM, fieldId: "item" });
                        const locationId = fulfillmentRecord.getCurrentSublistValue({ sublistId: SUBLIST_ITEM, fieldId: "location" }) || defaultInventoryLocation;
                        const qty = fulfillmentRecord.getCurrentSublistValue({ sublistId: SUBLIST_ITEM, fieldId: "quantity" });

                        // VERIFICACIÓN PREVENTIVA: Verificar stock disponible ANTES de tocar el inventorydetail
                        if (isAutoPicking) {
                            const cacheKey = `${itemId}|${locationId}`;
                            const lotesDisponibles = (this._inventarioCache.get(cacheKey) || []).filter((l) => l.disponible > 0);
                            const stockTotal = lotesDisponibles.reduce((sum, l) => sum + l.disponible, 0);

                            if (stockTotal <= 0) {
                                // No hay stock: desmarcar línea SIN tocar el inventorydetail
                                nLog.audit(`Línea desmarcada en OV ${salesOrderId}`, `Artículo ${itemId}: Sin stock físico en caché para AutoPicking: Artículo ${itemId} en Locación ${locationId}.`);
                                fulfillmentRecord.setCurrentSublistValue({ sublistId: SUBLIST_ITEM, fieldId: "itemreceive", value: false });
                                fulfillmentRecord.commitLine({ sublistId: SUBLIST_ITEM });
                                continue; // Saltar al siguiente artículo sin modificar el subregistro
                            }
                        }

                        try {
                            // Intenta asignar (esta función vacía el detalle primero y luego inyecta)
                            this._procesarInventoryDetail(fulfillmentRecord, lineToProcess, itemId, locationId, qty, isAutoPicking);
                            fulfillmentRecord.commitLine({ sublistId: SUBLIST_ITEM });
                            asignadas++;
                        } catch (e) {
                            // Si falla, el detalle YA ESTÁ VACÍO. Solo desmarcamos y aseguramos anular cantidad.
                            nLog.audit(`Línea desmarcada en OV ${salesOrderId}`, `Artículo ${itemId}: ${e.message}`);
                            fulfillmentRecord.setCurrentSublistValue({ sublistId: SUBLIST_ITEM, fieldId: "itemreceive", value: false });
                            // fulfillmentRecord.setCurrentSublistValue({ sublistId: SUBLIST_ITEM, fieldId: "quantity", value: 0 });
                            fulfillmentRecord.commitLine({ sublistId: SUBLIST_ITEM });
                        }
                    } else {
                        // Líneas que no queremos procesar: Vaciar y desmarcar
                        this._vaciarSubregistro(fulfillmentRecord);
                        fulfillmentRecord.setCurrentSublistValue({ sublistId: SUBLIST_ITEM, fieldId: "itemreceive", value: false });
                        // fulfillmentRecord.setCurrentSublistValue({ sublistId: SUBLIST_ITEM, fieldId: "quantity", value: 0 });
                        fulfillmentRecord.commitLine({ sublistId: SUBLIST_ITEM });
                    }
                }

                if (asignadas === 0) return null;

                return fulfillmentRecord.save({ enableSourcing: true, ignoreMandatoryFields: true });
            } catch (e) {
                nLog.error(`createPartialFulfillment — OV ${salesOrderId}`, e);
                throw e;
            }
        }

        updateLines(fulfillmentId, linesToFulfill, salesOrderId = null, isAutoPicking = false) {
            try {
                const fulfillmentRecord = record.load({
                    type: this.recordType,
                    id: fulfillmentId,
                    isDynamic: true
                });

                const lineCount = fulfillmentRecord.getLineCount({ sublistId: SUBLIST_ITEM });
                const linesMap = new Map(linesToFulfill.map((l) => [String(l.line), l]));
                const currentQtyMap = new Map();

                for (let i = 0; i < lineCount; i++) {
                    fulfillmentRecord.selectLine({ sublistId: SUBLIST_ITEM, line: i });
                    currentQtyMap.set(
                        String(fulfillmentRecord.getCurrentSublistValue({ sublistId: SUBLIST_ITEM, fieldId: "orderline" })),
                        parseFloat(fulfillmentRecord.getCurrentSublistValue({ sublistId: SUBLIST_ITEM, fieldId: "quantity" }) || 0)
                    );
                }

                const lineasNuevasFulfillment = [];
                if (isAutoPicking) this._precargarInventario(linesToFulfill);

                let asignadas = 0;

                for (let i = 0; i < lineCount; i++) {
                    fulfillmentRecord.selectLine({ sublistId: SUBLIST_ITEM, line: i });
                    const orderline = String(fulfillmentRecord.getCurrentSublistValue({ sublistId: SUBLIST_ITEM, fieldId: "orderline" }));
                    const lineToProcess = linesMap.get(orderline);

                    if (!lineToProcess) {
                        this._vaciarSubregistro(fulfillmentRecord);
                        fulfillmentRecord.setCurrentSublistValue({ sublistId: SUBLIST_ITEM, fieldId: "itemreceive", value: false });
                        fulfillmentRecord.setCurrentSublistValue({ sublistId: SUBLIST_ITEM, fieldId: "quantity", value: 0 });
                        fulfillmentRecord.commitLine({ sublistId: SUBLIST_ITEM });
                        continue;
                    }

                    const qtyActual = currentQtyMap.get(orderline) || 0;
                    const qtyNueva = parseFloat(lineToProcess.quantity) || 0;
                    const diferencia = qtyNueva - qtyActual;

                    fulfillmentRecord.setCurrentSublistValue({ sublistId: SUBLIST_ITEM, fieldId: "itemreceive", value: true });

                    if (diferencia > EPSILON) {
                        fulfillmentRecord.setCurrentSublistValue({ sublistId: SUBLIST_ITEM, fieldId: "quantity", value: qtyActual });
                        lineasNuevasFulfillment.push({ ...lineToProcess, quantity: diferencia, fulfillments: [] });
                    } else {
                        fulfillmentRecord.setCurrentSublistValue({ sublistId: SUBLIST_ITEM, fieldId: "quantity", value: qtyNueva });
                    }

                    const itemId = fulfillmentRecord.getCurrentSublistValue({ sublistId: SUBLIST_ITEM, fieldId: "item" });
                    const locationId = fulfillmentRecord.getCurrentSublistValue({ sublistId: SUBLIST_ITEM, fieldId: "location" });
                    const qty = fulfillmentRecord.getCurrentSublistValue({ sublistId: SUBLIST_ITEM, fieldId: "quantity" });

                    // VERIFICACIÓN PREVENTIVA: Verificar stock disponible ANTES de tocar el inventorydetail
                    if (isAutoPicking) {
                        const cacheKey = `${itemId}|${locationId}`;
                        const lotesDisponibles = (this._inventarioCache.get(cacheKey) || []).filter((l) => l.disponible > 0);
                        const stockTotal = lotesDisponibles.reduce((sum, l) => sum + l.disponible, 0);

                        if (stockTotal <= 0) {
                            // No hay stock: desmarcar línea SIN tocar el inventorydetail
                            nLog.audit(
                                `Línea desmarcada en Fulfillment ${fulfillmentId}`,
                                `Artículo ${itemId}: Sin stock físico en caché para AutoPicking: Artículo ${itemId} en Locación ${locationId}.`
                            );
                            fulfillmentRecord.setCurrentSublistValue({ sublistId: SUBLIST_ITEM, fieldId: "itemreceive", value: false });
                            fulfillmentRecord.setCurrentSublistValue({ sublistId: SUBLIST_ITEM, fieldId: "quantity", value: 0 });
                            fulfillmentRecord.commitLine({ sublistId: SUBLIST_ITEM });
                            if (diferencia > EPSILON) lineasNuevasFulfillment.pop();
                            continue; // Saltar al siguiente artículo sin modificar el subregistro
                        }
                    }

                    try {
                        this._procesarInventoryDetail(fulfillmentRecord, lineToProcess, itemId, locationId, qty, isAutoPicking);
                        fulfillmentRecord.commitLine({ sublistId: SUBLIST_ITEM });
                        asignadas++;
                    } catch (e) {
                        // Limpieza segura en caso de error
                        fulfillmentRecord.setCurrentSublistValue({ sublistId: SUBLIST_ITEM, fieldId: "itemreceive", value: false });
                        fulfillmentRecord.setCurrentSublistValue({ sublistId: SUBLIST_ITEM, fieldId: "quantity", value: 0 });
                        fulfillmentRecord.commitLine({ sublistId: SUBLIST_ITEM });

                        if (diferencia > EPSILON) lineasNuevasFulfillment.pop();
                    }
                }

                let updatedId = fulfillmentId;
                if (asignadas === 0) {
                    this.deleteById(fulfillmentId);
                    updatedId = null;
                } else {
                    fulfillmentRecord.save({ enableSourcing: true, ignoreMandatoryFields: true });
                }

                let createdId = null;
                if (lineasNuevasFulfillment.length > 0) {
                    if (!salesOrderId) throw new Error("Falta `salesOrderId` para el nuevo fulfillment.");
                    createdId = this.createPartialFulfillment(salesOrderId, lineasNuevasFulfillment, isAutoPicking);
                }

                return { updated: updatedId, created: createdId };
            } catch (e) {
                nLog.error(`updateLines — Fulfillment ${fulfillmentId}`, e);
                throw e;
            }
        }

        // ══════════════════════════════════════════════════════════════════════
        // RESTO DEL CRUD
        // ══════════════════════════════════════════════════════════════════════

        getById(id) {
            try {
                return record.load({ type: this.recordType, id, isDynamic: true });
            } catch (e) {
                if (e.name === "RCRD_DSNT_EXIST") return null;
                throw e;
            }
        }

        update(id, data) {
            try {
                const rec = this.getById(id);
                if (!rec) throw new Error(`El registro con ID ${id} no existe.`);
                Object.keys(data).forEach((fieldId) => rec.setValue({ fieldId, value: data[fieldId] }));
                return rec.save({ enableSourcing: true, ignoreMandatoryFields: true });
            } catch (e) {
                throw e;
            }
        }

        deleteById(id) {
            try {
                record.delete({ type: this.recordType, id });
            } catch (e) {
                throw e;
            }
        }

        search(filters = [], columns = []) {
            try {
                const results = [];
                search
                    .create({ type: this.recordType, filters, columns })
                    .run()
                    .each((r) => {
                        results.push(r);
                        return true;
                    });
                return results;
            } catch (e) {
                throw e;
            }
        }

        findFulfillmentsBySalesOrder(salesOrderId) {
            const filters = [["createdfrom", "anyof", salesOrderId], "AND", ["mainline", "is", "T"]];
            const columns = ["internalid", "statusref", "custbody_2win_auto_seleccion"];

            return this.search(filters, columns).map((r) => ({
                id: r.getValue("internalid"),
                status: r.getValue("statusref"),
                autopicking: r.getValue("custbody_2win_auto_seleccion") === "T"
            }));
        }

        /**
         * Remueve una línea específica de un Item Fulfillment desmarcando su check de recepción.
         * Si el Fulfillment queda sin líneas a recibir, elimina el registro completo.
         * * @param {string|number} fulfillmentId - Internal ID del Item Fulfillment
         * @param {string|number} lineId - Identificador de la línea (orderline) a remover
         * @returns {number} El Internal ID del registro guardado o eliminado
         */
        removeLine(fulfillmentId, lineId) {
            try {
                const fulfillmentRecord = record.load({
                    type: this.recordType,
                    id: fulfillmentId,
                    isDynamic: true
                });

                const lineCount = fulfillmentRecord.getLineCount({ sublistId: SUBLIST_ITEM });
                let countReceive = 0;

                for (let i = 0; i < lineCount; i++) {
                    fulfillmentRecord.selectLine({ sublistId: SUBLIST_ITEM, line: i });

                    const orderline = fulfillmentRecord.getCurrentSublistValue({
                        sublistId: SUBLIST_ITEM,
                        fieldId: "orderline"
                    });

                    // Usamos la comparación estricta asegurando que ambos sean números
                    if (Number(lineId) === Number(orderline)) {
                        // Vaciar subregistro (Inventory Detail) si aplica
                        // if (typeof this._vaciarSubregistro === "function") {
                        //     this._vaciarSubregistro(fulfillmentRecord);
                        // }

                        fulfillmentRecord.setCurrentSublistValue({
                            sublistId: SUBLIST_ITEM,
                            fieldId: "itemreceive",
                            value: false
                        });

                        // Al desmarcar itemreceive, la cantidad suele setearse a 0 automáticamente,
                        // pero forzarlo es una buena medida de seguridad.
                        // fulfillmentRecord.setCurrentSublistValue({
                        //     sublistId: SUBLIST_ITEM,
                        //     fieldId: "quantity",
                        //     value: 0
                        // });
                    } else {
                        // Verificar si hay otras líneas que sí se van a cumplir
                        const isReceive = fulfillmentRecord.getCurrentSublistValue({
                            sublistId: SUBLIST_ITEM,
                            fieldId: "itemreceive"
                        });

                        // Aseguramos la evaluación del booleano
                        if (isReceive === true || isReceive === "T") {
                            countReceive++;
                        }
                    }

                    fulfillmentRecord.commitLine({ sublistId: SUBLIST_ITEM });
                }

                // Si no quedan líneas para cumplir, eliminamos la ejecución para evitar registros vacíos u obsoletos
                if (countReceive === 0) {
                    record.delete({ type: this.recordType, id: fulfillmentId });
                    nLog.audit("Fulfillment Eliminado", `ID: ${fulfillmentId} eliminado porque no quedaron líneas válidas.`);
                    return fulfillmentId;
                }

                // Guardar el registro modificado
                const idGuardado = fulfillmentRecord.save({
                    enableSourcing: true,
                    ignoreMandatoryFields: true
                });

                return idGuardado;
            } catch (e) {
                nLog.error("Error en removeLine", `Fulfillment ID: ${fulfillmentId} | Error: ${e.message}`);
                throw e; // Relanza el error si necesitas manejarlo en el nivel superior
            }
        }
    }

    return ItemFulfillmentDao;
});
