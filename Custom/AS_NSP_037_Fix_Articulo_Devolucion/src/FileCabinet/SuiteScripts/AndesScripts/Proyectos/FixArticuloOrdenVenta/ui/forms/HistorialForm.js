/**
 * @NApiVersion 2.1
 * @NModuleScope SameAccount
 *
 * @description AS_NSP_037 - FixArticuloOrdenVenta | Pantalla 3: Historial.
 *              Filtros por estado, subsidiaria y fecha. Los procesos Validados abren la
 *              Validación; los demás, el Detalle.
 */
define(["N/ui/serverWidget", "../../utils/UiUtils", "../../utils/FormatoUtils", "../../constants/FixArticuloOrdenVentaConstants"], (serverWidget, ui, formato, CONST) => {
    const { SCRIPTS, FILTROS_HISTORIAL: F, SUBLISTAS } = CONST;
    const { esc } = formato;

    /**
     * Construye el Historial.
     * @param {object} o
     * @param {object[]} o.procesos - ProcesoFixService.getHistorial
     * @param {{valor: string, texto: string}[]} o.estados - opciones del filtro de estado
     * @param {object} o.filtros - { estado, subsidiaria, desde, hasta }
     * @param {object} [o.mensaje]
     * @returns {serverWidget.Form}
     */
    const construir = ({ procesos, estados, filtros, mensaje }) => {
        const form = serverWidget.createForm({ title: "Ajuste de Artículos en OV: Historial" });
        form.clientScriptModulePath = SCRIPTS.CS_PATH;
        ui.mensaje(form, mensaje);

        // ── Filtros ─────────────────────────────────────────────────────────
        form.addFieldGroup({ id: "custpage_grp_filtros", label: "Filtros" });
        const fEstado = form.addField({ id: F.ESTADO, type: serverWidget.FieldType.SELECT, label: "Estado", container: "custpage_grp_filtros" });
        fEstado.addSelectOption({ value: "", text: "- Todos -" });
        estados.forEach((e) => fEstado.addSelectOption({ value: e.valor, text: e.texto }));
        fEstado.defaultValue = filtros.estado || "";

        const fSubsidiaria = form.addField({ id: F.SUBSIDIARIA, type: serverWidget.FieldType.SELECT, label: "Subsidiaria", source: "subsidiary", container: "custpage_grp_filtros" });
        if (filtros.subsidiaria) fSubsidiaria.defaultValue = filtros.subsidiaria;
        fSubsidiaria.updateBreakType({ breakType: serverWidget.FieldBreakType.STARTCOL });

        const fDesde = form.addField({ id: F.DESDE, type: serverWidget.FieldType.DATE, label: "Validado desde", container: "custpage_grp_filtros" });
        if (filtros.desde) fDesde.defaultValue = filtros.desde;
        fDesde.updateBreakType({ breakType: serverWidget.FieldBreakType.STARTCOL });
        const fHasta = form.addField({ id: F.HASTA, type: serverWidget.FieldType.DATE, label: "Validado hasta", container: "custpage_grp_filtros" });
        if (filtros.hasta) fHasta.defaultValue = filtros.hasta;

        // ── Procesos ────────────────────────────────────────────────────────
        const sl = form.addSublist({ id: SUBLISTAS.HISTORIAL, type: serverWidget.SublistType.LIST, label: `Procesos (${procesos.length})` });
        ui.columnas(sl, [
            ["custpage_h_nombre", "Proceso"],
            ["custpage_h_subsidiaria", "Subsidiaria"],
            ["custpage_h_estado", "Estado"],
            ["custpage_h_lineas", "Líneas"],
            ["custpage_h_procesar", "A procesar"],
            ["custpage_h_procesadas", "Procesadas"],
            ["custpage_h_omitidas", "Omitidas / sin cambio"],
            ["custpage_h_errores", "Errores"],
            ["custpage_h_usuario", "Usuario"],
            ["custpage_h_creado", "Validado el"],
            ["custpage_h_fin", "Procesado el"],
            ["custpage_h_obs", "Observación"]
        ]);
        procesos.forEach((p, i) =>
            ui.fila(sl, i, {
                custpage_h_nombre: `<a href="${esc(p.url)}" target="_blank">${esc(p.nombre)}</a>`,
                custpage_h_subsidiaria: esc(p.subsidiaria),
                custpage_h_estado: esc(p.estadotexto),
                custpage_h_lineas: p.totallineas,
                custpage_h_procesar: p.totalprocesar,
                custpage_h_procesadas: p.totalprocesadas,
                custpage_h_omitidas: p.totalomitidas,
                custpage_h_errores: p.totalerrores,
                custpage_h_usuario: esc(p.usuario),
                custpage_h_creado: p.creado,
                custpage_h_fin: p.fechafin,
                custpage_h_obs: esc(p.observacion)
            })
        );

        form.addButton({ id: "custpage_btn_nueva", label: "Nueva carga", functionName: "irACarga" });
        form.addButton({ id: "custpage_btn_actualizar", label: "Actualizar", functionName: "actualizarPagina" });
        return form;
    };

    return { construir };
});
