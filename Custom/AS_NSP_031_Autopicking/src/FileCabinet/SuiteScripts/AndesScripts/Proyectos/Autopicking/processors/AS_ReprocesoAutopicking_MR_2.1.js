/**
 * @NApiVersion 2.1
 * @NScriptType MapReduceScript
 * @NModuleScope SameAccount
 *
 * @description AS_NSP_031 - Reproceso de autopicking.
 *              Crea las Ejecuciones de Orden de Artículo pendientes de las Órdenes de Venta
 *              que el autopicking en línea no pudo completar (por ejemplo, por falta de stock),
 *              y registra un log por cada OV procesada (customrecord_as_autopicking_log).
 *              La lógica de negocio vive en services/; este script lee parámetros y coordina las etapas.
 *
 *              Parámetros:
 *               - custscript_as_rap_ids_ov            IDs de OV separados por coma (prioridad sobre la búsqueda)
 *               - custscript_as_rap_dias_atras        Antigüedad máxima de las OV (días)
 *               - custscript_as_rap_limite_ov         Máximo de OV por ejecución
 *               - custscript_as_rap_simulacion        Solo calcula y registra, no crea Ejecuciones
 *               - custscript_as_rap_usar_fecha_linea  Fecha de la Ejecución = fecha de creación de la línea
 *               - custscript_as_rap_log_sin_cambios   Registrar log también cuando la OV sigue sin stock
 *               - custscript_as_rap_registrar_log     Guardar el log en customrecord_as_autopicking_log;
 *                                                     desmarcado = solo log de ejecución del script
 */
