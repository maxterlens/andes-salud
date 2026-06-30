/**
 *@NApiVersion 2.1
 *@NScriptType MapReduceScript
 */
define(["N/runtime", "N/record", "N/log", "N/search", "../dao/2win_dao_file", "../lib/2win_lib_peticion", "../dao/2win_dao_static_params_operacion"], function (
    runtime,
    record,
    nLog,
    search,
    daoFile,
    libPeticion,
    daoParametrosOperacion
) {
    function getInputData() {
        try {
            // Recuperar parametro
            const datosEntrada = runtime.getCurrentScript().getParameter({ name: "custscript_record_update_file_id" });
            nLog.debug("getInputData - datosEntrada", {
                datosEntrada: datosEntrada
            });

            // Validar que se haya recibido el parametro
            if (!datosEntrada) {
                throw new Error("Falta parametro custscript_record_update_file_id");
            }

            // Cargar archivo
            const archivo = daoFile.cargarArchivo(datosEntrada);
            const contenido = archivo.contenido;
            nLog.debug("getInputData - contenido", {
                contenido: contenido
            });

            // Parsear contenido
            const contenidoParseado = JSON.parse(contenido);
            nLog.debug("getInputData - contenidoParseado", {
                contenidoParseado: contenidoParseado
            });

            // Retornar un arreglo con cada cuenta como string
            const gestionCuenta = contenidoParseado?.gestionCuenta || [];
            nLog.debug("getInputData - gestionCuenta", {
                extension: gestionCuenta.length,
                gestionCuenta: gestionCuenta
            });

            return gestionCuenta;
        } catch (error) {
            nLog.error("getInputData - error", error);
            return [];
        }
    }

    function map(context) {
        let data = {};
        try {
            const key = context.key;
            data = JSON.parse(context.value);
            let recordType = "";
            let field = "";
            let estado = "";
            let ids = [];
            nLog.debug("map - key", key);
            nLog.debug("map - data", data);
            if (data.docAplica === "Orden de Venta") {
                recordType = record.Type.SALES_ORDER;
                const id = buscarOrdenVenta(data.numCuenta);
                ids.push(...id);
                estado = mapeoEstadoFicha(data.estadoCuenta);
                if (data.clasificacion === "Clasificacion Ficha") field = "custbody_2win_estado_ficha";
            } else if (data.docAplica === "Prefactura") {
                recordType = "customrecord_2w_as_prefactura";
                const id = buscarPrefactura(data.numPrefactura);
                ids.push(...id);
                if (data.clasificacion === "Estado Prefactura") field = "custrecord_2win_estado_ficha";
                if (data.clasificacion === "Clasificacion Prefactura") field = "custrecord_2win_tipo_prefactura";
                estado = mapeoEstadoFicha(data.estadoCuenta);
            }
            const value = {
                numFicha: data.numFicha,
                numIngreso: data.numIngreso,
                numPrefactura: data.numPrefactura,
                field: field,
                estado: estado,
                ids: ids,
                estadoCuenta: data.estadoCuenta, //"ficha abierta" - "ficha cerrada"
                docAplica: data.docAplica, //"orden de venta" - "prefactura"
                recordType: recordType
            };
            nLog.debug("map - value", value);
            let values = {};
            values[field] = estado || "";
            if (ids.length === 0) throw Error("No se encontro el registro");
            if (!recordType) throw new Error("El tipo de registro (recordType) no está definido.");
            if (!field) throw new Error("El id del campo a actualizar no está definido.");
            // if (!estado) throw new Error("El valor del campo a actualizar no está definido.");
            nLog.debug("map - values to update", values);
            for (let id of ids) {
                nLog.debug("map - updating record", {
                    type: recordType,
                    id: Number(id),
                    values: values,
                    options: {
                        enableSourcing: false,
                        ignoreMandatoryFields: true
                    }
                });
                record.submitFields({
                    type: recordType,
                    id: Number(id),
                    values: values,
                    options: {
                        enableSourcing: false,
                        ignoreMandatoryFields: true
                    }
                });
            }
        } catch (error) {
            nLog.error("map - error", error);
            data.error = error.message;
        }

        context.write({
            key: context.key,
            value: data
        });
    }

    function summarize(summary) {
        nLog.audit("summarize - Uso de gobernanza", summary.usage);
        nLog.audit("summarize - Concurrencia", summary.concurrency);
        nLog.audit("summarize - Cantidad de colas procesadas", summary.queueCount);
        const datosEntrada = runtime.getCurrentScript().getParameter({ name: "custscript_record_update_file_id" });
        const archivo = daoFile.cargarArchivo(datosEntrada);
        const name = archivo.nombre;
        const cuentasConErrores = [];
        let contieneErrores = false;
        // Recopilar registros actualizados exitosamente
        summary.output.iterator().each(function (key, value) {
            // nLog.debug("summarize - key", key);
            // nLog.debug("summarize - value", typeof value);
            const data = JSON.parse(value);
            if (data.error) {
                nLog.error("summarize - Error al actualizar registro", {
                    data: data
                });
                cuentasConErrores.push(data);
                contieneErrores = true;
            }
            return true;
        });
        nLog.debug("summarize - cuentasConErrores", cuentasConErrores);

        try {
            const payload = {
                tipoMensaje: "SEND^UPD",
                estado: !contieneErrores ? "success" : "error",
                codigo: !contieneErrores ? 200 : 400,
                tipo_proceso: "Gestion de Cuentas",
                idproceso: name.replace(".json", ""),
                mensaje: `La actualización del estado de la cuenta se ha procesado ${!contieneErrores ? "correctamente" : "con errores"}.`,
                errores: cuentasConErrores
            };
            // Nombres de parametros de operacion necesarios
            let nombresParmetrosOperacion = ["interfaces_andessalud_hc_url_base"];
            let valoresParametrosOperacion = [];

            // Recuperar cada parametro de operacion
            nombresParmetrosOperacion.forEach(function (nombreParametro) {
                let parametroOperacion = daoParametrosOperacion.getParam(nombreParametro);
                nLog.debug("eventoEdicionRegistro - parametroOperacion", parametroOperacion);
                valoresParametrosOperacion.push(parametroOperacion);
            });
            // Enviar evento único con el payload usando libPeticion
            const url = `${valoresParametrosOperacion[0].text}/process-batch`;
            const respuesta = libPeticion.ejecutarPeticionAutenticada("PUT", url, payload);
            nLog.debug("summarize - respuesta evento", respuesta);
        } catch (error) {
            nLog.error("summarize - Error al crear o enviar eventos", error);
        }
    }
    const buscarOrdenVenta = (numCuenta) => {
        const searchOjb = {
            type: "transaction",
            filters: [["type", "anyof", "SalesOrd"], "AND", ["mainline", "is", "T"], "AND", ["custbody_2win_nro_cuenta_paciente", "is", numCuenta.toString()]],
            columns: ["internalid"]
        };
        nLog.debug("filtros", searchOjb);
        const searchOV = search.create(searchOjb);
        const results = searchOV.run().getRange(0, 1000);
        return results.map((result) => result.getValue("internalid"));
    };
    const buscarPrefactura = (numPrefactura) => {
        const searchPF = search.create({
            type: "customrecord_2w_as_prefactura",
            filters: ["name", "is", numPrefactura],
            columns: ["internalid"]
        });
        const results = searchPF.run().getRange(0, 1000);
        return results.map((result) => result.getValue("internalid"));
    };
    const mapeoEstadoFicha = (estadoEntrada) => {
        const searchEstadoFicha = search.create({
            type: "customlist_2w_estados_cuenta",
            filters: ["name", "is", estadoEntrada.toUpperCase()],
            columns: ["internalid"]
        });
        const results = searchEstadoFicha.run().getRange(0, 1);
        return results[0]?.getValue("internalid");
    };
    return {
        getInputData: getInputData,
        map: map,
        // reduce: reduce,
        summarize: summarize
    };
});
