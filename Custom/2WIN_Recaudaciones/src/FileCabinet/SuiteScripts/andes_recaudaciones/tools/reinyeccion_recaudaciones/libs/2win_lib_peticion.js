/**
 * @NApiVersion 2.1
 * @NModuleScope Public
 */
define([
    "N/http",
    "N/https"
], function (
    http,
    https
) {

    /**
     * @function ejecutarPeticion - Realiza peticion a api.
     * @param {String} tipo - Tipo de peticion a ejecutar.
     * @param {String} url - Url a la cual se realizara la peticion.
     * @param {String} token - Token de autorizacion para la peticion.
     * @param {Object} body - Datos a enviar en el body de la peticion.
     * @returns {Object} - Respuesta a la peticion.
     */
    function ejecutarPeticion(tipo, url, token, body) {
        let tiempoInicio = new Date().getTime();
        try {
            log.audit("ejecutarPeticion - parametros", {
                tipo: tipo,
                url: url,
                token: token,
                body: body ? body : "sin body"
            });

            // Construir cabecera
            let cabecera = {
                "Content-Type": "application/json",
                "Accept": "*/*",
                "Connection": "Keep-Alive"
            };

            // Agregar token si se proporciona
            if (token) {
                // Agregar token a cabecera
                cabecera.Authorization = "Bearer " + token;
            }

            let respuesta;

            if (tipo === "GET") {
                respuesta = http.get({
                    url: url,
                    headers: cabecera
                });
            }

            if (tipo === "POST") {
                respuesta = http.post({
                    url: url,
                    headers: cabecera,
                    body: JSON.stringify(body)
                });
            }

            if (tipo === "PUT") {
                respuesta = http.put({
                    url: url,
                    headers: cabecera,
                    body: JSON.stringify(body)
                });
            }

            if (tipo === "DELETE") {
                respuesta = http.delete({
                    url: url,
                    headers: cabecera
                });
            }

            log.audit("ejecutarPeticion - respuesta", respuesta);

            return respuesta;
        } catch (error) {
            log.error("ejecutarPeticion - error", error);

            throw error;
        }
    }

    /**
     * @param {object} parametro - Parametros requeridos para ejcucion de peticion
     * @param {string} parametro.url - Parametros requeridos para ejcucion de peticion
     * @param {string} parametro.token - Parametros requeridos para ejcucion de peticion
     * @param {string} parametro.body - Parametros requeridos para ejcucion de peticion
     * @returns {object} - Respuesta a la peticion
     */
    function peticionReinyeccionRecaudacion(parametro) {
        log.debug("peticionReinyeccionRecaudacion - parametro", { parametro: parametro });

        let limiteReintentos = 1;

        for (let intento = 1; intento <= limiteReintentos; intento++) {
            try {
                log.debug("peticionReinyeccionRecaudacion - intento", { intento: intento });

                // Ejecutar peticion
                const respuesta = https.requestRestlet({
                    scriptId: parametro.scriptId,
                    deploymentId: parametro.deploymentId,
                    method: https.Method.POST,
                    body: parametro.body,
                    headers: {
                        'Content-Type': 'application/json'
                    }
                });

                // Validar estructura de respuesta
                if (respuesta && respuesta.code === 200) {
                    // Asegurarse de que body exista
                    let cuerpoRespuesta = respuesta.body;

                    log.debug("peticionReinyeccionRecaudacion - cuerpoRespuesta", { cuerpoRespuesta: cuerpoRespuesta });

                    return cuerpoRespuesta;
                } else {
                    // Código inválido o respuesta nula
                    let errMsg2 = "Respuesta inválida - code: " + (respuesta && respuesta.code) + " - body: " + (respuesta && respuesta.body);
                    log.debug("peticionReinyeccionRecaudacion - respuesta inválida", { intento: intento, errMsg: errMsg2 });
                    if (intento === limiteReintentos) throw new Error(errMsg2);
                    // siguiente intento
                    continue;
                }
            } catch (error) {
                log.debug("peticionReinyeccionRecaudacion - error", { intento: intento, error: error });
                if (intento === limiteReintentos) {
                    // Si se alcanza el máximo, lanzar error
                    throw error;
                }
            }
        }
    }

    return {
        ejecutarPeticion: ejecutarPeticion,
        peticionReinyeccionRecaudacion: peticionReinyeccionRecaudacion
    };
});
