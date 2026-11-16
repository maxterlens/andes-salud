/**
 * AS_NSP_040 — Recuento de Inventario Manual
 * @description Dibuja el aviso que queda despues de Generar recuento: el recuento
 *              se crea en segundo plano y no hay un registro que abrir todavia.
 *              No busca ni guarda records.
 *
 *              Muestra el estado y el tiempo que lleva, que el client script
 *              actualiza mientras consulta al Suitelet; el codigo y la tarea
 *              viajan ocultos para esa consulta.
 *
 * CHANGELOG v1.1.0 (2026-11-16):
 * - [FEAT] Estado, tiempo transcurrido y total de articulos, con el client script
 *          que sigue la generacion y abre el recuento al terminar.
 *
 * CHANGELOG v1.0.0 (2026-11-16):
 * - [FEAT] Aviso de recuento en generacion.
 *
 * @NApiVersion 2.1
 * @NModuleScope Public
 * @author Andes Salud
 * @version 1.1.0
 */
define(['N/ui/serverWidget', 'N/ui/message', '../constants/AS_RecuentoInventarioManualConstants'],
    (serverWidget, message, CONSTANTES) => {

    // ─────────────────────────────────────────────────────────────────────────
    // Principales
    // ─────────────────────────────────────────────────────────────────────────

    function construirAviso(codigo, tareaId, totalArticulos) {
        const form = serverWidget.createForm({ title: CONSTANTES.FORMULARIO.TITULO });

        form.clientScriptModulePath = CONSTANTES.FORMULARIO.CLIENT_SCRIPT;
        form.addPageInitMessage({
            type   : message.Type.INFORMATION,
            title  : CONSTANTES.FORMULARIO.ENVIADO_TITULO,
            message: CONSTANTES.FORMULARIO.ENVIADO_TEXTO,
        });
        agregarSeguimiento(form, codigo, tareaId, totalArticulos);

        return form;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Secundarias
    // ─────────────────────────────────────────────────────────────────────────

    function agregarSeguimiento(form, codigo, tareaId, totalArticulos) {
        const grupo = CONSTANTES.GRUPOS.GENERACION;

        form.addFieldGroup({ id: grupo, label: 'Generacion' });

        const campoEstado = form.addField({
            id       : CONSTANTES.CAMPOS.ESTADO,
            type     : serverWidget.FieldType.TEXT,
            label    : 'Estado',
            container: grupo,
        });
        campoEstado.defaultValue = CONSTANTES.FORMULARIO.ESTADOS_TAREA.PENDING;
        campoEstado.updateDisplayType({ displayType: serverWidget.FieldDisplayType.DISABLED });
        const campoTiempo = form.addField({
            id       : CONSTANTES.CAMPOS.TIEMPO,
            type     : serverWidget.FieldType.TEXT,
            label    : 'Tiempo transcurrido',
            container: grupo,
        });
        campoTiempo.defaultValue = '0 min 0 s';
        campoTiempo.updateDisplayType({ displayType: serverWidget.FieldDisplayType.DISABLED });
        const campoTotal = form.addField({
            id       : CONSTANTES.CAMPOS.TOTAL_ARTICULOS,
            type     : serverWidget.FieldType.INTEGER,
            label    : 'Articulos',
            container: grupo,
        });
        campoTotal.defaultValue = String(totalArticulos);
        campoTotal.updateDisplayType({ displayType: serverWidget.FieldDisplayType.DISABLED });
        const campoCodigo = form.addField({
            id   : CONSTANTES.CAMPOS.GENERACION,
            type : serverWidget.FieldType.TEXT,
            label: 'Codigo',
        });
        campoCodigo.defaultValue = codigo;
        campoCodigo.updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN });
        const campoTarea = form.addField({
            id   : CONSTANTES.CAMPOS.TAREA,
            type : serverWidget.FieldType.TEXT,
            label: 'Tarea',
        });
        campoTarea.defaultValue = tareaId;
        campoTarea.updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN });
    }

    return {
        construirAviso: construirAviso,
    };
});
