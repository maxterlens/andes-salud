/**
 * @NApiVersion 2.1
 * @module ./2win_dao_ubicacion.js
 * @NModuleScope Public
 */
define(["../lib/2win_lib_formato", "N/log", "N/record", "N/search", "../lib/2win_lib_peticion", "N/runtime"], function (libFormato, nLog, record, search, libPeticion, runtime) {
    /**
     * @function recuperarCamposRegistro - Recupera los campos de registro en NetSuite.
     * @param {record.Record} parametro - Registro de NetSuite del cual se recuperan los campos.
     * @returns {Object} - Objeto con los campos del registro.
     */
    function recuperarCamposRegistro(parametro) {
        try {
            const unitListCount = parametro.getLineCount({ sublistId: "uom" });

            const isValid = parametro.getValue("isinactive");

            const listUnit = [];

            for (let index = 0; index < unitListCount; index++) {
                const abbreviation = parametro.getSublistValue({ sublistId: "uom", fieldId: "abbreviation", line: index });
                const unitname = parametro.getSublistValue({ sublistId: "uom", fieldId: "unitname", line: index });
                listUnit.push({
                    UprSimbolo: abbreviation,
                    UprNombre: unitname,
                    Vigente: isValid ? "N" : "S",
                    Usuario: runtime.getCurrentUser().name
                });
            }
            return listUnit;
        } catch (error) {
            nLog.error("recuperarCamposRegistro - error", error);
            throw error;
        }
    }
    function getRecord(id) {
        return record.load({
            type: "customrecord_wmsse_itemgroup",
            id: id
        });
    }

    /**
     * @function enviarUnidadProducto - Envía los datos de la Unidad de Producto a un servicio externo.
     * @param {string} url - URL del endpoint del servicio externo.
     * @param {object} cuerpoPeticion - El cuerpo de la petición a enviar.
     * @returns {object} - La respuesta del servicio externo.
     */
    function enviarUnidadProducto(url, cuerpoPeticion) {
        try {
            nLog.audit("enviarUnidadProducto - parametros", { url: url, cuerpoPeticion: cuerpoPeticion });

            const respuesta = libPeticion.ejecutarPeticionAutenticada("PUT", url, cuerpoPeticion);

            nLog.debug("enviarUnidadProducto - respuesta", respuesta);
            return respuesta;
        } catch (error) {
            nLog.error("enviarUnidadProducto - error", error);
            throw error;
        }
    }

    return {
        recuperarCamposRegistro: recuperarCamposRegistro,
        getRecord: getRecord,
        enviarUnidadProducto: enviarUnidadProducto
    };
});
