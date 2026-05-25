/**
 * @NApiVersion 2.1
 * @NScriptType Restlet
 * @description Script para recepcion de datos Andes Salud."Ingresos amabulatorios SEND^REV"
 * @swagger
 * components:
 *   securitySchemes:
 *     OAuth2:
 *       type: oauth2
 *       flows:
 *         clientCredentials:
 *           tokenUrl: https://{accountId}.suitetalk.api.netsuite.com/services/rest/auth/oauth2/v1/token
 *           scopes:
 *             restlets: "Acceso a Restlets de NetSuite"
 *   schemas:
 *     RespuestaSendRev:
 *       type: object
 *       description: Respuesta del servidor con el resultado de la operacion.
 *       properties:
 *         tipoMensaje:
 *           type: string
 *           description: Identifica proceso ejecutado.
 *           example: SEND^REV
 *         estado:
 *           type: object
 *           description: Contiene detalle de la Respuesta
 *           properties:
 *             success:
 *               type: boolean
 *             codigo:
 *               type: number
 *             mensaje:
 *               type: string
 *             tipo_proceso:
 *               type: string
 *             id_proceso:
 *               type: string
 *           example:
 *             success: true
 *             codigo: 200
 *             mensaje: "Actualización de cargos recibido con éxito"
 *             tipo_proceso: ingresos ambulatorios
 *             id_proceso: 2dacf0fa-f443-4a4f-8c4e-c6fb70efcacf
 *
 * /restlet.nl?script=2154&deploy=1:
 *   put:
 *     security:
 *       - OAuth2: []
 *     tags:
 *       - Ingresos Ambulatorios + Ingresos Hospitalizados
 *     summary: Eliminar lineas a orden de venta SEND^REV
 *     description: Recibe objeto con datos desde Andes Salud y edita la orden de venta existente en NetSuite eliminando lineas, corresponde al mensaje SEND^REV.
 *     parameters:
 *       - name: script
 *         in: query
 *         description: script a cargo la peticion.
 *         required: true
 *         example: 2048
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
 *               tipoMensaje:
 *                 type: string
 *                 description: Identifica proceso a ejecutar.
 *                 example: SEND^REV
 *               datos:
 *                 type: object
 *                 description: Contenedor de los datos para ejecucion de proceso.
 *                 example:
 *                   {
 *                     "FechaEnvio": "2025-03-18",
 *                     "Pacientes": [
 *                       {
 *                         "IdPaciente": "621777",
 *                         "Ficha": 78910,
 *                         "Ingreso": 3,
 *                         "cuentaPaciente": 78910003,
 *                         "detallePrestaciones": [
 *                           {
 *                             "CrgCorrel": 0,
 *                             "CodigoGrupoPrefactura": "02001502",
 *                             "RutFinanciador": "184162865",
 *                             "CodigoConvenio": "conv001",
 *                             "NombreConvenio": "Convenio General",
 *                             "NombrePaquete": "NombrePaquete",
 *                             "CodigoPaquete": "CodigoPaquete",
 *                             "MontoAfecto": 100,
 *                             "MontoExento": 1000,
 *                             "Iva": 19,
 *                             "Total": 1119,
 *                             "CodServicio": "400"
 *                           }
 *                         ],
 *                         "RutEmpresa": "1",
 *                         "TipoAtencion": "A",
 *                         "FechaEnvio": "20250818",
 *                         "FechaAlta": "20250818"
 *                       }
 *                     ]
 *                   }
 *     responses:
 *       '200':
 *         description: Se ejecuto proceso en NetSuite.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/RespuestaSendRev'
 *       '400':
 *         description: Error en la solicitud o datos inválidos.
 *       '500':
 *         description: Error interno del servidor.
 */

define(["../domain/2win_dom_orden_venta", "N/error", "N/log"], function (domOrdenVenta, error, nLog) {
    /**
     * @function _put - Ejecuta operacion en base a datos recibidos de peticion.
     * @param {object} context - Datos de la peticion recibida.
     * @returns {JSON} - Respuesta a peticion.
     */
    function _put(context) {
        try {
            nLog.debug("_put - context", context);

            // Recepcion de datos recibidos de la peticion
            let respuesta = domOrdenVenta.recepcionDatos(context);
            nLog.debug("_put - respuesta", respuesta);

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
