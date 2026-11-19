/**
 * @NApiVersion 2.1
 * @NModuleScope SameAccount
 *
 * @description AS_NSP_037 - FixArticuloOrdenVenta | Pantalla 4: Detalle.
 *              Cabecera del proceso, descargas (CSV original, validación y resultado en Excel),
 *              resumen y una pestaña por estado de línea con enlaces a la OV y a sus Ejecuciones.
 */
define([
    "N/ui/serverWidget",
    "../../utils/UiUtils",
    "../../utils/FormatoUtils",
    "./LineasSublista",
    "../../constants/FixArticuloOrdenVentaConstants"
], (serverWidget, ui, formato, LineasSublista, CONST) => {
    const { SCRIPTS, ESTADO_LINEA } = CONST;
    const { esc } = formato;

    /** Pestañas en el orden en que se muestran. */
    const PESTANAS = [
        ["PROCESADA", "Procesadas"],
        ["ERROR", "Con error"],
        ["OMITIDA", "Omitidas"],
        ["NO_PROCESABLE", "No procesables"],
        ["SIN_CAMBIO", "Sin cambio"]
    ];

    /** Mensaje principal según el estado del proceso. */
    const mensajeEstado = (proceso, enCurso, estadoTarea) => {
        if (enCurso) return { tipo: "INFORMATION", titulo: "En proceso", texto: `El proceso se está ejecutando${estadoTarea ? ` (${estadoTarea})` : ""}. Presione Actualizar para ver el avance.` };
        if (proceso.estado === "ERROR") return { tipo: "ERROR", titulo: "Proceso con error", texto: "El proceso no pudo completarse. Revise los errores del proceso." };
        if (proceso.estado === "COMPLETADO_ERRORES") return { tipo: "WARNING", titulo: "Completado con errores", texto: `${proceso.totalErrores} línea(s) con error. Revise la pestaña Con error.` };
        if (proceso.estado === "COMPLETADO") return { tipo: "CONFIRMATION", titulo: "Proceso completado", texto: `${proceso.totalProcesadas} línea(s) procesada(s).` };
        return null;
    };

    /**
     * Construye el Detalle.
     * @param {object} datos - ProcesoFixService.getDatosDetalle
     * @param {object} [mensaje]
     * @returns {serverWidget.Form}
     */
    const construir = ({ proceso, grupos, enCurso, estadoTarea, urlOrigen, urlDescargaValidacion, urlDescargaResultado }, mensaje = null) => {
        const form = serverWidget.createForm({ title: `Ajuste de Artículos en OV: Detalle ${proceso.nombre}` });
        form.clientScriptModulePath = SCRIPTS.CS_PATH;
        ui.mensaje(form, mensaje || mensajeEstado(proceso, enCurso, estadoTarea));

        // ── Cabecera ────────────────────────────────────────────────────────
        form.addFieldGroup({ id: "custpage_grp_cabecera", label: "Información del proceso" });
        ui.inline(form, "custpage_d_subsidiaria", "Subsidiaria", proceso.subsidiariaNombre, "custpage_grp_cabecera");
        ui.inline(form, "custpage_d_usuario", "Usuario", proceso.usuario, "custpage_grp_cabecera");
        ui.html(
            form,
            "custpage_d_archivos",
            `<div style="padding:6px 0">${ui.boton(urlOrigen, "CSV original")}${ui.boton(urlDescargaValidacion, "Validación (Excel)")}${ui.boton(urlDescargaResultado, "Resultado (Excel)")}</div>`,
            "custpage_grp_cabecera"
        );
        ui.inline(form, "custpage_d_estado", "Estado", proceso.estadoTexto, "custpage_grp_cabecera").updateBreakType({ breakType: serverWidget.FieldBreakType.STARTCOL });
        ui.inline(form, "custpage_d_creado", "Validado el", proceso.creado, "custpage_grp_cabecera");
        ui.inline(form, "custpage_d_inicio", "Inicio", proceso.fechaInicio, "custpage_grp_cabecera").updateBreakType({ breakType: serverWidget.FieldBreakType.STARTCOL });
        ui.inline(form, "custpage_d_fin", "Fin", proceso.fechaFin, "custpage_grp_cabecera");
        ui.inline(form, "custpage_d_obs", "Observación", proceso.observacion, "custpage_grp_cabecera").updateBreakType({ breakType: serverWidget.FieldBreakType.STARTCOL });

        // ── Resumen ─────────────────────────────────────────────────────────
        form.addFieldGroup({ id: "custpage_grp_resumen", label: "Resumen" });
        ui.html(
            form,
            "custpage_d_resumen",
            ui.tarjetas([
                ui.tarjeta("Líneas", proceso.totalLineas, "del archivo", "#888"),
                ui.tarjeta("A procesar", proceso.totalProcesar, "incluye reemplazos confirmados", "#1565c0"),
                ui.tarjeta("Procesadas", proceso.totalProcesadas, "OV y Ejecuciones ajustadas", "#2d6a2d"),
                ui.tarjeta("Omitidas / sin cambio", proceso.totalOmitidas, "incluye no procesables", "#6a4c93"),
                ui.tarjeta("Con error", proceso.totalErrores, proceso.totalErrores ? "ver pestaña Con error" : "sin errores", "#a03028")
            ]) + (proceso.error ? `<div style="padding:6px 0;color:#a03028;font-size:12px"><b>Errores del proceso:</b><br>${esc(proceso.error).replace(/\n/g, "<br>")}</div>` : ""),
            "custpage_grp_resumen"
        );

        // ── Pestañas por estado ─────────────────────────────────────────────
        PESTANAS.forEach(([clave, titulo]) =>
            LineasSublista.agregar(form, {
                tab: `custpage_tab_${clave.toLowerCase()}`,
                sublista: `custpage_sl_${clave.toLowerCase()}`,
                titulo: titulo || ESTADO_LINEA[clave].texto,
                lineas: grupos[clave] || [],
                conResultado: true
            })
        );

        // ── Botones ─────────────────────────────────────────────────────────
        if (enCurso) form.addButton({ id: "custpage_btn_actualizar", label: "Actualizar", functionName: "actualizarPagina" });
        form.addButton({ id: "custpage_btn_historial", label: "Ver historial", functionName: "irAHistorial" });
        form.addButton({ id: "custpage_btn_nueva", label: "Nueva carga", functionName: "irACarga" });
        return form;
    };

    return { construir };
});
