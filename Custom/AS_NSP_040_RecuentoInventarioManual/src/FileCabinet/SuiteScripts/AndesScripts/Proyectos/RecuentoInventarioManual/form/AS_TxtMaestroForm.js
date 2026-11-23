/**
 * AS_NSP_040 — Recuento de Inventario Manual
 * @description Dibuja la pantalla Descargar TXT maestro: la Subsidiaria, el
 *              boton Descargar TXT y, con la subsidiaria elegida, el total de
 *              articulos distintos que lleva el TXT. Sin la lista: con miles
 *              de filas se veia mal y tardaba en cargar. Se abre desde el
 *              boton Descargar TXT maestro de la pantalla del recuento. No
 *              busca ni guarda records.
 *
 *              Elegir la subsidiaria recarga la pantalla con su total
 *              (client script). El boton no envia el formulario: el client
 *              script toma la Subsidiaria y abre el Suitelet por GET, que
 *              responde el TXT como descarga y la pagina queda igual.
 *
 * @NApiVersion 2.1
 * @NModuleScope Public
 * @author Andes Salud
 * @version 1.0.0
 *
 */
define(['N/ui/serverWidget', '../constants/AS_RecuentoInventarioManualConstants'],
    (serverWidget, CONSTANTES) => {

    // ─────────────────────────────────────────────────────────────────────────
    // Principales
    // ─────────────────────────────────────────────────────────────────────────

    function construirFormulario(subsidiariaId, totalArticulos) {
        const form = serverWidget.createForm({ title: CONSTANTES.FORMULARIO.MAESTRO_TITULO });

        form.clientScriptModulePath = CONSTANTES.FORMULARIO.CLIENT_SCRIPT;
        form.addButton({ id: CONSTANTES.BOTONES.MAESTRO_DESCARGAR, label: CONSTANTES.BOTONES.MAESTRO_DESCARGAR_LABEL, functionName: 'descargarTxtMaestro' });
        agregarSubsidiaria(form, subsidiariaId);
        if (!subsidiariaId) return form;
        agregarTotal(form, totalArticulos);

        return form;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Secundarias
    // ─────────────────────────────────────────────────────────────────────────

    function agregarSubsidiaria(form, subsidiariaId) {
        const grupo = CONSTANTES.GRUPOS.MAESTRO;

        form.addFieldGroup({ id: grupo, label: 'Articulos de la subsidiaria' });

        const campoSubsidiaria = form.addField({
            id       : CONSTANTES.CAMPOS.SUBSIDIARIA_MAESTRO,
            type     : serverWidget.FieldType.SELECT,
            label    : 'Subsidiaria',
            source   : 'subsidiary',
            container: grupo,
        });
        campoSubsidiaria.isMandatory  = true;
        campoSubsidiaria.defaultValue = subsidiariaId || '';
    }

    function agregarTotal(form, totalArticulos) {
        const campoArticulos = form.addField({
            id       : CONSTANTES.CAMPOS.TOTAL_ARTICULOS,
            type     : serverWidget.FieldType.INTEGER,
            label    : 'Total de articulos',
            container: CONSTANTES.GRUPOS.MAESTRO,
        });
        campoArticulos.defaultValue = String(totalArticulos);
        campoArticulos.updateDisplayType({ displayType: serverWidget.FieldDisplayType.INLINE });
    }

    return {
        construirFormulario: construirFormulario,
    };
});
