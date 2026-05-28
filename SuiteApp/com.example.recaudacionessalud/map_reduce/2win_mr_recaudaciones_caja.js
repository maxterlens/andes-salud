/**
 *@NApiVersion 2.1
 *@NScriptType MapReduceScript
 */
define([
    "N/runtime",
    "N/log",
    "N/task",
    "../dao/2win_dao_file",
    "../domain/2win_dom_caja",
    "../libs/2win_lib_peticion",
    "../dao/2win_dao_static_params_operacion",
    "../dao/2win_dao_cola",
    "N/search"
], function (runtime, nLog, task, daoFile, RecaudacionesCaja, libPeticion, daoParametrosOperacion, daoCola, search) {
    function getInputData() {
        try {
            // Recuperar parametro
            const datosEntrada = runtime.getCurrentScript().getParameter({ name: "custscript_2w_as_datos_recaudaciones_caj" });
            nLog.debug("getInputData - datosEntrada", {
                datosEntrada: datosEntrada
            });

            // Validar que se haya recibido el parametro
            if (!datosEntrada) {
                nLog.error("getInputData - error", "Falta parametro custscript_2w_as_datos_recaudaciones_caj");
                return [];
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
            return contenidoParseado?.cajas;
        } catch (error) {
            nLog.error("getInputData - error", error);
            return [];
        }
    }

    /**
     * MAP: Pre-carga datos de la caja y emite un entry por cada movimiento.
     * Cada movimiento se procesará individualmente en el stage reduce,
     * evitando el error SSS_USAGE_LIMIT_EXCEEDED.
     */
    function map(context) {
        try {
            const cajaId = context.key;
            nLog.audit("map - procesando caja", cajaId);

            const caja = JSON.parse(context.value);

            // Pre-cargar todos los datos de la caja (transacciones existentes, cierres, etc.)
            // Esto consume pocas unidades de gobernanza (~20 unidades por search)
            const datos = RecaudacionesCaja.preCargarDatosCaja(caja);

            // Emitir un entry por cada movimiento para que reduce los procese individualmente
            if (datos.detalles && datos.detalles.length > 0) {
                datos.detalles.forEach(function (movimiento) {
                    const movimientoKey = `${cajaId}_${movimiento.numeroMovimiento}`;
                    context.write({
                        key: movimientoKey,
                        value: JSON.stringify({
                            movimiento: movimiento,
                            datos: {
                                encabezado: datos.encabezado,
                                subsidiariaCaja: datos.subsidiariaCaja,
                                fechaGlobal: datos.fechaGlobal,
                                unidadCaja: datos.unidadCaja,
                                aperturaCaja: datos.aperturaCaja,
                                CajeroCierreCaja: datos.CajeroCierreCaja,
                                todasLasTransacciones: datos.todasLasTransacciones,
                                todosLosCierres: datos.todosLosCierres
                            }
                        })
                    });
                });
            } else {
                nLog.audit("map - caja sin movimientos", cajaId);
            }
        } catch (error) {
            nLog.error("map - error", error);
        }
    }

    /**
     * REDUCE: Procesa UN solo movimiento individualmente.
     * Cada llamada tiene 5,000 unidades de gobernanza disponibles.
     */
    function reduce(context) {
        const movimientoKey = context.key;
        let data = null;
        let movimiento = null;
        let datos = null;

        try {
            nLog.audit("reduce - procesando movimiento", movimientoKey);

            data = JSON.parse(context.values[0]);
            movimiento = data.movimiento;
            datos = data.datos;

            const resultado = {
                exito: true,
                errores: [],
                mensaje: ""
            };

            RecaudacionesCaja.procesarMovimiento(
                movimiento,
                datos.fechaGlobal,
                datos.subsidiariaCaja,
                datos.unidadCaja,
                resultado,
                datos.encabezado.razonSocialCaja,
                datos.aperturaCaja,
                datos.CajeroCierreCaja,
                datos.encabezado,
                datos.todasLasTransacciones,
                datos.todosLosCierres
            );

            // Si hubo errores durante el procesamiento, eliminar todas las transacciones creadas
            if (resultado.errores.length > 0) {
                nLog.audit("reduce - errores detectados, iniciando limpieza", `Movimiento: ${movimientoKey}, Errores: ${resultado.errores.length}`);
                const resumenCleanup = RecaudacionesCaja.limpiarTransaccionesMovimiento(datos, movimiento.numeroMovimiento);
                resultado.cleanup = resumenCleanup;
                resultado.mensaje = `Movimiento falló con ${resultado.errores.length} errores. Se eliminaron ${resumenCleanup.eliminadas.length} transacciones, ${resumenCleanup.fallidas.length} fallidas al eliminar.`;
            }

            // Registrar unidades de gobernanza restantes para monitoreo
            const remainingUsage = runtime.getCurrentScript().getRemainingUsage();
            nLog.audit("reduce - completado", `Movimiento: ${movimientoKey}, Unidades restantes: ${remainingUsage}, Errores: ${resultado.errores.length}`);

            context.write({
                key: movimientoKey,
                value: JSON.stringify(resultado)
            });
        } catch (error) {
            nLog.error("reduce - error", error);

            // Si tenemos datos del movimiento, intentar cleanup
            if (movimiento && datos) {
                try {
                    nLog.audit("reduce - excepción, iniciando limpieza", `Movimiento: ${movimientoKey}`);
                    const resumenCleanup = RecaudacionesCaja.limpiarTransaccionesMovimiento(datos, movimiento.numeroMovimiento);
                    nLog.audit("reduce - limpieza completada", `Eliminadas: ${resumenCleanup.eliminadas.length}, Fallidas: ${resumenCleanup.fallidas.length}`);
                } catch (cleanupError) {
                    nLog.error("reduce - error durante limpieza", cleanupError);
                }
            }

            // Escribir resultado con error para que summarize lo detecte
            context.write({
                key: movimientoKey,
                value: JSON.stringify({
                    exito: false,
                    errores: [{ error: error.message }],
                    mensaje: error.message
                })
            });
            // No re-lanzar para permitir que otros movimientos continúen procesándose
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
        const datosEntrada = runtime.getCurrentScript().getParameter({ name: "custscript_2w_as_datos_recaudaciones_caj" });

        const archivo = daoFile.cargarArchivo(datosEntrada);
        const name = archivo.nombre;
        const flujo = daoCola.FLUJO.CAJA;

        try {
            nLog.debug("summarize - summary", summary);

            // Recolectar resultados de todos los movimientos y agrupar por caja
            const movimientosConErrores = [];
            const cajasMap = {}; // Agrupar resultados por caja para procesar cierres

            summary.output.iterator().each(function (key, value) {
                const resultado = JSON.parse(value);
                if (resultado.errores && resultado.errores.length > 0) {
                    movimientosConErrores.push(resultado);
                }

                // Extraer el cajaId del key (formato: cajaId_movimientoNumero)
                const cajaId = key.split("_")[0];
                if (!cajasMap[cajaId]) {
                    cajasMap[cajaId] = true;
                }

                return true;
            });

            // ========================================
            // PROCESAR CIERRES DE CAJA EN SUMMARIZE
            // El summarize tiene 10,000 unidades de gobernanza
            // ========================================
            // Re-cargar datos de cada caja para reversar cierres previos y crear nuevos
            try {
                const cajasOriginales = getInputDataFromCache(datosEntrada);
                if (cajasOriginales && cajasOriginales.length > 0) {
                    cajasOriginales.forEach(function (caja) {
                        try {
                            const resultadoCierre = { exito: true, errores: [] };
                            const datos = RecaudacionesCaja.preCargarDatosCaja(caja);

                            // Reversar cierres previos
                            RecaudacionesCaja.reversarCierresPrevios(datos.todosLosCierres, resultadoCierre, datos.encabezado);

                            // Crear nuevo cierre de caja
                            RecaudacionesCaja.procesarCierreCaja(datos.encabezado, datos.fechaGlobal, datos.subsidiariaCaja);

                            if (resultadoCierre.errores.length > 0) {
                                movimientosConErrores.push(...resultadoCierre.errores);
                            }

                            nLog.audit("summarize - cierre de caja procesado", `Unidad: ${datos.unidadCaja}`);
                        } catch (errorCierre) {
                            nLog.error("summarize - error procesando cierre de caja", errorCierre);
                            movimientosConErrores.push({ error: errorCierre.message, tipo: "Cierre de Caja" });
                        }
                    });
                }
            } catch (errorCierres) {
                nLog.error("summarize - error general procesando cierres", errorCierres);
            }

            // Actualizar el registro de cola actual
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
                tipo_proceso: "Recaudaciones Flujo Caja",
                idproceso: name.replace(".json", ""),
                mensaje: `La ejecucion del proceso de recaudaciones flujo caja finalizo ${!movimientosConErrores.length ? "correctamente" : "con errores"}.`,
                errores: movimientosConErrores
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
            nLog.audit("summarize - unidades restantes: ", scriptObj.getRemainingUsage());
        } catch (error) {
            nLog.error("summarize - error", error);
        }
    }

    /**
     * Helper para re-cargar datos originales desde el archivo en summarize.
     * Necesario para procesar cierres de caja.
     */
    function getInputDataFromCache(datosEntrada) {
        try {
            const archivo = daoFile.cargarArchivo(datosEntrada);
            const contenido = archivo.contenido;
            const contenidoParseado = JSON.parse(contenido);
            return contenidoParseado?.cajas || [];
        } catch (error) {
            nLog.error("getInputDataFromCache - error", error);
            return [];
        }
    }

    return {
        getInputData: getInputData,
        map: map,
        reduce: reduce,
        summarize: summarize
    };
});
