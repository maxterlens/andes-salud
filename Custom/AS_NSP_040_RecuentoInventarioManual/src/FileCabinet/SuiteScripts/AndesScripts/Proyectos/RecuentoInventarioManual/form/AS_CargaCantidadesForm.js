/**
 * AS_NSP_040 — Recuento de Inventario Manual
 * @description Lo que ve el usuario de la carga de cantidades: la pantalla para
 *              elegir el recuento y el lote, y subir el archivo. Lo que pasa despues se ve
 *              en la solicitud de la cola (AS_ColaForm). No busca ni guarda
 *              records.
 *
 * @NApiVersion 2.1
 * @NModuleScope Public
 * @author Andes Salud
 * @version 1.4.0
 *
 */
define(['N/ui/serverWidget', 'N/ui/message', '../constants/AS_RecuentoInventarioManualConstants'],
    (serverWidget, message, CONSTANTES) => {

    // ─────────────────────────────────────────────────────────────────────────
    // Principales
    // ─────────────────────────────────────────────────────────────────────────

    function construirFormulario(recuentoId, recuentos, loteId, lotes, alerta) {
        const form = serverWidget.createForm({ title: CONSTANTES.CARGA.TITULO });

        if (alerta) form.addPageInitMessage({ type: message.Type.ERROR, title: CONSTANTES.CARGA.ALERTA_TITULO, message: alerta });
        agregarRecuento(form, recuentoId, recuentos, loteId, lotes);
        agregarArchivo(form);
        form.addSubmitButton({ label: CONSTANTES.CARGA.BOTON_CARGAR });

        return form;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Secundarias
    // ─────────────────────────────────────────────────────────────────────────

    function agregarRecuento(form, recuentoId, recuentos, loteId, lotes) {
        const grupo = CONSTANTES.GRUPOS.CARGA;

        form.addFieldGroup({ id: grupo, label: 'Recuento' });

        const campoRecuento = form.addField({
            id       : CONSTANTES.CAMPOS.RECUENTO_CARGA,
            type     : serverWidget.FieldType.SELECT,
            label    : CONSTANTES.CARGA.RECUENTO_LABEL,
            container: grupo,
        });
        campoRecuento.isMandatory = true;
        campoRecuento.addSelectOption({ value: '', text: '' });
        recuentos.forEach((recuento) => {
            campoRecuento.addSelectOption({ value: recuento.id, text: recuento.nombre, isSelected: recuento.id === String(recuentoId) });
        });

        const campoLote = form.addField({
            id       : CONSTANTES.CAMPOS.LOTE_CARGA,
            type     : serverWidget.FieldType.SELECT,
            label    : CONSTANTES.CARGA.LOTE_LABEL,
            container: grupo,
        });
        campoLote.isMandatory = true;
        campoLote.addSelectOption({ value: '', text: '' });
        lotes.forEach((lote) => {
            campoLote.addSelectOption({ value: lote.id, text: lote.nombre, isSelected: lote.id === String(loteId) });
        });
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
