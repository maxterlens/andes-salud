/**
 * @NApiVersion 2.1
 * @NModuleScope SameAccount
 *
 * @description AS_NSP_037 - Sublista de líneas común a las pantallas de Validación y Detalle.
 *              Cada pestaña (por procesar, reemplazos, sin cambio, no procesables / procesadas,
 *              errores, omitidas...) usa esta misma sublista con columnas opcionales.
 */
define(["N/ui/serverWidget", "../../utils/UiUtils", "../../utils/FormatoUtils", "../../constants/FixArticuloOrdenVentaConstants"], (serverWidget, ui, formato, CONST) => {
    const { COLUMNAS_REEMPLAZO: CR } = CONST;
    const { num, esc } = formato;

    /**
     * Agrega una pestaña con su sublista de líneas.
     * @param {serverWidget.Form} form
     * @param {object} o
     * @param {string} o.tab - ID de la pestaña
     * @param {string} o.sublista - ID de la sublista
     * @param {string} o.titulo - etiqueta (se le agrega la cantidad de líneas)
     * @param {Array<object>} o.lineas
     * @param {boolean} [o.conReemplazo] - columna con check Reemplazar y clave oculta
     * @param {boolean} [o.conResultado] - columnas de resultado (estado, cantidad resultante, Ejecuciones, lotes)
     * @param {boolean} [o.conAjuste] - columna con el ajuste previsto en la Ejecución
     */
    const agregar = (form, { tab, sublista, titulo, lineas, conReemplazo = false, conResultado = false, conAjuste = false }) => {
        const etiqueta = `${titulo} (${lineas.length})`;
        form.addSubtab({ id: tab, label: etiqueta });
        const sl = form.addSublist({ id: sublista, type: serverWidget.SublistType.LIST, label: etiqueta, tab });

        if (conReemplazo) {
            sl.addField({ id: CR.REEMPLAZAR, type: serverWidget.FieldType.CHECKBOX, label: "Reemplazar" });
            sl.addField({ id: CR.CLAVE, type: serverWidget.FieldType.TEXT, label: "Clave" }).updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN });
            if (lineas.length) sl.addMarkAllButtons();
        }
        ui.columnas(sl, [
            ["custpage_l_fila", "Fila"],
            ["custpage_l_cuenta", "Cuenta"],
            ["custpage_l_crg", "CRG_CORREL"],
            ["custpage_l_ov", "OV"],
            ["custpage_l_art_ov", "Artículo OV"],
            ["custpage_l_art_csv", "Artículo CSV"],
            ["custpage_l_cant_ov", "Cant. OV"],
            ["custpage_l_desp", "Despachada"],
            ["custpage_l_final", "Cant. final"],
            ...(conResultado ? [["custpage_l_result", "Cant. resultante"]] : []),
            ["custpage_l_precio_ov", "Precio actual"],
            ["custpage_l_precio_nuevo", "Precio nuevo"],
            ...(conResultado ? [] : [["custpage_l_monto", "Monto resultante"]]),
            ["custpage_l_accion", "Acción"],
            ...(conAjuste ? [["custpage_l_ajuste", "Ejecución prevista"]] : []),
            ...(conResultado
                ? [
                      ["custpage_l_ejecuciones", "Ejecuciones afectadas"],
                      ["custpage_l_lotes", "Lotes", serverWidget.FieldType.TEXTAREA]
                  ]
                : []),
            ["custpage_l_mensaje", "Mensaje", serverWidget.FieldType.TEXTAREA]
        ]);

        lineas.forEach((l, i) => {
            const valores = {
                custpage_l_fila: (l.filas || []).filter(Boolean).join(", "),
                custpage_l_cuenta: esc(l.cuenta),
                custpage_l_crg: esc(l.crg),
                custpage_l_ov: ui.enlace("salesorder", l.ovId, l.ovNumero),
                custpage_l_art_ov: esc(l.articuloOvNombre),
                custpage_l_art_csv: esc(l.articuloCsvNombre || l.idArticuloCsv),
                custpage_l_cant_ov: num(l.cantidadOv),
                custpage_l_desp: num(l.despachada),
                custpage_l_final: num(l.cantidadFinal),
                custpage_l_precio_ov: num(l.precioOv),
                custpage_l_precio_nuevo: num(l.precioNuevo),
                custpage_l_accion: esc(l.accionTexto),
                custpage_l_mensaje: esc(l.mensaje)
            };
            if (conReemplazo) {
                valores[CR.REEMPLAZAR] = l.confirmado ? "T" : "F";
                valores[CR.CLAVE] = l.clave;
            }
            if (conAjuste) valores.custpage_l_ajuste = esc(l.ajusteEjecucionTexto);
            if (conResultado) {
                valores.custpage_l_result = num(l.cantidadResultante);
                valores.custpage_l_ejecuciones = (l.ejecucionesAfectadas || []).map((e) => (e.id ? ui.enlace("itemfulfillment", e.id, e.texto) : esc(e.texto))).join(", ");
                valores.custpage_l_lotes = esc(l.lotes);
            } else {
                valores.custpage_l_monto = num(l.montoNuevo);
            }
            ui.fila(sl, i, valores);
        });
        return sl;
    };

    return { agregar };
});
