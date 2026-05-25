/**
 * @NApiVersion 2.1
 * @NScriptType MapReduceScript
 * @description Script Map/Reduce para reenvío masivo de eventos de creación de productos a Andes Salud
 */
define(["../domain/2win_dom_producto", "../lib/2win_lib_auditoria", "N/runtime", "N/log", "N/record", "N/search"], function (domProducto, libAuditoria, runtime, nLog, record, search) {
    // ─── Constantes ────────────────────────────────────────────────────────────

    const SCRIPT_ID = "2win_mr_andes_salud_reenvio_producto";
    const NOMBRE_PROCESO = "Interfaces Andes Salud - Reenvío Masivo Productos";
    const PARAM_FECHA_DESDE = "custscript_mr_as_reenvio_producto_desde";

    const FILTROS_ITEM = [["type", "anyof", "InvtPart"], "AND", ["isinactive", "is", "F"]];

    // ─── getInputData ──────────────────────────────────────────────────────────

    /**
     * Obtiene los IDs de los productos activos que deben ser reenviados.
     * @returns {string[]} Array de IDs como strings.
     */
    function getInputData() {
        try {
            nLog.audit("getInputData · inicio", "Buscando productos para reenvío masivo");

            // const fechaDesde = runtime.getCurrentScript().getParameter({ name: PARAM_FECHA_DESDE });

            const filters = [...FILTROS_ITEM];
            // if (fechaDesde) {
            //filters.push("AND", ["created", "onorafter", "14/04/2026"]);
          filters.push("AND", ["internalid", "anyof", [12855,
                                                      12856,
                                                      12857,
                                                      12858,
                                                      12859,
                                                      12860,
                                                      12861,
                                                      12862,
                                                      12863,
                                                      12872,
                                                      12873,
                                                      15081]]);
            // }

            const itemSearch = search.create({
                type: search.Type.INVENTORY_ITEM,
                filters: filters,
                columns: ["internalid"]
            });

            const ids = [];
            const pagedData = itemSearch.runPaged({ pageSize: 1000 });

            pagedData.pageRanges.forEach(function (pageRange) {
                pagedData.fetch({ index: pageRange.index }).data.forEach(function (result) {
                    ids.push(result.getValue("internalid"));
                });
            });

            nLog.audit("getInputData · resultados", {
                totalParaReenviar: ids.length,
                fechaFiltro: "04/01/2026"
            });

            return ids; // Map/Reduce maneja el caso de array vacío
        } catch (error) {
            nLog.error("getInputData · error", error);
            return [];
        }
    }

    // ─── map ───────────────────────────────────────────────────────────────────

    /**
     * Procesa cada producto disparando el evento de creación.
     * @param {Object} context
     */
    function map(context) {
        const itemId = context.value;
        const payload = { itemId, exitoso: false, error: null };

        try {
            nLog.debug(`map · procesando item ${itemId}`, "Cargando registro");

            const itemRecord = record.load({
                type: record.Type.INVENTORY_ITEM,
                id: itemId,
                isDynamic: false
            });

            payload.respuesta = domProducto.eventoCreacionRegistro(itemRecord);
            payload.exitoso = true;

            nLog.audit(`map · item ${itemId}`, "Procesado exitosamente");
        } catch (error) {
            payload.error = error.message;
            nLog.error(`map · error en item ${itemId}`, error);
        }

        context.write({ key: itemId, value: JSON.stringify(payload) });
    }

    // ─── summarize ─────────────────────────────────────────────────────────────

    /**
     * Consolida resultados y registra auditoría.
     * @param {Object} summary
     */
    function summarize(summary) {
        const proceso = {
            nombreProceso: NOMBRE_PROCESO,
            scriptId: runtime.getCurrentScript().id || SCRIPT_ID,
            etapa: "summarize",
            estado: "000",
            tokenProceso: libAuditoria.obtenerToken(),
            descripcionResultado: ""
        };

        try {
            nLog.audit("summarize · inicio", "Consolidando resultados");

            // Contabilizar errores de la etapa Map (iterator correcto)
            let mapErrors = 0;
            if (summary.mapSummary && summary.mapSummary.errors) {
                summary.mapSummary.errors.iterator().each(function (key, error) {
                    mapErrors++;
                    nLog.error(`summarize · error map key ${key}`, error);
                    return true;
                });
            }

            // Consolidar resultados escritos por map()
            const stats = { total: 0, exitosos: 0, fallidos: 0, errores: [] };

            summary.output.iterator().each(function (key, value) {
                try {
                    const resultado = JSON.parse(value);
                    stats.total++;
                    if (resultado.exitoso) {
                        stats.exitosos++;
                    } else {
                        stats.fallidos++;
                        stats.errores.push({ itemId: resultado.itemId, error: resultado.error });
                    }
                } catch (parseError) {
                    stats.fallidos++;
                    nLog.error("summarize · error parseando resultado", parseError);
                }
                return true;
            });

            proceso.descripcionResultado = [
                `Total procesados : ${stats.total}`,
                `Exitosos          : ${stats.exitosos}`,
                `Fallidos          : ${stats.fallidos}`,
                `Errores de Map    : ${mapErrors}`
            ].join("\n");

            nLog.audit("summarize · estadísticas", proceso.descripcionResultado);

            if (stats.errores.length > 0) {
                nLog.error("summarize · detalle de errores", JSON.stringify(stats.errores));
            }

            // Métricas de governance
            nLog.audit("summarize · governance", {
                concurrency: summary.concurrency || "N/A",
                yields: summary.yields || "N/A"
            });
        } catch (error) {
            proceso.estado = "001";
            proceso.descripcionResultado = error.message;
            nLog.error("summarize · error fatal", error);
        } finally {
            libAuditoria.crearReporteAuditoria(proceso);
        }
    }

    // ─── Entry points ──────────────────────────────────────────────────────────

    return { getInputData, map, summarize };
});
