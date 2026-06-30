/**
 * @NApiVersion 2.1
 * @NScriptType Restlet
 * @description Script para recepcion de datos Andes Salud."ADT^A08"
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
 * /restlet.nl?script=2036&deploy=1:
 *   put:
 *     security:
 *       - OAuth2: []
 *     tags:
 *       - MPI - Paciente
 *     summary: Edita cliente en netsuite ADT^A08
 *     description: Recibe los datos de un cliente desde Andes Salud y lo edita en NetSuite. Corresponde al mensaje HL7 ADT^A08
 *     parameters:
 *       - name: script
 *         in: query
 *         description: script a cargo la peticion.
 *         required: true
 *         example: 2037
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
 *                 example: "MSH|^~\\&|SistemaClinico1|Hospital Central|SistemaERP|Sucursal Norte|20250805122545||ADT^A08|MSG19397|P|2.5\rEVN|A08|20250805122545|02\rPID|1|41171331^^^HOSPITAL^RUT|ID_TEST_7777||Johansson^Eriksson^María Luis||19850615|M|||Av medina^^Santiago^Metropolitana^110111^Chile||+569316766487^^^|||S||987654321|A1234567\r"
 *     responses:
 *       '200':
 *         description: Cliente editado exitosamente.
 *         content:
 *           application/json:
 *             schema:
 *               type: string
 *               description: Respuesta del servidor con el resultado de la operacion.
 *               example: "MSH|^~\\&|SISTEMA_ADMISION|CLINICA_X|SISTEMA_DESTINO|NETSUITE|202507291455||ACK^A08|ACK87690|D|2.5\nMSA|AA|MSG_CREA_TEMP-77378"
 *       '400':
 *         description: Error en la solicitud o datos inválidos.
 *       '500':
 *         description: Error interno del servidor.
 */
define(["../lib/2win_lib_cliente", "N/log", "N/error"], function (libCliente, nLog, error) {
    /**
     * @function _put - Ejecuta operacion en base a datos recibidos de peticion.
     * @param {object} context - Datos de la peticion recibida.
     * @returns {JSON} - Respuesta a peticion.
     */
    function _put(context) {
        try {
            nLog.debug("_put - context", context);

            // Editar registro en netsuite
            let respuesta = libCliente.editarRegistro(context);

            return JSON.stringify(respuesta);
        } catch (err) {
            nLog.error("_put - error", err);
            throw {
                name: err.name || "CUSTOM_VALIDATION_ERROR",
                message: err.message,
                notifyOff: true
            };
        }
    }

    return {
        put: _put
    };
});