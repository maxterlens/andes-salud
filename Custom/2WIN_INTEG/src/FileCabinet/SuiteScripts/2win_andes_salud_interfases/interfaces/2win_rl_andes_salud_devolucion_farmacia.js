/**
 * @NApiVersion 2.1
 * @NScriptType Restlet
 * @description Script para recepcion de datos Andes Salud. "RDE_O25"
 * @swagger
 * /restlet.nl?script=2143&deploy=1:
 *   post:
 *     summary: Devolucion de Farmacia (RDE_O25)
 *     description: Procesa una devolución de medicamentos en farmacia.
 *     tags:
 *       - "AN-14 Cuenta Abierta - Atencion Ambulatoria"
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               tipoMensaje:
 *                 type: string
 *                 example: "RDE_O25"
 *               devolucionMedicamentos:
 *                 type: object
 *                 properties:
 *                   identificadorUnicoPaciente:
 *                     type: integer
 *                     example: 100
 *                   numeroFicha:
 *                     type: string
 *                     example: "FARM_01"
 *                   numeroIngreso:
 *                     type: integer
 *                     example: 1
 *                   numeroCuentaPaciente:
 *                     type: string
 *                     example: "1234001"
 *                   unidadProducto:
 *                     type: string
 *                     example: "Comprimido"
 *                   codigoProducto:
 *                     type: string
 *                     example: "01001838"
 *                   cantidadDevuelta:
 *                     type: integer
 *                     example: 1
 *                   codigoServicio:
 *                     type: string
 *                     example: "ADM"
 *                   codigoBodega:
 *                     type: string
 *                     example: "bod_ug"
 *                   valorNeto:
 *                     type: integer
 *                     example: 6000
 *                   valorExento:
 *                     type: integer
 *                     example: 0
 *                   valorIVA:
 *                     type: integer
 *                     example: 0
 *                   valorTotal:
 *                     type: integer
 *                     example: 6000
 *     responses:
 *       200:
 *         description: Devolución registrada correctamente.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 tipoMensaje:
 *                   type: string
 *                   description: Tipo de mensaje (RDE_O25).
 *                   example: "RDE_O25"
 *                 estado:
 *                   type: object
 *                   properties:
 *                     success:
 *                       type: boolean
 *                       description: Indica si la operación fue exitosa.
 *                       example: true
 *                     codigo:
 *                       type: integer
 *                       description: Código de estado (200 para éxito).
 *                       example: 200
 *                     mensaje:
 *                       type: string
 *                       description: Mensaje descriptivo del resultado de la operación.
 *                       example: "Acción registrada correctamente en NetSuite"
 *                 data:
 *                   type: object
 *                   description: Datos adicionales (vacío en este caso).
 *                   example: {}
 *       400:
 *         description: Error en la solicitud.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 tipoMensaje:
 *                   type: string
 *                   description: Tipo de mensaje (RDE_O25).
 *                   example: "RDE_O25"
 *                 estado:
 *                   type: object
 *                   properties:
 *                     success:
 *                       type: boolean
 *                       description: Indica si la operación fue exitosa.
 *                       example: false
 *                     codigo:
 *                       type: integer
 *                       description: Código de estado (código de error).
 *                       example: 400
 *                     mensaje:
 *                       type: string
 *                       description: Mensaje de error.
 *                       example: "Error en la recepcion de mensaje"
 *                 data:
 *                   type: object
 *                   description: Datos adicionales (puede contener información del error).
 *                   example: {}
 *       500:
 *         description: Error interno del servidor.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 tipoMensaje:
 *                   type: string
 *                   description: Tipo de mensaje (RDE_O25).
 *                   example: "RDE_O25"
 *                 estado:
 *                   type: object
 *                   properties:
 *                     success:
 *                       type: boolean
 *                       description: Indica si la operación fue exitosa.
 *                       example: false
 *                     codigo:
 *                       type: integer
 *                       description: Código de estado (500 para error interno).
 *                       example: 500
 *                     mensaje:
 *                       type: string
 *                       description: Mensaje de error.
 *                       example: "Error interno del servidor."
 *                 data:
 *                   type: object
 *                   description: Datos adicionales (puede contener información del error).
 *                   example: {}
 */
define(["N/log", "N/error", "../domain/2win_dom_farmacia"], function (nLog, error, domFarmacia) {
    /**
     * @function _post - Ejecuta operacion en base a datos recibidos de peticion.
     * @param {object} context - Datos de la peticion recibida.
     * @returns {JSON} - Respuesta a peticion.
     */
    function _post(context) {
        try {
            nLog.debug("_post - context", context);
            const respuesta = domFarmacia.devolverConsumo(context);
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