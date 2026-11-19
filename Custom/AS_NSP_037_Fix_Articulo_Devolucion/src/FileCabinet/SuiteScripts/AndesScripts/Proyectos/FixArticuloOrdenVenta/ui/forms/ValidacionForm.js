/**
 * @NApiVersion 2.1
 * @NModuleScope SameAccount
 *
 * @description AS_NSP_037 - FixArticuloOrdenVenta | Pantalla 2: Validación.
 *              Cabecera del proceso, resumen y una pestaña por grupo de líneas:
 *              Por procesar, Reemplazos por confirmar (check Reemplazar), Sin cambio y No procesables.
 *              Botones: Procesar, Revalidar (vuelve a validar el CSV cargado) y Anular (solo en estado Validado).
 *              Un proceso Anulado se muestra en solo lectura.
 */
define([
    "N/ui/serverWidget",
    "../../utils/UiUtils",
    "./LineasSublista",
    "../../constants/FixArticuloOrdenVentaConstants"
], (serverWidget, ui, LineasSublista, CONST) => {
    const { SCRIPTS, CAMPOS_VALIDACION: CV, ACCIONES, SUBLISTAS, ACCIONES_LINEA } = CONST;

    /** Detalle por acción para la tarjeta "Por procesar". */
    const detalleAcciones = (resumen) =>
        [ACCIONES_LINEA.ELIMINAR, ACCIONES_LINEA.REDUCIR, ACCIONES_LINEA.AUMENTAR, ACCIONES_LINEA.ACTUALIZAR_PRECIO]
            .map((a) => ((resumen.porAccion || {})[a.codigo] ? `${resumen.porAccion[a.codigo]} ${a.texto.toLowerCase()}` : ""))
            .filter(Boolean)
            .join(" · ");

    /**
     * Construye la pantalla de Validación.
     * @param {object} datos - ProcesoFixService.getDatosValidacion
     * @param {object} [mensaje] - { tipo, titulo, texto }
     * @returns {serverWidget.Form}
     */
    const construir = ({ proceso, datos, grupos, esValidado, esAnulado, urlOrigen, urlDescarga }, mensaje = null) => {
        const form = serverWidget.createForm({ title: `Ajuste de Artículos en OV: Validación ${proceso.nombre}` });
        form.clientScriptModulePath = SCRIPTS.CS_PATH;
        const resumen = datos.resumen;
        const hayTrabajo = grupos.porProcesar.length > 0 || grupos.reemplazos.length > 0;

        // ── Mensaje principal (NetSuite muestra uno solo) ───────────────────
        if (mensaje) ui.mensaje(form, mensaje);
        else if (esAnulado) ui.mensaje(form, { tipo: "WARNING", titulo: "Proceso anulado", texto: "Este proceso fue anulado y no se puede procesar. Vea la nota en la observación." });
        else if (!esValidado) ui.mensaje(form, { tipo: "INFORMATION", titulo: `Estado: ${proceso.estadoTexto}`, texto: "Este proceso ya fue enviado. Vea su avance en el Detalle." });
        else if (!hayTrabajo) ui.mensaje(form, { tipo: "WARNING", titulo: "Nada que procesar", texto: "Ninguna línea del archivo requiere cambios. Revise las pestañas Sin cambio y No procesables." });
        else {
            const confirmar = grupos.reemplazos.length ? ` Hay ${grupos.reemplazos.length} reemplazo(s) de artículo: márquelos en su pestaña para aplicarlos.` : "";
            ui.mensaje(form, {
                tipo: "CONFIRMATION",
                titulo: "Validación correcta",
                texto: `Se modificarán ${grupos.porProcesar.length} línea(s) de OV.${confirmar} Revise el detalle y presione Procesar.`
            });
        }

        // ── Cabecera ────────────────────────────────────────────────────────
        form.addFieldGroup({ id: "custpage_grp_cabecera", label: "Información del proceso" });
        ui.inline(form, "custpage_v_subsidiaria", "Subsidiaria", datos.subsidiariaNombre || proceso.subsidiariaNombre, "custpage_grp_cabecera");
        ui.inline(form, "custpage_v_archivo", "Archivo", datos.nombreArchivo, "custpage_grp_cabecera");
        ui.html(form, "custpage_v_archivos", `<div style="padding:6px 0">${ui.boton(urlOrigen, "CSV original")}${ui.boton(urlDescarga, "Validación (Excel)")}</div>`, "custpage_grp_cabecera");
        ui.inline(form, "custpage_v_estado", "Estado", proceso.estadoTexto, "custpage_grp_cabecera").updateBreakType({ breakType: serverWidget.FieldBreakType.STARTCOL });
        ui.inline(form, "custpage_v_usuario", "Usuario", proceso.usuario, "custpage_grp_cabecera");
        ui.inline(form, "custpage_v_creado", "Validado el", proceso.creado, "custpage_grp_cabecera");
        if (datos.revalidadoEl) ui.inline(form, "custpage_v_revalidado", "Revalidado el", datos.revalidadoEl.substring(0, 16).replace("T", " "), "custpage_grp_cabecera");
        ui.inline(form, "custpage_v_obs", "Observación", proceso.observacion, "custpage_grp_cabecera").updateBreakType({ breakType: serverWidget.FieldBreakType.STARTCOL });

        // ── Resumen ─────────────────────────────────────────────────────────
        form.addFieldGroup({ id: "custpage_grp_resumen", label: "Resumen" });
        ui.html(
            form,
            "custpage_v_resumen",
            ui.tarjetas([
                ui.tarjeta("Líneas", resumen.lineas, "filas del archivo (duplicados idénticos unificados)", "#888"),
                ui.tarjeta("Por procesar", grupos.porProcesar.length, detalleAcciones(resumen) || "sin cambios", "#2d6a2d"),
                ui.tarjeta("Reemplazos", grupos.reemplazos.length, "requieren confirmación", "#1565c0"),
                ui.tarjeta("Sin cambio", grupos.sinCambio.length, "la OV ya tiene la cantidad final", "#6a4c93"),
                ui.tarjeta("No procesables", grupos.noProcesables.length, "ver motivo en su pestaña", "#a03028")
            ]),
            "custpage_grp_resumen"
        );

        // ── Pestañas ────────────────────────────────────────────────────────
        LineasSublista.agregar(form, { tab: "custpage_tab_procesar", sublista: SUBLISTAS.POR_PROCESAR, titulo: "Por procesar", lineas: grupos.porProcesar, conAjuste: true });
        LineasSublista.agregar(form, {
            tab: "custpage_tab_reemplazos",
            sublista: SUBLISTAS.REEMPLAZOS,
            titulo: "Reemplazos por confirmar",
            lineas: grupos.reemplazos,
            conReemplazo: esValidado,
            conAjuste: true
        });
        LineasSublista.agregar(form, { tab: "custpage_tab_sin_cambio", sublista: SUBLISTAS.SIN_CAMBIO, titulo: "Sin cambio", lineas: grupos.sinCambio });
        LineasSublista.agregar(form, { tab: "custpage_tab_no_procesables", sublista: SUBLISTAS.NO_PROCESABLES, titulo: "No procesables", lineas: grupos.noProcesables });

        // ── Ocultos y botones ───────────────────────────────────────────────
        ui.oculto(form, CV.PROCESO_ID, proceso.id);
        ui.oculto(form, CV.ACCION, ACCIONES.PROCESAR);
        if (esValidado && hayTrabajo) form.addSubmitButton({ label: "Procesar" });
        if (esValidado) {
            form.addButton({ id: "custpage_btn_revalidar", label: "Revalidar", functionName: "revalidarArchivo" });
            form.addButton({ id: "custpage_btn_anular", label: "Anular", functionName: "anularProceso" });
        }
        form.addButton({ id: "custpage_btn_volver", label: "Volver", functionName: "irACarga" });
        form.addButton({ id: "custpage_btn_historial", label: "Ver historial", functionName: "irAHistorial" });
        return form;
    };

    return { construir };
});
