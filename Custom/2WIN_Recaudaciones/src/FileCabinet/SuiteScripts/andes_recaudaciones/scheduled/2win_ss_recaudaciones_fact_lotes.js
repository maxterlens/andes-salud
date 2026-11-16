/**
 * @NApiVersion 2.1
 * @NScriptType ScheduledScript
 */
define(["N/runtime", "N/task", "N/log", "N/search", "../dao/2win_dao_estado_recaudaciones_fact_lotes",
    "../domain/2win_dom_recaudaciones_fact_lotes", "../domain/2win_dom_cola_recaudaciones_fact_lotes",
    "../libs/2win_lib_recaudaciones_fact_lotes", "../dao/2win_dao_cola_fact_lotes",
    "../dao/2win_dao_cola", "../domain/2win_dom_plan_fact_lotes"],
function (runtime, task, nLog, search, daoEstado, dominio, domCola, libLotes, daoHijos, daoCola, plan) {
    function continuar(archivoId) {
        const params = {};
        params[libLotes.PARAMETRO_ARCHIVO_PROGRAMADO] = archivoId;
        try {
            const taskId = task.create({ taskType: task.TaskType.SCHEDULED_SCRIPT, scriptId: libLotes.SCRIPT_PROGRAMADO,
                deploymentId: libLotes.DEPLOYMENT_PROGRAMADO, params: params }).submit();
            nLog.audit("facturacion lotes SS - continuación", { archivoId: archivoId, taskId: taskId || null });
        } catch (error) {
            nLog.error("facturacion lotes SS - continuación pendiente", { archivoId: archivoId, error: error.message });
            throw error;
        }
    }
    function ejecutorOcupado() {
        const filas = search.create({ type: "scheduledscriptinstance",
            filters: [["formulatext: {scriptdeployment.scriptid}", "is", libLotes.DEPLOYMENT_PROGRAMADO], "AND",
                ["status", "noneof", "COMPLETE", "FAILED", "CANCELED"]], columns: ["status", "taskid"] })
            .run().getRange({ start: 0, end: 1 });
        // Incluye pendientes, procesamiento, deferred y reintentos nativos. Si la búsqueda falla, no despachar.
        return filas.length > 0;
    }
    function supervisar() {
        const inicio = Date.now();
        const resultado = { estado: "INICIADO", padreId: null };
        nLog.audit("facturacion lotes SS - supervisor inicio", {
            deploymentId: runtime.getCurrentScript().deploymentId,
            fechaUtc: new Date().toISOString()
        });
        try {
            if (ejecutorOcupado()) {
                resultado.estado = "EJECUTOR_OCUPADO";
                return;
            }
            const activos = daoHijos.activos();
            if (activos.length > 1) throw new Error("Hay varios padres de facturación EN_PROCESO; revisar la cola");
            const padre = activos[0] || daoHijos.cierrePendiente();
            if (padre) {
                resultado.padreId = padre.id;
                if (padre.version !== 2 || padre.scriptId !== libLotes.SCRIPT_PROGRAMADO) {
                    resultado.estado = "PROCESO_OMITIDO";
                    resultado.motivo = "La cola corresponde a otra versión o script";
                    return;
                }
                const archivoId = daoCola.obtenerIdArchivo(padre.id);
                resultado.archivoId = archivoId;
                const control = daoEstado.cargar(String(archivoId));
                if (control.estado.planVersion !== 2 || control.estado.via !== "LOTES_PROGRAMADO") {
                    resultado.estado = "PROCESO_OMITIDO";
                    resultado.motivo = "El archivo corresponde a otra versión o vía";
                    return;
                }
                // El supervisor no reclama ni modifica hijos. NetSuite serializa las submissions al deployment ejecutor.
                // No mantener una reserva de despacho durante esta recuperación: otro aborto no debe dejarla huérfana.
                continuar(archivoId);
                resultado.estado = "CONTINUACION_ENVIADA";
            } else {
                const envio = domCola.despacharPendiente(false, true);
                resultado.estado = envio ? "PENDIENTE_DESPACHADO" : "SIN_DESPACHO";
                if (envio) {
                    resultado.padreId = envio.colaId;
                    resultado.taskId = envio.taskId;
                } else {
                    resultado.motivo = "Sin pendientes elegibles o despacho no disponible";
                }
            }
        } catch (error) {
            resultado.estado = "ERROR";
            nLog.error("facturacion lotes SS - supervisor error", {
                padreId: resultado.padreId, archivoId: resultado.archivoId,
                nombre: error.name, error: error.message, stack: error.stack
            });
            throw error;
        } finally {
            resultado.duracionMs = Date.now() - inicio;
            nLog.audit("facturacion lotes SS - supervisor resultado", resultado);
        }
    }
    function execute(context) {
        const script = runtime.getCurrentScript();
        if (script.id !== libLotes.SCRIPT_PROGRAMADO) throw new Error("Script programado incorrecto");
        if (script.deploymentId === libLotes.DEPLOYMENT_SUPERVISOR) { supervisar(); return; }
        if (script.deploymentId !== libLotes.DEPLOYMENT_PROGRAMADO) throw new Error("Deployment ejecutor incorrecto");
        const archivoId = script.getParameter({ name: libLotes.PARAMETRO_ARCHIVO_PROGRAMADO });
        if (!archivoId) throw new Error(`Falta el parámetro ${libLotes.PARAMETRO_ARCHIVO_PROGRAMADO}`);
        const control = daoEstado.cargar(String(archivoId));
        if (control.estado.via !== "LOTES_PROGRAMADO") throw new Error("El archivo no pertenece al Scheduled de lotes");
        if (control.estado.planVersion !== 2) { ejecutarAnterior(context); return; }
        const cola = domCola.buscarCola(control.estado.nombre);
        if (cola.scriptId !== script.id || cola.deploymentId !== script.deploymentId) throw new Error("El Scheduled no corresponde al procesador asignado en la cola");
        if (control.estado.finalizado) {
            daoHijos.actualizarPadre(cola.id, { hijoActual: "", cierrePendiente: false, resultado: control.estado.errores.length ? "ERROR" : "COMPLETADO" });
            domCola.despacharPendiente(true);
            return;
        }
        // Si el cierre cambió la cola y se interrumpió antes del último snapshot, se completa ese cierre.
        if (cola.estado !== 2 && !(control.estado.cierre.auditoria && [3, 4].includes(cola.estado))) {
            throw new Error("La entrada de cola debe estar EN_PROCESO antes de ejecutar lotes");
        }
        const ejecucionId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        nLog.audit("facturacion lotes SS - entrada", { archivoId, padreId: cola.id, ejecucionId,
            fechaUtc: new Date().toISOString(), tipoInvocacion: context && context.type });
        if (cola.estado !== 2 || !plan.ejecutar(control, cola.id, ejecucionId)) {
            daoHijos.actualizarPadre(cola.id, { hijoActual: "", cierrePendiente: true, resultado: "CIERRE_PENDIENTE" });
            domCola.finalizar(control);
            daoHijos.actualizarPadre(cola.id, { cierrePendiente: false, resultado: control.estado.errores.length ? "ERROR" : "COMPLETADO" });
            return;
        }
        // Una operación por lanzamiento, incluido el cierre independiente.
        continuar(archivoId);
    }
    function ejecutarAnterior(context) {
        const script = runtime.getCurrentScript();
        const archivoId = script.getParameter({ name: libLotes.PARAMETRO_ARCHIVO_PROGRAMADO });
        if (!archivoId) throw new Error(`Falta el parámetro ${libLotes.PARAMETRO_ARCHIVO_PROGRAMADO}`);
        nLog.audit("facturacion lotes SS - entrada", { archivoId: archivoId,
            tipoInvocacion: context && context.type, scriptId: script.id, deploymentId: script.deploymentId });
        const control = daoEstado.cargar(String(archivoId));
        if (control.estado.via !== "LOTES_PROGRAMADO") throw new Error("El archivo no pertenece al Scheduled de lotes");
        const cola = domCola.buscarCola(control.estado.nombre);
        if (cola.scriptId !== libLotes.SCRIPT_PROGRAMADO || cola.deploymentId !== libLotes.DEPLOYMENT_PROGRAMADO ||
            script.id !== libLotes.SCRIPT_PROGRAMADO || script.deploymentId !== libLotes.DEPLOYMENT_PROGRAMADO) {
            throw new Error("El Scheduled no corresponde al procesador asignado en la cola");
        }
        if (control.estado.finalizado) {
            domCola.despacharPendiente(true);
            return;
        }
        if (cola.estado !== 2) throw new Error("La entrada de cola debe estar EN_PROCESO antes de ejecutar lotes");
        const documento = dominio.siguienteOperacion(control.estado);
        if (control.estado.operacionProgramada) {
            // Una ejecución interrumpida no se repite automáticamente al reiniciar NetSuite.
            const pendiente = control.estado.operacionProgramada;
            if (!documento || documento.processKey !== pendiente.processKey || documento.paso !== pendiente.paso) {
                throw new Error("El estado de la operación programada interrumpida es incompatible");
            }
            nLog.audit("facturacion lotes SS - operación sin cierre", { archivoId: archivoId,
                tipoInvocacion: context && context.type, pendiente: pendiente, revision: control.estado.revision,
                transcurridoMs: pendiente.inicioMs ? Date.now() - pendiente.inicioMs : null });
            const error = new Error("La ejecución anterior se interrumpió sin confirmar el resultado de la operación");
            const detalle = dominio.registrarError(control.estado, documento, error, "interrupcion");
            delete control.estado.operacionProgramada;
            daoEstado.guardar(control);
            nLog.error("facturacion lotes SS - interrupción", detalle);
            continuar(control.estado.archivoId);
            return;
        }
        if (!documento) {
            // El cierre tiene su propio lanzamiento, después de la última aplicación.
            domCola.finalizar(control);
            return;
        }
        const inicio = Date.now();
        const unidades = script.getRemainingUsage();
        const paso = documento.paso;
        control.estado.operacionProgramada = { processKey: documento.processKey, paso: paso, inicioMs: inicio,
            desdeLinea: documento.avance == null ? null : documento.avance + 1,
            lineasPorLote: control.estado.configuracion.lineasPorLote };
        daoEstado.guardar(control);
        nLog.audit("facturacion lotes SS - inicio", { processKey: documento.processKey, folio: documento.folio,
            etapa: paso, documentoId: documento.documentoId, lineasConfirmadas: documento.avance,
            totalLineas: documento.totalLineas, unidadesRestantes: script.getRemainingUsage() });
        let exito = false;
        try {
            // Exactamente una operación: preparación, lote, aprobación, validación, asiento o pago.
            dominio.ejecutarOperacion(control.estado, documento);
            exito = true;
        } catch (error) {
            const detalle = dominio.registrarError(control.estado, documento, error, "execute");
            nLog.error("facturacion lotes SS - error", { ...detalle, nombre: error.name, stack: error.stack });
        }
        delete control.estado.operacionProgramada;
        daoEstado.guardar(control);
        nLog.audit("facturacion lotes SS - consumo", { processKey: documento.processKey, folio: documento.folio,
            etapa: paso, documentoId: documento.documentoId, lineasConfirmadas: documento.avance,
            totalLineas: documento.totalLineas, exito: exito, duracionMs: Date.now() - inicio,
            unidadesConsumidas: unidades - script.getRemainingUsage(), unidadesRestantes: script.getRemainingUsage() });
        continuar(control.estado.archivoId);
    }

    return { execute };
});
