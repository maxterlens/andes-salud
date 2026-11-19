/**
 * @NApiVersion 2.1
 * @NModuleScope SameAccount
 *
 * @description AS_NSP_038 - ActualizarDescuentoFarmaciaVP | Pantalla 1: Parámetros.
 *              Subsidiaria (obligatoria), rango de fechas de la factura (opcional) y observación.
 *              Muestra los filtros fijos configurados en el deployment. Al buscar con error se conservan los valores.
 */
define(["N/ui/serverWidget", "../../utils/UiUtils", "../../utils/FormatoUtils", "../../constants/ActualizarDescuentoFarmaciaVPConstants"], (serverWidget, ui, formato, CONST) => {
    const { SCRIPTS, CAMPOS_PARAMETROS: CP, ACCIONES } = CONST;
    const { esc } = formato;

    /**
     * Construye el formulario de Parámetros.
     * @param {object} o
     * @param {object} [o.valores] - { subsidiaria, desde, hasta, observacion } a conservar tras un error
     * @param {object} [o.mensaje] - { tipo, titulo, texto }
     * @param {object} o.config - ProcesoDescuentoService.config()
     * @returns {serverWidget.Form}
     */
    const construir = ({ valores = {}, mensaje = null, config }) => {
        const form = serverWidget.createForm({ title: "Actualizar Descuento Farmacia Venta Público" });
        form.clientScriptModulePath = SCRIPTS.CS_PATH;
        ui.mensaje(form, mensaje);

        // ── Parámetros ──────────────────────────────────────────────────────
        form.addFieldGroup({ id: "custpage_grp_parametros", label: "Parámetros" });
        const fSubsidiaria = form.addField({ id: CP.SUBSIDIARIA, type: serverWidget.FieldType.SELECT, label: "Subsidiaria", source: "subsidiary", container: "custpage_grp_parametros" });
        fSubsidiaria.isMandatory = true;
        fSubsidiaria.setHelpText({ help: "Subsidiaria de las facturas de venta a revisar." });
        if (valores.subsidiaria) fSubsidiaria.defaultValue = valores.subsidiaria;

        const fDesde = form.addField({ id: CP.DESDE, type: serverWidget.FieldType.DATE, label: "Fecha factura desde", container: "custpage_grp_parametros" });
        fDesde.updateBreakType({ breakType: serverWidget.FieldBreakType.STARTCOL });
        fDesde.setHelpText({ help: "Opcional. Si se deja vacío se revisan todas las facturas abiertas." });
        if (valores.desde) fDesde.defaultValue = valores.desde;
        const fHasta = form.addField({ id: CP.HASTA, type: serverWidget.FieldType.DATE, label: "Fecha factura hasta", container: "custpage_grp_parametros" });
        fHasta.setHelpText({ help: "Opcional." });
        if (valores.hasta) fHasta.defaultValue = valores.hasta;

        const fObs = form.addField({ id: CP.OBSERVACION, type: serverWidget.FieldType.TEXTAREA, label: "Observación", container: "custpage_grp_parametros" });
        fObs.updateDisplaySize({ height: 3, width: 60 });
        fObs.updateBreakType({ breakType: serverWidget.FieldBreakType.STARTCOL });
        if (valores.observacion) fObs.defaultValue = valores.observacion;

        // ── Criterios ───────────────────────────────────────────────────────
        form.addFieldGroup({ id: "custpage_grp_criterios", label: "Criterios de búsqueda y validación" });
        ui.html(
            form,
            "custpage_ayuda_criterios",
            ui.ayuda(
                "Se buscan las <b>facturas de venta abiertas</b> de la subsidiaria con " +
                    `centro de costo <b>${esc(config.departamentos)}</b>, ubicación distinta de <b>${esc(config.ubicacionesExcluidas || "-")}</b> ` +
                    `e importe restante mayor a <b>${esc(config.restanteMinimo)}</b>.<br>` +
                    "En cada factura se revisa que el descuento (artículo de tipo <b>Servicio</b> cuyo nombre contiene <b>descuento</b>, " +
                    "ubicado justo debajo de su artículo) tenga la <b>misma cantidad</b> que el artículo.<br>" +
                    `Solo se pueden procesar las facturas cuyo ajuste del descuento con IVA (<b>${esc(config.iva)}%</b>) cuadra con el importe restante ` +
                    `(tolerancia <b>${esc(config.tolerancia)}</b>). <b>Nada se modifica hasta presionar Procesar.</b>`
            ),
            "custpage_grp_criterios"
        );

        // ── Ocultos y botones ───────────────────────────────────────────────
        ui.oculto(form, CP.ACCION, ACCIONES.BUSCAR);
        form.addSubmitButton({ label: "Buscar" });
        form.addButton({ id: "custpage_btn_historial", label: "Ver historial", functionName: "irAHistorial" });
        return form;
    };

    return { construir };
});
