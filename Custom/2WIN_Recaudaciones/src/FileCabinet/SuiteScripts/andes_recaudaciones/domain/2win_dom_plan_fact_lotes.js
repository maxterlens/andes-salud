/**
 * Plan persistido de tareas del Scheduled; no modifica el recorrido Map/Reduce.
 * @NApiVersion 2.1
 * @NModuleScope SameAccount
 */
define(["N/log", "N/runtime", "../dao/2win_dao_cola_fact_lotes", "../dao/2win_dao_estado_recaudaciones_fact_lotes",
    "../dao/2win_dao_conciliar_fact_lotes", "./2win_dom_recaudaciones_fact_lotes", "../libs/2win_lib_recaudaciones_fact_lotes"],
function (nLog, runtime, dao, daoEstado, conciliador, dominio, lib) {
    const MAX_INTENTOS = 3;
    const TERMINALES = ["COMPLETADO", "CANCELADO", "ERROR"];
    function copiar(valor) { return JSON.parse(JSON.stringify(valor)); }
    function errorDatos(error) {
        return { nombre: error.name || "Error", mensaje: String(error.message || error).slice(0, 2000),
            stack: String(error.stack || "").slice(0, 2500) };
    }
    function base(padreId, documento) {
        return { padreId: String(padreId), processKey: documento.processKey, tipo: documento.tipo,
            indice: documento.indice, folio: String(documento.folio || ""), fase: lib.TIPOS.indexOf(documento.tipo),
            preparadoId: documento.preparadoId || "", grupo: 0, orden: 0, desde: 0, hasta: 0 };
    }
    function inicializar(control, padreId) {
        if (control.estado.planInicializado) return;
        control.estado.documentos.forEach(doc => dao.asegurar({ ...base(padreId, doc), operacion: "PREPARAR" }));
        control.estado.planInicializado = true;
        daoEstado.guardar(control);
    }
    function preparado(estado, documento) {
        const datos = daoEstado.leerJson(documento.preparadoId);
        if (String(datos.archivoId) !== String(estado.archivoId) || datos.processKey !== documento.processKey ||
            datos.tipo !== documento.tipo || datos.indice !== documento.indice || !datos.estado) throw new Error("Preparado incompatible con la tarea");
        return datos;
    }
    function planificar(estado, tarea, documento) {
        const datos = preparado(estado, documento);
        const tareas = [];
        let orden = 1;
        if (documento.porLotes) {
            const cantidad = lib.enteroPositivo(estado.configuracion.lineasPorLote, "lineasPorLote");
            for (let desde = 1; desde <= documento.totalLineas; desde += cantidad) {
                tareas.push({ operacion: documento.ncRma ? "CARGAR_RMA" : "CARGAR", desde: desde, hasta: Math.min(desde + cantidad - 1, documento.totalLineas), orden: orden++ });
            }
            tareas.push({ operacion: documento.ncRma ? "APROBAR_RMA" : "APROBAR", orden: orden++ });
            if (documento.ncRma) tareas.push({ operacion: "TRANSFORMAR_NC", orden: orden++ });
        } else tareas.push({ operacion: "CREAR", orden: orden++ });
        tareas.push({ operacion: "APLICAR", grupo: 1, orden: 0 });
        if (documento.tipo === "NOTA_DEBITO") tareas.push({ operacion: "APLICAR_NOTA_CREDITO", grupo: 1, orden: 1 });
        if (datos.estado.totalJournalCopago > 0) tareas.push({ operacion: "CREAR_ASIENTO", grupo: 1, orden: 2 });
        if (datos.estado.totalJournalCopago > 0 || documento.tipo === "NOTA_CREDITO") tareas.push({ operacion: "CREAR_PAGO", grupo: 1, orden: 3 });
        tareas.forEach(paso => dao.asegurar({ ...base(tarea.padreId, documento), ...paso }));
    }
    function proyectar(control, tareas) {
        control.estado.documentos = control.estado.documentos.map(function (original) {
            const propias = tareas.filter(t => t.processKey === original.processKey);
            const completadas = propias.filter(t => t.estado === "COMPLETADO");
            const ultimo = completadas.length ? dao.cargar(completadas[completadas.length - 1].id) : null;
            const documento = ultimo && ultimo.resultado ? copiar(ultimo.resultado) : { ...original, paso: "PREPARAR" };
            const pendiente = propias.find(t => !TERMINALES.includes(t.estado));
            documento.paso = pendiente ? pendiente.operacion : (propias.some(t => t.estado === "ERROR") ? "ERROR" : (propias.some(t => t.estado === "CANCELADO") ? "CANCELADO" : "TERMINADO"));
            return documento;
        });
    }
    function completar(tarea, documento, recuperado) {
        tarea.estado = "COMPLETADO";
        tarea.resultado = copiar(documento);
        tarea.documentoId = documento.documentoId || "";
        tarea.preparadoId = documento.preparadoId || "";
        tarea.fin = new Date().toISOString();
        const intento = tarea.historial[tarea.historial.length - 1];
        if (intento) Object.assign(intento, { resultado: recuperado ? "RECUPERADO" : "COMPLETADO", fin: tarea.fin });
        dao.guardar(tarea);
    }
    function detener(control, padreId, tarea) {
        tarea.estado = "ERROR";
        tarea.fin = new Date().toISOString();
        dao.guardar(tarea);
        if (!control.estado.planDetenido) {
            const documento = control.estado.documentos.find(d => d.processKey === tarea.processKey) || {};
            nLog.error("facturacion lotes SS - proceso detenido", {
                mensaje: "Se agotaron los tres intentos y la conciliación final no confirmó la operación. Se detiene el padre y se cancelan sus tareas pendientes. Las transacciones guardadas se conservan para revisión.",
                padreId, archivoId: control.estado.archivoId, tareaId: tarea.id,
                processKey: tarea.processKey, tipo: tarea.tipo, folio: tarea.folio,
                documentoId: tarea.documentoId || documento.documentoId || null,
                rmaId: documento.rmaId || null,
                operacion: tarea.operacion, desdeLinea: tarea.desde, hastaLinea: tarea.hasta,
                totalLineas: documento.totalLineas || null, intentos: tarea.intentos,
                maxIntentos: MAX_INTENTOS, ejecucionId: tarea.ejecucionId, fechaUtc: tarea.fin,
                ultimoError: String(tarea.error || "Operación sin resultado confirmado").slice(0, 1200),
                historial: tarea.historial.slice(-MAX_INTENTOS).map(intento => ({
                    intento: intento.intento, ejecucionId: intento.ejecucionId,
                    inicio: intento.inicio, fin: intento.fin, resultado: intento.resultado,
                    error: intento.error ? String(intento.error.mensaje).slice(0, 180) : null
                }))
            });
        }
        dao.listar(padreId).filter(t => !TERMINALES.includes(t.estado)).forEach(function (resumen) {
            const hijo = dao.cargar(resumen.id);
            hijo.estado = "CANCELADO";
            hijo.error = `Padre detenido por la tarea ${tarea.id}`;
            dao.guardar(hijo);
        });
        control.estado.errores = [{ exito: false, errores: [{ tipo: tarea.tipo, folio: tarea.folio,
            processKey: tarea.processKey, documentoId: tarea.documentoId || null, tareaId: tarea.id,
            operacion: tarea.operacion, desdeLinea: tarea.desde, hastaLinea: tarea.hasta,
            intentos: tarea.intentos, error: tarea.error || "Se agotaron los intentos de la tarea" }] }];
        control.estado.planDetenido = true;
        daoEstado.guardar(control);
        dao.actualizarPadre(padreId, { hijoActual: tarea.id, resultado: `ERROR en tarea ${tarea.id}: ${tarea.error}`.slice(0, 3900) });
    }
    function sincronizar(control, padreId) {
        const tareas = dao.listar(padreId);
        proyectar(control, tareas);
        daoEstado.guardar(control);
        const listo = tareas.filter(t => t.operacion === "PREPARAR").every(t => t.estado === "COMPLETADO");
        dao.actualizarPadre(padreId, { planCompleto: listo });
    }
    function ejecutar(control, padreId, ejecucionId) {
        inicializar(control, padreId);
        let tareas = dao.listar(padreId);
        const fallo = tareas.find(t => t.estado === "ERROR");
        if (fallo) {
            // Completar cancelación/cierre si el proceso murió durante ese trabajo administrativo.
            detener(control, padreId, dao.cargar(fallo.id));
            return false;
        }
        proyectar(control, tareas);
        const resumen = tareas.find(t => !TERMINALES.includes(t.estado));
        if (!resumen) { daoEstado.guardar(control); return false; }
        const tarea = dao.cargar(resumen.id);
        const original = control.estado.documentos.find(d => d.processKey === tarea.processKey);
        if (!original) throw new Error("La tarea no pertenece a los documentos del padre");
        let documento = copiar(original);
        documento.paso = tarea.operacion;
        if (["CARGAR", "CARGAR_RMA"].includes(tarea.operacion)) documento.avance = tarea.desde - 1;
        if (tarea.preparadoId) documento.preparadoId = tarea.preparadoId;
        dao.actualizarPadre(padreId, { hijoActual: tarea.id });
        const inicio = Date.now();
        const unidades = runtime.getCurrentScript().getRemainingUsage();
        const anterior = tarea.intentos > 0;
        const final = tarea.intentos >= MAX_INTENTOS;
        if (tarea.estado === "EN_PROCESO" && tarea.historial.length) {
            Object.assign(tarea.historial[tarea.historial.length - 1], { resultado: "INTERRUMPIDO", fin: new Date().toISOString() });
            nLog.audit("facturacion lotes SS - interrupción detectada", {
                mensaje: "La ejecución anterior dejó la tarea EN_PROCESO sin confirmar su resultado. La causa de la interrupción no está disponible en este estado.",
                padreId, archivoId: control.estado.archivoId, tareaId: tarea.id,
                processKey: tarea.processKey, tipo: tarea.tipo, folio: tarea.folio,
                documentoId: tarea.documentoId || documento.documentoId || null,
                operacion: tarea.operacion, desdeLinea: tarea.desde, hastaLinea: tarea.hasta,
                intentoInterrumpido: tarea.intentos, ejecucionAnterior: tarea.ejecucionId,
                ejecucionId, fechaUtc: new Date().toISOString(),
                siguienteAccion: final ? "CONCILIACION_FINAL_SIN_REEJECUTAR" : "CONCILIAR_ANTES_DE_REINTENTAR"
            });
        }
        // La conciliación del tercer intento es exclusivamente de lectura. Nunca hay una cuarta operación.
        if (!final) {
            tarea.intentos++;
            tarea.historial.push({ intento: tarea.intentos, ejecucionId: ejecucionId, inicio: new Date().toISOString(), resultado: "EN_PROCESO" });
        }
        tarea.estado = "EN_PROCESO";
        tarea.ejecucionId = ejecucionId;
        tarea.inicio = new Date().toISOString();
        dao.guardar(tarea);
        nLog.audit("facturacion lotes SS - tarea inicio", { padreId, tareaId: tarea.id, ejecucionId,
            processKey: tarea.processKey, operacion: tarea.operacion, desde: tarea.desde, hasta: tarea.hasta,
            intento: tarea.intentos, conciliacionFinal: final });
        try {
            if (tarea.operacion === "PREPARAR") {
                if (tarea.resultado && tarea.resultado.preparadoId) documento = copiar(tarea.resultado);
                else {
                    if (final) throw new Error(tarea.error || "Preparación inconclusa después de tres intentos");
                    dominio.ejecutarOperacion(control.estado, documento);
                    // Confirmar el preparado antes de empezar a crear hijos: se reutiliza si la planificación se corta.
                    tarea.resultado = copiar(documento);
                    tarea.preparadoId = documento.preparadoId;
                    dao.guardar(tarea);
                }
                planificar(control.estado, tarea, documento);
                completar(tarea, documento, anterior);
            } else {
                const datos = preparado(control.estado, documento);
                const confirmado = anterior ? conciliador.comprobar(tarea, datos, documento) : null;
                if (confirmado) {
                    Object.assign(documento, confirmado);
                    completar(tarea, documento, true);
                } else {
                    if (final) throw new Error(tarea.error || "Operación no confirmada después de tres intentos");
                    // El rango persistido del hijo manda, incluso si cambia el parámetro de operación.
                    const estadoOperacion = { ...control.estado, configuracion: { ...control.estado.configuracion,
                        lineasPorLote: ["CARGAR", "CARGAR_RMA"].includes(tarea.operacion) ? tarea.hasta - tarea.desde + 1 : control.estado.configuracion.lineasPorLote } };
                    dominio.ejecutarOperacion(estadoOperacion, documento);
                    completar(tarea, documento, false);
                }
            }
        } catch (error) {
            // Si se perdió la respuesta al confirmar el hijo, no sobrescribir una confirmación guardada.
            const guardada = dao.cargar(tarea.id);
            if (guardada.estado === "COMPLETADO") {
                sincronizar(control, padreId);
                return true;
            }
            if (guardada.ejecucionId !== ejecucionId) throw error;
            Object.assign(tarea, guardada);
            tarea.error = String(error.message || error).slice(0, 3900);
            tarea.historial[tarea.historial.length - 1].error = errorDatos(error);
            tarea.historial[tarea.historial.length - 1].resultado = "ERROR";
            tarea.historial[tarea.historial.length - 1].fin = new Date().toISOString();
            if (final) detener(control, padreId, tarea);
            else { tarea.estado = "REINTENTO_PENDIENTE"; dao.guardar(tarea); }
            nLog.error("facturacion lotes SS - tarea error", { padreId, tareaId: tarea.id, ejecucionId,
                intento: tarea.intentos, operacion: tarea.operacion, desde: tarea.desde, hasta: tarea.hasta,
                duracionMs: Date.now() - inicio, unidadesConsumidas: unidades - runtime.getCurrentScript().getRemainingUsage(),
                unidadesRestantes: runtime.getCurrentScript().getRemainingUsage(), ...errorDatos(error) });
            return true;
        }
        sincronizar(control, padreId);
        nLog.audit("facturacion lotes SS - tarea consumo", { padreId, tareaId: tarea.id, ejecucionId,
            intento: tarea.intentos, operacion: tarea.operacion, desde: tarea.desde, hasta: tarea.hasta,
            documentoId: documento.documentoId, rmaId: documento.rmaId || null, duracionMs: Date.now() - inicio,
            unidadesConsumidas: unidades - runtime.getCurrentScript().getRemainingUsage(),
            unidadesRestantes: runtime.getCurrentScript().getRemainingUsage() });
        return true;
    }
    return { ejecutar };
});
