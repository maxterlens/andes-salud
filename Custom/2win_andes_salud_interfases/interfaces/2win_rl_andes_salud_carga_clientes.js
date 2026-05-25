/**
 * @NApiVersion 2.1
 * @NScriptType Restlet
 * @description Restlet para recepción masiva de mensajes HL7 de clientes desde Andes Salud
 * @swagger
 * components:
 *   securitySchemes:
 *     OAuth2:
 *       type: oauth2
 *       flows:
 *         clientCredentials:
 *           tokenUrl: https://{accountId}.suitetalk.api.netsuite.com/services/rest/auth/oauth2/v1/token
 *           scopes:
 *             restlets: Acceso a Restlets de NetSuite
 *
 * /restlet.nl?script=XXXX&deploy=1:
 *   post:
 *     security:
 *       - OAuth2: []
 *     tags:
 *       - MPI - Paciente
 *     summary: Carga masiva de clientes ADT^A04
 *     description: Recibe un array de mensajes HL7 (ADT^A04) para crear múltiples clientes en NetSuite
 *     parameters:
 *       - name: script
 *         in: query
 *         description: script a cargo la peticion.
 *         required: true
 *         schema:
 *           type: integer
 *       - name: deploy
 *         in: query
 *         description: deploy del script
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               mensajes:
 *                 type: array
 *                 description: Array de mensajes HL7 completos (ADT^A04)
 *                 items:
 *                   type: string
 *                   example: "MSH|^~\\&|SistemaClinico1|Hospital Central|SistemaERP|Sucursal Norte|20250805122257||ADT^A04|MSG96153|P|2.5\rEVN|A04|20250805122257|02\rPID|1|68568609^^^HOSPITAL^RUT|ID_TEST_47487488||Olsson^Gomez^Olaf Sven||19850615|M|||Av chile^^Santiago^Metropolitana^110111^Chile||+563665873166^^^|||S||987654321|A1234567\r"
 *               nombreProceso:
 *                 type: string
 *                 description: Identificador del proceso (opcional)
 *                 example: "Carga_Clientes_20250129"
 *     responses:
 *       '200':
 *         description: Proceso iniciado correctamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code_error:
 *                   type: string
 *                   example: "000"
 *                 code_desc:
 *                   type: string
 *                   example: "Proceso iniciado correctamente"
 *                 data:
 *                   type: object
 *                   properties:
 *                     idProceso:
 *                       type: string
 *                       description: ID del proceso Map/Reduce
 *                     nombreArchivo:
 *                       type: string
 *                       description: Nombre del archivo creado en File Cabinet
 *                     cantidadMensajes:
 *                       type: integer
 *                       description: Cantidad de mensajes recibidos
 *       '400':
 *         description: Error en la solicitud o datos inválidos
 *       '500':
 *         description: Error interno del servidor
 */

define(["../dao/2win_dao_file", "../dao/2win_dao_hl7", "N/log", "N/task", "N/error", "../lib/2win_lib_auditoria", "N/file"], function (daoFile, daoHl7, nLog, task, error, libAuditoria, file) {
    /**
     * @function _post - Ejecuta carga masiva de clientes
     * @param {object} context - Datos de la peticion recibida
     * @returns {object} - Respuesta a peticion
     */
    function _post(context) {
        try {
            nLog.audit("_post - context", context);

            // Validar que se recibieron mensajes
            if (!context.mensajes || !Array.isArray(context.mensajes)) {
                throw error.create({
                    name: "INVALID_PARAM",
                    message: "El parametro 'mensajes' es requerido y debe ser un array"
                });
            }

            if (context.mensajes.length === 0) {
                throw error.create({
                    name: "EMPTY_ARRAY",
                    message: "El array de mensajes no puede estar vacío"
                });
            }

            // Generar nombre de archivo para el proceso
            const timestamp = new Date().getTime();
            const nombreProceso = context.nombreProceso || `carga_clientes_${timestamp}`;
            const nombreArchivo = `${nombreProceso}.json`;

            nLog.audit("_post - Iniciando carga masiva", {
                cantidadMensajes: context.mensajes.length,
                nombreProceso: nombreProceso,
                nombreArchivo: nombreArchivo
            });

            // Crear objeto con los datos a procesar
            const datosProceso = {
                tipoOperacion: "crear",
                mensajes: context.mensajes,
                nombreProceso: nombreProceso,
                fechaCreacion: new Date().toISOString()
            };

            // Obtener o crear carpeta para archivos de carga masiva
            // TODO: Configurar el ID de carpeta correcto según el ambiente
            let idCarpeta = daoFile.buscarCarpetaPorNombre("Cargas Masivas Clientes");
            if (!idCarpeta) {
                idCarpeta = context.folderId || -12; // Folder por defecto (ajustar según necesidad)
            }

            // Crear archivo en File Cabinet
            const archivoCreado = daoFile.crearArchivo({
                nombre: nombreArchivo,
                contenido: JSON.stringify(datosProceso),
                folder: idCarpeta,
                tipo: file.Type.PLAINTEXT,
                encoding: file.Encoding.UTF8
            });

            nLog.audit("_post - Archivo creado", {
                internalId: archivoCreado.id,
                nombre: archivoCreado.nombre
            });

            // Crear tarea Map/Reduce
            const mrTask = task.create({
                taskType: task.TaskType.MAP_REDUCE,
                scriptId: "customscript_2win_mr_andes_salud_carga_c",
                deploymentId: "customdeploy_2win_mr_andes_salud_carga_c",
                params: {
                    custscript_mr_as_carga_clientes_archivo: archivoCreado.internalId
                }
            });

            const taskId = mrTask.submit();

            nLog.audit("_post - Tarea Map/Reduce iniciada", {
                taskId: taskId
            });

            // Respuesta exitosa
            const respuesta = {
                code_error: "000",
                code_desc: "Proceso iniciado correctamente",
                data: {
                    idProceso: taskId,
                    nombreArchivo: nombreArchivo,
                    cantidadMensajes: context.mensajes.length,
                    carpetaArchivo: idCarpeta,
                    mensaje: "El proceso se está ejecutando en segundo plano. Use el ID de proceso para consultar el estado."
                }
            };

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
