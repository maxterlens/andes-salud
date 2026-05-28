/**
 *@NApiVersion 2.1
 *@NScriptType MapReduceScript
 */
define([
    "N/runtime",
    "N/log",
    "N/task",
    "../dao/2win_dao_file",
    "../domain/2win_dom_facturacion",
    "../dao/2win_dao_cola",
    "N/search",
    "../libs/2win_lib_peticion",
    "../dao/2win_dao_static_params_operacion"
], function (runtime, nLog, task, daoFile, RecaudacionesFacturacion, daoCola, search, libPeticion, daoParametrosOperacion) {
    function getInputData() {
        try {
            // Recuperar parametro
            const datosEntrada = runtime.getCurrentScript().getParameter({ name: "custscript_2w_as_datos_recaudaciones_fac" });
            nLog.debug("getInputData - datosEntrada", {
                datosEntrada: datosEntrada
            });

            // Validar que se haya recibido el parametro
            if (!datosEntrada) {
                throw new Error("Falta parametro custscript_2w_as_datos_recaudaciones_fac");
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
            return [contenidoParseado];
        } catch (error) {
            nLog.error("getInputData - error", error);
            return [];
        }
    }

    // function map(context) {}

    function reduce(context) {
        try {
            const cajaId = context.key;
            nLog.debug("reduce - cajaId", cajaId);
            const valores = context.values;
            nLog.debug("reduce - valores", valores);
            const dataCaja = JSON.parse(valores[0]);
            nLog.debug("reduce - dataCaja", dataCaja);
            const results = RecaudacionesFacturacion.procesarCajaRecaudacion({ cajas: [dataCaja] });
            nLog.debug("reduce - results", results);
            return results;
        } catch (error) {
            nLog.error("reduce - error", error);
            throw error;
        }
    }

    function summarize(summary) {
        let proceso = {
            nombreProceso: "Interfaces andes salud",
            scriptId: "2win_rl_andes_salud_c-m_item_servicio",
            etapa: summarize.name,
            estado: "000",
            tokenProceso: "",
            descripcionResultado: "Procesamiento masivo de conceptos finalizado"
        };
        const datosEntrada = runtime.getCurrentScript().getParameter({ name: "custscript_2w_as_datos_recaudaciones_fac" });

        const archivo = daoFile.cargarArchivo(datosEntrada);
        const name = archivo.nombre;
        const flujo = daoCola.FLUJO.FACTURACION;

        try {
            nLog.debug("summarize - summary", summary);

            // Ajustar datos del proceso
            //     proceso.scriptId = runtime.getCurrentScript().id;
            //     proceso.tokenProceso = libAuditoria.obtenerToken();
            //     proceso.tipoRegistroCreado = "Concepto";
            const movimientosConErrores = [];
            summary.output.iterator().each(function (key, value) {
                const resultado = JSON.parse(value);
                if (resultado.errores) movimientosConErrores.push(resultado);
                return true;
            });

            //     libAuditoria.crearReporteAuditoria(proceso);

            // Actualizar el registro de cola actual
            // Buscar el registro de cola por nombre de archivo
            const nombreArchivo = name;
            const searchColaActual = search.create({
                type: "customrecord_2w_as_cola_procesamiento",
                filters: [
                    ["custrecord_2w_as_estado_cola", "is", daoCola.ESTADO_COLA.EN_PROCESO],
                    "AND",
                    ["custrecord_2w_as_flujo", "is", flujo],
                    "AND",
                    ["custrecord_2w_as_nombre_archivo", "is", nombreArchivo]
                ],
                columns: ["internalid", "custrecord_2w_as_intentos"]
            });

            const resultadoColaActual = searchColaActual.run().getRange({
                start: 0,
                end: 1
            });

            if (resultadoColaActual.length > 0) {
                const idColaActual = resultadoColaActual[0].getValue("internalid");
                const intentosActuales = parseInt(resultadoColaActual[0].getValue("custrecord_2w_as_intentos") || 0);

                // Actualizar estado según el resultado
                const nuevoEstado = movimientosConErrores.length > 0 ? daoCola.ESTADO_COLA.ERROR : daoCola.ESTADO_COLA.COMPLETADO;
                daoCola.actualizarEstadoEIntentos(idColaActual, nuevoEstado, intentosActuales);
                nLog.audit("summarize - estado actualizado", `ID Cola: ${idColaActual}, Estado: ${nuevoEstado}`);
            }

            // Buscar siguiente registro pendiente en la cola
            const siguientePendiente = daoCola.obtenerSiguientePendiente(flujo);

            if (siguientePendiente) {
                // Actualizar estado a En Proceso
                daoCola.actualizarEstadoCola(siguientePendiente.id, daoCola.ESTADO_COLA.EN_PROCESO);

                // Ejecutar el siguiente Map/Reduce
                try {
                    const taskId = daoCola.ejecutarMapReduce(siguientePendiente);
                    nLog.audit("summarize - siguiente tarea iniciada", `ID Tarea: ${taskId}, ID Cola: ${siguientePendiente.id}`);
                } catch (errorSiguiente) {
                    nLog.error("summarize - error al ejecutar siguiente", errorSiguiente);
                    // Si falla al iniciar el siguiente, dejarlo en estado Pendiente para reintentar
                    daoCola.actualizarEstadoCola(siguientePendiente.id, daoCola.ESTADO_COLA.PENDIENTE);
                }
            } else {
                nLog.audit("summarize - no hay pendientes", "No hay más registros pendientes en la cola");
            }

            // Enviar evento a URL externa
            const payload = {
                tipoMensaje: "SEND^UPD",
                estado: !movimientosConErrores.length ? "success" : "error",
                codigo: !movimientosConErrores.length ? 200 : 400,
                tipo_proceso: "Recaudaciones Flujo Facturacion",
                idproceso: name.replace(".json", ""),
                mensaje: `La ejecucion del proceso de recaudaciones flujo facturacion finalizo ${!movimientosConErrores.length ? "correctamente" : "con errores"}.`,
                errores: movimientosConErrores
            };
            //     // Nombres de parametros de operacion necesarios
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
        }
    }

    return {
        getInputData: getInputData,
        // map: map,
        reduce: reduce,
        summarize: summarize
    };
});
