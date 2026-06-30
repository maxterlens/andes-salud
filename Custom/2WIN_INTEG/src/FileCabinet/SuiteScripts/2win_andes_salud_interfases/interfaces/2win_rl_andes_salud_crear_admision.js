/**
 * @NApiVersion 2.1
 * @NScriptType Restlet
 * @description Script para recepcion de datos Andes Salud. "ADT^A01"
 * @swagger
 * /restlet.nl?script=2156&deploy=1:
 *   post:
 *     summary: Crear Admision (ADT^A01)
 *     description: Crea una nueva admisión en el sistema a partir de un mensaje HL7 ADT^A01.
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
 *                   sendingApplication:
 *                     type: string
 *                     example: "HIS"
 *                   sendingFacility:
 *                     type: string
 *                     example: "CASC"
 *                   receivingApplication:
 *                     type: string
 *                     example: "ERP"
 *                   receivingFacility:
 *                     type: string
 *                     example: "NetSuite"
 *                   timestamp:
 *                     type: string
 *                     format: date-time
 *                     example: "2025-05-22T10:30:00Z"
 *                   messageType:
 *                     type: string
 *                     example: "ADT^A01"
 *                   controlID:
 *                     type: string
 *                     example: "MSG00008"
 *                   messagePriority:
 *                     type: string
 *                     example: "P"
 *               EVN:
 *                 type: object
 *                 properties:
 *                   eventTypeCode:
 *                     type: string
 *                     example: "A01"
 *                   recordedDateTime:
 *                     type: string
 *                     format: date-time
 *                     example: "2025-05-22T10:30:00Z"
 *               PID:
 *                 type: object
 *                 properties:
 *                   patientID:
 *                     type: integer
 *                     example: 123456
 *               PV1:
 *                 type: object
 *                 properties:
 *                   recordNumber:
 *                     type: integer
 *                     example: 789012
 *                   admissionID:
 *                     type: string
 *                     example: "ADM012"
 *                   admissionDate:
 *                     type: string
 *                     format: date-time
 *                     example: "2025-05-22T10:30:00Z"
 *                   attendingProvider:
 *                     type: string
 *                     example: "12345678-9"
 *                   attendingProviderName:
 *                     type: string
 *                     example: "Dr. Juan Pérez"
 *                   responsibleID:
 *                     type: string
 *                     example: "12345678-0"
 *                   responsibleName:
 *                     type: string
 *                     example: "María González"
 *                   insuranceCode:
 *                     type: string
 *                     example: "PREV01"
 *                   insuranceName:
 *                     type: string
 *                     example: "FONASA"
 *                   insuranceTramo:
 *                     type: string
 *                     example: "A"
 *                   insuranceFFAA:
 *                     type: string
 *                     example: "fach"
 *                   convenioCode:
 *                     type: string
 *                     example: "CONV001"
 *                   convenioName:
 *                     type: string
 *                     example: "Convenio General"
 *                   paqueteCode:
 *                     type: string
 *                     example: "PAQ001"
 *                   paqueteName:
 *                     type: string
 *                     example: "Paquete Base"
 *                   admissionType:
 *                     type: string
 *                     example: "A"
 *                   accountNumber:
 *                     type: string
 *                     example: "789012001"
 *                   reclamo:
 *                     type: string
 *                     example: "S"
 *                   insurance:
 *                     type: string
 *                     example: "N"
 *     responses:
 *       200:
 *         description: Respuesta exitosa.
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
 *                   example: "Admisión registrada correctamente"
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
define(["N/log", "N/error", "../domain/2win_dom_admision"], function (nLog, error, admision) {
    /**
     * @function _post - Ejecuta operacion en base a datos recibidos de peticion.
     * @param {object} context - Datos de la peticion recibida.
     * @returns {JSON} - Respuesta a peticion.
     */
    function _post(context) {
        try {
            nLog.debug("_post - context", context);
            // let { messageRaw } = context;
            const respuesta = admision.crear(context);
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
