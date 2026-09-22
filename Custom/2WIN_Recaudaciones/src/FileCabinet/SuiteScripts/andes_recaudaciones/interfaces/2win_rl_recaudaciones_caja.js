/**
 *@NApiVersion 2.1
 *@NScriptType Restlet
 */
define(["../domain/2win_dom_caja", "N/log", "N/error", "N/scriptTypes/restlet", "../domain/2win_dom_operaciones_masivas"], function (ProcesadorRecaudacion, nLog, error, restlet, { OperacionMasiva }) {
    /**
     * Punto de entrada del RESTlet para métodos GET, POST, PUT
     * @param {Object} request - Objeto de request HTTP
     * @returns {Object} - Respuesta HTTP
     */
    function get(request) {
        nLog.debug("GET request recibido en RecaudacionRestlet", {});

        try {
            // Para requests GET, devolvemos información sobre el servicio
            const infoServicio = {
                servicio: "RESTlet de Recaudaciones Andes Salud",
                version: "1.0.0",
                metodos_soportados: {
                    GET: "Información del servicio",
                    POST: "Procesamiento de caja de recaudaciones",
                    PUT: "Reproceso de caja de recaudaciones"
                },
                formato_entrada: "JSON con estructura de caja de recaudaciones",
                campos_requeridos: ["unidadCaja", "fechaCaja", "movimientos"],
                ejemplo_uso: {
                    metodo: "POST",
                    url: "/app/site/hosting/restlet.nl?script=customscript_recaudacion_restlet&deploy=1",
                    body: JSON.stringify({
                        unidadCaja: "CAJA001",
                        fechaCaja: "2025-11-19",
                        movimientos: []
                    })
                }
            };

            return crearRespuestaExito(200, infoServicio, "Servicio de recaudaciones activo");
        } catch (errorServicio) {
            nLog.error("Error en GET del servicio:", errorServicio);
            return crearRespuestaError(500, "Error interno del servidor", errorServicio.message);
        }
    }

    /**
     * Procesa request POST para crear nuevas recaudaciones
     * @param {Object} request - Objeto de request HTTP
     * @returns {Object} - Respuesta HTTP
     */
    function post(context) {
        try {
            nLog.debug("_post - context", context);
            
            // Validar que haya cajas para procesar
            if (!context.cajas || context.cajas.length === 0) {
                nLog.audit("POST request - Array cajas vacío", "No hay cajas para procesar, retornando respuesta exitosa");
                return {
                    tipoMensaje: "SEND^RECAUDACION^CAJA",
                    estado: "success",
                    codigo: 200,
                    mensaje: "No hay cajas para procesar - Array vacío",
                    data: {}
                };
            }
            
            const operacion = new OperacionMasiva({
                nombre: "Recaudaciones Flujo Caja",
                tipoMensaje: "SEND^RECAUDACION^CAJA",
                scriptIdMapReduce: "customscript_2win_mr_recaudaciones_caja",
                deploymentIdMapReduce: "customdeploy_2win_mr_recaudaciones_caja",
                folderId: "./Recaudaciones Caja",
                mapReduceParameter: "custscript_2w_as_datos_recaudaciones_caj",
                tipoFlujo: "CAJA"
            });
            context.tipoOperacion = "crear";
            const respuesta = operacion.procesar(context);
            nLog.debug("_post - respuesta", respuesta);
            return respuesta || {};
        } catch (err) {
            nLog.error("_post - error", err);
            throw {
                name: err.name || "CUSTOM_VALIDATION_ERROR",
                message: err.message,
                notifyOff: true
            };
        }
    }

    /**
     * Crea una respuesta de éxito estandarizada
     * @param {Number} codigo - Código HTTP de respuesta
     * @param {Object} datos - Datos a devolver
     * @param {String} mensaje - Mensaje de éxito
     * @returns {Object} - Respuesta formateada
     */
    function crearRespuestaExito(codigo, datos, mensaje) {
        const respuesta = {
            exito: true,
            codigo: codigo,
            mensaje: mensaje,
            timestamp: new Date().toISOString(),
            datos: datos
        };

        return restlet.createResponse({
            content: JSON.stringify(respuesta),
            contentType: "application/json"
        });
    }

    /**
     * Crea una respuesta de error estandarizada
     * @param {Number} codigo - Código HTTP de error
     * @param {String} mensaje - Mensaje de error
     * @param {Object} detalles - Detalles adicionales del error
     * @returns {Object} - Respuesta de error formateada
     */
    function crearRespuestaError(codigo, mensaje, detalles) {
        const respuesta = {
            exito: false,
            codigo: codigo,
            mensaje: mensaje,
            timestamp: new Date().toISOString(),
            detalles: detalles
        };

        return restlet.createResponse({
            content: JSON.stringify(respuesta),
            contentType: "application/json"
        });
    }

    return {
        get: get,
        post: post
    };
});
