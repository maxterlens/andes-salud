/**
 * @NApiVersion 2.1
 * @NScriptType ClientScript
 * @NModuleScope SameAccount
 * @file AS_OrdenTraslado_CLNT_2.1.js
 * @description Client Script de la Orden de Traslado.
 *              - pageInit (edit/copy): calcula custcol_as_stock_disponible en todas las
 *                líneas existentes con un único request batch al Suitelet.
 *              - fieldChanged (item en sublista): recalcula el stock de esa línea.
 *              - fieldChanged (location en cabecera): recalcula el stock de todas las líneas.
 */
define(["N/currentRecord", "N/url"], (currentRecord, url) => {
    // ─────────────────────────────────────────────────────────────────────────
    // CONFIGURACIÓN
    // ─────────────────────────────────────────────────────────────────────────
    const STLT_SCRIPT_ID = "customscript_as_action_execut_hdlr_stlt";
    const STLT_DEPLOY_ID = "customdeploy_as_action_execut_hdlr_stlt";

    currentRecord = currentRecord.get();

    // ─────────────────────────────────────────────────────────────────────────
    // HOOKS
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * En modo edit o copy calcula el stock disponible de todas las líneas que
     * ya tengan ítem asignado, usando un único request batch al Suitelet.
     */
    const pageInit = (context) => {
        const { mode } = context;

        // Solo en edit y copy (en view no hay campos editables; en create no hay líneas previas)
        if (mode !== "edit" && mode !== "copy") return;
    };

    /**
     * Detecta dos disparadores:
     *  1. Cambio de ítem en una línea    → recalcula solo esa línea.
     *  2. Cambio de ubicación en cabecera → recalcula todas las líneas.
     */
    const fieldChanged = (context) => {
        const { sublistId, fieldId, line } = context;

        // Caso 1: cambió el ítem en la sublista
        if (sublistId === 'item' && fieldId === 'item') {
            _recalcularStockLinea(line);
            return;
        }

        // Caso 2: cambió la ubicación en el header
        // (los campos de cabecera llegan con sublistId vacío o nulo)
        if (!sublistId && fieldId === 'location') {
            const locationId = currentRecord.getValue({ fieldId: 'location' });
            if (!locationId) {
                // Limpiar todas las líneas si se borró la ubicación
                _limpiarStockTodasLasLineas();
                return;
            }
            _recalcularStockTodasLasLineas(locationId);
        }
    };

    // ─────────────────────────────────────────────────────────────────────────
    // HELPERS DE RECÁLCULO
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Recalcula custcol_as_stock_disponible de una sola línea.
     * @param {number} lineIndex - Índice base 0 de la línea en la sublista item
     */
    const _recalcularStockLinea = (lineIndex) => {
        const itemId = currentRecord.getCurrentSublistValue({ sublistId: 'item', fieldId: 'item' });
        const locationId = currentRecord.getValue({ fieldId: 'location' });

        // Limpiar inmediatamente
        currentRecord.setCurrentSublistValue({
            sublistId: 'item',
            fieldId: 'custcol_as_stock_disponible',
            value: "",
        });

        if (!itemId || !locationId) return;

        _obtenerStockMap([String(itemId)], locationId)
            .then((stockMap) => {
                if (!stockMap) return;
                currentRecord.selectLine({ sublistId: 'item', line: lineIndex });
                currentRecord.setCurrentSublistValue({
                    sublistId: 'item',
                    fieldId: 'custcol_as_stock_disponible',
                    value: stockMap[String(itemId)] ?? 0,
                });
            })
            .catch((err) => {
                console.error("[AS_OrdenTraslado_CLNT] _recalcularStockLinea — error:", err);
            });
    };

    /**
     * Recalcula custcol_as_stock_disponible de todas las líneas con ítem asignado.
     * Un único request batch al Suitelet.
     * @param {string|number} locationId
     */
    const _recalcularStockTodasLasLineas = (locationId) => {
        const lineCount = currentRecord.getLineCount({ sublistId: 'item' });
        if (!lineCount) return;

        // Mapear itemId → [lineIndexes]
        const linesByItemId = {};
        for (let i = 0; i < lineCount; i++) {
            const itemId = String(
                currentRecord.getSublistValue({
                    sublistId: 'item',
                    fieldId: 'item',
                    line: i,
                }) || "",
            );
            if (!itemId) continue;
            if (!linesByItemId[itemId]) linesByItemId[itemId] = [];
            linesByItemId[itemId].push(i);
        }

        const itemIds = Object.keys(linesByItemId);
        if (itemIds.length === 0) return;

        _obtenerStockMap(itemIds, locationId)
            .then((stockMap) => {
                if (!stockMap) return;
                itemIds.forEach((itemId) => {
                    const stock = stockMap[itemId] ?? 0;
                    linesByItemId[itemId].forEach((lineIndex) => {
                        currentRecord.selectLine({ sublistId: 'item',  line: lineIndex });
                        currentRecord.setCurrentSublistValue({
                            sublistId: 'item',
                            fieldId: 'custcol_as_stock_disponible',
                            value: stock,
                            ignoreFieldChange: true,
                            forceSyncSourcing: true
                        });
                    });
                    if (linesByItemId[itemId].length) {
                        currentRecord.commitLine({ sublistId: 'item' });
                    }
                });
            })
            .catch((err) => {
                console.error("[AS_OrdenTraslado_CLNT] _recalcularStockTodasLasLineas — error:", err);
            });
    };

    /**
     * Pone vacío custcol_as_stock_disponible en todas las líneas.
     * Se usa cuando se borra la ubicación del header.
     */
    const _limpiarStockTodasLasLineas = () => {
        const lineCount = currentRecord.getLineCount({
            sublistId: 'item',
        });
        for (let i = 0; i < lineCount; i++) {
            currentRecord.selectLine({ sublistId: 'item', line: i });
            currentRecord.setCurrentSublistValue({
                sublistId: 'item',
                fieldId: 'custcol_as_stock_disponible',
                value: "",
                ignoreFieldChange: true,
                forceSyncSourcing: true
            });
        }
    };

    // ─────────────────────────────────────────────────────────────────────────
    // HELPERS DE COMUNICACIÓN
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Llama al Suitelet (GET get-available-stock) y retorna el stockMap.
     * itemIds se envía como CSV: "1,2,3".
     *
     * @param {string[]}      itemIds
     * @param {string|number} locationId
     * @returns {Promise<Object|null>} { [itemId]: stock } o null si falla
     */
    const _obtenerStockMap = (itemIds, locationId) => {
        const suiteletUrl = _resolverUrlSuitelet();
        if (!suiteletUrl) return Promise.resolve(null);

        const urlConParams =
            `${suiteletUrl}` +
            `&itemIds=${encodeURIComponent(itemIds.join(","))}` +
            `&locationId=${encodeURIComponent(locationId)}`;

        return fetch(urlConParams, {
            method: "GET",
            headers: {
                "X-Record-Type": "transferOrder",
                "X-Operation": "get-available-stock",
            },
        })
            .then((response) => response.json())
            .then((result) => (result.ok ? result.stockMap : null));
    };

    const _resolverUrlSuitelet = () => {
        try {
            return url.resolveScript({
                scriptId: STLT_SCRIPT_ID,
                deploymentId: STLT_DEPLOY_ID,
                returnExternalUrl: false,
            });
        } catch (e) {
            console.error("[AS_OrdenTraslado_CLNT] No se pudo resolver la URL del Suitelet:", e);
            return null;
        }
    };

    // ─────────────────────────────────────────────────────────────────────────
    // EXPORTS
    // ─────────────────────────────────────────────────────────────────────────

    return { pageInit, fieldChanged };
});