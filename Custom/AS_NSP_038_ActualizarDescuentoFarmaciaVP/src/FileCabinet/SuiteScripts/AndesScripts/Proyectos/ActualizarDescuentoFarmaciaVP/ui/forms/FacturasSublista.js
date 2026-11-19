/**
 * @NApiVersion 2.1
 * @NModuleScope SameAccount
 *
 * @description AS_NSP_038 - Sublista de facturas de la pantalla de Validación.
 *              Una fila por factura con el detalle de los descuentos a corregir y el cuadre contra el
 *              importe restante. La pestaña Por procesar agrega la casilla Procesar (marcada por defecto).
 */
define(["N/ui/serverWidget", "../../utils/UiUtils", "../../utils/FormatoUtils", "../../constants/ActualizarDescuentoFarmaciaVPConstants"], (serverWidget, ui, formato, CONST) => {
    const { COLUMNAS_SELECCION: CS } = CONST;
    const { num, esc } = formato;

    /**
     * Agrega una pestaña con su sublista de facturas.
     * @param {serverWidget.Form} form
     * @param {object} o
     * @param {string} o.tab - ID de la pestaña
     * @param {string} o.sublista - ID de la sublista
     * @param {string} o.titulo - etiqueta (se le agrega la cantidad de facturas)
     * @param {object[]} o.facturas
     * @param {boolean} [o.conSeleccion] - casilla Procesar e ID de factura oculto
     * @param {boolean} [o.conCuadre] - columnas del detalle de descuentos y del cuadre
     */
    const agregar = (form, { tab, sublista, titulo, facturas, conSeleccion = false, conCuadre = true }) => {
        const etiqueta = `${titulo} (${facturas.length})`;
        form.addSubtab({ id: tab, label: etiqueta });
        const sl = form.addSublist({ id: sublista, type: serverWidget.SublistType.LIST, label: etiqueta, tab });

        if (conSeleccion) {
            sl.addField({ id: CS.PROCESAR, type: serverWidget.FieldType.CHECKBOX, label: "Procesar" });
            sl.addField({ id: CS.FACTURA_ID, type: serverWidget.FieldType.TEXT, label: "ID factura" }).updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN });
            if (facturas.length) sl.addMarkAllButtons();
        }
        ui.columnas(sl, [
            ["custpage_v_factura", "Factura"],
            ["custpage_v_fecha", "Fecha"],
            ["custpage_v_cliente", "Cliente"],
            ["custpage_v_ubicacion", "Ubicación"],
            ["custpage_v_total", "Importe"],
            ["custpage_v_restante", "Importe restante"],
            ...(conCuadre
                ? [
                      ["custpage_v_lineas", "Descuentos a corregir"],
                      ["custpage_v_accion", "Acción", serverWidget.FieldType.TEXTAREA],
                      ["custpage_v_neto", "Ajuste neto"],
                      ["custpage_v_esperado", "Ajuste con IVA"],
                      ["custpage_v_dif", "Diferencia cuadre"],
                      ["custpage_v_rest_esperado", "Restante esperado"]
                  ]
                : []),
            ["custpage_v_motivo", "Observación", serverWidget.FieldType.TEXTAREA]
        ]);

        facturas.forEach((f, i) => {
            const valores = {
                custpage_v_factura: ui.enlace("invoice", f.id, f.numero),
                custpage_v_fecha: esc(f.fecha),
                custpage_v_cliente: esc(f.cliente),
                custpage_v_ubicacion: esc(f.ubicacion),
                custpage_v_total: num(f.total, 2),
                custpage_v_restante: num(f.restante, 2),
                custpage_v_motivo: esc(f.motivo)
            };
            if (conCuadre) {
                valores.custpage_v_lineas = String((f.lineas || []).length);
                valores.custpage_v_accion = esc(f.accion);
                valores.custpage_v_neto = num(f.netoAdicional, 2);
                valores.custpage_v_esperado = num(f.importeEsperado, 2);
                valores.custpage_v_dif = num(f.diferenciaCuadre, 2);
                valores.custpage_v_rest_esperado = num(f.restanteEsperado, 2);
            }
            if (conSeleccion) {
                valores[CS.PROCESAR] = f.seleccionada ? "T" : "F";
                valores[CS.FACTURA_ID] = f.id;
            }
            ui.fila(sl, i, valores);
        });
        return sl;
    };

    return { agregar };
});
