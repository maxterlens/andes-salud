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
            nLog.audit("recuperarCamposRegistro - parametro", parametro);
            let camposRecuperados = {
                CodFamilia: parametro.getValue({ fieldId: "custrecord_2win_familycode" }),
                NombreFamilia: parametro.getValue({ fieldId: "name" }),
                Vigente: parametro.getValue({ fieldId: "isinactive" }) ? "N" : "S",
                Usuario: runtime.getCurrentUser().name
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
            type: "customrecord_wmsse_item_family",
            id: id
        });
    }

    /**
     * @function enviarFamiliaProducto - Envía los datos de la FamiliaProducto a un servicio externo.
     * @param {string} url - URL del endpoint del servicio externo.
     * @param {object} cuerpoPeticion - El cuerpo de la petición a enviar.
     * @returns {object} - La respuesta del servicio externo.
     */
    function enviarFamiliaProducto(url, cuerpoPeticion) {
        try {
            nLog.audit("enviarFamiliaProducto - parametros", { url: url, cuerpoPeticion: cuerpoPeticion });

            const respuesta = libPeticion.ejecutarPeticionAutenticada("PUT", url, cuerpoPeticion);

            nLog.debug("enviarFamiliaProducto - respuesta", respuesta);
            return respuesta;
        } catch (error) {
            nLog.error("enviarFamiliaProducto - error", error);
            throw error;
        }
    }

    return {
        recuperarCamposRegistro: recuperarCamposRegistro,
        getRecord: getRecord,
        enviarFamiliaProducto: enviarFamiliaProducto
    };
});
