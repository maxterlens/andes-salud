/**
 * @NApiVersion 2.1
 * @NModuleScope SameAccount
 */
define([
    'N/runtime',
    '../services/OrdenTrasladoService'
], (runtime, OrdenTrasladoService) => {

    const ESTADOS_PERMITIDOS = ['pendingFulfillment', 'partiallyFulfilled'];

    // ─── Helpers privados ────────────────────────────────────────────────────

    /**
     * Devuelve true si todas las líneas procesables de la OT ya tienen
     * su detalle de inventario completamente asignado.
     *
     * Una línea se considera "completa" cuando la suma de cantidades en
     * inventoryassignment es igual a la cantidad requerida de la línea.
     * Las líneas ya despachadas (quantityfulfilled > 0) se omiten.
     *
     * @param {Record} toRecord
     * @returns {boolean}
     */
    const _todasLasLineasCompletas = (toRecord) => {
        const lineCount = toRecord.getLineCount({ sublistId: 'item' });

        for (let i = 0; i < lineCount; i++) {
            const qtyFulfilled = parseFloat(toRecord.getSublistValue({ sublistId: 'item', fieldId: 'quantityfulfilled', line: i })) || 0;

            // Línea ya despachada: saltar
            if (qtyFulfilled > 0) continue;

            const qtyRequired = parseFloat(toRecord.getSublistValue({ sublistId: 'item', fieldId: 'quantity', line: i })) || 0;
            const invDetail   = toRecord.getSublistSubrecord({ sublistId: 'item', fieldId: 'inventorydetail', line: i });

            // Sin subrecord de inventario → línea incompleta
            if (!invDetail) return false;

            // Sumar las cantidades ya asignadas en inventoryassignment
            const assignCount = invDetail.getLineCount({ sublistId: 'inventoryassignment' });
            let   qtyAsignada = 0;
            for (let j = 0; j < assignCount; j++) {
                qtyAsignada += parseFloat(invDetail.getSublistValue({ sublistId: 'inventoryassignment', fieldId: 'quantity', line: j })) || 0;
            }

            // Si la cantidad asignada no cubre la requerida → hay trabajo pendiente
            if (qtyAsignada < qtyRequired) return false;
        }

        // Todas las líneas procesables están cubiertas
        return true;
    };

    // ─── Funcionalidades beforeLoad ─────────────────────────────────────────
    const agregarBotonAsignacionLote = (context) => {

        const { form, newRecord, type } = context;
        const { executionContext, ContextType} = runtime
        
        // Guard: solo en modo View
        if (type != 'view') return;

        // Guard: solo en contexto de UI del usuario (no en Suitelet, web services, etc.)
        if (executionContext != ContextType.USER_INTERFACE) return;

        const estado = newRecord.getValue({ fieldId: 'statusRef' });

        // Guard: solo en estados procesables
        if (!ESTADOS_PERMITIDOS.includes(estado)) return;

        // Guard: no agregar botón si todas las líneas ya tienen detalle de inventario completo
        if (_todasLasLineasCompletas(newRecord)) return;

        // Agregar botón visible
        form.addButton({
            id   : 'custpage_as_btn_asignar_lotes',
            label: 'Asignar Lotes',
            functionName: 'asignarLotes'  // función definida en el Client Script
        });

        form.clientScriptModulePath = '../clients/AS_ActionButtons_CLNT_2.1.js'
    }


    // ─── Funcionalidades beforeLoad ─────────────────────────────────────────

    /**
     * Puebla custcol_as_stock_disponible en cada línea de ítem con el stock actual
     * del artículo en la ubicación de la OT.
     * Se ejecuta en los modos view, edit y copy.
     * Usa una sola consulta batch — nunca un request por línea.
     *
     * @param {Object} context - Contexto del User Event Script
     */
    const poblarStockDisponible = (context) => {
        const { newRecord, type } = context;
        const { executionContext, ContextType} = runtime

        // Solo en los modos donde tiene sentido mostrar el stock actual
        const MODOS_PERMITIDOS = ['view', 'edit', 'copy'];
        if (!MODOS_PERMITIDOS.includes(type)) return;

        // Guard: solo en contexto de UI del usuario (no en Suitelet, web services, etc.)
        if (executionContext != ContextType.USER_INTERFACE) return;

        const locationId = newRecord.getValue({ fieldId: 'location' });
        if (!locationId) return;

        const lineCount = newRecord.getLineCount({ sublistId: 'item' });
        if (!lineCount || lineCount === 0) return;

        // ── Recolectar itemIds únicos y sus índices de línea ─────────────────
        const linesByItemId = {};
        for (let i = 0; i < lineCount; i++) {
            const itemId = String(
                newRecord.getSublistValue({ sublistId: 'item', fieldId: 'item', line: i }) || ''
            );
            if (!itemId) continue;
            if (!linesByItemId[itemId]) linesByItemId[itemId] = [];
            linesByItemId[itemId].push(i);
        }

        const itemIds = Object.keys(linesByItemId);
        if (itemIds.length === 0) return;

        // ── Una sola consulta batch al service ───────────────────────────────
        const { ok, stockMap } = OrdenTrasladoService.obtenerStockDisponibleEnLote({ itemIds, locationId });
        if (!ok || !stockMap) return;

        // ── Setear el campo en cada línea (modo no-dinámico en UE) ───────────
        itemIds.forEach(itemId => {
            const stock = stockMap[itemId] ?? 0;
            linesByItemId[itemId].forEach(lineIndex => {
                newRecord.setSublistValue({
                    sublistId: 'item',
                    fieldId  : 'custcol_as_stock_disponible',
                    line     : lineIndex,
                    value    : stock
                });
            });
        });
    };

    // ─── Triggers (índice público) ───────────────────────────────────────────

    return {
        agregarBotonAsignacionLote,
        poblarStockDisponible
    };
});