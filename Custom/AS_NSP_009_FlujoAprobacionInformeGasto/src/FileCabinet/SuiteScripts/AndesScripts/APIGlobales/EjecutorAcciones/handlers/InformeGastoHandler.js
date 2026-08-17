/**
 * @NApiVersion 2.1
 * @NModuleScope SameAccount
 * @file InformeGastoHandler.js
 * @description Handler de Informe de Gasto para el Ejecutor de Acciones.
 *              Valida el método HTTP de cada operación, parsea el payload
 *              y delega al Service correspondiente.
 */
define([
    'N/error',
    '../services/InformeGastoService'
], (error, InformeGastoService) => {

    // ==========================================
    // 1. FUNCIONES INTERNAS (CONTROLADORES DE FLUJO)
    // ==========================================

    /**
     * Actualiza el motivo de rechazo en el Informe de Gasto.
     * Se invoca desde el Employee Center donde record.submitFields
     * del lado cliente no tiene permisos de edición.
     *
     * Método HTTP esperado: POST
     * Body esperado: { recordId: string|number, motivoRechazo: string }
     */
    const _actualizarMotivoRechazo = (scriptContext) => {
        let body;
        try {
            body = JSON.parse(scriptContext.request.body || '{}');
        } catch (e) {
            log.error('error', e);
            throw error.create({
                name   : 'INVALID_BODY',
                message: 'El body del request no es JSON válido.'
            });
        }

        const { recordId, motivoRechazo } = body;

        if (!recordId) {
            throw error.create({
                name   : 'MISSING_PARAMETER',
                message: 'Se requiere el parámetro recordId en el body del request.'
            });
        }

        if (!motivoRechazo || !motivoRechazo.trim()) {
            throw error.create({
                name   : 'MISSING_PARAMETER',
                message: 'Se requiere el parámetro motivoRechazo con un valor no vacío.'
            });
        }

        log.error({
            title  : 'InformeGastoHandler — update-rejection-reason',
            details: `recordId=${recordId}`
        });

        return InformeGastoService.actualizarMotivoRechazo({
            recordId     : recordId,
            motivoRechazo: motivoRechazo.trim()
        });
    };

    // ==========================================
    // 2. MAPA DE OPERACIONES CON VALIDACIÓN HTTP
    // ==========================================

    const OPERATIONS_MAP = {
        'update-rejection-reason': {
            method: 'POST',
            action: _actualizarMotivoRechazo
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

        // 1. Validar que la operación exista para este record type
        if (!operationConfig) {
            throw error.create({
                name   : 'INVALID_OPERATION',
                message: `La operación '${operation}' no está soportada para expensereport.`
            });
        }

        // 2. Validar que el método HTTP coincida con el esperado
        if (currentMethod !== operationConfig.method) {
            throw error.create({
                name   : 'METHOD_NOT_ALLOWED',
                message: `El método ${currentMethod} no está permitido para '${operation}'. Se esperaba ${operationConfig.method}.`
            });
        }

        // 3. Enrutar a la función interna
        log.debug({
            title  : 'InformeGastoHandler — enrutamiento',
            details: `[${currentMethod}] -> ${operation}`
        });

        return operationConfig.action(scriptContext);
    };

    return { execute };
});
