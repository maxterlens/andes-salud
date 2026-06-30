/**
 * @NApiVersion 2.1
 * @NScriptType Restlet
 * @description Script para recepcion de datos Andes Salud. "Listado de Stock por Bodega"
 * @swagger
 * /restlet.nl?script=2363&deploy=1:
 *   post:
 *     summary: Listado de Stock por Bodega
 *     description: Obtiene el listado de stock para una bodega específica.
 *     tags:
 *       - "AN-14 Cuenta Abierta - Atencion Ambulatoria"
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               CodigoBodega:
 *                 type: string
 *                 example: "VPF (CASC)"
 *     responses:
 *       200:
 *         description: OK. Respuesta exitosa con el listado de productos por bodega.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 bodega:
 *                   type: string
 *                   example: "VPF (CASC)"
 *                 productos:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       nombreProducto:
 *                         type: string
 *                         example: "Celecoxib Test"
 *                       codigoProducto:
 *                         type: string
 *                         example: ""
 *                       unidadMedida:
 *                         type: string
 *                         example: "unidad"
 *                       cantidadDisponible:
 *                         type: integer
 *                         example: 100
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 error:
 *                   type: string
 *                   example: ""
 *                 tipoMensaje:
 *                   type: string
 *                   example: "listarPorBodega_"
 *                 mensaje:
 *                   type: string
 *                   example: "Listado por bodega recibido con éxito"
 */
define(["N/log", "N/error", "../domain/2win_dom_producto"], function (nLog, error, producto) {
    /**
     * @function _post - Ejecuta operacion en base a datos recibidos de peticion.
     * @param {object} context - Datos de la peticion recibida.
     * @returns {JSON} - Respuesta a peticion.
     */
    function _post(context) {
        try {
            nLog.debug("_post - context", context);
            // let { messageRaw } = context;
            const respuesta = producto.listarPorBodega(context);
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
