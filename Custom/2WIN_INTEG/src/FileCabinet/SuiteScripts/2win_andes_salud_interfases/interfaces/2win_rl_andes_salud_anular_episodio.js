/**
 * @NApiVersion 2.1
 * @NScriptType Restlet
 * @description Script para recepcion de datos Andes Salud. "ADT^A23"
 * @swagger
 * /restlet.nl?script=2160&deploy=1:
 *   post:
 *     summary: Anular Episodio (ADT^A23)
 *     description: Anula un episodio en el sistema a partir de un mensaje HL7 ADT^A23.
 *     tags:
 *       - "AN-14 Cuenta Abierta - Atencion Ambulatoria"
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               MSH:
 *                 type: object
 *                 properties:
 *                   fieldSeparator:
 *                     type: string
 *                     example: "|"
 *                   encodingCharacters:
 *                     type: string
 *                     example: "^~\\&"
 *                   sendingApplication:
 *                     type: string
 *                     example: "HIS_AndesSalud"
 *                   sendingFacility:
 *                     type: string
 *                     example: "Clinica Andes"
 *                   receivingApplication:
 *                     type: string
 *                     example: "NetSuite"
 *                   receivingFacility:
 *                     type: string
 *                     example: "ServidorCentral"
 *                   timestamp:
 *                     type: string
 *                     format: date-time
 *                     example: "2025-05-28T11:00:00Z"
 *                   messageType:
 *                     type: string
 *                     example: "ADT^A23"
 *                   controlID:
 *                     type: string
 *                     example: "CTRL98765"
 *                   messagePriority:
 *                     type: string
 *                     example: "Alta"
 *               EVN:
 *                 type: object
 *                 properties:
 *                   eventTypeCode:
 *                     type: string
 *                     example: "A23"
 *                   recordedDateTime:
 *                     type: string
 *                     format: date-time
 *                     example: "2025-05-28T11:05:00Z"
 *               PID:
 *                 type: object
 *                 properties:
 *                   patientID:
 *                     type: string
 *                     example: "123456"
 *               PV1:
 *                 type: object
 *                 properties:
 *                   registro:
 *                     type: string
 *                     example: "FCH998877"
 *                   admisiónID:
 *                     type: string
 *                     example: "ADM008"
 *                   cuentaPaciente:
 *                     type: string
 *                     example: "998877067"
 *                   fechaAnulacion:
 *                     type: string
 *                     format: date-time
 *                     example: "2025-07-15T11:20:00Z"
 *     responses:
 *       200:
 *         description: OK. Respuesta exitosa indicando que el evento de anulación fue procesado.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code_error:
 *                   type: string
 *                   description: "Código de error, vacío si no hay error."
 *                   example: ""
 *                 code_desc:
 *                   type: string
 *                   description: "Descripción del error, vacía si no hay error."
 *                   example: ""
 *                 data:
 *                   type: object
 *                   description: "Objeto para datos adicionales, vacío en este caso."
 *                   example: {}
 *                 estado:
 *                   type: object
 *                   description: "Objeto para estado adicional, vacío en este caso."
 *                   example: {}
 *                 tipoMensaje:
 *                   type: string
 *                   example: "ADT^A23"
 *                 message:
 *                   type: string
 *                   example: "Evento ADT^A23 procesado correctamente."
 *                 success:
 *                   type: boolean
 *                   example: true
 */
define(["N/log", "N/error", "../domain/2win_dom_admision"], function (nLog, error, domEpisodio) {
    /**
     * @function _post - Ejecuta operacion en base a datos recibidos de peticion.
     * @param {object} context - Datos de la peticion recibida.
     * @returns {JSON} - Respuesta a peticion.
     */
    function _post(context) {
        try {
            nLog.debug("_post - context", context);
            const respuesta = domEpisodio.anular(context);
            return respuesta;
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
