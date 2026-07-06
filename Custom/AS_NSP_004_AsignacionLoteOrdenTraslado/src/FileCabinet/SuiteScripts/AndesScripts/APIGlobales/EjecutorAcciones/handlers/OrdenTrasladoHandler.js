/**
 * @NApiVersion 2.1
 * @NModuleScope SameAccount
 * @file OrdenTrasladoHandler.js
 * @description Handler de Orden de Traslado para el Ejecutor de Acciones.
 *              Valida el método HTTP de cada operación, parsea el payload
 *              y delega al Service correspondiente.
 */
define([
    'N/error',
    'N/runtime',
    '../services/OrdenTrasladoService'
], (error, runtime, OrdenTrasladoService) => {

    // ==========================================
    // 1. FUNCIONES INTERNAS (CONTROLADORES DE FLUJO)
    // ==========================================

    /**
     * Retorna el stock disponible de uno o varios ítems en una ubicación.
     * Método HTTP esperado: GET
     * Query params esperados: itemIds (CSV, ej: "1,2,3"), locationId
     */
    const _obtenerStockDisponible = (scriptContext) => {
        const { itemIds, locationId } = scriptContext.request.parameters;

        if (!itemIds || !locationId) {
            throw error.create({
                name   : 'MISSING_PARAMETER',
                message: 'Se requieren los query parameters itemIds (CSV) y locationId.'
            });
        }

        const itemIdsArray = itemIds.split(',').map(id => id.trim()).filter(Boolean);

        if (itemIdsArray.length === 0) {
            throw error.create({
                name   : 'MISSING_PARAMETER',
                message: 'El parámetro itemIds no contiene valores válidos.'
            });
        }

        return OrdenTrasladoService.obtenerStockDisponibleEnLote({ itemIds: itemIdsArray, locationId });
    };

    /**
     * Asigna el detalle de inventario (lotes FEFO) a las líneas de la OT.
     * Método HTTP esperado: POST
     * Body esperado: { ordenTrasladoId: string|number }
     */
    const _asignarDetalleInventario = (scriptContext) => {
        let body;
        try {
            body = JSON.parse(scriptContext.request.body || '{}');
        } catch (e) {
            throw error.create({
                name   : 'INVALID_BODY',
                message: 'El body del request no es JSON válido.'
            });
        }

        const { ordenTrasladoId } = body;

        if (!ordenTrasladoId) {
            throw error.create({
                name   : 'MISSING_PARAMETER',
                message: 'Se requiere el parámetro ordenTrasladoId en el body del request.'
            });
        }

        const userId = runtime.getCurrentUser().id;

        log.audit({
            title  : 'OrdenTrasladoActionHandler — asign-inventory-detail',
            details: `ordenTrasladoId=${ordenTrasladoId} | userId=${userId}`
        });

        return OrdenTrasladoService.asignarDetalleInventario({ ordenTrasladoId, userId });
    };

    // ==========================================
    // 2. MAPA DE OPERACIONES CON VALIDACIÓN HTTP
    // ==========================================
    //    Cada entrada define el método HTTP permitido y la función interna a invocar.

    const OPERATIONS_MAP = {
        'asign-inventory-detail': {
            method: 'POST',
            action: _asignarDetalleInventario
        },
        'get-available-stock': {
            method: 'GET',
            action: _obtenerStockDisponible
        }
    };

    // ==========================================
    // 3. PUNTO DE ENTRADA Y ENRUTAMIENTO SEGURO
    // ==========================================

    /**
     * Evalúa y ejecuta la operación solicitada validando el verbo HTTP.
     * @param {Object} scriptContext - Contexto nativo del Suitelet { request, response }
     * @param {string} operation     - Valor de X-Operation en lowercase
     * @returns {Object} Resultado serializable como JSON
     */
    const execute = (scriptContext, operation) => {
        const currentMethod   = scriptContext.request.method.toUpperCase();
        const operationConfig = OPERATIONS_MAP[operation];
        log.error('operationConfig', operationConfig);
        log.error('currentMethod', currentMethod);
        log.error('operationConfig.method', operationConfig.method);

        // 1. Validar que la operación exista para este record type
        if (!operationConfig) {
            throw error.create({
                name   : 'INVALID_OPERATION',
                message: `La operación '${operation}' no está soportada para transferOrder.`
            });
        }

        // 2. Validar que el método HTTP coincida con el esperado
        if (currentMethod != operationConfig.method) {
            throw error.create({
                name   : 'METHOD_NOT_ALLOWED',
                message: `El método ${currentMethod} no está permitido para '${operation}'. Se esperaba ${operationConfig.method}.`
            });
        }

        // 3. Enrutar a la función interna
        log.debug({
            title  : 'OrdenTrasladoActionHandler — enrutamiento',
            details: `[${currentMethod}] -> ${operation}`
        });

        return operationConfig.action(scriptContext);
    };

    return { execute };
});