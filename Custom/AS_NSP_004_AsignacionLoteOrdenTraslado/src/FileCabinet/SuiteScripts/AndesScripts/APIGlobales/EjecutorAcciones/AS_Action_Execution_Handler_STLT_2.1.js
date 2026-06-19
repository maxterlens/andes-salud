/**
 * @NApiVersion 2.1
 * @NScriptType Suitelet
 * @NModuleScope SameAccount
 * @Name AS_Action_Execution_Handler_STLT_2.1.js
 * @Description API Gateway principal que actúa como Router/Dispatcher usando patrones de arquitectura limpia.
 */
define([
    './handlers/OrdenTrasladoHandler'
], (ordenTrasladoHandler) => {

    // Diccionario de enrutamiento de primer nivel (Mapeo por Record Type)
    const HANDLER_MAP = {
        'transferorder': ordenTrasladoHandler
    };

    /**
     * Punto de entrada del Suitelet
     * @param {Object} scriptContext
     * @param {ServerRequest} scriptContext.request
     * @param {ServerResponse} scriptContext.response
     */
    const onRequest = (scriptContext) => {
        const { request, response } = scriptContext;
        
        // Garantizamos que toda respuesta de nuestra API sea en formato JSON
        response.addHeader({ name: 'Content-Type', value: 'application/json' });

        try {
            // 1. Extraer las cabeceras personalizadas de enrutamiento
            const recordType = request.headers['X-Record-Type'];
            const operation = request.headers['X-Operation'];

            log.error('API Gateway', `Request recibido - Record: ${recordType} | Operation: ${operation}`);

            // 2. Validar presencia de cabeceras requeridas
            if (!recordType || !operation) {
                response.write(JSON.stringify({ 
                    status: 'ERROR', 
                    code: 'MISSING_ROUTING_HEADERS',
                    message: 'Faltan las cabeceras obligatorias de control: X-Record-Type y/o X-Operation.' 
                }));
                return;
            }

            // 3. Resolver el Handler adecuado
            const handler = HANDLER_MAP[recordType.toLowerCase()];
            if (!handler) {
                response.write(JSON.stringify({ 
                    status: 'ERROR', 
                    code: 'HANDLER_NOT_FOUND',
                    message: `No existe un controlador configurado para el tipo de registro: '${recordType}'` 
                }));
                return;
            }

            // 4. Delegar la ejecución de la petición a la capa Handler
            // El Handler se encargará de mapear la operación, llamar al Servicio y este al Repositorio.
            const result = handler.execute(scriptContext, operation.toLowerCase());

            // 5. Retornar la respuesta exitosa procesada por las capas internas
            response.write(JSON.stringify(result));

        } catch (e) {
            // Capa global de Catch: Captura errores de sintaxis, validaciones lanzadas en servicios o fallos de NetSuite
            log.error('Gateway Critical Error', e);
            
            response.write(JSON.stringify({ 
                status: 'ERROR', 
                code: e.name || 'INTERNAL_SERVER_ERROR',
                message: e.message || 'Ocurrió un error inesperado en el procesamiento de la API.' 
            }));
        }
    };

    return { onRequest };
});