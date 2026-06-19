/**
 * @NApiVersion 2.1
 * @NModuleScope SameAccount
 */
define([
    'N/ui/serverWidget',
    'N/runtime',
], (serverWidget, runtime) => {

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

    const agregarColumnaStockDisponible = (context) => {
        
    }

    // ─── Triggers (índice público) ───────────────────────────────────────────

    return { 
        agregarBotonAsignacionLote,
        agregarColumnaStockDisponible
    };
});
