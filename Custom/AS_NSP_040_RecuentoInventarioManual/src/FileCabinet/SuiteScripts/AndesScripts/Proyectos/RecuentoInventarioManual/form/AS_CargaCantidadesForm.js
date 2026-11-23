/**
 * AS_NSP_040 — Recuento de Inventario Manual
 * @description Lo que ve el usuario de la carga de cantidades: la pantalla para
 *              elegir la subsidiaria, el recuento y el lote, y subir el archivo.
 *              Recuento y Lote solo traen los de la subsidiaria elegida (vacios
 *              sin ella); la lista completa viaja en JSON oculto y el client
 *              script la vuelve a filtrar al cambiar la subsidiaria. Lo que pasa
 *              despues se ve en la solicitud de la cola (AS_ColaForm). No busca
 *              ni guarda records.
 *
 * @NApiVersion 2.1
 * @NModuleScope Public
 * @author Andes Salud
 * @version 1.5.0
 *
 */

define(['N/ui/serverWidget', 'N/ui/message', '../constants/AS_RecuentoInventarioManualConstants'],
    (serverWidget, message, CONSTANTES) => {

    // ─────────────────────────────────────────────────────────────────────────
    // Principales
    // ─────────────────────────────────────────────────────────────────────────

    function construirFormulario(subsidiariaId, recuentoId, recuentos, loteId, lotes, alerta) {
        const form = serverWidget.createForm({ title: CONSTANTES.CARGA.TITULO });

        form.clientScriptModulePath = CONSTANTES.CARGA.CLIENT_SCRIPT;
        if (alerta) form.addPageInitMessage({ type: message.Type.ERROR, title: CONSTANTES.CARGA.ALERTA_TITULO, message: alerta });
        agregarRecuento(form, subsidiariaId, recuentoId, recuentos, loteId, lotes);
        agregarArchivo(form);
        form.addSubmitButton({ label: CONSTANTES.CARGA.BOTON_CARGAR });

        return form;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Secundarias
    // ─────────────────────────────────────────────────────────────────────────

    function agregarRecuento(form, subsidiariaId, recuentoId, recuentos, loteId, lotes) {
        const grupo       = CONSTANTES.GRUPOS.CARGA;
        const subsidiaria = String(subsidiariaId || '');

        form.addFieldGroup({ id: grupo, label: 'Recuento' });

        const campoSubsidiaria = form.addField({
            id       : CONSTANTES.CAMPOS.SUBSIDIARIA_CARGA,
            type     : serverWidget.FieldType.SELECT,
            label    : 'Subsidiaria',
            source   : 'subsidiary',
            container: grupo,
        });
        campoSubsidiaria.isMandatory  = true;
        campoSubsidiaria.defaultValue = subsidiaria;
        const campoRecuento = form.addField({
            id       : CONSTANTES.CAMPOS.RECUENTO_CARGA,
            type     : serverWidget.FieldType.SELECT,
            label    : CONSTANTES.CARGA.RECUENTO_LABEL,
            container: grupo,
        });
        campoRecuento.isMandatory = true;
        campoRecuento.addSelectOption({ value: '', text: '' });
        recuentos.forEach((recuento) => {
            if (recuento.subsidiaria !== subsidiaria) return;
            campoRecuento.addSelectOption({ value: recuento.id, text: recuento.nombre, isSelected: recuento.id === String(recuentoId) });
        });
        const campoRecuentosData = form.addField({
            id   : CONSTANTES.CAMPOS.RECUENTOS_DATA,
            type : serverWidget.FieldType.LONGTEXT,
            label: 'Recuentos',
        });
        campoRecuentosData.defaultValue = JSON.stringify(recuentos);
        campoRecuentosData.updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN });
        const campoLote = form.addField({
            id       : CONSTANTES.CAMPOS.LOTE_CARGA,
            type     : serverWidget.FieldType.SELECT,
            label    : CONSTANTES.CARGA.LOTE_LABEL,
            container: grupo,
        });
        campoLote.isMandatory = true;
        campoLote.addSelectOption({ value: '', text: '' });
        lotes.forEach((lote) => {
            if (lote.subsidiaria !== subsidiaria) return;
            campoLote.addSelectOption({ value: lote.id, text: lote.nombre, isSelected: lote.id === String(loteId) });
        });
        const campoLotesData = form.addField({
            id   : CONSTANTES.CAMPOS.LOTES_DATA,
            type : serverWidget.FieldType.LONGTEXT,
            label: 'Lotes',
        });
        campoLotesData.defaultValue = JSON.stringify(lotes);
        campoLotesData.updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN });
    }

    function agregarArchivo(form) {
        const campoArchivo = form.addField({
            id   : CONSTANTES.CAMPOS.ARCHIVO,
            type : serverWidget.FieldType.FILE,
            label: CONSTANTES.CARGA.ARCHIVO_LABEL,
        });
        campoArchivo.isMandatory = true;
    }

    return {
        construirFormulario: construirFormulario,
    };
});
