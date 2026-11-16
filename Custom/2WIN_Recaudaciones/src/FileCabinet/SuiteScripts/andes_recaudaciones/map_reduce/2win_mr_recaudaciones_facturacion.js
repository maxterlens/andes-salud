/**
 *@NApiVersion 2.1
 *@NScriptType MapReduceScript
 */
define([
    "N/runtime",
    "N/log",
    "N/task",
    "N/file",
    "N/search",
    "../dao/2win_dao_file",
    "../domain/2win_dom_facturacion",
    "../dao/2win_dao_cola",
    "../libs/2win_lib_peticion",
    "../dao/2win_dao_static_params_operacion",
    "../libs/2win_lib_auditoria"
], function (runtime, nLog, task, file, search, daoFile, RecaudacionesFacturacion, daoCola, libPeticion, daoParametrosOperacion, libAuditoria) {
    const PARAMETRO_ARCHIVO = "custscript_2w_as_datos_recaudaciones_fac";
    const PARAMETRO_FASE = "custscript_2w_as_fac_fase";
    const PARAMETRO_ESTADO = "custscript_2w_as_fac_estado";
    const FASES = ["FACTURA", "NOTA_CREDITO", "NOTA_DEBITO"];
    const CAMPOS_FASE = {
        FACTURA: "facturasEmitidas",
        NOTA_CREDITO: "ncEmitidas",
        NOTA_DEBITO: "ndEmitidas"
    };
    const DEPLOYMENTS = {
        NOTA_CREDITO: "customdeploy_2win_mr_recaudaciones_nc",
        NOTA_DEBITO: "customdeploy_2win_mr_recaudaciones_nd"
    };

    function obtenerParametros() {
        const script = runtime.getCurrentScript();
        const faseEjecucion = script.getParameter({ name: PARAMETRO_FASE }) || "FACTURA";
        const aplicar = faseEjecucion.endsWith("_APLICAR");
        return {
            faseEjecucion: faseEjecucion,
            aplicar: aplicar,
            archivoId: script.getParameter({ name: PARAMETRO_ARCHIVO }),
            fase: aplicar ? faseEjecucion.slice(0, -8) : faseEjecucion,
            estadoId: script.getParameter({ name: PARAMETRO_ESTADO })
        };
    }

    function getInputData() {
        const unidadesIniciales = runtime.getCurrentScript().getRemainingUsage();
        const parametros = obtenerParametros();
        if (!parametros.archivoId) throw new Error(`Falta parametro ${PARAMETRO_ARCHIVO}`);
        if (!CAMPOS_FASE[parametros.fase]) throw new Error(`Fase de facturación no reconocida: ${parametros.fase}`);
        if (parametros.aplicar) {
            const estado = cargarEstadoAplicacion(parametros);
            const unidadesRestantes = runtime.getCurrentScript().getRemainingUsage();
            nLog.audit("getInputData - consumo", { fase: parametros.faseEjecucion, documentos: estado.pendientes.length, unidadesConsumidas: unidadesIniciales - unidadesRestantes, unidadesRestantes: unidadesRestantes });
            return estado.pendientes;
        }
        const archivo = daoFile.cargarArchivo(parametros.archivoId);
        const contenido = JSON.parse(archivo.contenido);
        const documentos = contenido[CAMPOS_FASE[parametros.fase]] || [];
        if (!Array.isArray(documentos)) throw new Error(`El campo ${CAMPOS_FASE[parametros.fase]} debe ser un arreglo`);
        const entradas = documentos.map(function (documento, indice) {
            return { indice: indice, documento: documento };
        });
        const unidadesRestantes = runtime.getCurrentScript().getRemainingUsage();
        nLog.audit("getInputData - consumo", { fase: parametros.fase, documentos: entradas.length, unidadesConsumidas: unidadesIniciales - unidadesRestantes, unidadesRestantes: unidadesRestantes });
        return entradas;
    }

    function cargarEstadoAplicacion(parametros) {
        if (!parametros.estadoId) throw new Error("Falta el estado de aplicación");
        const estado = JSON.parse(daoFile.cargarArchivo(parametros.estadoId).contenido);
        if (String(estado.archivoId) !== String(parametros.archivoId) || estado.fase !== parametros.fase ||
            !Array.isArray(estado.pendientes) || !Array.isArray(estado.errores)) {
            throw new Error(`Estado de aplicación inválido: ${parametros.estadoId}`);
        }
        return estado;
    }

    function guardarPendienteAplicacion(parametros, indice, datos) {
        // Persistir solo el estado de aplicación, sin duplicar los items de creación.
        const estado = Object.assign({}, datos.estado);
        delete estado.datosCreacion;
        const archivo = file.load({ id: parametros.archivoId });
        const pendienteId = daoFile.crearArchivo({
            nombre: `${datos.processKey}-aplicacion-${Date.now()}.json`,
            contenido: JSON.stringify({ archivoId: parametros.archivoId, fase: parametros.fase,
                indice: indice, documento: datos.documento, estado: estado, processKey: datos.processKey }),
            folder: archivo.folder, tipo: file.Type.JSON, encoding: file.Encoding.UTF8
        }).id;
        return { indice: indice, pendienteId: pendienteId, processKey: datos.processKey, documento: datos.documento };
    }

    function buscarPorClaveProceso(tipo, processKey) {
        const resultados = search.create({
            type: tipo,
            filters: [["custbody_2win_as_rec_fact_key", "is", processKey]],
            columns: ["internalid"]
        }).run().getRange({ start: 0, end: 1 });
        return resultados.length ? resultados[0].getValue("internalid") : null;
    }

    function crearClaveProceso(archivoId, fase, indice) {
        return `2win_fac_${archivoId}_${fase}_${indice}`;
    }

    function crearError(fase, documento, error, etapa) {
        documento = documento || {};
        let detalleError = error && error.message ? error.message : String(error)
        let mensajeError = detalleError + ", datos asociados a documento - Folio: " + documento.folioDoc + ", Razon social: " + documento.razonSocial + ", Tipo: " + documento.tipoDocumento;
        return {
            tipo: fase,
            folio: documento && documento.folioDoc,
            razonSocial: documento && documento.razonSocial,
            tipoDocumento: documento && documento.tipoDocumento,
            etapa: etapa,
            error: mensajeError
        };
    }

    function map(context) {
        const inicioMap = Date.now();
        const unidadesIniciales = runtime.getCurrentScript().getRemainingUsage();
        const parametros = obtenerParametros();
        let entrada;
        let documentoId;
        let processKey;
        let exito = false;
        try {
            entrada = JSON.parse(context.value);
            if (parametros.aplicar) {
                processKey = crearClaveProceso(parametros.archivoId, parametros.fase, entrada.indice);
                const pendiente = JSON.parse(daoFile.cargarArchivo(entrada.pendienteId).contenido);
                if (String(pendiente.archivoId) !== String(parametros.archivoId) || pendiente.fase !== parametros.fase ||
                    pendiente.processKey !== processKey || entrada.processKey !== processKey ||
                    !pendiente.documento || !pendiente.estado) {
                    throw new Error(`Estado de documento inválido: ${entrada.pendienteId}`);
                }
                documentoId = pendiente.estado.documentoId;
                context.write({ key: String(entrada.indice), value: JSON.stringify(pendiente) });
                exito = true;
                return;
            }
            const documento = entrada.documento;
            processKey = crearClaveProceso(parametros.archivoId, parametros.fase, entrada.indice);
            const tipoRegistro = parametros.fase === "NOTA_CREDITO" ? "creditmemo" : "invoice";
            const existenteId = buscarPorClaveProceso(tipoRegistro, processKey);
            const estado = RecaudacionesFacturacion.prepararDocumento(parametros.fase, documento, processKey, existenteId, true);
            if (!estado) throw new Error("No se pudo preparar la transacción");
            documentoId = estado.documentoId;
            context.write({
                key: String(entrada.indice),
                value: JSON.stringify({
                    documento: {
                        folioDoc: documento.folioDoc,
                        tipoDocumento: documento.tipoDocumento,
                        razonSocial: documento.razonSocial,
                        FechaDocumento: documento.FechaDocumento,
                        RutCliente: documento.RutCliente,
                        folioRef: documento.folioRef
                    },
                    estado: estado,
                    processKey: processKey
                })
            });
            exito = true;
        } catch (error) {
            nLog.error("map - error", { fase: parametros.faseEjecucion, folio: entrada && entrada.documento && entrada.documento.folioDoc, nombre: error.name, mensaje: error.message, stack: error.stack });
            context.write({
                key: entrada ? String(entrada.indice) : String(context.key),
                value: JSON.stringify({ errores: [crearError(parametros.fase, entrada && entrada.documento, error, "map")] })
            });
        } finally {
            const unidadesRestantes = runtime.getCurrentScript().getRemainingUsage();
            const duracionMs = Date.now() - inicioMap;
            nLog.audit("map - consumo", { processKey: processKey, etapa: "map", duracionMs: duracionMs, acumuladoMs: duracionMs, fase: parametros.faseEjecucion, folio: entrada && entrada.documento && entrada.documento.folioDoc, id: documentoId, exito: exito, unidadesConsumidas: unidadesIniciales - unidadesRestantes, unidadesRestantes: unidadesRestantes });
        }
    }

    function reduce(context) {
        const inicioReduce = Date.now();
        const unidadesIniciales = runtime.getCurrentScript().getRemainingUsage();
        const parametros = obtenerParametros();
        let datos;
        let exito = false;
        try {
            datos = JSON.parse(context.values[0]);
            if (datos.errores) {
                context.write({ key: context.key, value: JSON.stringify({ exito: false, errores: datos.errores }) });
                return;
            }
            if (!parametros.aplicar) {
                const tipoRegistro = parametros.fase === "NOTA_CREDITO" ? "creditmemo" : "invoice";
                const existenteId = buscarPorClaveProceso(tipoRegistro, datos.processKey);
                if (existenteId) {
                    datos.estado.documentoId = existenteId;
                } else if (datos.estado.datosCreacion) {
                    datos.estado.documentoId = RecaudacionesFacturacion.crearDocumento(parametros.fase, datos.estado.datosCreacion);
                }
                const pendiente = guardarPendienteAplicacion(parametros, context.key, datos);
                context.write({ key: context.key, value: JSON.stringify({ exito: true, errores: [], pendiente: pendiente }) });
                exito = true;
                return;
            }
            const existingJournalId = buscarPorClaveProceso("journalentry", `${datos.processKey}:journal`);
            const existingPaymentId = buscarPorClaveProceso("customerpayment", `${datos.processKey}:payment`);
            RecaudacionesFacturacion.aplicarDocumento(
                parametros.fase,
                datos.documento,
                datos.estado,
                datos.processKey,
                existingJournalId,
                existingPaymentId
            );
            context.write({ key: context.key, value: JSON.stringify({ exito: true, errores: [] }) });
            exito = true;
        } catch (error) {
            nLog.error("reduce - error", error);
            context.write({
                key: context.key,
                value: JSON.stringify({ exito: false, errores: [crearError(parametros.fase, datos && datos.documento, error, "reduce")] })
            });
        } finally {
            if (datos && !datos.errores) {
                const unidadesRestantes = runtime.getCurrentScript().getRemainingUsage();
                nLog.audit("reduce - consumo", { duracionMs: Date.now() - inicioReduce, processKey: datos.processKey, id: datos.estado && datos.estado.documentoId, fase: parametros.faseEjecucion, folio: datos.documento && datos.documento.folioDoc, exito: exito, unidadesConsumidas: unidadesIniciales - unidadesRestantes, unidadesRestantes: unidadesRestantes });
            }
        }
    }

    function recuperarErrores(estadoId, fase) {
        if (fase === "FACTURA") return [];
        if (!estadoId) throw new Error(`Falta el estado de errores de facturación para la fase ${fase}`);
        const estado = JSON.parse(daoFile.cargarArchivo(estadoId).contenido);
        if (!Array.isArray(estado.errores)) throw new Error(`Estado de errores de facturación inválido: ${estadoId}`);
        return estado.errores;
    }

    function guardarErrores(parametros, archivo, errores, pendientes) {
        const contenido = JSON.stringify({ archivoId: parametros.archivoId, fase: parametros.fase, errores: errores, pendientes: pendientes });
        const nombre = `${archivo.nombre.replace(/\.json$/i, "")}-${parametros.faseEjecucion}-facturacion-estado.json`;
        return daoFile.crearArchivo({
            nombre: nombre,
            contenido: contenido,
            folder: archivo.folder,
            tipo: file.Type.JSON,
            encoding: file.Encoding.UTF8
        }).id;
    }

    function agregarErroresDeEtapa(errores, resumenEtapa, fase, etapa) {
        if (!resumenEtapa || !resumenEtapa.errors) return;
        resumenEtapa.errors.iterator().each(function (key, value) {
            errores.push({ exito: false, errores: [crearError(fase, { folioDoc: key }, value, etapa)] });
            return true;
        });
    }

    function actualizarAuditoria(nombreArchivo, errores) {
        const identificador = nombreArchivo.replace(/\.json$/i, "");
        const auditorias = libAuditoria.busquedaDatosAuditoria(identificador);
        if (!auditorias || !auditorias.length) throw new Error(`No se encontró auditoría para ${identificador}`);
        const campos = {
            custrecord_2win_auditoria_id_script: runtime.getCurrentScript().id,
            custrecord_2win_auditoria_etapa: "summarize",
            custrecord_2win_auditoria_descripcion: errores.length ? errores[0].errores[0].error : "Procesamiento completado exitosamente"
        };
        if (errores.length) campos.custrecord_2win_auditoria_estado = "001";
        libAuditoria.actualizarCamposRegistro({
            recordtype: "customrecord_2win_auditoria",
            internalid: auditorias[0].internalid,
            campos: campos
        });
    }

    function finalizar(archivo, errores) {
        const flujo = daoCola.FLUJO.FACTURACION;
        const cola = search.create({
            type: "customrecord_2w_as_cola_procesamiento",
            filters: [
                ["custrecord_2w_as_estado_cola", "is", daoCola.ESTADO_COLA.EN_PROCESO],
                "AND",
                ["custrecord_2w_as_flujo", "is", flujo],
                "AND",
                ["custrecord_2w_as_nombre_archivo", "is", archivo.nombre]
            ],
            columns: ["internalid", "custrecord_2w_as_intentos"]
        }).run().getRange({ start: 0, end: 1 });
        if (!cola.length) {
            nLog.error("summarize - cola no encontrada", archivo.nombre);
            return;
        }
        const idCola = cola[0].getValue("internalid");
        const intentos = parseInt(cola[0].getValue("custrecord_2w_as_intentos") || 0);
        const estado = errores.length ? daoCola.ESTADO_COLA.ERROR : daoCola.ESTADO_COLA.COMPLETADO;
        const siguiente = daoCola.obtenerSiguientePendiente(flujo);
        if (siguiente) daoCola.actualizarEstadoCola(siguiente.id, daoCola.ESTADO_COLA.EN_PROCESO);
        try {
            daoCola.actualizarEstadoEIntentos(idCola, estado, intentos);
        } catch (error) {
            if (siguiente) daoCola.actualizarEstadoCola(siguiente.id, daoCola.ESTADO_COLA.PENDIENTE);
            throw error;
        }
        try {
            actualizarAuditoria(archivo.nombre, errores);
        } catch (error) {
            nLog.error("summarize - auditoría", error);
        }
        const payload = {
            tipoMensaje: "SEND^UPD",
            estado: errores.length ? "error" : "success",
            codigo: errores.length ? 400 : 200,
            tipo_proceso: "Recaudaciones Flujo Facturacion",
            idproceso: archivo.nombre.replace(".json", ""),
            mensaje: `La ejecucion del proceso de recaudaciones flujo facturacion finalizo ${errores.length ? "con errores" : "correctamente"}.`,
            errores: errores
        };
        try {
            const urlBase = daoParametrosOperacion.getParam("interfaces_andessalud_hc_url_base");
            nLog.audit("summarize - payload", { url: `${urlBase.text}/process-batch`, payload: payload });
            libPeticion.ejecutarPeticionAutenticada("PUT", `${urlBase.text}/process-batch`, payload);
        } catch (error) {
            nLog.error("summarize - evento", error);
        }
        if (siguiente) {
            try {
                daoCola.ejecutarMapReduce(siguiente);
            } catch (error) {
                nLog.error("summarize - siguiente tarea", error);
                daoCola.actualizarEstadoCola(siguiente.id, daoCola.ESTADO_COLA.PENDIENTE);
            }
        }
    }

    function summarize(summary) {
        const unidadesIniciales = runtime.getCurrentScript().getRemainingUsage();
        const parametros = obtenerParametros();
        let archivo;
        let errores = [];
        let siguienteFase = null;
        try {
            archivo = daoFile.cargarArchivo(parametros.archivoId);
            errores = recuperarErrores(parametros.estadoId, parametros.faseEjecucion);
            const pendientes = new Map();
            if (summary.inputSummary && summary.inputSummary.error) {
                errores.push({ exito: false, errores: [crearError(parametros.fase, null, summary.inputSummary.error, "getInputData")] });
            }
            summary.output.iterator().each(function (key, value) {
                const resultado = JSON.parse(value);
                if (resultado.errores && resultado.errores.length) errores.push(resultado);
                if (!parametros.aplicar && resultado.exito && resultado.pendiente) {
                    pendientes.set(String(key), resultado.pendiente);
                }
                return true;
            });
            agregarErroresDeEtapa(errores, summary.mapSummary, parametros.fase, "map");
            agregarErroresDeEtapa(errores, summary.reduceSummary, parametros.fase, "reduce");
            const siguienteIndice = FASES.indexOf(parametros.fase) + 1;
            if ((!parametros.aplicar || (siguienteIndice > 0 && siguienteIndice < FASES.length)) && !(summary.inputSummary && summary.inputSummary.error)) {
                const estadoId = guardarErrores(parametros, archivo, errores, Array.from(pendientes.values()));
                siguienteFase = parametros.aplicar ? FASES[siguienteIndice] : `${parametros.fase}_APLICAR`;
                const params = {};
                params[PARAMETRO_ARCHIVO] = parametros.archivoId;
                params[PARAMETRO_FASE] = siguienteFase;
                params[PARAMETRO_ESTADO] = estadoId;
                task.create({
                    taskType: task.TaskType.MAP_REDUCE,
                    scriptId: runtime.getCurrentScript().id,
                    deploymentId: parametros.aplicar ? DEPLOYMENTS[siguienteFase] : runtime.getCurrentScript().deploymentId,
                    params: params
                }).submit();
                const unidadesRestantes = runtime.getCurrentScript().getRemainingUsage();
                nLog.audit("summarize - consumo", { fase: parametros.faseEjecucion, siguienteFase: siguienteFase, errores: errores.length, unidadesConsumidas: unidadesIniciales - unidadesRestantes, unidadesRestantes: unidadesRestantes });
                return;
            }
        } catch (error) {
            siguienteFase = null;
            nLog.error("summarize - error", error);
            errores.push({ exito: false, errores: [crearError(parametros.fase, null, error, "summarize")] });
        }
        try {
            if (archivo) finalizar(archivo, errores);
        } finally {
            const unidadesRestantes = runtime.getCurrentScript().getRemainingUsage();
            nLog.audit("summarize - consumo", { fase: parametros.faseEjecucion, siguienteFase: siguienteFase, errores: errores.length, unidadesConsumidas: unidadesIniciales - unidadesRestantes, unidadesRestantes: unidadesRestantes });
        }
    }

    return { getInputData: getInputData, map: map, reduce: reduce, summarize: summarize };
});
