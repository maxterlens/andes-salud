/**
 * @NApiVersion 2.1
 * @NScriptType Restlet
 * @description Script para recepcion de datos Andes Salud. "RDE^O25"
 * @swagger
 * /restlet.nl?script=2158&deploy=1:
 *   post:
 *     summary: Transferencia de Episodio (RDE^O31)
 *     description: Transfiere un episodio de atención médica.
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
 *                 description: Segmento de encabezado del mensaje (Message Header).
 *                 properties:
 *                   sendingApplication:
 *                     type: string
 *                     example: "HIS"
 *                   sendingFacility:
 *                     type: string
 *                     example: "CASC"
 *                   receivingApplication:
 *                     type: string
 *                     example: "ERP"
 *                   timestamp:
 *                     type: string
 *                     format: date-time
 *                     example: "2025-05-22T11:15:00Z"
 *                   messageType:
 *                     type: string
 *                     example: "ADT^A31"
 *                   controlID:
 *                     type: string
 *                     example: "MSG00004"
 *                   messagePriority:
 *                     type: string
 *                     example: "P"
 *               EVN:
 *                 type: object
 *                 description: Segmento de evento (Event Type).
 *                 properties:
 *                   recordedDateTime:
 *                     type: string
 *                     format: date-time
 *                     example: "2025-05-22T09:30:00Z"
 *               PID:
 *                 type: object
 *                 description: Segmento de información del paciente (Patient Identification).
 *                 properties:
 *                   patientID:
 *                     type: integer
 *                     example: 123456
 *               PV1:
 *                 type: object
 *                 description: Segmento de visita del paciente (Patient Visit).
 *                 properties:
 *                   recordNumber:
 *                     type: integer
 *                     example: 56789
 *                   admissionID:
 *                     type: string
 *                     example: "ADM009"
 *                   admissionDate:
 *                     type: string
 *                     example: "2025-05-22"
 *                   admissionTime:
 *                     type: string
 *                     example: "090000"
 *                   serviceCode:
 *                     type: string
 *                     example: "CAR"
 *                   admissionType:
 *                     type: string
 *                     example: "H"
 *                   accountNumber:
 *                     type: integer
 *                     example: 56790233
 *                   claim:
 *                     type: string
 *                     example: "S"
 *                   insurance:
 *                     type: string
 *                     example: "N"
 *               OBX:
 *                 type: object
 *                 description: Segmento de observación (Observation Result).
 *                 properties:
 *                   documentStatus:
 *                     type: string
 *                     example: "Estado Garantía Vigente"
 *                   documentCode:
 *                     type: string
 *                     example: "F12345"
 *                   holderID:
 *                     type: string
 *                     example: "12345678"
 *                   holderName:
 *                     type: string
 *                     example: "Juan Titular"
 *     responses:
 *       200:
 *         description: Transferencia aplicada correctamente.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   description: Indica si la operación fue exitosa.
 *                   example: true
 *                 message:
 *                   type: string
 *                   description: Mensaje descriptivo del resultado de la operación.
 *                   example: "Modificación aplicada correctamente"
 *       400:
 *         description: Error en la solicitud.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   description: Indica si la operación fue exitosa.
 *                   example: false
 *                 message:
 *                   type: string
 *                   description: Mensaje de error.
 *                   example: "Error en la recepcion de mensaje"
 *       500:
 *         description: Error interno del servidor.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   description: Indica si la operación fue exitosa.
 *                   example: false
 *                 message:
 *                   type: string
 *                   description: Mensaje de error.
 *                   example: "Error interno del servidor."
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
            const respuesta = domEpisodio.transferir(context);
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
