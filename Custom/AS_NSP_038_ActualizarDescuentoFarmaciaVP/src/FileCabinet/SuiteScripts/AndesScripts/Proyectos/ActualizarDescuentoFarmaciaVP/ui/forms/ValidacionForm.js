/**
 * @NApiVersion 2.1
 * @NModuleScope SameAccount
 *
 * @description AS_NSP_038 - ActualizarDescuentoFarmaciaVP | Pantalla 2: Validación.
 *              Muestra la búsqueda (JSON temporal del usuario; todavía no existe el registro del proceso):
 *              cabecera, resumen y una pestaña por grupo de facturas: Por procesar (casilla Procesar, todas
 *              marcadas por defecto), No procesables y Sin diferencia.
 *              Botones: Procesar (crea el proceso y lanza el Map/Reduce) y Revalidar (vuelve a buscar con los mismos parámetros).
 */
define([
    "N/ui/serverWidget",
    "../../utils/UiUtils",
    "../../utils/FormatoUtils",
    "./FacturasSublista",
    "../../constants/ActualizarDescuentoFarmaciaVPConstants"
], (serverWidget, ui, formato, FacturasSublista, CONST) => {
    const { SCRIPTS, CAMPOS_VALIDACION: CV, ACCIONES, SUBLISTAS } = CONST;
    const { num } = formato;

    /** ISO (UTC) → 'DD/MM/YYYY HH:MI' en la hora del servidor. */
    const textoFechaHora = (iso) => {
        if (!iso) return "";
        const d = new Date(iso);
        const p = (n) => String(n).padStart(2, "0");
        return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
    };

    /** Rango de fechas de la búsqueda para mostrar. */
    const textoRango = (desde, hasta) => {
        if (!desde && !hasta) return "Todas las fechas";
        return `${desde ? formato.isoATexto(desde) : "…"} al ${hasta ? formato.isoATexto(hasta) : "…"}`;
    };

    /**
     * Construye la pantalla de Validación.
     * @param {object} datos - ProcesoDescuentoService.getDatosValidacion
     * @param {object} [mensaje] - { tipo, titulo, texto }
     * @returns {serverWidget.Form}
     */
    const construir = ({ datos, grupos, archivoId, token, urlDescarga }, mensaje = null) => {
        const form = serverWidget.createForm({ title: "Actualizar Descuento Farmacia VP: Validación" });
        form.clientScriptModulePath = SCRIPTS.CS_PATH;
        const resumen = datos.resumen;
        const config = datos.config || {};
        const hayTrabajo = grupos.porProcesar.length > 0;

        // ── Mensaje principal (NetSuite muestra uno solo) ───────────────────
        if (mensaje) ui.mensaje(form, mensaje);
        else if (!hayTrabajo) ui.mensaje(form, { tipo: "WARNING", titulo: "Nada que procesar", texto: "Ninguna factura tiene un descuento que se pueda corregir. Revise las pestañas No procesables y Sin diferencia." });
        else {
            ui.mensaje(form, {
                tipo: "CONFIRMATION",
                titulo: "Validación correcta",
                texto: `Se corregirá la cantidad del descuento en ${grupos.porProcesar.length} factura(s). Desmarque las que no desea procesar y presione Procesar.`
            });
        }

        // ── Cabecera ────────────────────────────────────────────────────────
        form.addFieldGroup({ id: "custpage_grp_cabecera", label: "Información de la búsqueda" });
        ui.inline(form, "custpage_c_subsidiaria", "Subsidiaria", datos.subsidiariaNombre, "custpage_grp_cabecera");
        ui.inline(form, "custpage_c_rango", "Fecha de facturas", textoRango(datos.desde, datos.hasta), "custpage_grp_cabecera");
        ui.html(form, "custpage_c_archivos", `<div style="padding:6px 0">${ui.boton(urlDescarga, "Validación (Excel)")}</div>`, "custpage_grp_cabecera");
        ui.inline(form, "custpage_c_usuario", "Usuario", datos.usuarioNombre, "custpage_grp_cabecera").updateBreakType({ breakType: serverWidget.FieldBreakType.STARTCOL });
        ui.inline(form, "custpage_c_buscado", "Buscado el", textoFechaHora(datos.revalidadoEl || datos.buscadoEl), "custpage_grp_cabecera");
        ui.inline(
            form,
            "custpage_c_criterios",
            "Criterios",
            `Centro de costo ${config.departamentos} · Ubicación excluida ${config.ubicacionesExcluidas || "-"} · Restante > ${config.restanteMinimo} · IVA ${config.iva}% · Tolerancia ${config.tolerancia}`,
            "custpage_grp_cabecera"
        ).updateBreakType({ breakType: serverWidget.FieldBreakType.STARTCOL });
        ui.inline(form, "custpage_c_obs", "Observación", datos.observacion, "custpage_grp_cabecera");

        // ── Resumen ─────────────────────────────────────────────────────────
        form.addFieldGroup({ id: "custpage_grp_resumen", label: "Resumen" });
        ui.html(
            form,
            "custpage_c_resumen",
            ui.tarjetas([
                ui.tarjeta("Facturas revisadas", resumen.revisadas, "abiertas con importe restante", "#888"),
                ui.tarjeta("Por procesar", grupos.porProcesar.length, `${resumen.lineasPorProcesar || 0} descuento(s) · ajuste ${num(resumen.ajustePorProcesar, 2)}`, "#2d6a2d"),
                ui.tarjeta("No procesables", grupos.noProcesables.length, "no cuadran o estructura no reconocida", "#a03028"),
                ui.tarjeta("Sin diferencia", grupos.sinDiferencia.length, "el restante no se explica por el descuento", "#6a4c93")
            ]),
            "custpage_grp_resumen"
        );

        // ── Pestañas ────────────────────────────────────────────────────────
        FacturasSublista.agregar(form, { tab: "custpage_tab_procesar", sublista: SUBLISTAS.POR_PROCESAR, titulo: "Por procesar", facturas: grupos.porProcesar, conSeleccion: true });
        FacturasSublista.agregar(form, { tab: "custpage_tab_no_procesables", sublista: SUBLISTAS.NO_PROCESABLES, titulo: "No procesables", facturas: grupos.noProcesables });
        FacturasSublista.agregar(form, { tab: "custpage_tab_sin_diferencia", sublista: SUBLISTAS.SIN_DIFERENCIA, titulo: "Sin diferencia", facturas: grupos.sinDiferencia, conCuadre: false });

        // ── Ocultos y botones ───────────────────────────────────────────────
        ui.oculto(form, CV.ARCHIVO_ID, archivoId);
        ui.oculto(form, CV.TOKEN, token);
        ui.oculto(form, CV.ACCION, ACCIONES.PROCESAR);
        if (hayTrabajo) form.addSubmitButton({ label: "Procesar" });
        form.addButton({ id: "custpage_btn_revalidar", label: "Revalidar", functionName: "revalidarBusqueda" });
        form.addButton({ id: "custpage_btn_volver", label: "Volver", functionName: "irAParametros" });
        form.addButton({ id: "custpage_btn_historial", label: "Ver historial", functionName: "irAHistorial" });
        return form;
    };

    return { construir };
});
