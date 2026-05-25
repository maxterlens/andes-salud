/**
 * @NApiVersion 2.1
 * @NScriptType MapReduceScript
 */
define([
    "../lib/2win_lib_auditoria",
    "../lib/2win_lib_custodia",
    "../dao/2win_dao_producto",
    "../dao/2win_dao_file",
    "N/runtime",
    "N/log",
    "N/task",
    "../lib/2win_lib_peticion",
    "../dao/2win_dao_static_params_operacion"
], function (libAuditoria, libCustodia, daoProducto, daoFile, runtime, nLog, task, libPeticion, daoParametrosOperacion) {
    /**
     * @function getInputData - Recupera los datos de entrada para procesar los items de servicio.
     * @returns {Array} - Arreglo de conceptos a procesar.
     */
    function getInputData() {
        try {
            // Recuperar parametro
            const datosEntrada = runtime.getCurrentScript().getParameter({ name: "custscript_mr_as_items_servicio_datos" });
            nLog.debug("getInputData - datosEntrada", {
                datosEntrada: datosEntrada
            });

            // Validar que se haya recibido el parametro
            if (!datosEntrada) {
                throw new Error("Falta parametro custscript_mr_as_items_servicio_datos");
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
            const conceptos = contenidoParseado;
            const listaConceptos = daoProducto.mapearCamposConcepto(conceptos);
            return listaConceptos.map((concepto) => {
                concepto.tipoOperacion = contenidoParseado.tipoOperacion;
                return concepto;
            });
        } catch (error) {
            nLog.error("getInputData - error", error);
            return [];
        }
    }

    /**
     * @function map - Procesa cada concepto individualmente.
     * @param {Object} context - Contexto con los datos a procesar.
     */
    function map(context) {
        let item = {};
        try {
            item = JSON.parse(context.value);
            nLog.audit(`map - key: ${context.key}`, {
                item: item
            });

            if (item.tipoOperacion === "crear") {
                item.recordId = daoProducto.create(item);
            } else if (item.tipoOperacion === "editar") {
                const itemId = daoProducto.searchConcepto(item.itemid);
                item.recordId = daoProducto.update(itemId, item);
            } else {
                throw new Error(`Tipo de operación no válido: ${item.tipoOperacion}`);
            }

            context.write({ key: context.key, value: item });
        } catch (error) {
            nLog.error("map - error", error);
            item.error = error.message;
            context.write({ key: context.key, value: item });
        }
    }

    /**
     * @function summarize - Resumen de la ejecución del Map/Reduce.
     * @param {Object} summary - Resumen de la ejecución.
     */
    function summarize(summary) {
        let proceso = {
            nombreProceso: "Interfaces andes salud",
            scriptId: "2win_rl_andes_salud_c-m_item_servicio",
            etapa: summarize.name,
            estado: "000",
            tokenProceso: "",
            descripcionResultado: "Procesamiento masivo de conceptos finalizado"
        };
        const datosEntrada = runtime.getCurrentScript().getParameter({ name: "custscript_mr_as_items_servicio_datos" });

        const archivo = daoFile.cargarArchivo(datosEntrada);
        const name = archivo.nombre;

        try {
            nLog.debug("summarize - summary", summary);

            // Ajustar datos del proceso
            proceso.scriptId = runtime.getCurrentScript().id;
            proceso.tokenProceso = libAuditoria.obtenerToken();
            proceso.tipoRegistroCreado = "Concepto";
            const cuentasConErrores = [];
            summary.output.iterator().each(function (key, value) {
                const resultado = JSON.parse(value);
                if (resultado.error) cuentasConErrores.push(resultado);
                return true;
            });

            libAuditoria.crearReporteAuditoria(proceso);

            // Enviar evento a URL externa
            const payload = {
                tipoMensaje: "SEND^CONCEP",
                estado: "success",
                codigo: 200,
                mensaje: "Operación masiva recibida correctamente",
                tipo_proceso: "Conceptos",
                idproceso: name.replace(".json", ""),
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

            let scriptObj = runtime.getCurrentScript();
            nLog.debug("summarize - unidades restantes: ", scriptObj.getRemainingUsage());
        } catch (error) {
            nLog.error("summarize - error", error);

            proceso.estado = "001";
            proceso.descripcionResultado = error.message;
            libAuditoria.crearReporteAuditoria(proceso);
        }
    }

    return {
        getInputData: getInputData,
        map: map,
        summarize: summarize
    };
});
