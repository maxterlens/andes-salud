/**
 * @NApiVersion 2.1
 * @NScriptType Restlet
 * @description Script para recepcion de datos Andes Salud. "RDE_O11"
 * @swagger
 * /restlet.nl?script=2157&deploy=1:
 *   post:
 *     summary: Crear Orden de Farmacia (RDE_O11)
 *     description: Crea una orden de farmacia para consumo de medicamentos.
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
 *                 example: "RDE_O11"
 *               consumoMedicamentos:
 *                 type: object
 *                 properties:
 *                   numeroFicha:
 *                     type: string
 *                     example: "FARM_01"
 *                   numeroIngreso:
 *                     type: string
 *                     example: "ADM009"
 *                   codigoProducto:
 *                     type: string
 *                     example: "01001838"
 *                   consumo:
 *                     type: string
 *                     example: "S"
 *                   numeroCuentaPaciente:
 *                     type: integer
 *                     example: 45000
 *                   identificadorUnicoPaciente:
 *                     type: string
 *                     example: "154879452"
 *                   servicioBodega:
 *                     type: string
 *                     example: "bod_ug"
 *                   cantidad:
 *                     type: integer
 *                     example: 1
 *                   codigoServicio:
 *                     type: string
 *                     example: "ADM"
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
 *         description: Orden de farmacia creada correctamente.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 tipoMensaje:
 *                   type: string
 *                   description: Tipo de mensaje (RDE_O11).
 *                   example: "RDE_O11"
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
 *                       example: "Orden de farmacia creada correctamente en NetSuite"
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
 *                   description: Tipo de mensaje (RDE_O11).
 *                   example: "RDE_O11"
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
 *                   description: Tipo de mensaje (RDE_O11).
 *                   example: "RDE_O11"
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
define(["N/log", "N/error", "../domain/2win_dom_farmacia"], (nLog, error, domFarmacia) => {
    const _post = (context) => {
        try {
            nLog.debug("_post - context", context);
            const response = domFarmacia.crearOrdenConsumo(context);

            return response;
        } catch (err) {
            nLog.error("_post - error", err);
            throw {
                name: err.name || "CUSTOM_VALIDATION_ERROR",
                message: err.message,
                notifyOff: true
            };
        }
    };

    return {
        post: _post
    };
});