define([
    "N/runtime",
    "N/log",
    "../constants/AutopickingConstants",
    "../repositories/OrdenVentaRepository",
    "../repositories/LogAutopickingRepository",
    "../services/ReprocesoAutopickingService"
], (runtime, nLog, CONST, ordenVentaRepo, logRepo, reprocesoService) => {
    const { PARAMETROS, DEFAULTS, RESULTADO, LOG } = CONST;

    const esVerdadero = (v) => v === true || v === "T" || v === "true";

    /** Checkbox que vale verdadero salvo que venga desmarcado explícitamente (deploys anteriores al parámetro). */
    const esVerdaderoPorDefecto = (v) => !(v === false || v === "F" || v === "false");

    const numeroPositivo = (valor, porDefecto) => {
        const n = parseInt(valor, 10);
        return Number.isFinite(n) && n > 0 ? n : porDefecto;
    };

    const parsearIds = (texto) =>
        [
            ...new Set(
                String(texto || "")
                    .split(/[\s,;]+/)
                    .map((s) => parseInt(s, 10))
                    .filter((n) => Number.isFinite(n) && n > 0)
            )
        ];

    function leerParametros() {
        const script = runtime.getCurrentScript();
        const p = (id) => script.getParameter({ name: id });
        return {
            idsOrdenVenta: parsearIds(p(PARAMETROS.IDS_ORDEN_VENTA)),
            diasAtras: numeroPositivo(p(PARAMETROS.DIAS_ATRAS), DEFAULTS.DIAS_ATRAS),
            limite: numeroPositivo(p(PARAMETROS.LIMITE_OV), DEFAULTS.LIMITE_OV),
            simulacion: esVerdadero(p(PARAMETROS.SIMULACION)),
            usarFechaLinea: esVerdadero(p(PARAMETROS.USAR_FECHA_LINEA)),
            logSinCambios: esVerdadero(p(PARAMETROS.LOG_SIN_CAMBIOS)),
            registrarLog: esVerdaderoPorDefecto(p(PARAMETROS.REGISTRAR_LOG))
        };
    }

    /** Identificador común de la ejecución, para agrupar los logs de una misma corrida. */
    const generarIdProceso = () => {
        const script = runtime.getCurrentScript();
        return `${script.deploymentId}-${new Date().toISOString()}`;
    };

    // ── getInputData ───────────────────────────────────────────────────────────
    function getInputData() {
        const parametros = leerParametros();
        const idProceso = generarIdProceso();
        nLog.audit({ title: "AS_NSP_031 - Inicio reproceso autopicking", details: JSON.stringify({ idProceso, ...parametros }) });

        const candidatas = ordenVentaRepo.buscarCandidatas(parametros);
        nLog.audit({ title: "AS_NSP_031 - OV candidatas", details: `${candidatas.length} OV a procesar` });

        return candidatas.map((ov) => ({ idOrdenVenta: ov.id, tranid: ov.tranid, idProceso }));
    }

    // ── map: una clave por OV para que cada reduce procese una sola OV ─────────
    function map(context) {
        const entrada = JSON.parse(context.value);
        context.write({ key: String(entrada.idOrdenVenta), value: JSON.stringify(entrada) });
    }

    // ── reduce ─────────────────────────────────────────────────────────────────
    function reduce(context) {
        const entrada = JSON.parse(context.values[0]);
        const parametros = leerParametros();
        const opciones = {
            simulacion: parametros.simulacion,
            usarFechaLinea: parametros.usarFechaLinea,
            logSinCambios: parametros.logSinCambios,
            registrarLog: parametros.registrarLog,
            idProceso: entrada.idProceso
        };

        let salida;
        try {
            salida = reprocesoService.procesarOrdenVenta({ idOrdenVenta: entrada.idOrdenVenta, tranid: entrada.tranid, opciones });
        } catch (e) {
            const mensaje = (e && e.message) || String(e);
            nLog.error({ title: `AS_NSP_031 - Error OV ${entrada.tranid || entrada.idOrdenVenta}`, details: mensaje });
            salida = { resultado: RESULTADO.ERROR, idOrdenVenta: entrada.idOrdenVenta, tranid: entrada.tranid, ejecuciones: [], errores: [mensaje], idLog: null };
            // Sin registro personalizado, el nLog.error anterior es el único rastro (ya incluye OV y mensaje)
            if (opciones.registrarLog) salida.idLog = logRepo.crear({
                idOrdenVenta: entrada.idOrdenVenta,
                tranid: entrada.tranid,
                estado: LOG.ESTADOS.ERROR,
                simulacion: opciones.simulacion,
                idProceso: opciones.idProceso,
                ejecuciones: [],
                detalle: [],
                error: mensaje
            });
        }

        context.write({
            key: salida.resultado,
            value: JSON.stringify({
                ov: salida.tranid || salida.idOrdenVenta,
                id: salida.idOrdenVenta,
                ejecuciones: salida.ejecuciones,
                pendienteFinal: salida.pendienteFinal,
                errores: salida.errores
            })
        });
    }

    // ── summarize ──────────────────────────────────────────────────────────────
    function summarize(summary) {
        if (summary.inputSummary.error) {
            nLog.error({ title: "AS_NSP_031 - Error en getInputData", details: summary.inputSummary.error });
        }
        summary.mapSummary.errors.iterator().each((clave, error) => {
            nLog.error({ title: `AS_NSP_031 - Error en map (OV ${clave})`, details: error });
            return true;
        });
        summary.reduceSummary.errors.iterator().each((clave, error) => {
            nLog.error({ title: `AS_NSP_031 - Error en reduce (OV ${clave})`, details: error });
            return true;
        });

        const totales = {};
        const conPendiente = [];
        let ejecucionesCreadas = 0;
        summary.output.iterator().each((clave, valor) => {
            totales[clave] = (totales[clave] || 0) + 1;
            const r = JSON.parse(valor);
            ejecucionesCreadas += (r.ejecuciones || []).length;
            if ([RESULTADO.PARCIAL, RESULTADO.SIN_STOCK, RESULTADO.ERROR].includes(clave)) {
                conPendiente.push(`${r.ov} (${clave})`);
            }
            return true;
        });

        nLog.audit({
            title: "AS_NSP_031 - Fin reproceso autopicking",
            details: JSON.stringify({
                totales,
                ejecucionesCreadas,
                segundos: summary.seconds,
                usoGobernanza: summary.usage,
                colas: summary.concurrency
            })
        });
        if (conPendiente.length > 0) {
            nLog.audit({ title: "AS_NSP_031 - OV que siguen con pendiente", details: conPendiente.join(", ").substring(0, 3900) });
        }
    }

    return { getInputData, map, reduce, summarize };
});
