/**
 * @NApiVersion 2.1
 * @NScriptType Restlet
 * @description Script para recepcion de datos Andes Salud. "Consulta de Stock"
 * @swagger
 * /restlet.nl?script=2364&deploy=1:
 *   post:
 *     summary: Consulta de Stock
 *     description: Consulta el stock de un producto.
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
 *                 example: "STOCK^VAL"
 *               datos:
 *                 type: object
 *                 properties:
 *                   codigoProducto:
 *                     type: string
 *                     example: "02001502"
 *                   cantidad:
 *                     type: integer
 *                     example: 1
 *                   codigoBodega:
 *                     type: string
 *                     example: "CAR (CASCH)"
 *                   unidadProducto:
 *                     type: string
 *                     example: "Comprimido"
 *                   identificadorUnicoFila:
 *                     type: integer
 *                     example: 1
 *                   numeroFicha:
 *                     type: integer
 *                     example: 1234
 *                   numeroIngreso:
 *                     type: integer
 *                     example: 1
 *                   numeroCuentaPaciente:
 *                     type: integer
 *                     example: 45000
 *                   estado:
 *                     type: string
 *                     example: "Agregar"
 *                   codigoServicio:
 *                     type: string
 *                     example: "CEM"
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
 *       200:
 *         description: OK. Respuesta de la validación de stock.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 tipoMensaje:
 *                   type: string
 *                   example: "STOCK^VAL"
 *                 estado:
 *                   type: object
 *                   properties:
 *                     success:
 *                       type: boolean
 *                       example: true
 *                     codigo:
 *                       type: integer
 *                       example: 200
 *                     mensaje:
 *                       type: string
 *                       example: "Validación de stock completada"
 *                 data:
 *                   type: object
 *                   properties:
 *                     resultado:
 *                       type: boolean
 *                       example: true
 */
define(["N/log", "N/error", "../domain/2win_dom_farmacia", "../lib/2win_lib_error"], function (nLog, error, farmacia, { errorHandler }) {
    /**
     * @function _post - Ejecuta operacion en base a datos recibidos de peticion.
     * @param {object} context - Datos de la peticion recibida.
     * @returns {JSON} - Respuesta a peticion.
     */
    function _post(context) {
        try {
            nLog.debug("_post - context", context);
            // let { messageRaw } = context;
            const respuesta = farmacia.consultarStock(context);
            return respuesta;
        } catch (err) {
            nLog.error("_post - error", err);
            throw {
                name: err.name || "CUSTOM_VALIDATION_ERROR",
                message: err.message,
                notifyOff: true
            };
            // throw errorHandler(err);
        }
    }

    return {
        post: _post
    };
});
