/**
 * @NApiVersion 2.1
 * @NScriptType MapReduceScript
 * @NModuleScope SameAccount
 *
 * @description AS_NSP_038 - CuadreFacturaJson: cuadra facturas de venta de Farmacia Venta Público contra el JSON
 *              de la integración y lo pagado por el cliente. Todo el resultado queda en el log de ejecución.
 *
 *               - getInputData: lee el CSV del File Cabinet (columnas ID interno, Factura, Json).
 *               - map: una clave por factura (si el CSV la repite, se procesa una vez).
 *               - reduce: CuadreFacturaJsonService.cuadrar, un log AUDIT por factura con sus cambios y, si está
 *                 activada la trazabilidad, un registro de detalle por cambio (customrecord_as_adfv_cuadre_det).
 *               - summarize: resumen por resultado y errores de etapa; cierra el registro de la ejecución
 *                 (customrecord_as_adfv_cuadre_ejec) con sus totales.
 *
 *              Parámetros (deployment):
 *                custscript_as_adfv_cuadre_archivo      ID interno del CSV (obligatorio)
 *                custscript_as_adfv_cuadre_simulacion   T = calcula y deja log sin guardar (por defecto T)
 *                custscript_as_adfv_cuadre_limite       máximo de facturas (0 o vacío = todas)
 *                custscript_as_adfv_cuadre_art_redondeo ID interno del artículo de redondeo (casuística C)
 *                custscript_as_adfv_cuadre_imp_redondeo ID del código de impuesto de la línea de redondeo (opcional)
 *                custscript_as_adfv_cuadre_tope_iva     ajuste máximo de impuesto por línea (por defecto 100)
 *                custscript_as_adfv_cuadre_rango_red    diferencia máxima de redondeo de efectivo (por defecto 5)
 *                custscript_as_adfv_cuadre_registrar    T = crea los registros de trazabilidad (ejecución y detalle)
 *
 *              Sin reintentos: una factura reintentada podría quedar a medio corregir.
 */
