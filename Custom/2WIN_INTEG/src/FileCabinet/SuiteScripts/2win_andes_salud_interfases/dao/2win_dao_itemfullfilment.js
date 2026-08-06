/**
 * @NApiVersion 2.1
 * @NModuleScope SameAccount
 *
 * @description DAO para Item Fulfillment.
 *              El inventorydetail se copia siempre desde la línea correspondiente
 *              de la OV (fuente de verdad). El auto-picking se usa SOLO como
 *              fallback opcional cuando la OV no tiene detalle o éste es insuficiente.
 *              Validación previa en bloque (LBYL) + defensa al guardar (EAFP).
 */
define(["N/record", "N/search", "N/log", "N/query", "N/format"], (record, search, nLog, query, format) => {
    // ─── Constantes ────────────────────────────────────────────────────────────
    const EPSILON = 0.00001;
    const SUBLIST_ITEM = "item";
    const SUBLIST_INV = "inventoryassignment";
    const FIELD_INV_DETAIL = "inventorydetail";

    class ItemFulfillmentDao {
        constructor() {
            this.recordType = record.Type.ITEM_FULFILLMENT;
        }

        // ══════════════════════════════════════════════════════════════════════
        // LBYL — Validación física de stock en bloque
        // ══════════════════════════════════════════════════════════════════════

        /**
         * Verifica que TODOS los lotes requeridos tengan stock físico real en la
         * locación indicada, en una única consulta SuiteQL.
         * @param {Array} linesToProcess  - líneas con inventoryDetail poblado
         * @param {number} locationId    - locación a validar
         * @throws {Error} si hay lotes con stock insuficiente
         */
        _validarStockLotesEnBloque(linesToProcess, locationId, fechaReferencia = null) {
            const idsLotes = new Set();
            const idsItems = new Set();
            const lotesRequeridos = [];

            for (const linea of linesToProcess) {
                if (!linea.inventoryDetail) continue;
                const invDetail = linea.inventoryDetail;
                const lineCount = invDetail.getLineCount({ sublistId: SUBLIST_INV });
                for (let j = 0; j < lineCount; j++) {
                    const lotId = invDetail.getSublistValue({ sublistId: SUBLIST_INV, fieldId: "issueinventorynumber", line: j });
                    const qty = parseFloat(invDetail.getSublistValue({ sublistId: SUBLIST_INV, fieldId: "quantity", line: j }) || 0);
                    if (lotId && qty > 0) {
                        idsLotes.add(Number(lotId));
                        idsItems.add(Number(linea.item));
                        lotesRequeridos.push({
                            item: Number(linea.item),
                            loteId: Number(lotId),
                            qtyRequired: qty,
                            lineaPadre: linea.line
                        });
                    }
                }
            }
            if (idsLotes.size === 0) return true;

            const fechaFiltro = fechaReferencia ? (fechaReferencia instanceof Date ? format.format({ value: fechaReferencia, type: format.Type.DATE }) : fechaReferencia) : "CURRENT_DATE";

            const suiteQL = `
                    SELECT
                        invNum.id AS inventorynumber,
                        item.id AS item,
                        invNumLoc.quantityavailable
                    FROM
                        Item item
                        INNER JOIN InventoryNumber invNum ON invNum.item = item.id
                        INNER JOIN InventoryNumberLocation invNumLoc ON invNumLoc.inventorynumber = invNum.id
                        LEFT JOIN Location loc ON invNumLoc.location = loc.id
                        INNER JOIN InventoryNumberInventoryBalance as invNumIb on invNumIb.inventorynumber = invNum.id
                        and invNumIb.location = invNumLoc.location
                        and invNumIb.inventoryStatus IS NOT NULL
                    WHERE
                        invNum.id IN (${[...idsLotes].join(",")})
                        AND loc.id = ${Number(locationId)}
                        AND item.id IN (${[...idsItems].join(",")})
                        AND invNumLoc.quantityavailable > 0
                        AND (
                            ${fechaFiltro === "CURRENT_DATE" ? "CURRENT_DATE" : `'${fechaFiltro}'`} < invNum.expirationdate
                            OR invNum.expirationdate IS NULL
                        )
            `;
            const resultados = query.runSuiteQL({ query: suiteQL }).asMappedResults();

            const mapaStockReal = new Map();
            for (const r of resultados) {
                mapaStockReal.set(`${r.item}|${r.inventorynumber}`, parseFloat(r.quantityavailable || 0));
            }

            const errores = [];
            const consumoAcumulado = new Map();
            for (const req of lotesRequeridos) {
                const key = `${req.item}|${req.loteId}`;
                const stockReal = mapaStockReal.get(key) || 0;
                const consumido = (consumoAcumulado.get(key) || 0) + req.qtyRequired;
                consumoAcumulado.set(key, consumido);
                if (consumido > stockReal) {
                    errores.push(`Línea ${req.lineaPadre}: Lote ID ${req.loteId} requiere ${consumido} pero solo tiene ${stockReal} disponible.`);
                }
            }
            if (errores.length > 0) {
                throw new Error(`Validación Previa LBYL Fallida:\n${errores.join("\n")}`);
            }
            return true;
        }

        // ══════════════════════════════════════════════════════════════════════
        // SNAPSHOT — Copia del estado actual del subregistro
        // ══════════════════════════════════════════════════════════════════════

        _tomarSnapshot(subRecord) {
            const lineas = [];
            const count = subRecord.getLineCount({ sublistId: SUBLIST_INV });
            for (let j = 0; j < count; j++) {
                const inventorystatus = subRecord.getSublistValue({ sublistId: SUBLIST_INV, fieldId: "inventorystatus", line: j });
                if (!inventorystatus) continue;
                lineas.push({
                    inventorynumber: subRecord.getSublistValue({ sublistId: SUBLIST_INV, fieldId: "issueinventorynumber", line: j }),
                    binnumber: subRecord.getSublistValue({ sublistId: SUBLIST_INV, fieldId: "binnumber", line: j }),
                    inventorystatus: inventorystatus,
                    qty: parseFloat(subRecord.getSublistValue({ sublistId: SUBLIST_INV, fieldId: "quantity", line: j }) || 0)
                });
            }
            return lineas;
        }

        /**
         * Extrae el snapshot de lotes/bins desde un subrecord de inventorydetail
         * ya cargado en memoria (proveniente de la OV leída por el caller).
         * Evita un record.load adicional — el AutoPickingManager ya tiene la OV
         * en memoria y pasa el inventoryDetail directamente en el objeto de línea.
         *
         * @param {object} inventoryDetailSubrecord - subrecord inventorydetail en memoria
         * @returns {Array} snapshot con { inventorynumber, binnumber, inventorystatus, qty }
         */
        _extraerSnapshotDeSubrecord(inventoryDetailSubrecord) {
            if (!inventoryDetailSubrecord) return [];
            try {
                return this._tomarSnapshot(inventoryDetailSubrecord);
            } catch (e) {
                nLog.debug("_extraerSnapshotDeSubrecord", `No se pudo leer el subrecord: ${e.message}`);
                return [];
            }
        }

        _limpiarSubregistro(fulfillmentRecord) {
            if (!fulfillmentRecord.hasCurrentSublistSubrecord({ sublistId: SUBLIST_ITEM, fieldId: FIELD_INV_DETAIL })) {
                return;
            }
            const sub = fulfillmentRecord.getCurrentSublistSubrecord({ sublistId: SUBLIST_ITEM, fieldId: FIELD_INV_DETAIL });
            const count = sub.getLineCount({ sublistId: SUBLIST_INV });
            for (let j = count - 1; j >= 0; j--) {
                sub.removeLine({ sublistId: SUBLIST_INV, line: j, ignoreRecalc: true });
            }
        }
        _removerSubregistro(fulfillmentRecord) {
            if (fulfillmentRecord.hasCurrentSublistSubrecord({ sublistId: SUBLIST_ITEM, fieldId: FIELD_INV_DETAIL })) {
                fulfillmentRecord.removeCurrentSublistSubrecord({ sublistId: SUBLIST_ITEM, fieldId: FIELD_INV_DETAIL });
            }
        }

        // ══════════════════════════════════════════════════════════════════════
        // ERROR PARSING — Detección y extracción de lotes desde errores de inventario
        // ══════════════════════════════════════════════════════════════════════

        /**
         * Determina si un error capturado en save() corresponde a una validación
         * de inventario insuficiente. Verifica múltiples fuentes del objeto Error
         * porque SuiteScript 2.x puede envolver/truncar el mensaje o entregar solo
         * el código en `error.name` / `error.cause.code`.
         *
         * @param {Error} error
         * @returns {boolean}
         */
        _esErrorDeInventario(error) {
            const ERROR_CODES_INVENTARIO = ["INVENTORY_BALANCE_AVAILABLE_QUANTITY_VALIDATION", "INSUFFICIENT_INVENTORY", "INVENTORY_NUMBERS_REQUIRED"];
            const ERROR_MESSAGES_INVENTARIO = ["Inventario números", "Inventory numbers", "On Hand", "suficiente inventario disponible", "Not enough inventory available"];

            // 1. Verificar error.name (código del error SuiteScript)
            if (error.name && ERROR_CODES_INVENTARIO.some((code) => error.name.includes(code))) return true;

            // 2. Verificar error.message (compatibilidad retroactiva)
            if (error.message && ERROR_MESSAGES_INVENTARIO.some((msg) => error.message.includes(msg))) return true;

            // 3. Verificar error.cause.code y error.cause.details (estructura anidada)
            const cause = error.cause;
            if (cause) {
                if (cause.code && ERROR_CODES_INVENTARIO.some((code) => cause.code.includes(code))) return true;
                if (cause.details && ERROR_MESSAGES_INVENTARIO.some((msg) => cause.details.includes(msg))) return true;
            }

            return false;
        }

        /**
         * Extrae los números de lote mencionados en un error de inventario.
         * Busca en `error.message` y `error.cause.details` usando el patrón
         * "Número de inventario:" / "Number:".
         *
         * @param {Error} error
         * @returns {Set<string>} Conjunto de lotes a excluir
         */
        _extraerLotesDeError(error) {
            const lotes = new Set();
            const regex = /(?:Number:|Número de inventario:)\s*([^,\]\[\n\r\-]+)/g;

            const textos = [error.message];
            if (error.cause && error.cause.details) {
                textos.push(error.cause.details);
            }

            for (const texto of textos) {
                if (!texto) continue;
                const matches = [...texto.matchAll(regex)];
                matches.forEach((m) => lotes.add(m[1].trim()));
            }

            return lotes;
        }

        // ══════════════════════════════════════════════════════════════════════
        // ASIGNACIÓN — Snapshot (preferida) → Auto-Picking (fallback)
        // ══════════════════════════════════════════════════════════════════════

        /**
         * Reasigna inventario usando el snapshot original de lotes/bins.
         * La última línea absorbe el remanente exacto (evita errores de redondeo).
         * @throws {Error} si el snapshot no cubre la cantidad requerida
         */
        _asignarDesdeSnapshot(subRecord, lineasActuales, qtyRequired) {
            let remaining = parseFloat(qtyRequired);
            for (let j = 0; j < lineasActuales.length; j++) {
                if (remaining <= EPSILON) break;
                const lote = lineasActuales[j];
                const esUltimo = j === lineasActuales.length - 1;
                const assignedQty = esUltimo ? remaining : Math.min(lote.qty, remaining);
                if (assignedQty <= EPSILON) continue;
                if (!lote.inventorystatus) continue;
                try {
                    subRecord.selectNewLine({ sublistId: SUBLIST_INV });
                    if (lote.inventorynumber) {
                        subRecord.setCurrentSublistValue({ sublistId: SUBLIST_INV, fieldId: "issueinventorynumber", value: lote.inventorynumber });
                    }
                    if (lote.binnumber) {
                        subRecord.setCurrentSublistValue({ sublistId: SUBLIST_INV, fieldId: "binnumber", value: lote.binnumber });
                    }
                    if (lote.inventorystatus) {
                        subRecord.setCurrentSublistValue({ sublistId: SUBLIST_INV, fieldId: "inventorystatus", value: lote.inventorystatus });
                    }
                    subRecord.setCurrentSublistValue({ sublistId: SUBLIST_INV, fieldId: "quantity", value: assignedQty });
                    subRecord.commitLine({ sublistId: SUBLIST_INV });
                    remaining -= assignedQty;
                } catch (loteError) {
                    nLog.audit("Snapshot - Lote saltado", `Lote ${lote.inventorynumber}: ${loteError.message}`);
                    continue;
                }
            }
            if (remaining > EPSILON) {
                throw new Error(`Snapshot insuficiente: quedan ${remaining} uds sin asignar.`);
            }
        }

        // ══════════════════════════════════════════════════════════════════════
        // STOCK CACHE — Carga en bloque (1 consulta por OV) para Auto-Picking
        // ══════════════════════════════════════════════════════════════════════

        /**
         * Carga TODOS los lotes disponibles para un conjunto de ítems y locaciones
         * en una ÚNICA consulta SuiteQL. Orden FEFO (vencimiento ascendente) para
         * que el consumo sea determinista.
         *
         * @param {Array<number>} itemIds
         * @param {Array<number>} locationIds
         * @param {Date|string|null} fechaReferencia - Fecha para validar vencimiento (default: CURRENT_DATE)
         * @returns {Map<string, Array>} Mapa clave "item|location" → lotes disponibles
         */
        _cargarStockDisponibleEnBloque(itemIds, locationIds, fechaReferencia = null) {
            const stockMap = new Map();
            if (!itemIds.length || !locationIds.length) return stockMap;

            const fechaFiltro = fechaReferencia ? (fechaReferencia instanceof Date ? format.format({ value: fechaReferencia, type: format.Type.DATE }) : fechaReferencia) : "CURRENT_DATE";

            const sql = `
                    SELECT
                        item.id AS item,
                        loc.id AS location,
                        invNum.id AS inventorynumber,
                        invNum.inventorynumber AS inventorynumbertext,
                        '' AS binnumber,
                        invNumIb.inventoryStatus,
                        invNumLoc.quantityavailable
                    FROM
                        Item item
                        INNER JOIN InventoryNumber invNum ON invNum.item = item.id
                        INNER JOIN InventoryNumberLocation invNumLoc ON invNumLoc.inventorynumber = invNum.id
                        LEFT JOIN Location loc ON invNumLoc.location = loc.id
                        INNER JOIN InventoryNumberInventoryBalance AS invNumIb ON invNumIb.inventorynumber = invNum.id
                            AND invNumIb.location = invNumLoc.location
                            AND invNumIb.inventoryStatus IS NOT NULL
                    WHERE
                        item.id IN (${itemIds.join(",")})
                        AND loc.id IN (${locationIds.join(",")})
                        AND invNumLoc.quantityavailable > 0
                        AND (
                            ${fechaFiltro === "CURRENT_DATE" ? "CURRENT_DATE" : `'${fechaFiltro}'`} < invNum.expirationdate
                            OR invNum.expirationdate IS NULL
                        )
                    ORDER BY
                        invNum.expirationdate ASC NULLS LAST
            `;
            const results = query.runSuiteQL({ query: sql }).asMappedResults();
            for (const r of results) {
                const key = `${r.item}|${r.location}`;
                if (!stockMap.has(key)) stockMap.set(key, []);
                stockMap.get(key).push({
                    inventorynumber: r.inventorynumber,
                    inventorynumbertext: r.inventorynumbertext,
                    binnumber: r.binnumber,
                    inventorystatus: r.inventorystatus,
                    quantityavailable: parseFloat(r.quantityavailable || 0)
                });
            }
            return stockMap;
        }

        /**
         * Auto-picking: asigna inventario desde los lotes cacheados por
         * `_cargarStockDisponibleEnBloque`. Respeta el consumo acumulado entre
         * líneas y entre IFs (tracker compartido a nivel de OV) para evitar
         * sobreconsumo del mismo lote.
         *
         * @param {object} subRecord       - subrecord inventorydetail del IF
         * @param {number} itemId
         * @param {number} locationId
         * @param {number} qtyRequired
         * @param {Array}  lotesCacheados  - lotes ya cargados en bloque
         * @param {Map}    consumoTracker  - Map clave "item|inventorynumber" → consumido
         * @throws {Error} si no hay lotes o el stock es insuficiente
         */
        _asignarInventarioAutomatico(subRecord, itemId, locationId, qtyRequired, lotesCacheados, consumoTracker) {
            if (!lotesCacheados || lotesCacheados.length === 0) {
                throw new Error(`No hay stock físico para Auto-Picking del Artículo ${itemId} en Locación ${locationId}.`);
            }

            let remaining = parseFloat(qtyRequired);
            for (const lote of lotesCacheados) {
                if (remaining <= EPSILON) break;
                const key = `${itemId}|${lote.inventorynumber}`;
                const consumido = consumoTracker.get(key) || 0;
                const disponibleReal = lote.quantityavailable - consumido;
                const assignedQty = Math.min(disponibleReal, remaining);
                if (assignedQty <= EPSILON) continue;
                if (!lote.inventorystatus) continue;

                try {
                    subRecord.selectNewLine({ sublistId: SUBLIST_INV });
                    if (lote.inventorynumber) {
                        subRecord.setCurrentSublistValue({ sublistId: SUBLIST_INV, fieldId: "issueinventorynumber", value: lote.inventorynumber });
                    }
                    if (lote.binnumber) {
                        subRecord.setCurrentSublistValue({ sublistId: SUBLIST_INV, fieldId: "binnumber", value: lote.binnumber });
                    }
                    if (lote.inventorystatus) {
                        subRecord.setCurrentSublistValue({ sublistId: SUBLIST_INV, fieldId: "inventorystatus", value: lote.inventorystatus });
                    }
                    subRecord.setCurrentSublistValue({ sublistId: SUBLIST_INV, fieldId: "quantity", value: assignedQty });
                    subRecord.commitLine({ sublistId: SUBLIST_INV });

                    consumoTracker.set(key, consumido + assignedQty);
                    remaining -= assignedQty;
                } catch (loteError) {
                    nLog.audit("Auto-Picking - Lote saltado", `Artículo ${itemId}, Lote ${lote.inventorynumber}: ${loteError.message}`);
                    continue;
                }
            }
            if (remaining > EPSILON) {
                throw new Error(`Stock insuficiente tras Auto-Picking. Faltan ${remaining} uds del Artículo ${itemId}.`);
            }
        }

        // ══════════════════════════════════════════════════════════════════════
        // PROCESADOR CENTRAL — Snapshot → Clean → Reassign
        // ══════════════════════════════════════════════════════════════════════

        /**
         * Limpieza → asignación del inventorydetail del IF vía Auto-Picking.
         * Usa los lotes cacheados en bloque y respeta el consumo acumulado.
         *
         * @param {object} fulfillmentRecord  - registro IF en modo dinámico (línea ya seleccionada)
         * @param {number} itemId
         * @param {number} locationId
         * @param {number} qtyToFulfill
         * @param {boolean} isAutoPicking
         * @param {Array}  snapshotOV         - snapshot de la OV (reservado para uso futuro)
         * @param {Map}    stockMap           - Map "item|location" → lotes (cache en bloque)
         * @param {Map}    consumoTracker     - Map "item|inventorynumber" → consumido (tracker OV)
         */
        _procesarInventoryDetail(fulfillmentRecord, itemId, locationId, qtyToFulfill, isAutoPicking, snapshotOV, stockMap, consumoTracker) {
            const subRecord = fulfillmentRecord.getCurrentSublistSubrecord({ sublistId: SUBLIST_ITEM, fieldId: FIELD_INV_DETAIL });
            this._limpiarSubregistro(fulfillmentRecord);

            if (snapshotOV && snapshotOV.length > 0) {
                try {
                    this._asignarDesdeSnapshot(subRecord, snapshotOV, qtyToFulfill);
                    return;
                } catch (e) {
                    nLog.audit("_procesarInventoryDetail", `Snapshot insuficiente para Artículo ${itemId}, fallback a auto-picking: ${e.message}`);
                    this._limpiarSubregistro(fulfillmentRecord);
                }
            }

            const lotesCacheados = stockMap.get(`${itemId}|${locationId}`) || [];
            this._asignarInventarioAutomatico(subRecord, itemId, locationId, qtyToFulfill, lotesCacheados, consumoTracker);
        }

        // ══════════════════════════════════════════════════════════════════════
        // PÚBLICOS — Creación / Actualización
        // ══════════════════════════════════════════════════════════════════════

        /**
         * Prepara un contexto de asignación (cache de stock + tracker de consumo)
         * compartible entre múltiples llamadas a create/update para una misma OV.
         * Evita N consultas SQL y previene sobreconsumo del mismo lote entre IFs.
         *
         * @param {Array<number>} itemIds
         * @param {Array<number>} locationIds
         * @param {Date|string|null} fechaReferencia - Fecha para validar vencimiento (default: CURRENT_DATE)
         * @returns {{ stockMap: Map, consumoTracker: Map }}
         */
        prepararContextoAsignacion(itemIds, locationIds, fechaReferencia = null) {
            return {
                stockMap: this._cargarStockDisponibleEnBloque(itemIds, locationIds, fechaReferencia),
                consumoTracker: new Map()
            };
        }

        /**
         * Obtiene la fecha de creación de cada línea de la OV desde TransactionLine.
         * Una única consulta SuiteQL por OV trae el `lineCreatedDate` de todas las líneas.
         *
         * @param {number} salesOrderId
         * @param {Array} lines - líneas pendientes (con propiedad `line`)
         * @returns {Map<string, Date>} Map "line" → lineCreatedDate
         */
        _obtenerFechasCreacionLineas(salesOrderId, lines) {
            const fechasMap = new Map();
            if (!salesOrderId || !lines || lines.length === 0) return fechasMap;

            try {
                const sql = `
                    SELECT 
                        TransactionLine.id as line, 
                        TransactionLine.lineCreatedDate
                    FROM TransactionLine
                    where  TransactionLine.id IN (${lines.map((l) => Number(l.line)).join(",")})
                    AND TransactionLine.transaction = ${Number(salesOrderId)}
                `;
                const results = query.runSuiteQL({ query: sql }).asMappedResults();
                for (const r of results) {
                    if (r.linecreateddate) {
                        const d = r.linecreateddate instanceof Date ? r.linecreateddate : format.parse({ value: r.linecreateddate, type: format.Type.DATE });
                        if (!isNaN(d.getTime())) fechasMap.set(String(r.line), d);
                    }
                }
            } catch (e) {
                nLog.error("_obtenerFechasCreacionLineas", `Error obteniendo fechas para OV ${salesOrderId}: ${e.message}`);
            }
            return fechasMap;
        }

        /**
         * Agrupa las líneas por día de creación (lineCreatedDate).
         * La fecha se normaliza a "YYYY-MM-DD" (sin hora) para que líneas
         * creadas en distintos momentos del mismo día caigan en el mismo IF.
         *
         * @param {Array} lines - líneas con propiedad `lineCreatedDate` inyectada
         * @returns {Map<string, Array>} Map "YYYY-MM-DD" → líneas de ese día
         */
        _agruparLineasPorFecha(lines) {
            const grupos = new Map();
            for (const linea of lines) {
                let fechaKey;
                if (linea.lineCreatedDate) {
                    const d = new Date(linea.lineCreatedDate);
                    fechaKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
                } else {
                    fechaKey = "SIN_FECHA";
                }
                if (!grupos.has(fechaKey)) grupos.set(fechaKey, []);
                grupos.get(fechaKey).push(linea);
            }
            return grupos;
        }

        /**
         * Crea un IF para un grupo de líneas correspondientes a un mismo día de
         * creación. Setea el `trandate` del IF con la fecha del grupo.
         *
         * @param {number} salesOrderId
         * @param {Array}  grupoLineas   - líneas pendientes de un mismo día
         * @param {boolean} isAutoPicking
         * @param {object} ctx           - { stockMap, consumoTracker }
         * @param {Date|string|null} fechaGrupo - fecha de creación de las líneas del grupo
         * @param {Date|string|null} fechaReferencia - Fecha para validar vencimiento (default: CURRENT_DATE)
         * @returns {number|null} ID del IF creado, o null si no se asignó nada
         */
        _crearIFParaGrupoFecha(salesOrderId, grupoLineas, isAutoPicking, ctx, fechaGrupo, fechaReferencia = null) {
            const defaultInventoryLocation = grupoLineas.find((l) => l.locationInfo?.id)?.locationInfo?.id;

            // LBYL: Validar stock físico antes de transformar
            if (!isAutoPicking && defaultInventoryLocation) {
                try {
                    this._validarStockLotesEnBloque(grupoLineas, defaultInventoryLocation, fechaReferencia);
                } catch (validationError) {
                    nLog.error(`Fulfillment abortado en OV ${salesOrderId} por LBYL (fecha ${fechaGrupo})`, validationError.message);
                    return null;
                }
            }

            const lotesExcluidos = new Set();
            const MAX_INTENTOS = 3;
            const itemIds = [...new Set(grupoLineas.map((l) => Number(l.item)))];
            const locIds = [...new Set(grupoLineas.map((l) => Number(l.locationInfo?.id || l.inventorylocation)).filter(Boolean))];

            for (let intento = 1; intento <= MAX_INTENTOS; intento++) {
                let ctxActual = ctx;
                if (intento > 1) {
                    ctxActual = {
                        stockMap: this._cargarStockDisponibleEnBloque(itemIds, locIds, fechaReferencia),
                        consumoTracker: new Map()
                    };
                }

                if (lotesExcluidos.size > 0) {
                    const filteredStockMap = new Map();
                    for (const [key, lotes] of ctxActual.stockMap) {
                        filteredStockMap.set(key, lotes.filter((l) => !lotesExcluidos.has(String(l.inventorynumbertext))));
                    }
                    ctxActual = { stockMap: filteredStockMap, consumoTracker: ctxActual.consumoTracker };
                }

                const fulfillmentRecord = record.transform({
                    fromType: record.Type.SALES_ORDER,
                    fromId: salesOrderId,
                    toType: this.recordType,
                    isDynamic: true,
                    defaultValues: { inventorylocation: defaultInventoryLocation }
                });

                if (fechaGrupo) {
                    try {
                        const fechaObj = fechaGrupo instanceof Date ? fechaGrupo : new Date(fechaGrupo);
                        fulfillmentRecord.setValue({ fieldId: "trandate", value: fechaObj });
                    } catch (e) {
                        nLog.audit(`No se pudo setear trandate en OV ${salesOrderId}`, e.message);
                    }
                }

                if (isAutoPicking) {
                    fulfillmentRecord.setValue({ fieldId: "shipstatus", value: "C" });
                    fulfillmentRecord.setValue({ fieldId: "custbody_2win_auto_seleccion", value: true });
                }

                const lineCount = fulfillmentRecord.getLineCount({ sublistId: SUBLIST_ITEM }) || 0;
                const linesMap = new Map(grupoLineas.map((l) => [String(l.line), l]));
                let asignadas = 0;

                for (let i = 0; i < lineCount; i++) {
                    fulfillmentRecord.selectLine({ sublistId: SUBLIST_ITEM, line: i });
                    const orderline = fulfillmentRecord.getCurrentSublistValue({ sublistId: SUBLIST_ITEM, fieldId: "orderline" });
                    const lineToProcess = linesMap.get(String(orderline));

                    if (!lineToProcess) {
                        this._removerSubregistro(fulfillmentRecord);
                        fulfillmentRecord.setCurrentSublistValue({ sublistId: SUBLIST_ITEM, fieldId: "itemreceive", value: false });
                        fulfillmentRecord.commitLine({ sublistId: SUBLIST_ITEM });
                        continue;
                    }

                    fulfillmentRecord.setCurrentSublistValue({ sublistId: SUBLIST_ITEM, fieldId: "itemreceive", value: true });

                    const itemId = fulfillmentRecord.getCurrentSublistValue({ sublistId: SUBLIST_ITEM, fieldId: "item" });
                    const locationId = fulfillmentRecord.getCurrentSublistValue({ sublistId: SUBLIST_ITEM, fieldId: "location" }) || defaultInventoryLocation;
                    const qty = fulfillmentRecord.getCurrentSublistValue({ sublistId: SUBLIST_ITEM, fieldId: "quantity" });

                    // const snapshotOV = this._extraerSnapshotDeSubrecord(lineToProcess.inventoryDetail);

                    try {
                        this._procesarInventoryDetail(fulfillmentRecord, itemId, locationId, qty, isAutoPicking, [], ctxActual.stockMap, ctxActual.consumoTracker);
                        fulfillmentRecord.commitLine({ sublistId: SUBLIST_ITEM });
                        asignadas++;
                    } catch (e) {
                        nLog.audit(`Línea desmarcada en OV ${salesOrderId}`, `Artículo ${itemId}: ${e.message}`);
                        this._removerSubregistro(fulfillmentRecord);
                        fulfillmentRecord.setCurrentSublistValue({ sublistId: SUBLIST_ITEM, fieldId: "itemreceive", value: false });
                        fulfillmentRecord.commitLine({ sublistId: SUBLIST_ITEM });
                    }
                }

                if (asignadas === 0) return null;

                try {
                    return fulfillmentRecord.save({ enableSourcing: true, ignoreMandatoryFields: true });
                } catch (saveError) {
                    if (!this._esErrorDeInventario(saveError)) throw saveError;

                    const lotesDelError = this._extraerLotesDeError(saveError);
                    if (lotesDelError.size === 0) {
                        nLog.audit(`Error de inventario sin lotes parseables en OV ${salesOrderId} (fecha ${fechaGrupo})`, `name: ${saveError.name} | message: ${saveError.message}`);
                        return null;
                    }

                    lotesDelError.forEach((l) => lotesExcluidos.add(l));
                    nLog.audit(`Intento ${intento}/${MAX_INTENTOS} fallido en OV ${salesOrderId} (fecha ${fechaGrupo})`, `Lotes excluidos: ${[...lotesExcluidos].join(", ")}`);
                }
            }

            return null;
        }

        /**
         * Crea uno o más IFs parciales transformando desde la OV.
         *
         * [CAMBIO] Las líneas pendientes se agrupan por día de creación
         * (TransactionLine.lineCreatedDate) y se crea un IF independiente por
         * cada día, seteando su `trandate` con la fecha correspondiente.
         *
         * Las líneas que ya tienen un fulfillment asociado (fulfillments.length > 0)
         * se actualizan en sus IFs existentes vía updateLines y NO se incluyen en el
         * transform. Solo se crean IFs nuevos para líneas verdaderamente pendientes
         * (fulfillments.length === 0).
         *
         * @returns {Array<number>|null} Array de IDs de IFs creados, o null si no se creó ninguno
         */
        createPartialFulfillment(salesOrderId, linesToFulfill, isAutoPicking = false, ctxAsignacion = null, fechaReferencia = null) {
            try {
                // ── Contexto de asignación: cache de stock + tracker de consumo ───────
                // Si el caller (AutoPickingManager) pasa ctxAsignacion, se comparte a
                // nivel de OV; si no, se crea uno local para esta llamada.
                const allItemIds = [...new Set(linesToFulfill.map((l) => Number(l.item)))];
                const allLocIdsRaw = linesToFulfill.map((l) => l.locationInfo?.id || l.inventorylocation).filter(Boolean);
                const allLocationIds = [...new Set(allLocIdsRaw.map(Number))];
                const ctx = ctxAsignacion ?? {
                    stockMap: this._cargarStockDisponibleEnBloque(allItemIds, allLocationIds, fechaReferencia),
                    consumoTracker: new Map()
                };

                // ── Separar líneas: nuevas vs. con IF existente ──────────────────────
                const pendingLines = linesToFulfill.filter((l) => l.fulfillments.length === 0);
                const linesWithFulfillment = linesToFulfill.filter((l) => l.fulfillments.length > 0);

                // Actualizar IFs existentes para líneas que ya tienen fulfillment
                // y cuya cantidad en la OV es mayor a la ya fulfillada.
                if (linesWithFulfillment.length > 0) {
                    // Agrupar por fulfillment ID para hacer una sola llamada por IF
                    const fulfillmentUpdateMap = new Map();
                    for (const linea of linesWithFulfillment) {
                        for (const fulf of linea.fulfillments) {
                            const fId = fulf.id;
                            if (!fulfillmentUpdateMap.has(fId)) {
                                fulfillmentUpdateMap.set(fId, []);
                            }
                            fulfillmentUpdateMap.get(fId).push({
                                ...linea,
                                // quantity en linesToFulfill es la cantidad OBJETIVO total
                                // para esta línea de OV en este IF específico
                                quantity: linea.quantity
                            });
                        }
                    }
                    for (const [fId, lines] of fulfillmentUpdateMap) {
                        try {
                            this.updateLines(fId, lines, salesOrderId, isAutoPicking, false, ctx, fechaReferencia);
                        } catch (e) {
                            nLog.error(`createPartialFulfillment — error actualizando IF existente ${fId} en OV ${salesOrderId}`, e.message);
                        }
                    }
                }
                // ─────────────────────────────────────────────────────────────────────

                if (pendingLines.length === 0) return null;

                // ── [NUEVO] Obtener fechas de creación de líneas y agrupar por día ────
                const fechasCreacion = this._obtenerFechasCreacionLineas(salesOrderId, pendingLines);
                for (const linea of pendingLines) {
                    const fecha = fechasCreacion.get(String(linea.line));
                    if (fecha) {
                        linea.lineCreatedDate = fecha;
                    }
                }

                const gruposPorFecha = this._agruparLineasPorFecha(pendingLines);

                // ── [NUEVO] Crear un IF por cada grupo de fecha ───────────────────────
                const idsCreados = [];
                for (const [fechaKey, grupoLineas] of gruposPorFecha) {
                    const fechaGrupo = fechaKey === "SIN_FECHA" ? null : fechaKey;
                    try {
                        const ifId = this._crearIFParaGrupoFecha(salesOrderId, grupoLineas, isAutoPicking, ctx, fechaGrupo, fechaReferencia);
                        if (ifId) idsCreados.push(ifId);
                    } catch (e) {
                        nLog.error(`createPartialFulfillment — error creando IF para fecha ${fechaKey} en OV ${salesOrderId}`, e.message);
                    }
                }

                return idsCreados.length > 0 ? idsCreados : null;
            } catch (e) {
                nLog.error(`createPartialFulfillment — OV ${salesOrderId}`, e);
                throw e;
            }
        }

        /**
         * Actualiza líneas de un IF existente. Sigue el patrón del fix_overship:
         * snapshot → set cantidad → clean → reassign snapshot (fallback auto-picking).
         *
         * [CAMBIO] Si la cantidad nueva (line.quantity) es MAYOR a la actual del IF,
         * se actualiza directamente la línea en el mismo IF con la cantidad completa.
         * Ya NO se genera un IF adicional para el excedente cuando la línea ya tiene
         * fulfillment asociado — ese caso se resuelve aquí mismo.
         */
        updateLines(fulfillmentId, linesToFulfill, salesOrderId = null, isAutoPicking = false, forceStatusDowngrade = false, ctxAsignacion = null, fechaReferencia = null) {
            try {
                const itemIds = [...new Set(linesToFulfill.map((l) => Number(l.item)))];
                const locIdsRaw = linesToFulfill.map((l) => l.locationInfo?.id || l.inventorylocation).filter(Boolean);
                const lotesExcluidos = new Set();
                const MAX_INTENTOS = 3;

                for (let intento = 1; intento <= MAX_INTENTOS; intento++) {
                    let stockMapActual = ctxAsignacion?.stockMap ?? this._cargarStockDisponibleEnBloque(itemIds, locIdsRaw.length > 0 ? [...new Set(locIdsRaw.map(Number))] : [], fechaReferencia);
                    let consumoTrackerActual = ctxAsignacion?.consumoTracker ?? new Map();

                    if (intento > 1) {
                        const locIds = locIdsRaw.length > 0 ? [...new Set(locIdsRaw.map(Number))] : [];
                        stockMapActual = this._cargarStockDisponibleEnBloque(itemIds, locIds, fechaReferencia);
                        consumoTrackerActual = new Map();
                    }

                    if (lotesExcluidos.size > 0) {
                        const filteredStockMap = new Map();
                        for (const [key, lotes] of stockMapActual) {
                            filteredStockMap.set(key, lotes.filter((l) => !lotesExcluidos.has(String(l.inventorynumbertext))));
                        }
                        stockMapActual = filteredStockMap;
                    }

                    const fulfillmentRecord = record.load({ type: this.recordType, id: fulfillmentId, isDynamic: true });

                    let originalStatus = null;
                    if (forceStatusDowngrade) {
                        originalStatus = fulfillmentRecord.getValue({ fieldId: "shipstatus" });
                        if (originalStatus === "C") {
                            fulfillmentRecord.setValue({ fieldId: "shipstatus", value: "B" });
                        }
                    }

                    const defaultInventoryLocation = fulfillmentRecord.getValue({ fieldId: "location" });

                    // ── LBYL Snapshot: validar lotes originales de la OV ──
                    const linesWithSnapshot = linesToFulfill.filter((l) => l.inventoryDetail);
                    if (linesWithSnapshot.length > 0 && defaultInventoryLocation) {
                        try {
                            this._validarStockLotesEnBloque(linesWithSnapshot, defaultInventoryLocation, fechaReferencia);
                        } catch (validationError) {
                            nLog.audit(`LBYL Snapshot en IF ${fulfillmentId} (intento ${intento})`, validationError.message);
                        }
                    }

                    const lineCount = fulfillmentRecord.getLineCount({ sublistId: SUBLIST_ITEM });
                    const linesMap = new Map(linesToFulfill.map((l) => [String(l.line), l]));
                    let asignadas = 0;

                    for (let i = 0; i < lineCount; i++) {
                        fulfillmentRecord.selectLine({ sublistId: SUBLIST_ITEM, line: i });
                        const orderline = String(fulfillmentRecord.getCurrentSublistValue({ sublistId: SUBLIST_ITEM, fieldId: "orderline" }));
                        const lineToProcess = linesMap.get(orderline);

                        if (!lineToProcess) {
                            this._removerSubregistro(fulfillmentRecord);
                            fulfillmentRecord.setCurrentSublistValue({ sublistId: SUBLIST_ITEM, fieldId: "itemreceive", value: false });
                            fulfillmentRecord.commitLine({ sublistId: SUBLIST_ITEM });
                            continue;
                        }

                        const qtyNueva = parseFloat(lineToProcess.quantity) || 0;

                        fulfillmentRecord.setCurrentSublistValue({ sublistId: SUBLIST_ITEM, fieldId: "quantity", value: qtyNueva });
                        fulfillmentRecord.setCurrentSublistValue({ sublistId: SUBLIST_ITEM, fieldId: "itemreceive", value: true });

                        const itemId = fulfillmentRecord.getCurrentSublistValue({ sublistId: SUBLIST_ITEM, fieldId: "item" });
                        const locationId = fulfillmentRecord.getCurrentSublistValue({ sublistId: SUBLIST_ITEM, fieldId: "location" }) || defaultInventoryLocation;
                        const qty = fulfillmentRecord.getCurrentSublistValue({ sublistId: SUBLIST_ITEM, fieldId: "quantity" });

                        // ── LBYL Auto-Picking: pre-validar stock del cache ──
                        const lotesAuto = stockMapActual.get(`${itemId}|${locationId}`) || [];
                        const totalDisponible = lotesAuto.reduce((sum, l) => {
                            const consumido = consumoTrackerActual.get(`${itemId}|${l.inventorynumber}`) || 0;
                            return sum + Math.max(0, l.quantityavailable - consumido);
                        }, 0);
                        const snapshotOV = this._extraerSnapshotDeSubrecord(lineToProcess.inventoryDetail);

                        if (!snapshotOV.length && totalDisponible < parseFloat(qty)) {
                            nLog.audit(`LBYL Auto-Picking IF ${fulfillmentId}`, `Artículo ${itemId}: requiere ${qty}, disponible ${totalDisponible}`);
                            this._removerSubregistro(fulfillmentRecord);
                            fulfillmentRecord.setCurrentSublistValue({ sublistId: SUBLIST_ITEM, fieldId: "itemreceive", value: false });
                            fulfillmentRecord.commitLine({ sublistId: SUBLIST_ITEM });
                            continue;
                        }

                        try {
                            this._procesarInventoryDetail(fulfillmentRecord, itemId, locationId, qty, isAutoPicking, snapshotOV, stockMapActual, consumoTrackerActual);
                            fulfillmentRecord.commitLine({ sublistId: SUBLIST_ITEM });
                            asignadas++;
                        } catch (e) {
                            nLog.audit(`Línea desmarcada en IF ${fulfillmentId}`, `Artículo ${itemId}: ${e.message}`);
                            this._removerSubregistro(fulfillmentRecord);
                            fulfillmentRecord.setCurrentSublistValue({ sublistId: SUBLIST_ITEM, fieldId: "itemreceive", value: false });
                            fulfillmentRecord.commitLine({ sublistId: SUBLIST_ITEM });
                        }
                    }

                    if (asignadas === 0) {
                        this.deleteById(fulfillmentId);
                        return { updated: null, created: null };
                    }

                    if (forceStatusDowngrade && originalStatus === "C") {
                        fulfillmentRecord.setValue({ fieldId: "shipstatus", value: "C" });
                    }

                    try {
                        fulfillmentRecord.save({ enableSourcing: true, ignoreMandatoryFields: true });
                        return { updated: fulfillmentId, created: null };
                    } catch (saveError) {
                        if (!this._esErrorDeInventario(saveError)) throw saveError;

                        const lotesDelError = this._extraerLotesDeError(saveError);
                        if (lotesDelError.size === 0) {
                            nLog.audit(`Error de inventario sin lotes parseables en IF ${fulfillmentId}`, `name: ${saveError.name} | message: ${saveError.message}`);
                            return { updated: null, created: null };
                        }

                        lotesDelError.forEach((l) => lotesExcluidos.add(l));
                        nLog.audit(`Intento ${intento}/${MAX_INTENTOS} fallido en IF ${fulfillmentId}`, `Lotes excluidos: ${[...lotesExcluidos].join(", ")}`);
                    }
                }

                return { updated: null, created: null };
            } catch (e) {
                nLog.error(`updateLines — Fulfillment ${fulfillmentId}`, e);
                throw e;
            }
        }

        // ══════════════════════════════════════════════════════════════════════
        // CRUD genérico
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
         * Marca como no recibida una línea del IF (por orderline).
         * Si tras desmarcarla no quedan líneas válidas, elimina el IF completo.
         */
        removeLine(fulfillmentId, lineId) {
            try {
                const fulfillmentRecord = record.load({ type: this.recordType, id: fulfillmentId, isDynamic: true });
                const lineCount = fulfillmentRecord.getLineCount({ sublistId: SUBLIST_ITEM });
                let countReceive = 0;

                for (let i = 0; i < lineCount; i++) {
                    fulfillmentRecord.selectLine({ sublistId: SUBLIST_ITEM, line: i });
                    const orderline = fulfillmentRecord.getCurrentSublistValue({ sublistId: SUBLIST_ITEM, fieldId: "orderline" });

                    if (Number(lineId) === Number(orderline)) {
                        this._removerSubregistro(fulfillmentRecord);
                        fulfillmentRecord.setCurrentSublistValue({ sublistId: SUBLIST_ITEM, fieldId: "itemreceive", value: false });
                    } else {
                        const isReceive = fulfillmentRecord.getCurrentSublistValue({ sublistId: SUBLIST_ITEM, fieldId: "itemreceive" });
                        if (isReceive === true || isReceive === "T") countReceive++;
                    }
                    fulfillmentRecord.commitLine({ sublistId: SUBLIST_ITEM });
                }

                if (countReceive === 0) {
                    record.delete({ type: this.recordType, id: fulfillmentId });
                    nLog.audit("Fulfillment Eliminado", `ID: ${fulfillmentId} eliminado porque no quedaron líneas válidas.`);
                    return fulfillmentId;
                }

                return fulfillmentRecord.save({ enableSourcing: true, ignoreMandatoryFields: true });
            } catch (e) {
                nLog.error("Error en removeLine", `Fulfillment ID: ${fulfillmentId} | Error: ${e.message}`);
                throw e;
            }
        }
    }

    return ItemFulfillmentDao;
});
