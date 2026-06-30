/**
 * @NApiVersion 2.1
 * @module ./2win_dao_ubicacion.js
 * @NModuleScope Public
 */
define(["../lib/2win_lib_formato", "../lib/2win_lib_peticion", "N/log", "N/record", "N/search"], function (libFormato, libPeticion, nLog, record, search) {
    /**
     * @function recuperarCamposRegistro - Recupera los campos de registro en NetSuite.
     * @param {record.Record} parametro - Registro de NetSuite del cual se recuperan los campos.
     * @returns {Object} - Objeto con los campos del registro.
     */
    function recuperarCamposRegistro(parametro) {
        try {
            nLog.audit("recuperarCamposRegistro - parametro", parametro);
            const departmentId = parametro.getValue({ fieldId: "custrecord_2win_ubi_as_codigo_centro_cos" });
            let subsidiariaRUT = "";
            if (parametro.getValue({ fieldId: "custrecord_2win_as_ubi_clinica" })) {
                subsidiariaRUT = search.lookupFields({
                    type: "subsidiary",
                    id: parametro.getValue({ fieldId: "custrecord_2win_as_ubi_clinica" }),
                    columns: ["custrecord_2winrutsubsiudiaria"]
                })?.custrecord_2winrutsubsiudiaria;
            }

            let camposRecuperados = {
                CodigoBodega: parametro.id,
                NombreBodega: parametro.getValue({ fieldId: "name" }),
                FechaInicioVigencia: libFormato.formatearFecha(parametro.getValue({ fieldId: "custrecord_2win_as_ubi_inicio_vigencia" })),
                PermiteStockNegativo: parametro.getValue({ fieldId: "custrecord_2win_as_ubi_stock_negativo" }) ? "S" : "N",
                CodigoCentroCosto: departmentId || "",
                Clinica: subsidiariaRUT.replaceAll("-", "")
            };

            // Validar valor de campo isinactive
            let isInactive = parametro.getValue({ fieldId: "isinactive" });

            // Caso 1: Si el registro esta inactivo
            if (isInactive) {
                camposRecuperados.FechaFinVigencia = parametro.getValue({ fieldId: "isinactive" }) ? libFormato.formatearFecha(new Date()) : "";
            }

            nLog.debug("recuperarCamposRegistro - camposRecuperados", camposRecuperados);
            return camposRecuperados;
        } catch (error) {
            nLog.error("recuperarCamposRegistro - error", error);
            throw error;
        }
    }
    function getRecord(id) {
        return record.load({
            type: record.Type.LOCATION,
            id: id
        });
    }

    /**
     * @function enviarBodega - Envía los datos de la bodega a un servicio externo.
     * @param {string} url - URL del endpoint del servicio externo.
     * @param {object} cuerpoPeticion - El cuerpo de la petición a enviar.
     * @returns {object} - La respuesta del servicio externo.
     */
    function enviarBodega(url, cuerpoPeticion) {
        try {
            nLog.audit("enviarBodega - parametros", { url: url, cuerpoPeticion: cuerpoPeticion });

            const respuesta = libPeticion.ejecutarPeticionAutenticada("PUT", url, cuerpoPeticion);

            nLog.debug("enviarBodega - respuesta", respuesta);
            return respuesta;
        } catch (error) {
            nLog.error("enviarBodega - error", error);
            throw error;
        }
    }
    function getBodegaByCode(code) {
        const result = search.create({
            type: "location",
            filters: [
                [!Number(code) ? ["custrecord_2w_codigo_ubicacion", "is", code] : ["internalid", "IS", code]], "AND", ["isinactive", "IS", "F"]
            ],
            columns: [
                "name",
                "subsidiary",
                "subsidiary.custrecord_2winrutsubsiudiaria",
                "custrecord_2w_codigo_ubicacion",
                "internalid"
            ]
        }).run().getRange(0, 1)
        return {
            subsidiaryName: result[0]?.getValue("subsidiary"),
            subsidiary: result[0]?.getValue("subsidiary.custrecord_2winrutsubsiudiaria"),
            internalid: result[0]?.getValue("internalid")
        }
    }
    return {
        recuperarCamposRegistro: recuperarCamposRegistro,
        getRecord: getRecord,
        enviarBodega: enviarBodega,
        getBodegaByCode
    };
});
