/**
 * @NApiVersion 2.1
 * @NScriptType Restlet
 * @description Script para recepcion de datos Andes Salud. "Crear Paciente"
 * @swagger
 * components:
 *   securitySchemes:
 *     OAuth2:
 *       type: oauth2
 *       flows:
 *         clientCredentials:
 *           tokenUrl: https://{accountId}.suitetalk.api.netsuite.com/services/rest/auth/oauth2/v1/token
 *           scopes:
 *             restlets: Acceso a Restlets de NetSuite
 *
 * /restlet.nl?script=2035&deploy=1:
 *   post:
 *     security:
 *       - OAuth2: []
 *     tags:
 *       - MPI - Paciente
 *     summary: Crea cliente ADT^A04
 *     description: Recibe los datos de un cliente desde Andes Salud y lo crea en NetSuite. Corresponde al mensaje HL7 ADT^A04
 *     parameters:
 *       - name: script
 *         in: query
 *         description: script a cargo la peticion.
 *         required: true
 *         example: 2036
 *         schema:
 *           type: integer
 *       - name: deploy
 *         in: query
 *         description: deploy del script
 *         required: true
 *         example: 1
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               messageRaw:
 *                 type: string
 *                 description: Mensaje HL7 completo recibido desde Andes Salud.
 *                 example: "MSH|^~\\&|SistemaClinico1|Hospital Central|SistemaERP|Sucursal Norte|20250805122257||ADT^A04|MSG96153|P|2.5\rEVN|A04|20250805122257|02\rPID|1|68568609^^^HOSPITAL^RUT|ID_TEST_47487488||Olsson^Gomez^Olaf Sven||19850615|M|||Av chile^^Santiago^Metropolitana^110111^Chile||+563665873166^^^|||S||987654321|A1234567\rPV1|TIPO_VISITA|UBICACION_VISITA^SALA^CAMA^INSTITUCION||||ID_MEDICO_RESPONSABLE^APELLIDO_MEDICO^NOMBRE_MEDICO|||TIPO_ADMISION|||||||ID_NUMERO_CONTRATO|||||||||||||||||||||||FECHA_HORA_ADMISION\r"
 *     responses:
 *       '200':
 *         description: Se creo correctamente un nuevo cliente en netsuite.
 *         content:
 *           application/json:
 *             schema:
 *               type: string
 *               description: Respuesta del servidor con el resultado de la operacion.
 *               example: "MSH|^~\\\\&|SISTEMA_ADMISION|CLINICA_X|SISTEMA_DESTINO|NETSUITE|202507291455||ACK^A04|ACK87690|D|2.5\nMSA|AA|MSG_CREA_TEMP-77378"
 *       '400':
 *         description: Error en la solicitud o datos inválidos.
 *       '500':
 *         description: Error interno del servidor.
 */

define(["../lib/2win_lib_cliente", "N/log", "N/error"], function (libCliente, nLog, error) {
    /**
     * @function _post - Ejecuta operacion en base a datos recibidos de peticion.
     * @param {object} context - Datos de la peticion recibida.
     * @returns {string} - Respuesta a peticion.
     */
    function _post(context) {
        try {
            nLog.debug("_post - context", context);

            // Crear registro en netsuite
            let respuesta = libCliente.crearRegistro(context);

            return JSON.stringify(respuesta);
        } catch (err) {
            nLog.error("_post - error", err);

            throw {
                name: err.name || "CUSTOM_VALIDATION_ERROR",
                message: err.message,
                notifyOff: true
            };
        }
    }

    return {
        post: _post
    };
});