define([
    "N/runtime",
    "N/file",
    "N/log",
    "../constants/CuadreFacturaJsonConstants",
    "../utils/CsvUtils",
    "../services/CuadreFacturaJsonService",
    "../repositories/CuadreTrazaRepository"
], (runtime, file, nLog, CONST, csv, cuadreService, trazaRepo) => {
    const { SCRIPT, DEFECTO, COLUMNAS_CSV, REGLAS, RESULTADO } = CONST;
    const P = SCRIPT.PARAMS;

    const config = { retryCount: 0, exitOnError: false };

    const _numero = (v, defecto) => (v !== null && v !== undefined && v !== "" && Number.isFinite(Number(v)) ? Number(v) : defecto);
    const _texto = (v) => {
        const s = typeof v === "string" ? v : JSON.stringify(v);
        return s.length > REGLAS.LIMITE_LOG ? `${s.substring(0, REGLAS.LIMITE_LOG - 15)}...[truncado]` : s;
    };

    /** Parámetros del deployment. */
    const _cfg = () => {
        const s = runtime.getCurrentScript();
        const p = (name) => s.getParameter({ name });
        const simulacion = p(P.SIMULACION);
        const registrar = p(P.REGISTRAR);
        return {
            registrar: registrar === true || registrar === "T",
            archivo: _numero(p(P.ARCHIVO), null),
            simulacion: simulacion === true || simulacion === "T",
            limite: _numero(p(P.LIMITE), 0),
            articuloRedondeo: _numero(p(P.ARTICULO_REDONDEO), null),
            impuestoRedondeo: _numero(p(P.IMPUESTO_REDONDEO), null),
            topeAjusteIva: _numero(p(P.TOPE_AJUSTE_IVA), DEFECTO.TOPE_AJUSTE_IVA),
            rangoRedondeo: _numero(p(P.RANGO_REDONDEO), DEFECTO.RANGO_REDONDEO)
        };
    };

    const _mensaje = (error) => {
        try {
            return JSON.parse(error).message || error;
        } catch (e) {
            return error;
        }
    };

    const getInputData = () => {
        const cfg = _cfg();
        if (!cfg.archivo) throw new Error("Falta el parámetro Archivo CSV (ID interno del archivo en el File Cabinet).");
        const { registros, faltantes } = csv.leerRegistros(file.load({ id: cfg.archivo }).getContents(), COLUMNAS_CSV);
        if (faltantes.includes("ID") || faltantes.includes("JSON")) throw new Error(`El CSV no tiene las columnas obligatorias: ${faltantes.join(", ")}.`);

        const validos = registros.filter((r) => /^\d+$/.test(r.ID) && r.JSON);
        const descartados = registros.length - validos.length;
        const entrada = cfg.limite > 0 ? validos.slice(0, cfg.limite) : validos;
        const ejecucion = cfg.registrar ? trazaRepo.crearEjecucion({ cfg, filas: registros.length, aProcesar: entrada.length }) : null;
        nLog.audit({
            title: `AS_NSP_038 Cuadre | Inicio${cfg.simulacion ? " (SIMULACIÓN)" : ""}`,
            details: _texto({ ejecucion, archivo: cfg.archivo, filas: registros.length, descartadas: descartados, aProcesar: entrada.length, ...cfg })
        });
        return entrada.map((r) => ({ id: r.ID, factura: r.FACTURA, json: r.JSON, fila: r.fila, ejecucion }));
    };

    const map = (context) => {
        const r = JSON.parse(context.value);
        context.write({ key: String(r.id), value: context.value });
    };

    const reduce = (context) => {
        const entrada = JSON.parse(context.values[0]);
        const cfg = _cfg();
        const r = cuadreService.cuadrar(entrada, cfg);
        const detalle = _texto({ id: r.id, fila: entrada.fila, mensaje: r.mensaje, antes: r.antes, despues: r.despues, cambios: r.cambios });
        const titulo = `AS_NSP_038 Cuadre | ${r.factura || r.id} | ${r.resultado}`;
        if (r.resultado === RESULTADO.ERROR) nLog.error({ title: titulo, details: detalle });
        else nLog.audit({ title: titulo, details: detalle });
        if (cfg.registrar && entrada.ejecucion) trazaRepo.crearDetalles(entrada.ejecucion, r, cfg.simulacion);
        context.write({ key: r.resultado, value: JSON.stringify({ factura: r.factura || String(r.id), ejecucion: entrada.ejecucion || null }) });
    };

    const summarize = (summary) => {
        const cfg = _cfg();
        const conteo = {};
        const porResultado = {};
        let ejecucion = null;
        summary.output.iterator().each((resultado, valor) => {
            const v = JSON.parse(valor);
            const factura = v.factura;
            ejecucion = ejecucion || v.ejecucion;
            conteo[resultado] = (conteo[resultado] || 0) + 1;
            if (resultado !== RESULTADO.CORREGIDA && resultado !== RESULTADO.SIMULADA && resultado !== RESULTADO.SIN_CAMBIO) {
                (porResultado[resultado] = porResultado[resultado] || []).push(factura);
            }
            return true;
        });
        const errores = [];
        if (summary.inputSummary.error) errores.push(`Entrada: ${_mensaje(summary.inputSummary.error)}`);
        summary.mapSummary.errors.iterator().each((k, e) => {
            errores.push(`map ${k}: ${_mensaje(e)}`);
            return true;
        });
        summary.reduceSummary.errors.iterator().each((k, e) => {
            errores.push(`reduce ${k}: ${_mensaje(e)}`);
            return true;
        });
        nLog.audit({ title: `AS_NSP_038 Cuadre | Resumen${cfg.simulacion ? " (SIMULACIÓN)" : ""}`, details: _texto({ ejecucion, conteo, segundos: summary.seconds, usoGobernanza: summary.usage }) });
        Object.keys(porResultado).forEach((k) => nLog.audit({ title: `AS_NSP_038 Cuadre | Facturas ${k}`, details: _texto(porResultado[k].join(", ")) }));
        if (errores.length) nLog.error({ title: "AS_NSP_038 Cuadre | Errores de etapa", details: _texto(errores.join("\n")) });

        // Trazabilidad: cierra la ejecución (si ninguna factura llegó al reduce, se busca por archivo)
        if (cfg.registrar) {
            const id = ejecucion || (cfg.archivo ? trazaRepo.buscarEjecucionEnProceso(cfg.archivo) : null);
            if (id) trazaRepo.finalizarEjecucion(id, { conteo, errores, errorEntrada: !!summary.inputSummary.error });
        }
    };

    return { config, getInputData, map, reduce, summarize };
});
