/**
 * @desc Librería para registrar procesos en tabla de audítoría.
 * @NApiVersion 2.x
 * @NModuleScope Public
 * @author Sebastian Alayon <sebastian.alayon@2win.cl>
 */
define(["N/search", "N/record"], function (search, record) {

    /**
     * @function obtenerResultados
     * @param {{"type": String,"filters": Array,"columns": Array}} createSearch - Objeto con parametros para la busqueda
     * @returns {Array} - Resultados de la busqueda
     */
    function obtenerResultados(createSearch) {
        try {
            log.audit("obtenerResultados - createSearch", {
                "type": createSearch.type,
                "filters": createSearch.filters,
                "tipoDato": typeof (createSearch)
            })

            // Array que almacenara resultados
            var searchResults = [];

            var saveSearch = search.create(createSearch);
            var searchResultCount;

            // Ejecutar busqueda estandar
            searchResultCount = saveSearch.runPaged().count;
            if (searchResultCount == 0) {
                log.debug("obtenerResultados - searchResultCount", "la busqueda no retorno resultados")
                return searchResultCount
            }
            saveSearch.run().each(function (item) {
                var objectCompiled = {};
                for (var i = 0; i < item.columns.length; i++) {
                    objectCompiled[item.columns[i].label] = item.getValue(item.columns[i]);
                }
                searchResults.push(objectCompiled);
                return true;
            });
            log.debug("obtenerResultados - ejecutada", "Obtuvo resultados")

            return searchResults;
        } catch (error) {
            log.error("obtenerResultados - error", error)
            throw error
        }
    };

    /**
    * @description Función que se utiliza para generar Token tabla Auditoria.
    * @function obtenerToken.
    */
    function obtenerToken() {
        var uuid = "", i, random;
        for (i = 0; i < 32; i++) {
            random = Math.random() * 16 | 0;

            if (i == 8 || i == 12 || i == 16 || i == 20) {
                uuid += "-"
            }
            uuid += (i == 12 ? 4 : (i == 16 ? (random & 3 | 8) : random))
                .toString(16);
        }
        var existsToken = validarToken(uuid);

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
            var objSearch = {
                type: "customrecord_2win_auditoria",
                filters: [
                    ["custrecord_2win_auditoria_token", "contains", token]
                ],
                columns: [
                    search.createColumn({ name: "internalid", label: "internal_id" })
                ]
            }

            // Ejecutar busqueda
            var result = obtenerResultados(objSearch);

            log.audit("validarToken - resultados", {
                "extension": result.length,
                "resultado": result
            });
            return result;
        } catch (error) {
            log.error("validarToken - error", error.message);
            throw error
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
                "datos": datos,
                "tipoDato": typeof (datos)
            })

            // Crear el registro
            var crearRegistro = record.create({ type: "customrecord_2win_auditoria", isDynamic: true });

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

            // Guarda registro (enableSourcing: false para mejor performance)
            var guardarRegistro = crearRegistro.save({ enableSourcing: false, ignoreMandatoryFields: true });
            datos.registroAuditoria = guardarRegistro
            log.audit("crearReporteAuditoria - guardarRegistro", guardarRegistro);

            return guardarRegistro;
        } catch (error) {
            log.error("crearReporteAuditoria - error", error)
            throw error
        }
    }

    /**
     * @function busquedaDatosAuditoria - Recuperar datos de la tabla 2win auditoria 
     * @param {String} token - Parametro usado para el filtro
     * @returns {Object} - Resultado de busqueda
     */
    function busquedaDatosAuditoria(token) {
        try {
            log.debug("busquedaDatosAuditoria - token", token)

            var objSearchErrores = {
                type: "customrecord_2win_auditoria",
                filters: [
                    ["custrecord_2win_auditoria_token", "contains", token]
                ],
                columns: [
                    search.createColumn({ name: "custrecord_2win_auditoria_proceso", label: "nombreProceso" }),
                    search.createColumn({ name: "custrecord_2win_auditoria_tipo_registro", label: "tipoRegistro" }),
                    search.createColumn({ name: "custrecord_2win_auditoria_etapa", label: "etapa" }),
                    search.createColumn({ name: "custrecord_2win_auditoria_descripcion", label: "descripcion" })
                ]
            }
            var result = obtenerResultados(objSearchErrores);

            log.audit("busquedaDatosAuditoria - resultados", {
                "extension": result.length,
                "resultado": result
            });
            return resultadoSearch;
        } catch (error) {
            log.error("busquedaDatosAuditoria - error", error);
            throw error
        }
    }

    /**
     * @function crearReportesAuditoriaBatch - Crea múltiples registros de auditoría en batch
     * @param {Array<object>} listaDatos - Array de objetos con datos de auditoría
     * @returns {Array<Number>} - Array con IDs de registros creados
     */
    function crearReportesAuditoriaBatch(listaDatos) {
        try {
            log.audit("crearReportesAuditoriaBatch - inicio", {
                "total": listaDatos.length
            });

            var idsCreados = [];

            for (var i = 0; i < listaDatos.length; i++) {
                var datos = listaDatos[i];

                // Crear el registro sin isDynamic para mejor performance
                var crearRegistro = record.create({
                    type: "customrecord_2win_auditoria",
                    isDynamic: false
                });

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
                var guardarRegistro = crearRegistro.save({
                    enableSourcing: false,
                    ignoreMandatoryFields: true
                });

                idsCreados.push(guardarRegistro);
            }

            log.audit("crearReportesAuditoriaBatch - completado", {
                "registrosCreados": idsCreados.length,
                "ids": idsCreados
            });

            return idsCreados;
        } catch (error) {
            log.error("crearReportesAuditoriaBatch - error", error);
            throw error;
        }
    }

    return {
        obtenerToken: obtenerToken,
        crearReporteAuditoria: crearReporteAuditoria,
        crearReportesAuditoriaBatch: crearReportesAuditoriaBatch,
        busquedaDatosAuditoria: busquedaDatosAuditoria
    }
});