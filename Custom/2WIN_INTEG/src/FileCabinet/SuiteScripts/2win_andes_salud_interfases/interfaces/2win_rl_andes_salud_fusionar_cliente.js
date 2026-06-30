/**
 * @NApiVersion 2.1
 * @NScriptType Restlet
 * @description Script para recepcion de datos Andes Salud. "Fusionar Paciente"
 * @swagger
 * /restlet.nl?script=2141&deploy=1:
 *   post:
 *     summary: Fusionar Paciente
 *     description: Fusiona la información de un paciente en NetSuite a partir de un mensaje HL7 ADT^A40.
 *     tags:
 *       - "MPI - Paciente"
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               messageRaw:
 *                 type: string
 *                 example: "MSH|^~&|SISTEMA_MAESTRO_PACIENTES|CLINICA_X|SISTEMA_DESTINO|NETSUITE|20231027103000||ADT^A40|MSG_MERGE_003|P|2.5\rEVN|A40|20231027103000|||SYSADMIN^ADMIN^SISTEMA\rPID|1||100765433-3^^^RUT^PN||PEREZ^JUAN^CARLOS GONZALEZ||19850515|M|||AV. PROVIDENCIA 123^DEPTO 45^SANTIAGO^RM^7500000^RUT||(56)912345678|||S\rMRG|100765433-2^^^RUT^PN|||||||\r"
 *     responses:
 *       200:
 *         description: OK
 */
define(["N/log", "N/scriptTypes/restlet", "../lib/2win_lib_cliente", "N/error"], function (nLog, restlet, libCliente, error) {
    /**
     *  Endpoint de fusion de clientes
     * @param {object} context
     * @returns {string}
     */
    function _post(context) {
        try {
            nLog.debug("_put - context", context);

            // Recepcion de mensaje en netsuite
            let respuesta = libCliente.fusionarRegistro(context);
            return restlet.createResponse({
                content: JSON.stringify(respuesta),
                contentType: "application/json"
            });
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
        // get: _get,
        post: _post
        // put: _put,
        // delete: _delete
    };
});
