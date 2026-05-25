/**
 * @desc Librería para registrar procesos en tabla de audítoría.
 * @NApiVersion 2.1
 * @NModuleScope Public
 * @author Sebastian Alayon <sebastian.alayon@2win.cl>
 */
define(["N/search", "N/record", "N/log"], function (search, record, nLog) {
    /**
     * @function obtenerResultados
     * @param {{"type": String,"filters": Array,"columns": Array}} createSearch - Objeto con parametros para la busqueda
     * @returns {Array} - Resultados de la busqueda
     */
    function obtenerResultados(createSearch) {
        try {
            nLog.audit("obtenerResultados - createSearch", {
                type: createSearch.type,
                filters: createSearch.filters,
                tipoDato: typeof createSearch
            });

            // Array que almacenara resultados
            let searchResults = [];

            let saveSearch = search.create(createSearch);
            let searchResultCount;

            // Ejecutar busqueda estandar
            searchResultCount = saveSearch.runPaged().count;
            if (searchResultCount === 0) {
                nLog.debug("obtenerResultados - searchResultCount", "la busqueda no retorno resultados");
                return searchResultCount;
            }
            saveSearch.run().each(function (item) {
                let objectCompiled = {};
                for (let i = 0; i < item.columns.length; i++) {
                    objectCompiled[item.columns[i].label] = item.getValue(item.columns[i]);
                }
                searchResults.push(objectCompiled);
                return true;
            });
            nLog.debug("obtenerResultados - ejecutada", "Obtuvo resultados");

            return searchResults;
        } catch (error) {
            nLog.error("obtenerResultados - error", error);
            throw error;
        }
    }

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
            let result = obtenerResultados(objSearch);

            nLog.audit("validarToken - resultados", {
                extension: result.length,
                resultado: result
            });
            return result;
        } catch (error) {
            nLog.error("validarToken - error", error.message);
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
            nLog.audit("crearReporteAuditoria - datos", {
                datos: datos,
                tipoDato: typeof datos
            });

            // Crear el registro
            let crearRegistro = record.create({ type: "customrecord_2win_auditoria", isDynamic: true });

            // Definir Body fields
            crearRegistro.setValue({ fieldId: "custrecord_2win_auditoria_fecha", value: new Date() });
            nLog.debug("crearReporteAuditoria - custrecord_2win_auditoria_fecha", new Date());
            crearRegistro.setValue({ fieldId: "custrecord_2win_auditoria_proceso", value: datos.nombreProceso });
            nLog.debug("crearReporteAuditoria - custrecord_2win_auditoria_proceso", datos.nombreProceso);
            crearRegistro.setValue({ fieldId: "custrecord_2win_auditoria_id_script", value: datos.scriptId });
            nLog.debug("crearReporteAuditoria - custrecord_2win_auditoria_id_script", datos.scriptId);
            crearRegistro.setValue({ fieldId: "custrecord_2win_auditoria_tipo_registro", value: datos.tipoRegistroCreado });
            nLog.debug("crearReporteAuditoria - custrecord_2win_auditoria_tipo_registro", datos.tipoRegistroCreado);
            crearRegistro.setValue({ fieldId: "custrecord_2win_auditoria_registro_cread", value: datos.idRegistroCreado });
            nLog.debug("crearReporteAuditoria - custrecord_2win_auditoria_registro_cread", datos.idRegistroCreado);
            crearRegistro.setValue({ fieldId: "custrecord_2win_auditoria_etapa", value: datos.etapa });
            nLog.debug("crearReporteAuditoria - custrecord_2win_auditoria_etapa", datos.etapa);
            crearRegistro.setValue({ fieldId: "custrecord_2win_auditoria_estado", value: datos.estado });
            nLog.debug("crearReporteAuditoria - custrecord_2win_auditoria_estado", datos.estado);
            crearRegistro.setValue({ fieldId: "custrecord_2win_auditoria_token", value: datos.tokenProceso });
            nLog.debug("crearReporteAuditoria - custrecord_2win_auditoria_token", datos.tokenProceso);
            crearRegistro.setValue({ fieldId: "custrecord_2win_auditoria_descripcion", value: datos.descripcionResultado });
            nLog.debug("crearReporteAuditoria - custrecord_2win_auditoria_descripcion", datos.descripcionResultado);

            // Guarda registro
            let guardarRegistro = crearRegistro.save({ enableSourcing: true });
            datos.registroAuditoria = guardarRegistro;
            nLog.audit("crearReporteAuditoria - guardarRegistro", guardarRegistro);

            return guardarRegistro;
        } catch (error) {
            nLog.error("crearReporteAuditoria - error", error);
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
            nLog.debug("busquedaDatosAuditoria - token", token);

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
            let result = obtenerResultados(objSearchErrores);

            nLog.audit("busquedaDatosAuditoria - resultados", {
                extension: result.length,
                resultado: result
            });
            return result;
        } catch (error) {
            nLog.error("busquedaDatosAuditoria - error", error);
            throw error;
        }
    }

    return {
        obtenerToken: obtenerToken,
        crearReporteAuditoria: crearReporteAuditoria,
        busquedaDatosAuditoria: busquedaDatosAuditoria
    };
});
