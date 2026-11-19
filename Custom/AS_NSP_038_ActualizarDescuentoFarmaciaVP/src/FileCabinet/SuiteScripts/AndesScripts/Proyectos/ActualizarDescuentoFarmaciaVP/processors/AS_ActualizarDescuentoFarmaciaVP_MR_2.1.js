/**
 * @NApiVersion 2.1
 * @NScriptType MapReduceScript
 * @NModuleScope SameAccount
 *
 * @description AS_NSP_038 - ActualizarDescuentoFarmaciaVP: aplica un proceso validado en el Suitelet.
 *              La lógica de negocio vive en services/; este script solo coordina las etapas.
 *
 *               - getInputData: facturas con diferencia del JSON de la validación (ProcesoDescuentoService.prepararProceso).
 *               - map: una clave por factura.
 *               - reduce: CorreccionService.procesarFactura y un detalle por línea de descuento en el historial.
 *               - summarize: ProcesoDescuentoService.finalizar (totales y estado final del proceso).
 *
 *              Sin reintentos: un reduce reintentado podría volver a leer una factura a medio guardar.
 *              Sin salida al primer error: cada factura es independiente.
 *
 *              Parámetro: custscript_as_adfv_proceso (ID del registro customrecord_as_adfv_proceso).
 */
define([
    "N/runtime",
    "N/log",
    "../constants/ActualizarDescuentoFarmaciaVPConstants",
    "../repositories/ProcesoRepository",
    "../services/ProcesoDescuentoService",
    "../services/CorreccionService"
], (runtime, nLog, CONST, procesoRepo, procesoService, correccionService) => {
    const { SCRIPTS, CLASIFICACION } = CONST;

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

    /** Estado de la factura a partir de sus filas: Error > Procesada > el de la primera fila. */
    const _estadoFactura = (filas) => {
        if (filas.some((f) => f.estado === "ERROR")) return "ERROR";
        if (filas.some((f) => f.estado === "PROCESADA")) return "PROCESADA";
        return (filas[0] && filas[0].estado) || "ERROR";
    };

    const getInputData = () => {
        const procesoId = _procesoId();
        if (!procesoId) throw new Error("No se recibió el ID del proceso.");
        return procesoService.prepararProceso(procesoId);
    };

    const map = (context) => {
        const f = JSON.parse(context.value);
        context.write({ key: `FV-${f.id}`, value: context.value });
    };

    const reduce = (context) => {
        const procesoId = _procesoId();
        const f = JSON.parse(context.values[0]);

        let filas;
        try {
            filas = correccionService.procesarFactura(f);
        } catch (e) {
            nLog.error({ title: `AS_NSP_038 - Error no controlado en ${f.numero}`, details: _mensajeError(e) });
            const procesable = f.clasificacion === CLASIFICACION.POR_PROCESAR.codigo && f.seleccionada;
            const lineas = f.lineas && f.lineas.length ? f.lineas : [{}];
            filas = lineas.map((l) => ({
                ...l,
                facturaId: f.id,
                facturaNumero: f.numero,
                restanteAntes: f.restante,
                restanteEsperado: f.restanteEsperado,
                estado: procesable ? "ERROR" : "NO_PROCESABLE",
                mensaje: procesable ? `Error no controlado: ${_mensajeError(e)}` : f.motivo
            }));
        }

        filas.forEach((r) => procesoRepo.crearDetalle(procesoId, r));
        context.write({ key: _estadoFactura(filas), value: "1" });
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
            procesoService.finalizar(procesoId, { conteo, errores, erroresEtapas, errorEntrada: !!summary.inputSummary.error });
        } catch (e) {
            nLog.error({ title: "AS_NSP_038 - No se pudo cerrar el proceso", details: _mensajeError(e) });
        }
        nLog.audit({ title: "AS_NSP_038 - Fin ActualizarDescuentoFarmaciaVP", details: JSON.stringify({ procesoId, conteo, errores: errores.length, segundos: summary.seconds, usoGobernanza: summary.usage }) });
    };

    return { config, getInputData, map, reduce, summarize };
});
