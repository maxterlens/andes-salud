/**
 * @NApiVersion 2.1
 * @NModuleScope SameAccount
 *
 * @description AS_NSP_037 - FixArticuloOrdenVenta | Pantalla 1: Carga.
 *              Subsidiaria, observación y archivo CSV. Al validar con error se conservan los valores.
 */
define(["N/ui/serverWidget", "../../utils/UiUtils", "../../constants/FixArticuloOrdenVentaConstants"], (serverWidget, ui, CONST) => {
    const { SCRIPTS, CAMPOS_CARGA: CC, ACCIONES, COLUMNAS_CSV } = CONST;

    /**
     * Construye el formulario de Carga.
     * @param {object} o
     * @param {object} [o.valores] - { subsidiaria, observacion } a conservar tras un error
     * @param {object} [o.mensaje] - { tipo, titulo, texto }
     * @param {string} o.urlPlantilla
     * @returns {serverWidget.Form}
     */
    const construir = ({ valores = {}, mensaje = null, urlPlantilla }) => {
        const form = serverWidget.createForm({ title: "Ajuste de Artículos en OV" });
        form.clientScriptModulePath = SCRIPTS.CS_PATH;
        ui.mensaje(form, mensaje);

        // ── Información principal ───────────────────────────────────────────
        form.addFieldGroup({ id: "custpage_grp_principal", label: "Información principal" });
        const fSubsidiaria = form.addField({ id: CC.SUBSIDIARIA, type: serverWidget.FieldType.SELECT, label: "Subsidiaria", source: "subsidiary", container: "custpage_grp_principal" });
        fSubsidiaria.isMandatory = true;
        fSubsidiaria.setHelpText({ help: "Subsidiaria de las OV. La cuenta del paciente se busca dentro de esta subsidiaria." });
        if (valores.subsidiaria) fSubsidiaria.defaultValue = valores.subsidiaria;

        const fObs = form.addField({ id: CC.OBSERVACION, type: serverWidget.FieldType.TEXTAREA, label: "Observación", container: "custpage_grp_principal" });
        fObs.updateDisplaySize({ height: 3, width: 60 });
        fObs.updateBreakType({ breakType: serverWidget.FieldBreakType.STARTCOL });
        if (valores.observacion) fObs.defaultValue = valores.observacion;

        const columnas = Object.values(COLUMNAS_CSV)
            .map((c) => `<b>${c.oficial}</b>${c.obligatoria ? "" : " (opcional)"}`)
            .join(" · ");
        ui.html(
            form,
            "custpage_ayuda_principal",
            ui.ayuda(
                "Al validar se muestra qué se hará con cada línea de la OV (eliminar, reducir, aumentar, reemplazar o actualizar precio). " +
                    "<b>Nada se modifica hasta presionar Procesar.</b> Las líneas con artículo distinto solo se reemplazan si se confirman en la validación."
            ),
            "custpage_grp_principal"
        );

        // ── Archivo ─────────────────────────────────────────────────────────
        form.addFieldGroup({ id: "custpage_grp_archivo", label: "Archivo CSV" });
        // NetSuite no permite campos FILE dentro de un grupo de campos: el campo va fuera del contenedor
        const fArchivo = form.addField({ id: CC.ARCHIVO, type: serverWidget.FieldType.FILE, label: "Archivo CSV" });
        fArchivo.isMandatory = true;
        ui.html(
            form,
            "custpage_ayuda_archivo",
            ui.ayuda(
                `Separado por <b>;</b> o <b>,</b>. Columnas: ${columnas}. También se aceptan <b>LINEA (CRG_CORREL)</b> e <b>ID_NETSUIT</b>. ` +
                    "Si VALOR_UNITARIO trae valor se reemplaza el precio de la línea; si viene vacío se mantiene el actual."
            ) + ui.boton(urlPlantilla, "Descargar plantilla"),
            "custpage_grp_archivo"
        );

        // ── Ocultos y botones ───────────────────────────────────────────────
        ui.oculto(form, CC.ACCION, ACCIONES.VALIDAR);
        form.addSubmitButton({ label: "Validar" });
        form.addButton({ id: "custpage_btn_historial", label: "Ver historial", functionName: "irAHistorial" });
        return form;
    };

    return { construir };
});
