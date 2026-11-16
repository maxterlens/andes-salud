/**
 * AS_NSP_040 — Recuento de Inventario Manual
 * @description Lo que ve el usuario de la carga de cantidades: el boton Cargar
 *              CSV en la vista del recuento y la pantalla para subir el archivo.
 *              No busca ni guarda records.
 *
 * CHANGELOG v1.0.0 (2026-11-15):
 * - [FEAT] agregarBoton y construirFormulario.
 *
 * @NApiVersion 2.1
 * @NModuleScope Public
 * @author Andes Salud
 * @version 1.0.0
 */
define(['N/ui/serverWidget', 'N/ui/message', '../constants/AS_RecuentoInventarioManualConstants'],
    (serverWidget, message, CONSTANTES) => {

    // ─────────────────────────────────────────────────────────────────────────
    // Principales
    // ─────────────────────────────────────────────────────────────────────────

    function agregarBoton(form) {
        form.clientScriptModulePath = CONSTANTES.FORMULARIO.CLIENT_SCRIPT;
        form.addButton({
            id          : CONSTANTES.BOTONES.CSV,
            label       : CONSTANTES.BOTONES.CSV_LABEL,
            functionName: 'cargarCsv',
        });
    }

    function construirFormulario(recuentoId, alerta) {
        const form = serverWidget.createForm({ title: CONSTANTES.CARGA.TITULO });

        if (alerta) form.addPageInitMessage({ type: message.Type.ERROR, title: CONSTANTES.CARGA.ALERTA_TITULO, message: alerta });
        agregarArchivo(form, recuentoId);
        form.addSubmitButton({ label: CONSTANTES.CARGA.BOTON_CARGAR });

        return form;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Secundarias
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * El campo FILE va suelto, sin grupo: NetSuite lo rechaza dentro de un
     * contenedor. El id del recuento viaja oculto para que el POST sepa a cual
     * escribir.
     */
    function agregarArchivo(form, recuentoId) {
        const campoArchivo = form.addField({
            id   : CONSTANTES.CAMPOS.ARCHIVO,
            type : serverWidget.FieldType.FILE,
            label: CONSTANTES.CARGA.ARCHIVO_LABEL,
        });
        campoArchivo.isMandatory = true;
        const campoRecuento = form.addField({
            id   : CONSTANTES.CAMPOS.RECUENTO_CARGA,
            type : serverWidget.FieldType.TEXT,
            label: 'Recuento',
        });
        campoRecuento.defaultValue = recuentoId;
        campoRecuento.updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN });
    }

    return {
        agregarBoton       : agregarBoton,
        construirFormulario: construirFormulario,
    };
});
