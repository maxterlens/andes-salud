/**
 * @NApiVersion 2.1
 * @NScriptType MapReduceScript
 * @NModuleScope SameAccount
 *
 * @description AS_NSP_037 - FixArticuloOrdenVenta: aplica un proceso validado en el Suitelet.
 *              La lógica de negocio vive en services/; este script solo coordina las etapas.
 *
 *               - getInputData: líneas del JSON de la validación (ProcesoFixService.prepararProceso).
 *               - map: agrupa las líneas por OV (una OV = un reduce, para guardarla una sola vez).
 *               - reduce: CorreccionService.procesarOrdenVenta y un detalle por línea en el historial.
 *               - summarize: ProcesoFixService.finalizar (totales y estado final del proceso).
 *
 *              Sin reintentos: un reduce reintentado podría volver a tocar Ejecuciones ya ajustadas o
 *              crear dos veces la Ejecución de un reemplazo. Sin salida al primer error: cada OV es
 *              independiente y un error en una no debe detener las demás.
 *
 *              Parámetro: custscript_as_faov_proceso (ID del registro customrecord_as_faov_proceso).
 */
define([
    "N/runtime",
    "N/log",
    "../constants/FixArticuloOrdenVentaConstants",
    "../repositories/ProcesoRepository",
    "../services/ProcesoFixService",
    "../services/CorreccionService"
], (runtime, nLog, CONST, procesoRepo, procesoFixService, correccionService) => {
    const { SCRIPTS, ACCIONES_LINEA } = CONST;

    const config = { retryCount: 0, exitOnError: false };

    const _procesoId = () => Number(runtime.getCurrentScript().getParameter({ name: SCRIPTS.MAP_REDUCE.PARAM_PROCESO }));
    const _mensajeError = (e) => (e && (e.message || e.name)) || String(e);

    /** Mensaje de un error serializado por el Map/Reduce. */
    const _mensaje = (error) => {
        try {
            return JSON.parse(error).message || error;
        } catch (e) {
            return error;
        }
    };

    const getInputData = () => {
        const procesoId = _procesoId();
        if (!procesoId) throw new Error("No se recibió el ID del proceso.");
        return procesoFixService.prepararProceso(procesoId);
    };

    /** Una clave por OV; las líneas sin OV van cada una por separado. */
    const map = (context) => {
        const l = JSON.parse(context.value);
        const clave = l.ovId ? `OV-${l.ovId}` : `SIN_OV-${l.clave}-${(l.filas || [])[0] || ""}`;
        context.write({ key: clave, value: JSON.stringify(l) });
    };

    const reduce = (context) => {
        const procesoId = _procesoId();
        const lineas = context.values.map((v) => JSON.parse(v));

        let resultados;
        try {
            resultados = correccionService.procesarOrdenVenta({ idOrdenVenta: lineas[0].ovId || null, subsidiaria: lineas[0].subsidiaria, lineas });
        } catch (e) {
            nLog.error({ title: `AS_NSP_037 - Error no controlado en ${context.key}`, details: _mensajeError(e) });
            resultados = lineas.map((l) => ({
                ...l,
                estado: l.procesable ? "ERROR" : l.accion === ACCIONES_LINEA.SIN_CAMBIO.codigo ? "SIN_CAMBIO" : "NO_PROCESABLE",
                mensaje: l.procesable ? `Error no controlado: ${_mensajeError(e)}` : l.mensaje,
                cantidadResultante: l.cantidadOv,
                ejecucionesAfectadas: [],
                lotes: ""
            }));
        }

        for (const r of resultados) {
            procesoRepo.crearDetalle(procesoId, r);
            context.write({ key: r.estado || "ERROR", value: "1" });
        }
    };

    const summarize = (summary) => {
        const procesoId = _procesoId();
        const errores = [];
        let erroresEtapas = 0;
        if (summary.inputSummary.error) errores.push(`Preparación: ${_mensaje(summary.inputSummary.error)}`);
        summary.mapSummary.errors.iterator().each((clave, error) => {
            errores.push(`${clave}: ${_mensaje(error)}`);
            erroresEtapas++;
            return true;
        });
        summary.reduceSummary.errors.iterator().each((clave, error) => {
            errores.push(`${clave}: ${_mensaje(error)}`);
            erroresEtapas++;
            return true;
        });

        const conteo = {};
        summary.output.iterator().each((estado) => {
            conteo[estado] = (conteo[estado] || 0) + 1;
            return true;
        });

        try {
            procesoFixService.finalizar(procesoId, { conteo, errores, erroresEtapas, errorEntrada: !!summary.inputSummary.error });
        } catch (e) {
            nLog.error({ title: "AS_NSP_037 - No se pudo cerrar el proceso", details: _mensajeError(e) });
        }
        nLog.audit({ title: "AS_NSP_037 - Fin FixArticuloOrdenVenta", details: JSON.stringify({ procesoId, conteo, errores: errores.length, segundos: summary.seconds, usoGobernanza: summary.usage }) });
    };

    return { config, getInputData, map, reduce, summarize };
});
