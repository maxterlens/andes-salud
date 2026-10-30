/**
 * AS_NSP_035 — Reporte de Stock Valorizado
 * @description Dibuja la pantalla del reporte. No busca ni guarda records.
 *
 *              construirFormulario se lee como indice: formulario, aviso de
 *              solicitud, filtros, boton Generar e historial.
 * @NApiVersion 2.1
 * @NModuleScope Public
 * @author Andes Salud
 * @version 1.3.0
 *
 * CHANGELOG v1.3.0:
 * - [FEAT] Aviso cuando ya hay un reporte en proceso.
 *
 * CHANGELOG v1.2.0:
 * - [FIX]  Ubicacion pasa de lista multiple a lista desplegable.
 *
 * CHANGELOG v1.1.0:
 * - [FEAT] Campo Ubicacion y columna en el historial.
 * - [FIX]  La subsidiaria ya no viene fija en Puerto Montt.
 *
 */
define(['N/ui/serverWidget', 'N/ui/message', 'N/format', '../constants/AS_StockValorizadoConstants'],
    (serverWidget, message, format, CONSTANTES) => {

    // ─────────────────────────────────────────────────────────────────────────
    // Principales
    // ─────────────────────────────────────────────────────────────────────────

    function construirFormulario(historial, ubicaciones, solicitado, ocupado) {
        const form = serverWidget.createForm({ title: CONSTANTES.FORMULARIO.TITULO });

        form.clientScriptModulePath = CONSTANTES.FORMULARIO.CLIENT_SCRIPT;
        if (solicitado) {
            form.addPageInitMessage({ type: message.Type.CONFIRMATION, title: CONSTANTES.FORMULARIO.SOLICITUD_TITULO, message: CONSTANTES.FORMULARIO.SOLICITUD_TEXTO });
        }
        if (ocupado) {
            form.addPageInitMessage({ type: message.Type.WARNING, title: CONSTANTES.FORMULARIO.OCUPADO_TITULO, message: CONSTANTES.FORMULARIO.OCUPADO_TEXTO });
        }
        agregarFiltros(form, ubicaciones);
        form.addSubmitButton({ label: CONSTANTES.FORMULARIO.BOTON_GENERAR });
        agregarHistorial(form, historial);

        return form;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Secundarias
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Ubicacion nace sin opciones: las pone el client script segun la subsidiaria,
     * sacandolas del JSON oculto.
     */
    function agregarFiltros(form, ubicaciones) {
        const grupo = CONSTANTES.GRUPOS.FILTROS;

        form.addFieldGroup({ id: grupo, label: 'Filtros' });

        const campoSubsidiaria = form.addField({
            id       : CONSTANTES.CAMPOS.SUBSIDIARIA,
            type     : serverWidget.FieldType.SELECT,
            label    : 'Subsidiaria',
            source   : 'subsidiary',
            container: grupo,
        });
        campoSubsidiaria.isMandatory = true;
        form.addField({
            id       : CONSTANTES.CAMPOS.UBICACION,
            type     : serverWidget.FieldType.SELECT,
            label    : 'Ubicacion',
            container: grupo,
        });
        const campoUbicacionesData = form.addField({
            id   : CONSTANTES.CAMPOS.UBICACIONES_DATA,
            type : serverWidget.FieldType.LONGTEXT,
            label: 'Ubicaciones',
        });
        campoUbicacionesData.defaultValue = JSON.stringify(ubicaciones);
        campoUbicacionesData.updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN });
        const campoFechaCorte = form.addField({
            id       : CONSTANTES.CAMPOS.FECHA_CORTE,
            type     : serverWidget.FieldType.DATE,
            label    : 'Fecha de corte',
            container: grupo,
        });
        campoFechaCorte.isMandatory  = true;
        campoFechaCorte.defaultValue = format.format({ value: new Date(), type: format.Type.DATE });
    }

    /**
     * NetSuite no acepta un valor vacio en setSublistValue: los enlaces y el error
     * se escriben solo si el reporte los tiene.
     */
    function agregarHistorial(form, historial) {
        const columnas = CONSTANTES.SUBLISTA.COLUMNAS;

        const sublista = form.addSublist({
            id   : CONSTANTES.SUBLISTA.ID,
            type : serverWidget.SublistType.LIST,
            label: 'Reportes generados',
        });
        sublista.addRefreshButton();
        sublista.addField({ id: columnas.FECHA,       type: serverWidget.FieldType.TEXT, label: 'Fecha' });
        sublista.addField({ id: columnas.USUARIO,     type: serverWidget.FieldType.TEXT, label: 'Usuario' });
        sublista.addField({ id: columnas.SUBSIDIARIA, type: serverWidget.FieldType.TEXT, label: 'Subsidiaria' });
        sublista.addField({ id: columnas.UBICACION,   type: serverWidget.FieldType.TEXTAREA, label: 'Ubicacion' });
        sublista.addField({ id: columnas.FECHA_CORTE, type: serverWidget.FieldType.TEXT, label: 'Fecha de corte' });
        sublista.addField({ id: columnas.ESTADO,      type: serverWidget.FieldType.TEXT, label: 'Estado' });
        sublista.addField({ id: columnas.EXCEL,       type: serverWidget.FieldType.TEXT, label: 'Excel' });
        sublista.addField({ id: columnas.CSV,         type: serverWidget.FieldType.TEXT, label: 'CSV' });
        sublista.addField({ id: columnas.ERROR,       type: serverWidget.FieldType.TEXTAREA, label: 'Error' });

        historial.forEach((reporte, fila) => {
            sublista.setSublistValue({ id: columnas.FECHA,       line: fila, value: reporte.fecha });
            sublista.setSublistValue({ id: columnas.USUARIO,     line: fila, value: reporte.usuario });
            sublista.setSublistValue({ id: columnas.SUBSIDIARIA, line: fila, value: reporte.subsidiaria });
            sublista.setSublistValue({ id: columnas.UBICACION,   line: fila, value: reporte.ubicaciones || CONSTANTES.FORMULARIO.UBICACION_TODAS });
            sublista.setSublistValue({ id: columnas.FECHA_CORTE, line: fila, value: reporte.fechaCorte });
            sublista.setSublistValue({ id: columnas.ESTADO,      line: fila, value: reporte.estado });
            if (reporte.urlExcel) sublista.setSublistValue({ id: columnas.EXCEL, line: fila, value: '<a href="' + reporte.urlExcel + '" target="_blank">Descargar</a>' });
            if (reporte.urlCsv) sublista.setSublistValue({ id: columnas.CSV, line: fila, value: '<a href="' + reporte.urlCsv + '" target="_blank">Descargar</a>' });
            if (reporte.error) sublista.setSublistValue({ id: columnas.ERROR, line: fila, value: reporte.error });
        });
    }

    return {
        construirFormulario: construirFormulario,
    };
});
