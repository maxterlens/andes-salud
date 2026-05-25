/**
 * @NApiVersion 2.1
 * @NScriptType Restlet
 * @description Script para recepcion de datos Andes Salud. "Actualización de Precio de Productos"
 * @swagger
 * /restlet.nl?script=2362&deploy=1:
 *   post:
 *     summary: Actualización de Precio de Productos
 *     description: Actualiza el precio de un producto.
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
 *                 example: "ActualizacionPrecioProducto"
 *               consumoMedicamentos:
 *                 type: object
 *                 properties:
 *                   identificadorUnicoPaciente:
 *                     type: integer
 *                     example: 100
 *                   numeroFicha:
 *                     type: integer
 *                     example: 1234
 *                   numeroIngreso:
 *                     type: integer
 *                     example: 1
 *                   numeroCuentaPaciente:
 *                     type: string
 *                     example: "45000"
 *                   identificadorUnicoFila:
 *                     type: integer
 *                     example: 17072025
 *                   codigoProducto:
 *                     type: string
 *                     example: "pro1234"
 *                   codigoServicio:
 *                     type: string
 *                     example: "CEM"
 *                   codigoBodega:
 *                     type: string
 *                     example: "BCN"
 *                   valorNeto:
 *                     type: integer
 *                     example: 2500
 *                   valorExento:
 *                     type: integer
 *                     example: 0
 *                   valorIVA:
 *                     type: integer
 *                     example: 475
 *                   valorTotal:
 *                     type: integer
 *                     example: 2975
 *     responses:
 *       '200':
 *         description: Se actualizo correctamente el precio del producto.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                  tipoMensaje:
 *                      type: string
 *                      example: "ActualizacionPrecioProducto"
 *                  estado:
 *                      type: object
 *                      properties:
 *                          success:
 *                              type: boolean
 *                              example: true
 *                          codigo:
 *                              type: number
 *                              example: 200
 *                          mensaje:
 *                              type: string
 *                              example: "Acción registrada correctamente en NetSuite"
 *                  data:
 *                      type: object
 *       '400':
 *         description: Error en la solicitud o datos inválidos.
 *       '500':
 *         description: Error interno del servidor.
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
            // let { messageRaw } = context;
            const respuesta = domFarmacia.actualizarPrecioProducto(context);
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
