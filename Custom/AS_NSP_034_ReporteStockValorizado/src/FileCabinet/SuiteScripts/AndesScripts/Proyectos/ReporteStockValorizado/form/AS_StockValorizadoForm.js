/**
 * AS_NSP_035 — Reporte de Stock Valorizado
 * @description Dibuja la pantalla del reporte. No busca ni guarda records.
 *
 *              construirFormulario se lee como indice: formulario, aviso de
 *              solicitud, filtros, boton Generar e historial.
 * @NApiVersion 2.1
 * @NModuleScope Public
 * @author Andes Salud
 * @version 1.0.0
 *
 */
define(['N/ui/serverWidget', 'N/ui/message', 'N/format', '../constants/AS_StockValorizadoConstants'],
    (serverWidget, message, format, CONSTANTES) => {

    // ─────────────────────────────────────────────────────────────────────────
    // Principales
    // ─────────────────────────────────────────────────────────────────────────

    function construirFormulario(historial, solicitado) {
        const form = serverWidget.createForm({ title: CONSTANTES.FORMULARIO.TITULO });

        if (solicitado) {
            form.addPageInitMessage({ type: message.Type.CONFIRMATION, title: CONSTANTES.FORMULARIO.SOLICITUD_TITULO, message: CONSTANTES.FORMULARIO.SOLICITUD_TEXTO });
        }
        agregarFiltros(form);
        form.addSubmitButton({ label: CONSTANTES.FORMULARIO.BOTON_GENERAR });
        agregarHistorial(form, historial);

        return form;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Secundarias
    // ─────────────────────────────────────────────────────────────────────────

    function agregarFiltros(form) {
        const grupo = CONSTANTES.GRUPOS.FILTROS;

        form.addFieldGroup({ id: grupo, label: 'Filtros' });

        const campoSubsidiaria = form.addField({
            id       : CONSTANTES.CAMPOS.SUBSIDIARIA,
            type     : serverWidget.FieldType.SELECT,
            label    : 'Subsidiaria',
            source   : 'subsidiary',
            container: grupo,
        });
        campoSubsidiaria.isMandatory  = true;
        campoSubsidiaria.defaultValue = CONSTANTES.SUBSIDIARIA_DEFECTO;
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
        sublista.addField({ id: columnas.FECHA_CORTE, type: serverWidget.FieldType.TEXT, label: 'Fecha de corte' });
        sublista.addField({ id: columnas.ESTADO,      type: serverWidget.FieldType.TEXT, label: 'Estado' });
        sublista.addField({ id: columnas.EXCEL,       type: serverWidget.FieldType.TEXT, label: 'Excel' });
        sublista.addField({ id: columnas.CSV,         type: serverWidget.FieldType.TEXT, label: 'CSV' });
        sublista.addField({ id: columnas.ERROR,       type: serverWidget.FieldType.TEXTAREA, label: 'Error' });

        historial.forEach((reporte, fila) => {
            sublista.setSublistValue({ id: columnas.FECHA,       line: fila, value: reporte.fecha });
            sublista.setSublistValue({ id: columnas.USUARIO,     line: fila, value: reporte.usuario });
            sublista.setSublistValue({ id: columnas.SUBSIDIARIA, line: fila, value: reporte.subsidiaria });
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
