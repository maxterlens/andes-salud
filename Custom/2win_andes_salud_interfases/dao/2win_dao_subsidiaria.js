/**
 * @NApiVersion 2.1
 * @module ./2win_dao_subsidiaria.js
 * @NModuleScope Public
 */
define(["../lib/moment", "./2win_dao", "N/search", "N/log", "N/record"], function (moment, dao, search, nLog, record) {
    /**
     * @function busquedaRegistroPorRut - Función para realizar una busqueda en una tabla de netsuite.
     * @param {string} parametro - Parametros a usar en los filtros de la busqueda.
     * @return {Array} - Resultados de la busqueda.
     */
    function busquedaRegistroPorRut(parametro) {
        try {
            nLog.debug("busquedaRegistroPorRut - parametro", {
                parametro: parametro,
                tipoDato: typeof parametro
            });

            // Tipo, filtros y columnas para la busqueda
            let objSearch = {
                type: "subsidiary",
                filters: [["custrecord_2winrutsubsiudiaria", "is", parametro]],
                columns: [
                    // Campos cuerpo registro
                    search.createColumn({ name: "internalid", label: "internalid" })
                ]
            };
            let filtros = `tipo: ${objSearch.type}, filtros: ${objSearch.filters}`;

            // Ejecutar busqueda
            let result = dao.obtenerResultados(objSearch);
            nLog.audit("busquedaRegistroPorRut - resultados", {
                extension: result.length,
                resultado: result
            });

            // Valida que la busqueda retorne resultados
            if (result.length > 0) {
                return result;
            } else {
                throw new Error(`No se encontro empresa para rut: ${parametro}`);
            }
        } catch (error) {
            nLog.error("busquedaRegistroPorRut - error", error);
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

            // Recuperar campos de registro creado en netsuite
            let subRegistroDireccion = parametro.getSubrecord({ fieldId: "mainaddress" });
            nLog.debug("recuperarCamposRegistro - subRegistroDireccion", subRegistroDireccion);

            // Ejecutar busqueda para recuperar texto de campos en registro
            let camposBusqueda = search.lookupFields({
                type: "subsidiary",
                id: parametro.id,
                columns: ["country"]
            });
            nLog.debug("recuperarCamposRegistro - camposBusqueda", camposBusqueda);

            // Ejecutar busqueda para recuperar codigo de campos en registro
            nLog.debug("recuperarCamposRegistro - nacionalidad", {
                nacionalidad: subRegistroDireccion.getValue({ fieldId: "custrecord_2w_nacionalidad" })
            });
            let camposBusquedaCodigoPais = search.lookupFields({
                type: "customrecord_2win_nacionalidades",
                id: subRegistroDireccion.getValue({ fieldId: "custrecord_2w_nacionalidad" }),
                columns: ["custrecord_2wincodigosnacionalidadhl7"]
            });
            nLog.debug("recuperarCamposRegistro - camposBusquedaCodigoPais", camposBusquedaCodigoPais);

            // Ejecutar busqueda para recuperar rut de subsidiaria padre
            let camposBusquedaSubsidiariaPadre = search.lookupFields({
                type: "subsidiary",
                id: parametro.getValue({ fieldId: "parent" }),
                columns: ["custrecord_2winrutsubsiudiaria"]
            });
            nLog.debug("recuperarCamposRegistro - camposBusquedaSubsidiariaPadre", camposBusquedaSubsidiariaPadre);

            // Aislar valor fecha fin vigencia para posterior validacion
            let fechaFinVigencia = parametro.getValue({ fieldId: "custrecord_2win_fecha_fin_vigencia" });

            // Aislar y limpiar valor de campos con rut para enviar sin guiones o espacios y solo alfanumericos
            let rutEmpresa = parametro.getValue({ fieldId: "custrecord_2winrutsubsiudiaria" });
            let rutEmpresaLimpio = rutEmpresa.replace(/[^0-9A-Za-z]/g, '');
            let rutEmpresaPadreLimpio = camposBusquedaSubsidiariaPadre.custrecord_2winrutsubsiudiaria.replace(/[^0-9A-Za-z]/g, '');
            nLog.debug("recuperarCamposRegistro - rut", {
                rutEmpresaLimpio: rutEmpresaLimpio,
                rutEmpresaPadreLimpio: rutEmpresaPadreLimpio
            });

            // Definir estructura con campos recuperados
            let camposRecuperados = {
                RutEmpresa: rutEmpresaLimpio,
                RutEmpresaPadre: rutEmpresaPadreLimpio,
                RazonSocial: parametro.getValue({ fieldId: "name" }),
                Giro: parametro.getValue({ fieldId: "custrecord_2wingiroempresa" }),
                Direccion: subRegistroDireccion.getValue({ fieldId: "addr1" }),
                Region: subRegistroDireccion.getValue({ fieldId: "state" }),
                Comuna: subRegistroDireccion.getValue({ fieldId: "addr2" }),
                Ciudad: subRegistroDireccion.getValue({ fieldId: "city" }),
                Pais: camposBusquedaCodigoPais.custrecord_2wincodigosnacionalidadhl7,
                FechaInicioVigencia: moment(parametro.getValue({ fieldId: "custrecord_2win_fecha_inicio_vigencia" })).format("YYYYMMDD"),
                FechaFinVigencia: fechaFinVigencia ? moment(fechaFinVigencia).format("YYYYMMDD") : "", // Formatear fecha si existe
                ActividadEconomica: parametro.getValue({ fieldId: "custrecord_2w_actividad_economica_prelim" }),
                CodActividadEconomica: parametro.getValue({ fieldId: "custrecord_2w_cod_act_econ_prelim" }),
                Clinica:parametro.getValue({ fieldId: "custrecord_2w_esclinica" }) === true ? "S" : "N"
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
            type: "subsidiary",
            id: id
        });
    }

    /**
     * @function busquedaSubsidiariasActivas - Busca todas las subsidiarias activas.
     * @returns {Array} - Un arreglo de IDs de las subsidiarias activas.
     */
    function busquedaSubsidiariasActivas() {
        try {
            const subsidiarySearch = search.create({
                type: search.Type.SUBSIDIARY,
                filters: [["isinactive", "is", "F"], "AND", ["iselimination", "is", "F"]],
                columns: [search.createColumn({ name: "internalid" })]
            });

            const activeSubsidiaries = [];
            subsidiarySearch.run().each(function (result) {
                activeSubsidiaries.push(result.getValue({ name: "internalid" }));
                return true;
            });

            nLog.debug("busquedaSubsidiariasActivas - Subsidiarias Activas", activeSubsidiaries);
            return activeSubsidiaries;
        } catch (error) {
            nLog.error("busquedaSubsidiariasActivas - error", error);
            throw error;
        }
    }

    return {
        recuperarCamposRegistro: recuperarCamposRegistro,
        busquedaRegistroPorRut: busquedaRegistroPorRut,
        getRecord: getRecord,
        busquedaSubsidiariasActivas: busquedaSubsidiariasActivas
    };
});
