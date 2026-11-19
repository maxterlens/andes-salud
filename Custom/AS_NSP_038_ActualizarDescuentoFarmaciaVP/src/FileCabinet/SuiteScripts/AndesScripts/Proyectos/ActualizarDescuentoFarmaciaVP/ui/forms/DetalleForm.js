/**
 * @NApiVersion 2.1
 * @NModuleScope SameAccount
 *
 * @description AS_NSP_038 - ActualizarDescuentoFarmaciaVP | Pantalla 4: Detalle de la ejecución.
 *              Cabecera del proceso, descargas (validación y resultado en Excel), resumen y una pestaña
 *              por estado con una fila por línea de descuento: cantidades e importes antes y después,
 *              importe restante antes, esperado y después, y el mensaje del resultado.
 */
define(["N/ui/serverWidget", "../../utils/UiUtils", "../../utils/FormatoUtils", "../../constants/ActualizarDescuentoFarmaciaVPConstants"], (serverWidget, ui, formato, CONST) => {
    const { SCRIPTS, ESTADO_LINEA } = CONST;
    const { esc, num } = formato;

    /** Pestañas en el orden en que se muestran. */
    const PESTANAS = [
        ["PROCESADA", "Procesadas"],
        ["ERROR", "Con error"],
        ["SIN_CAMBIO", "Sin cambio"],
        ["OMITIDA", "Omitidas"],
        ["NO_PROCESABLE", "No procesables"]
    ];

    /** Mensaje principal según el estado del proceso. */
    const mensajeEstado = (proceso, enCurso, estadoTarea) => {
        if (enCurso) return { tipo: "INFORMATION", titulo: "En proceso", texto: `El proceso se está ejecutando${estadoTarea ? ` (${estadoTarea})` : ""}. Presione Actualizar para ver el avance.` };
        if (proceso.estado === "ERROR") return { tipo: "ERROR", titulo: "Proceso con error", texto: "El proceso no pudo completarse. Revise los errores del proceso." };
        if (proceso.estado === "COMPLETADO_ERRORES") return { tipo: "WARNING", titulo: "Completado con errores", texto: `${proceso.totalErrores} factura(s) con error. Revise la pestaña Con error.` };
        if (proceso.estado === "COMPLETADO") return { tipo: "CONFIRMATION", titulo: "Proceso completado", texto: `${proceso.totalProcesadas} factura(s) corregida(s).` };
        return null;
    };

    /** Pestaña con las líneas de un estado. */
    const agregarPestana = (form, clave, titulo, filas) => {
        const etiqueta = `${titulo || ESTADO_LINEA[clave].texto} (${filas.length})`;
        const tab = `custpage_tab_${clave.toLowerCase()}`;
        form.addSubtab({ id: tab, label: etiqueta });
        const sl = form.addSublist({ id: `custpage_sl_${clave.toLowerCase()}`, type: serverWidget.SublistType.LIST, label: etiqueta, tab });
        ui.columnas(sl, [
            ["custpage_d_factura", "Factura"],
            ["custpage_d_articulo", "Artículo"],
            ["custpage_d_cant_art", "Cant. artículo"],
            ["custpage_d_descuento", "Descuento"],
            ["custpage_d_cant_ant", "Cant. desc. antes"],
            ["custpage_d_cant_des", "Cant. desc. después"],
            ["custpage_d_tarifa", "Tarifa desc."],
            ["custpage_d_imp_ant", "Importe desc. antes"],
            ["custpage_d_imp_des", "Importe desc. después"],
            ["custpage_d_rest_ant", "Restante antes"],
            ["custpage_d_rest_esp", "Restante esperado"],
            ["custpage_d_rest_des", "Restante después"],
            ["custpage_d_mensaje", "Mensaje", serverWidget.FieldType.TEXTAREA]
        ]);
        filas.forEach((d, i) =>
            ui.fila(sl, i, {
                custpage_d_factura: ui.enlace("invoice", d.facturaid, d.factura),
                custpage_d_articulo: esc(d.articulo ? `${d.articulo}${d.lineaarticulo ? ` (línea ${d.lineaarticulo})` : ""}` : ""),
                custpage_d_cant_art: num(d.cantarticulo),
                custpage_d_descuento: esc(d.descuento ? `${d.descuento}${d.lineadescuento ? ` (línea ${d.lineadescuento})` : ""}` : ""),
                custpage_d_cant_ant: num(d.cantdescantes),
                custpage_d_cant_des: num(d.cantdescdespues),
                custpage_d_tarifa: num(d.tarifadesc, 2),
                custpage_d_imp_ant: num(d.impdescantes, 2),
                custpage_d_imp_des: num(d.impdescdespues, 2),
                custpage_d_rest_ant: num(d.restanteantes, 2),
                custpage_d_rest_esp: num(d.restanteesperado, 2),
                custpage_d_rest_des: num(d.restantedespues, 2),
                custpage_d_mensaje: esc(d.mensaje)
            })
        );
    };

    /**
     * Construye el Detalle.
     * @param {object} datos - ProcesoDescuentoService.getDatosDetalle
     * @param {object} [mensaje]
     * @returns {serverWidget.Form}
     */
    const construir = ({ proceso, grupos, enCurso, estadoTarea, urlDescargaValidacion, urlDescargaResultado }, mensaje = null) => {
        const form = serverWidget.createForm({ title: `Actualizar Descuento Farmacia VP: Detalle ${proceso.nombre}` });
        form.clientScriptModulePath = SCRIPTS.CS_PATH;
        ui.mensaje(form, mensaje || mensajeEstado(proceso, enCurso, estadoTarea));

        // ── Cabecera ────────────────────────────────────────────────────────
        form.addFieldGroup({ id: "custpage_grp_cabecera", label: "Información del proceso" });
        ui.inline(form, "custpage_e_subsidiaria", "Subsidiaria", proceso.subsidiariaNombre, "custpage_grp_cabecera");
        ui.inline(
            form,
            "custpage_e_rango",
            "Fecha de facturas",
            proceso.desde || proceso.hasta ? `${formato.isoATexto(proceso.desde) || "…"} al ${formato.isoATexto(proceso.hasta) || "…"}` : "Todas las fechas",
            "custpage_grp_cabecera"
        );
        ui.inline(form, "custpage_e_usuario", "Usuario", proceso.usuario, "custpage_grp_cabecera");
        ui.html(
            form,
            "custpage_e_archivos",
            `<div style="padding:6px 0">${ui.boton(urlDescargaValidacion, "Validación (Excel)")}${ui.boton(urlDescargaResultado, "Resultado (Excel)")}</div>`,
            "custpage_grp_cabecera"
        );
        ui.inline(form, "custpage_e_estado", "Estado", proceso.estadoTexto, "custpage_grp_cabecera").updateBreakType({ breakType: serverWidget.FieldBreakType.STARTCOL });
        ui.inline(form, "custpage_e_inicio", "Inicio", proceso.fechaInicio, "custpage_grp_cabecera").updateBreakType({ breakType: serverWidget.FieldBreakType.STARTCOL });
        ui.inline(form, "custpage_e_fin", "Fin", proceso.fechaFin, "custpage_grp_cabecera");
        ui.inline(form, "custpage_e_obs", "Observación", proceso.observacion, "custpage_grp_cabecera").updateBreakType({ breakType: serverWidget.FieldBreakType.STARTCOL });

        // ── Resumen ─────────────────────────────────────────────────────────
        form.addFieldGroup({ id: "custpage_grp_resumen", label: "Resumen (facturas)" });
        ui.html(
            form,
            "custpage_e_resumen",
            ui.tarjetas([
                ui.tarjeta("Revisadas", proceso.totalRevisadas, "facturas abiertas", "#888"),
                ui.tarjeta("Con diferencia", proceso.totalConDiferencia, `${proceso.totalProcesables} procesable(s)`, "#6a4c93"),
                ui.tarjeta("Seleccionadas", proceso.totalSeleccionadas, "marcadas para procesar", "#1565c0"),
                ui.tarjeta("Procesadas", proceso.totalProcesadas, "descuento corregido", "#2d6a2d"),
                ui.tarjeta("Omitidas / sin cambio", proceso.totalOmitidas, "incluye no procesables", "#888"),
                ui.tarjeta("Con error", proceso.totalErrores, proceso.totalErrores ? "ver pestaña Con error" : "sin errores", "#a03028")
            ]) + (proceso.error ? `<div style="padding:6px 0;color:#a03028;font-size:12px"><b>Errores del proceso:</b><br>${esc(proceso.error).replace(/\n/g, "<br>")}</div>` : ""),
            "custpage_grp_resumen"
        );

        // ── Pestañas por estado ─────────────────────────────────────────────
        PESTANAS.forEach(([clave, titulo]) => agregarPestana(form, clave, titulo, grupos[clave] || []));

        // ── Botones ─────────────────────────────────────────────────────────
        if (enCurso) form.addButton({ id: "custpage_btn_actualizar", label: "Actualizar", functionName: "actualizarPagina" });
        form.addButton({ id: "custpage_btn_historial", label: "Ver historial", functionName: "irAHistorial" });
        form.addButton({ id: "custpage_btn_nueva", label: "Nueva búsqueda", functionName: "irAParametros" });
        return form;
    };

    return { construir };
});
