/**
 * @NApiVersion 2.1
 * @NModuleScope SameAccount
 * @file OrdenTrasladoRepository.js
 * @description Acceso a datos exclusivo de la Orden de Traslado (transferorder).
 *              Carga el record, lee líneas con su inventorydetail, ejecuta búsquedas
 *              de lotes e ítems en lote, y aplica el plan de asignación.
 *              Todo lo relacionado con el log de ejecución vive en CRLogAsignacionLoteOTRepository.js.
 */
define([
    'N/record',
    'N/search',
    'N/format',
    'N/query'
], (record, search, format, query) => {

    // ─── IDs de campos y sublists ─────────────────────────────────────────────
    const TIPO_OT            = 'transferorder';
    const TIPO_INV_NUM       = 'inventorynumber';

    const SUBLIST_ITEM       = 'item';
    const FIELD_LINE_ITEM    = 'item';
    const FIELD_LINE_QTY     = 'quantity';
    const FIELD_LINE_QTY_FUL = 'quantityfulfilled';
    const FIELD_INV_DETAIL   = 'inventorydetail';
    const SUBLIST_INV_ASSIGN = 'inventoryassignment';
    const FIELD_ASSIGN_LOT   = 'issueinventorynumber';
    const FIELD_ASSIGN_QTY   = 'quantity';

    // ─────────────────────────────────────────────────────────────────────────
    // ORDEN DE TRASLADO
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Carga la Orden de Traslado en modo dinámico.
     * @param {string|number} ordenTrasladoId
     * @returns {Record}
     */
    const cargarOrdenTraslado = (ordenTrasladoId) => {
        return record.load({ type: TIPO_OT, id: ordenTrasladoId, isDynamic: true });
    }

    /**
     * Lee todas las líneas de la OT y retorna un array de objetos planos.
     * Incluye asignaciones existentes en inventorydetail.
     *
     * @param {Record} trasnferOrderRecord
     * @returns {Array<{lineIndex, itemId, itemName, qtyRequired, qtyFulfilled, qtyPrev, asignacionesExistentes}>}
     */
    const leerLineasOrdenTraslado = (trasnferOrderRecord) => {
        const lineCount = trasnferOrderRecord.getLineCount({ sublistId: SUBLIST_ITEM });
        const lineas    = [];

        for (let i = 0; i < lineCount; i++) {
            trasnferOrderRecord.selectLine({ sublistId: SUBLIST_ITEM, line: i });
            const invDetail              = trasnferOrderRecord.getCurrentSublistSubrecord({ sublistId: SUBLIST_ITEM, fieldId: FIELD_INV_DETAIL});
            const asignacionesExistentes = invDetail ? _leerAsignacionesInventario(invDetail) : [];
            const qtyPrev                = asignacionesExistentes.reduce((s, a) => s + a.qty, 0);

            lineas.push({
                lineIndex            : i,
                itemId               : String(trasnferOrderRecord.getSublistValue({ sublistId: SUBLIST_ITEM, fieldId: FIELD_LINE_ITEM,    line: i }) || ''),
                itemName             : trasnferOrderRecord.getSublistText ({ sublistId: SUBLIST_ITEM, fieldId: FIELD_LINE_ITEM,    line: i }) || `Ítem línea ${i + 1}`,
                qtyRequired          : parseFloat(trasnferOrderRecord.getSublistValue({ sublistId: SUBLIST_ITEM, fieldId: FIELD_LINE_QTY,     line: i })) || 0,
                qtyFulfilled         : parseFloat(trasnferOrderRecord.getSublistValue({ sublistId: SUBLIST_ITEM, fieldId: FIELD_LINE_QTY_FUL, line: i })) || 0,
                qtyPrev,
                asignacionesExistentes   // [{ lotId, qty, idx }]
            });
        }

        return lineas;
    };

    // ─────────────────────────────────────────────────────────────────────────
    // BÚSQUEDAS EN LOTE
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Retorna lotes disponibles por ítem en la ubicación dada.
     * Una sola búsqueda para todos los ítems — nunca llamar dentro de un bucle.
     * Resultado: { [itemId]: [{lotId, lotNum, expDate, qty}] } con FEFO aplicado.
     *
     * @param {Array<string>} itemIds
     * @param {string|number} locationId
     * @returns {Object}
     */
    const obtenerLotesDisponiblesEnLote = (itemIds, locationId) => {
        const resultado = {};
        if (!itemIds || itemIds.length === 0) return resultado;

        itemIds.forEach(id => { resultado[id] = []; });

        search.create({
            type: TIPO_INV_NUM,
            filters: [
                search.createFilter({ name: 'item',              operator: search.Operator.ANYOF,       values: itemIds    }),
                search.createFilter({ name: 'location',          operator: search.Operator.IS,          values: locationId }),
                search.createFilter({ name: 'quantityavailable', operator: search.Operator.GREATERTHAN, values: 0          })
            ],
            columns: [
                search.createColumn({ name: 'internalid'        }),
                search.createColumn({ name: 'item'              }),
                search.createColumn({ name: 'inventorynumber'   }),
                search.createColumn({ name: 'expirationdate'    }),
                search.createColumn({ name: 'quantityavailable' })
            ]
        }).run().each((result) => {
            const itemId     = String(result.getValue({ name: 'item' }));
            const expDateRaw = result.getValue({ name: 'expirationdate' });
            if (resultado[itemId]) {
                resultado[itemId].push({
                    lotId  : String(result.getValue({ name: 'internalid'         })),
                    lotNum : result.getValue({ name: 'inventorynumber'   }) || '',
                    expDate: expDateRaw ? format.parse({ value: expDateRaw, type: format.Type.DATE }) : null,
                    qty    : parseFloat(result.getValue({ name: 'quantityavailable' })) || 0
                });
            }
            return true;
        });

        // Ordenar FEFO por ítem
        Object.keys(resultado).forEach(id => {
            resultado[id] = _ordenarFEFO(resultado[id]);
        });

        return resultado;
    };

    /**
     * Retorna un mapa { [itemId]: boolean } indicando si el ítem tiene control de lote.
     * Una sola búsqueda para todos los ítems.
     *
     * @param {Array<string>} itemIds
     * @returns {Object}
     */
    const verificarItemsConLoteEnLote = (itemIds) => {
        const resultado = {};
        if (!itemIds || itemIds.length === 0) return resultado;

        itemIds.forEach(id => { resultado[id] = false; });

        search.create({
            type: search.Type.INVENTORY_ITEM,
            filters: [
                search.createFilter({ name: 'internalid', operator: search.Operator.ANYOF, values: itemIds }),
                search.createFilter({ name: 'islotitem',  operator: search.Operator.IS,    values: 'T'     })
            ],
            columns: [ search.createColumn({ name: 'internalid' }) ]
        }).run().each((result) => {
            resultado[String(result.id)] = true;
            return true;
        });

        return resultado;
    };

    // ─────────────────────────────────────────────────────────────────────────
    // STOCK DISPONIBLE
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Retorna el stock disponible de múltiples ítems en una ubicación via SuiteQL.
     * Una sola query con GROUP BY — nunca llamar dentro de un bucle.
     *
     * @param {Array<string|number>} itemIds
     * @param {string|number}        locationId
     * @returns {Object} Mapa { [itemId]: stockDisponible }. Ítems sin stock retornan 0.
     */
    const obtenerStockDisponibleEnLote = (itemIds, locationId) => {
        const stockMap = {};
        if (!itemIds || itemIds.length === 0) return stockMap;

        // Inicializar todos en 0 para garantizar entrada por cada itemId
        itemIds.forEach(id => { stockMap[String(id)] = 0; });

        const placeholders = itemIds.map(() => '?').join(', ');
        const params = [
            ...itemIds.map(id => Number(id)),
            Number(locationId)
        ];

        const resultSet = query.runSuiteQL({
            query : `
                SELECT
                    ib.item,
                    SUM(inl.quantityavailable) AS stockdisponible
                FROM
                    inventoryBalance ib
                    JOIN inventoryNumber invn ON ib.inventorynumber = invn.id
                    JOIN InventoryNumberLocation inl ON invn.id = inl.inventorynumber AND inl.location = ib.location
                WHERE
                    ib.item IN (${placeholders})
                    AND ib.location = ?
                    AND inl.quantityavailable > 0
                GROUP BY ib.item`,
            params
        });

        resultSet.asMappedResults().forEach(row => {
            stockMap[String(row.item)] = Number(row.stockdisponible) || 0;
        });

        return stockMap;
    };

    // ─────────────────────────────────────────────────────────────────────────
    // APLICACIÓN DEL PLAN
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Aplica el plan de asignación al inventorydetail de cada línea y guarda la OT.
     * @param {Record} trasnferOrderRecord
     * @param {Array<{lineIndex, asignaciones}>} planLineas
     * @returns {number} ID guardado
     */
    const aplicarPlanAsignacion = (trasnferOrderRecord, planLineas) => {
        planLineas.forEach(({ lineIndex, asignaciones }) => {
            if (!asignaciones || asignaciones.length === 0) return;

            trasnferOrderRecord.selectLine({ sublistId: SUBLIST_ITEM, line: lineIndex });
            const invDetail = trasnferOrderRecord.getCurrentSublistSubrecord({ sublistId: SUBLIST_ITEM, fieldId  : FIELD_INV_DETAIL });
            if (!invDetail) {
                log.error({ title: 'OrdenTrasladoRepository.aplicarPlanAsignacion', details: `inventorydetail null en línea ${lineIndex}` });
                return;
            }

            let huboModificacion = false;
            asignaciones.forEach(({ lotId, qty, lineExistente, lineExistenteIndex }) => {
                if (lineExistente) {
                    const prevQty = parseFloat(invDetail.getSublistValue({ sublistId: SUBLIST_INV_ASSIGN, fieldId: FIELD_ASSIGN_QTY, line: lineExistenteIndex })) || 0;
                    invDetail.selectLine({ sublistId: SUBLIST_INV_ASSIGN, line: lineExistenteIndex });
                    invDetail.setCurrentSublistValue({ sublistId: SUBLIST_INV_ASSIGN, fieldId: FIELD_ASSIGN_QTY, value: prevQty + qty });
                    invDetail.commitLine({ sublistId: SUBLIST_INV_ASSIGN });
                    huboModificacion = true;
                } else {
                    invDetail.selectNewLine({ sublistId: SUBLIST_INV_ASSIGN });
                    if (lotId) {
                        invDetail.setCurrentSublistValue({ sublistId: SUBLIST_INV_ASSIGN, fieldId: FIELD_ASSIGN_LOT, value: lotId });
                    }
                    invDetail.setCurrentSublistValue({ sublistId: SUBLIST_INV_ASSIGN, fieldId: FIELD_ASSIGN_QTY, value: qty });
                    invDetail.commitLine({ sublistId: SUBLIST_INV_ASSIGN });
                    huboModificacion = true;
                }
            });
            if (huboModificacion) {
                trasnferOrderRecord.commitLine({ sublistId: SUBLIST_ITEM });
            }
        });

        return trasnferOrderRecord.save({ enableSourcing: false, ignoreMandatoryFields: false });
    };

    // ─────────────────────────────────────────────────────────────────────────
    // HELPERS PRIVADOS
    // ─────────────────────────────────────────────────────────────────────────

    const _leerAsignacionesInventario = (invDetail) => {
        const count  = invDetail.getLineCount({ sublistId: SUBLIST_INV_ASSIGN });
        const result = [];
        for (let i = 0; i < count; i++) {
            result.push({
                lotId: String(invDetail.getSublistValue({ sublistId: SUBLIST_INV_ASSIGN, fieldId: FIELD_ASSIGN_LOT, line: i }) || ''),
                qty  : parseFloat(invDetail.getSublistValue({ sublistId: SUBLIST_INV_ASSIGN, fieldId: FIELD_ASSIGN_QTY, line: i })) || 0,
                idx  : i
            });
        }
        return result;
    };

    /** FEFO: expDate ASC, nulls al final. Orden original como desempate (FIFO). */
    const _ordenarFEFO = (lots) =>
        lots.slice().sort((a, b) => {
            if (a.expDate && b.expDate) return a.expDate.getTime() - b.expDate.getTime();
            if (a.expDate)  return -1;
            if (b.expDate)  return  1;
            return 0;
        });

    // ─────────────────────────────────────────────────────────────────────────
    // EXPORTS
    // ─────────────────────────────────────────────────────────────────────────

    return {
        cargarOrdenTraslado,
        leerLineasOrdenTraslado,
        obtenerLotesDisponiblesEnLote,
        verificarItemsConLoteEnLote,
        aplicarPlanAsignacion,
        obtenerStockDisponibleEnLote
    };
});