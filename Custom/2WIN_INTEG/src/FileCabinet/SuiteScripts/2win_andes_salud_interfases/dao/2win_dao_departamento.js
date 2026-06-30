/**
 * @NApiVersion 2.1
 * @module ./2win_dao_departamento.js
 * @NModuleScope Public
 */
define(["./2win_dao", "N/search", "N/log", "N/record", "../lib/2win_lib_peticion"], function (dao, search, nLog, record, libPeticion) {
    /**
     * @function busquedaRegistroPorCodigo - Función para realizar una busqueda en una tabla de netsuite.
     * @param {string} parametro - Parametros a usar en los filtros de la busqueda.
     * @return {Array} - Resultados de la busqueda.
     */
    function busquedaRegistroPorCodigo(parametro) {
        try {
            nLog.debug("busquedaRegistroPorCodigo - parametro", {
                parametro: parametro,
                tipoDato: typeof parametro
            });

            // Tipo, filtros y columnas para la busqueda
            let objSearch = {
                type: "department",
                /**@todo - Ajustar filtro de busqueda */
                filters: [["internalid", "is", parametro]], // custrecord_2w_codigo_departamento
                columns: [
                    // Campos cuerpo registro
                    search.createColumn({ name: "internalid", label: "internalid" })
                ]
            };
            let filtros = `tipo: ${objSearch.type}, filtros: ${objSearch.filters}`;

            // Ejecutar busqueda
            let result = dao.obtenerResultados(objSearch);
            nLog.audit("busquedaRegistroPorCodigo - resultados", {
                extension: result.length,
                resultado: result
            });

            // Valida que la busqueda retorne resultados
            if (result.length > 0) {
                return result;
            } else {
                throw new Error(`No se encontro servicio para codigo: ${parametro}`);
            }
        } catch (error) {
            nLog.error("busquedaRegistroPorCodigo - error", error);
            throw error;
        }
    }

    /**
     * @function recuperarCamposRegistro - Recupera los campos de registro en NetSuite.
     * @param {record.Record} parametro - Registro de NetSuite del cual se recuperan los campos.
     * @returns {Object} - Objeto con los campos del registro.
     */
    function recuperarCamposRegistro(parametro) {
        try {
            nLog.audit("recuperarCamposRegistro - parametro", parametro);

            // Recuperar campo Usuario
            let campoUsuario = search.lookupFields({
                type: "department",
                id: parametro.id,
                columns: ["custrecord_2win_as_dep_usuario_registro"]
            });
            nLog.debug("recuperarCamposRegistro - campoUsuario", campoUsuario);

            // Validar que el usuario de registro exista
            if (!campoUsuario || campoUsuario.custrecord_2win_as_dep_usuario_registro.length === 0) {
                throw new Error("No se encontró usuario de registro.");
            }

            // Recuperar los campos del registro
            let camposRecuperados = {
                CodServicio: String(parametro.id),
                NombreServicio: parametro.getValue({ fieldId: "name" }),
                Vigente: parametro.getValue({ fieldId: "isinactive" }) ? "N" : "S",
                Usuario: campoUsuario.custrecord_2win_as_dep_usuario_registro[0].text
            };
            nLog.debug("recuperarCamposRegistro - camposRecuperados", camposRecuperados);
            return camposRecuperados;
        } catch (error) {
            nLog.error("recuperarCamposRegistro - error", error);
            throw error;
        }
    }

    function getRecord(id) {
        return record.load({
            type: "department",
            id: id
        });
    }

    /**
     * @function enviarRegistro - Envía los datos del centro de costo a un servicio externo.
     * @param {string} url - URL del endpoint del servicio externo.
     * @param {object} cuerpoPeticion - El cuerpo de la petición a enviar.
     * @returns {object} - La respuesta del servicio externo.
     */
    function enviarRegistro(url, cuerpoPeticion) {
        try {
            nLog.audit("enviarRegistro - parametros", { url: url, cuerpoPeticion: cuerpoPeticion });

            // Utiliza la nueva función autenticada. El tipo de petición es PUT según el DOM.
            const respuesta = libPeticion.ejecutarPeticionAutenticada("PUT", url, cuerpoPeticion);

            nLog.debug("enviarRegistro - respuesta", respuesta);
            return respuesta;
        } catch (error) {
            nLog.error("enviarRegistro - error", error);
            throw error;
        }
    }

    /**
     * @function getServicioIngreso - Obtener el ID del servicio de ingreso a partir de su nombre.
     * @param {string} servicioIngreso - Nombre del servicio de ingreso a buscar
     * @returns {number|null} - Internal ID del servicio de ingreso o null si no se encuentra
     */
    const getServicioIngreso = (servicioIngreso = "") => {
        try {
            const servicioIngresoSearch = search.create({
                type: "department",
                filters: [["externalid", "is", servicioIngreso.toUpperCase()]],
                columns: ["internalid"]
            });
            const result = servicioIngresoSearch.run().getRange({ start: 0, end: 1 });
            return result.length > 0 ? result[0].getValue("internalid") : null;
        } catch (error) {
            nLog.error("getServicioIngreso - error", error);
            throw new Error(`Error al obtener el servicio de ingreso: ${error.message}`);
        }
    };
    return {
        busquedaRegistroPorCodigo: busquedaRegistroPorCodigo,
        recuperarCamposRegistro: recuperarCamposRegistro,
        getRecord: getRecord,
        enviarRegistro: enviarRegistro,
        busquedaRegistroPorIdExterno: getServicioIngreso
    };
});
