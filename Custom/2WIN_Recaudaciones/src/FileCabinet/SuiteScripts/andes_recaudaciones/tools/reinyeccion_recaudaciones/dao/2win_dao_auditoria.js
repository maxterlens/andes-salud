/**
 * @desc Librería para registrar procesos en tabla de audítoría.
 * @NApiVersion 2.1
 * @NModuleScope Public
 * @author Sebastian Alayon <sebastian.alayon@2win.cl>
 */
define(["./2win_dao", "N/search", "N/record"],

    function (dao, search, record) {

        /**
         * @description Función que se utiliza para generar Token tabla Auditoria.
         * @function obtenerToken.
         */
        function obtenerToken() {
            let uuid = "",
                index,
                random;
            for (index = 0; index < 32; index++) {
                random = (Math.random() * 16) | 0;

                if (index === 8 || index === 12 || index === 16 || index === 20) {
                    uuid += "-";
                }
                uuid += (index === 12 ? 4 : index === 16 ? (random & 3) | 8 : random).toString(16);
            }
            let existsToken = validarToken(uuid);

            if (existsToken.length > 0) obtenerToken();
            else return uuid;
        }

        /**
         * @function validarToken - Función para realizar una busqueda en una tabla de netsuite
         * @param {string} token - Parametro usado en el filtro de la busqueda
         * @returns {Array} - Resultado de busqueda
         */
        function validarToken(token) {
            try {
                // Tipo, filtros y columnas para la busqueda
                let objSearch = {
                    type: "customrecord_2win_auditoria",
                    filters: [["custrecord_2win_auditoria_token", "contains", token]],
                    columns: [search.createColumn({ name: "internalid", label: "internal_id" })]
                };

                // Ejecutar busqueda
                let result = dao.getDataSearch(objSearch);

                log.audit("validarToken - resultados", {
                    extension: result.length,
                    resultado: result
                });
                return result;
            } catch (error) {
                log.error("validarToken - error", error.message);
                throw error;
            }
        }

        /**
         * @function crearReporteAuditoria - Crea un nuevo registro en base a los datos recibidos
         * @param {object} datos - Datos necesarios para crear el registro
         * @returns {Number} - Id de registro creado
         */
        function crearReporteAuditoria(datos) {
            try {
                log.audit("crearReporteAuditoria - datos", {
                    datos: datos,
                    tipoDato: typeof datos
                });

                // Crear el registro
                let crearRegistro = record.create({ type: "customrecord_2win_auditoria", isDynamic: true });

                // Definir Body fields
                crearRegistro.setValue({ fieldId: "custrecord_2win_auditoria_fecha", value: new Date() });
                crearRegistro.setValue({ fieldId: "custrecord_2win_auditoria_proceso", value: datos.nombreProceso });
                crearRegistro.setValue({ fieldId: "custrecord_2win_auditoria_id_script", value: datos.scriptId });
                crearRegistro.setValue({ fieldId: "custrecord_2win_auditoria_tipo_registro", value: datos.tipoRegistroCreado });
                crearRegistro.setValue({ fieldId: "custrecord_2win_auditoria_registro_cread", value: datos.idRegistroCreado });
                crearRegistro.setValue({ fieldId: "custrecord_2win_auditoria_etapa", value: datos.etapa });
                crearRegistro.setValue({ fieldId: "custrecord_2win_auditoria_estado", value: datos.estado });
                crearRegistro.setValue({ fieldId: "custrecord_2win_auditoria_token", value: datos.tokenProceso });
                crearRegistro.setValue({ fieldId: "custrecord_2win_auditoria_descripcion", value: datos.descripcionResultado });

                // Guarda registro
                let guardarRegistro = crearRegistro.save({ enableSourcing: true });
                datos.registroAuditoria = guardarRegistro;
                log.audit("crearReporteAuditoria - guardarRegistro", guardarRegistro);

                return guardarRegistro;
            } catch (error) {
                log.error("crearReporteAuditoria - error", error);
                throw error;
            }
        }

        /**
         * @function busquedaDatosAuditoria - Recuperar datos de la tabla 2win auditoria
         * @param {String} token - Parametro usado para el filtro
         * @returns {Object} - Resultado de busqueda
         */
        function busquedaDatosAuditoria(token) {
            try {
                log.debug("busquedaDatosAuditoria - token", token);

                let objSearchErrores = {
                    type: "customrecord_2win_auditoria",
                    filters: [["custrecord_2win_auditoria_token", "contains", token]],
                    columns: [
                        search.createColumn({ name: "custrecord_2win_auditoria_proceso", label: "nombreProceso" }),
                        search.createColumn({ name: "custrecord_2win_auditoria_tipo_registro", label: "tipoRegistro" }),
                        search.createColumn({ name: "custrecord_2win_auditoria_etapa", label: "etapa" }),
                        search.createColumn({ name: "custrecord_2win_auditoria_descripcion", label: "descripcion" })
                    ]
                };
                let result = dao.getDataSearch(objSearchErrores);

                log.audit("busquedaDatosAuditoria - resultados", {
                    extension: result.length,
                    resultado: result
                });
                return result;
            } catch (error) {
                log.error("busquedaDatosAuditoria - error", error);
                throw error;
            }
        }

        /**
         * @function busquedaRegistrosFallidos - Recuperar datos de la tabla 2win auditoria
         * @param {String} fecha - Parametro usado para el filtro
         * @returns {Object} - Resultado de busqueda
         */
        function busquedaRegistrosFallidos(fecha) {
            try {
                log.debug("busquedaRegistrosFallidos - fecha", fecha);

                let objSearchErrores = {
                    type: "customrecord_2win_auditoria",
                    filters:    [
                        [
                            ["created", "on", fecha],
                            "OR",
                            ["lastmodified", "on", fecha]
                        ],
                        "AND",
                        ["custrecord_2win_auditoria_proceso", "contains", "Recaudaciones Flujo"],
                        "AND",
                        ["custrecord_2win_auditoria_estado", "isnot", "000"],
                        "AND",
                        ["custrecord_2win_auditoria_descripcion", "contains", "No se encontraron"],
                    ],
                    columns: [
                        search.createColumn({ name: "internalid", label: "internalid" }),
                        search.createColumn({ name: "custrecord_2win_auditoria_proceso", label: "custrecord_2win_auditoria_proceso" }),
                        search.createColumn({ name: "custrecord_2win_auditoria_id_script", label: "custrecord_2win_auditoria_id_script" }),
                        search.createColumn({ name: "custrecord_2win_auditoria_etapa", label: "custrecord_2win_auditoria_etapa" }),
                        search.createColumn({ name: "custrecord_2win_auditoria_estado", label: "custrecord_2win_auditoria_estado" }),
                        search.createColumn({ name: "custrecord_2win_auditoria_token", label: "custrecord_2win_auditoria_token" }),
                        search.createColumn({ name: "custrecord_2win_auditoria_descripcion", label: "custrecord_2win_auditoria_descripcion" })
                    ]
                };
                let result = dao.getDataSearch(objSearchErrores);

                log.audit("busquedaRegistrosFallidos - resultados", {
                    extension: result.length,
                    resultado: result
                });
                return result;
            } catch (error) {
                log.error("busquedaRegistrosFallidos - error", error);
                throw error;
            }
        }

        return {
            obtenerToken: obtenerToken,
            crearReporteAuditoria: crearReporteAuditoria,
            busquedaDatosAuditoria: busquedaDatosAuditoria,
            busquedaRegistrosFallidos: busquedaRegistrosFallidos
        };
    }
);
