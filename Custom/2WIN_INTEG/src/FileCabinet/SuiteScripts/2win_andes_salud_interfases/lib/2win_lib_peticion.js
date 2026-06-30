/**
 * @NApiVersion 2.1
 * @NModuleScope Public
 */
define(["N/https", "N/log", "N/encode"], function (https, nLog, encode) {
    /**
     * @function ejecutarPeticion - Realiza peticion a api.
     * @param {String} tipo - Tipo de peticion a ejecutar.
     * @param {String} url - Url a la cual se realizara la peticion.
     * @param {String} token - Token de autorizacion para la peticion.
     * @param {Object} body - Datos a enviar en el body de la peticion.
     * @returns {Object} - Respuesta a la peticion.
     */
    function ejecutarPeticion(tipo, url, token, body) {
        try {
            nLog.audit("ejecutarPeticion - parametros", {
                tipo: tipo,
                url: url,
                token: token,
                body: body ? body : "sin body"
            });

            // Construir cabecera
            let cabecera = {
                "Content-Type": "application/json",
                "Accept": "*/*",
                "Connection": "Keep-Alive",
                "Authorization": `Bearer ${token}`
            };

            let respuesta;

            // Realizar peticion
            if (tipo === "GET") {
                respuesta = https.get({
                    url: url,
                    headers: cabecera
                });
            }

            if (tipo === "POST") {
                respuesta = https.post({
                    url: url,
                    headers: cabecera,
                    body: JSON.stringify(body)
                });
            }

            if (tipo === "PUT") {
                respuesta = https.put({
                    url: url,
                    headers: cabecera,
                    body: JSON.stringify(body)
                });
            }

            if (tipo === "DELETE") {
                respuesta = https.delete({
                    url: url,
                    headers: cabecera
                });
            }

            nLog.audit("ejecutarPeticion - respuesta", respuesta);

            // // Evaluar codigo de respuesta
            // if (respuesta.code !== 400) {
            //     // Parsear cuerpo respuesta
            //     let bodyParseado = JSON.parse(respuesta.body);
            //     nLog.debug("ejecutarPeticion - bodyParseado", bodyParseado);
            //     return bodyParseado;
            // } else {
            //  throw new Error(`Error peticion - codigo: ${respuesta.code} - cuerpo: ${respuesta.body}`);
            // };
            return respuesta;
        } catch (error) {
            nLog.error("ejecutarPeticion - error", error);
            throw error;
        }
    }

    /**
     * @function generarToken - Funcion para genrar token.
     * @returns {String} - Token recuperado de la peticon.
     */
    function generarToken() {
        const clientId = "0UPpJD18QX7pEWh2UNbrf1X6xhI54q5cv9VqLM-CCT4";
        const clientSecret = "FvXp5MMO3ivXfUhs25EckJD3qfgXinjsVIcewVoOnUpujUuhdb4X_U6CrTm1NBROjlMIu-5pCsIQVQXvDwFbMg";
        const scope = "citas:all";
        const tokenUrl = "https://amh.andessalud.cl/hc/oauth2/token";

        const credentials = `${clientId}:${clientSecret}`;
        const base64Credentials = encode.convert({
            string: credentials,
            inputEncoding: encode.Encoding.UTF_8,
            outputEncoding: encode.Encoding.BASE_64
        });
        const tokenRequestHeaders = {
            "Authorization": `Basic ${base64Credentials}`, // <-- Header de autenticación
            "Content-Type": "application/x-www-form-urlencoded"
        };

        const tokenRequestBody = `grant_type=client_credentials&scope=${scope}`;

        const tokenResponse = https.post({
            url: tokenUrl,
            headers: tokenRequestHeaders,
            body: tokenRequestBody
        });
        if (tokenResponse.code !== 200) {
            throw new Error(`Error al obtener token: Código ${tokenResponse.code} - Respuesta: ${tokenResponse.body}`);
        }

        const tokenData = JSON.parse(tokenResponse.body);
        const accessToken = tokenData.access_token;

        if (!accessToken) {
            throw new Error("La respuesta del token no contiene un access_token.");
        }
        nLog.debug("generarToken - accessToken", accessToken);
        return accessToken;
    }

    /**
     * @function ejecutarPeticionAutenticada - Encapsula la obtención de token y la ejecución de la petición.
     * @param {String} tipo - Tipo de peticion a ejecutar (POST, PUT, GET, DELETE).
     * @param {String} url - Url a la cual se realizara la peticion.
     * @param {Object} body - Datos a enviar en el body de la peticion.
     * @returns {Object} - Respuesta a la peticion.
     */
    function ejecutarPeticionAutenticada(tipo, url, body) {
        try {
            nLog.audit("Inicio PeticionAutenticada", `Iniciando petición autenticada: ${tipo} a ${url}`);

            // Paso 1: Generar el token de autenticación.
            const token = generarToken();

            // Paso 2: Ejecutar la petición principal con el token obtenido.
            const respuesta = ejecutarPeticion(tipo, url, token, body);

            nLog.audit("ejecutarPeticionAutenticada - respuesta final", respuesta);

            return respuesta;
        } catch (error) {
            nLog.error("ejecutarPeticionAutenticada - error", error);
            throw error;
        }
    }

    return {
        ejecutarPeticion: ejecutarPeticion,
        generarToken: generarToken,
        ejecutarPeticionAutenticada: ejecutarPeticionAutenticada
    };
});
