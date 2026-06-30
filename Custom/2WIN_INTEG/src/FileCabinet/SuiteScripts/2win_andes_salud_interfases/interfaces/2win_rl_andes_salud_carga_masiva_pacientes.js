/**
 * @NApiVersion 2.1
 * @NScriptType Restlet
 * @description Script para carga masiva de pacientes desde Andes Salud
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
 *     summary: Carga masiva de pacientes
 *     description: Recibe un array de pacientes y los procesa de forma asíncrona usando Map/Reduce
 *     parameters:
 *       - name: script
 *         in: query
 *         description: script a cargo la peticion.
 *         required: true
 *         example: XXXX
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
 *             type: array
 *             items:
 *               type: object
 *               properties:
 *                 messageRaw:
 *                   type: string
 *                   description: Mensaje HL7 completo del paciente
 *                   example: "MSH|^~\\&|SistemaClinico1|Hospital Central|SistemaERP|Sucursal Norte|20250805122257||ADT^A04|MSG96153|P|2.5\rEVN|A04|20250805122257|02\rPID|1|68568609^^^HOSPITAL^RUT|ID_TEST_47487488||Olsson^Gomez^Olaf Sven||19850615|M|||Av chile^^Santiago^Metropolitana^110111^Chile||+563665873166^^^|||S||987654321|A1234567\rPV1|TIPO_VISITA|UBICACION_VISITA^SALA^CAMA^INSTITUCION||||ID_MEDICO_RESPONSABLE^APELLIDO_MEDICO^NOMBRE_MEDICO|||TIPO_ADMISION|||||||ID_NUMERO_CONTRATO|||||||||||||||||||||||FECHA_HORA_ADMISION\r"
 *                 idSecuencial:
 *                   type: string
 *                   description: Identificador secuencial para mantener el orden
 *                   example: "1"
 *     responses:
 *       '200':
 *         description: Carga masiva iniciada correctamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 tipoMensaje:
 *                   type: string
 *                   description: Tipo de mensaje procesado
 *                   example: "CREACION^PACIENTE_MASIVO"
 *                 estado:
 *                   type: string
 *                   description: Estado del proceso
 *                   example: "success"
 *                 codigo:
 *                   type: integer
 *                   description: Código de respuesta
 *                   example: 200
 *                 mensaje:
 *                   type: string
 *                   description: Mensaje de confirmación
 *                   example: "Operación masiva recibida correctamente"
 *                 tipo_proceso:
 *                   type: string
 *                   description: Nombre del proceso
 *                   example: "Carga Masiva Pacientes"
 *                 id_proceso:
 *                   type: string
 *                   description: UUID del proceso
 *                   example: "550e8400-e29b-41d4-a716-446655440000"
 *                 custodiaCreada:
 *                   type: object
 *                   description: Información de registros de custodia creados para seguimiento individual
 *                   properties:
 *                     totalRegistros:
 *                       type: integer
 *                       description: Total de registros de custodia creados
 *                       example: 100
 *                     registros:
 *                       type: array
 *                       description: Array de registros de custodia
 *                       items:
 *                         type: object
 *                         properties:
 *                           indice:
 *                             type: integer
 *                             description: Índice del paciente en el array original
 *                             example: 0
 *                           custodiaId:
 *                             type: integer
 *                             description: ID del registro de custodia
 *                             example: 12345
 *                           externalId:
 *                             type: string
 *                             description: External ID único para seguimiento
 *                             example: "carga_pacientes_1700000000000_0"
 *       '400':
 *         description: Error en la solicitud o datos inválidos
 *       '500':
 *         description: Error interno del servidor
 */

define(["N/log", "N/error", "../domain/2win_dom_operaciones_masivas", "../lib/2win_lib_custodia"], function (nLog, error, { OperacionMasiva }, libCustodia) {
    /**
     * @function _post - Inicia el proceso de carga masiva de pacientes
     * @param {object} context - Datos de la peticion recibida (array de pacientes)
     * @returns {object} - Respuesta con el taskId de la tarea Map/Reduce
     */
    function _post(context) {
        try {
            nLog.audit("_post - inicio", "Iniciando carga masiva de pacientes");

            // Validar que se reciba un array
            if (!Array.isArray(context)) {
                throw error.create({
                    name: "INVALID_REQUEST",
                    message: "El cuerpo de la petición debe ser un array de pacientes"
                });
            }

            // Validar que el array no esté vacío
            if (context.length === 0) {
                throw error.create({
                    name: "INVALID_REQUEST",
                    message: "El array de pacientes no puede estar vacío"
                });
            }

            // Validar límite de registros (recomendado: máximo 500 por lote)
            const MAX_REGISTROS = 500;
            if (context.length > MAX_REGISTROS) {
                throw error.create({
                    name: "INVALID_REQUEST",
                    message: `El array no puede contener más de ${MAX_REGISTROS} registros por lote`
                });
            }

            // Validar estructura de cada paciente y crear registros de custodia
            const idsCustodiaCreados = [];
            const contextoConCustodia = context.map((paciente, i) => {
                if (!paciente.messageRaw) {
                    throw error.create({
                        name: "INVALID_REQUEST",
                        message: `El paciente en posición ${i} no tiene el campo 'messageRaw'`
                    });
                }

                // Crear registro de custodia para cada paciente
                const externalId = `carga_pacientes_${Date.now()}_${i}`;
                const custodiaData = {
                    externalid: externalId,
                    custrecord_2win_as_emisor: "ANDES_SALUD",
                    custrecord_2win_as_receptor: "NETSUITE",
                    custrecord_2win_as_fecha_mensaje: new Date(),
                    custrecord_2win_as_tiempo_proceso: Date.now(),
                    custrecord_2win_as_interface: "carga masiva pacientes",
                    codigoRespuesta: "PENDIENTE",
                    datosEntrada: JSON.stringify(paciente),
                    respuesta: "Pendiente de procesamiento",
                    reintentos: 0
                };

                const custodiaId = libCustodia.crearRegistro(custodiaData);
                idsCustodiaCreados.push({
                    indice: i,
                    custodiaId: custodiaId,
                    externalId: externalId
                });

                nLog.debug(`Creando custodia para paciente ${i}`, {
                    custodiaId: custodiaId,
                    externalId: externalId
                });

                // Agregar ID de custodia al objeto paciente para el Map/Reduce
                return {
                    ...paciente,
                    _custodiaId: custodiaId,
                    _custodiaExternalId: externalId,
                    _indice: i
                };
            });

            nLog.audit("Registros de custodia creados", {
                totalCustodias: idsCustodiaCreados.length,
                ids: idsCustodiaCreados
            });

            // Crear operación masiva usando la librería estándar
            const operacion = new OperacionMasiva({
                nombre: "Carga Masiva Pacientes",
                tipoMensaje: "CREACION^PACIENTE_MASIVO",
                scriptIdMapReduce: "customscript_2win_mr_andes_salud_c_pac",
                deploymentIdMapReduce: "customdeploy_2win_mr_andes_salud_c_pac",
                folderId: 1247,
                mapReduceParameter: "custscript_mr_pacientes_data"
            });

            // Procesar usando la librería de operaciones masivas (con datos de custodia)
            const respuesta = operacion.procesar(contextoConCustodia);

            nLog.audit("_post - respuesta", respuesta);

            // Agregar información de custodia a la respuesta
            respuesta.custodiaCreada = {
                totalRegistros: idsCustodiaCreados.length,
                registros: idsCustodiaCreados
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
