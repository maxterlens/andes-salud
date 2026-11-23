/**
 * AS_NSP_040 — Recuento de Inventario Manual
 * @description Dibuja la pantalla del recuento. No busca ni guarda records.
 *
 *              construirFormulario se lee como indice: formulario, cabecera y,
 *              con la ubicacion elegida, la lista de articulos para marcar y el
 *              boton Generar recuento. El boton Cargar CSV abre la pantalla de
 *              carga, para elegir el recuento. El boton Descargar TXT maestro
 *              esta siempre y abre su propia pantalla (AS_TxtMaestroForm),
 *              para bajar el TXT de toda una subsidiaria sin ubicacion.
 *
 *              La lista va tapada con el aviso Cargando articulos: NetSuite
 *              dibuja la tabla antes de terminar de armarla, y un check marcado
 *              en ese rato se ve pero no se envia. El client script quita el
 *              aviso en pageInit, cuando la lista ya esta armada.
 * @NApiVersion 2.1
 * @NModuleScope Public
 * @author Andes Salud
 * @version 1.4.0
 *
 */

define(['N/ui/serverWidget', 'N/ui/message', 'N/format', '../constants/AS_RecuentoInventarioManualConstants'],
    (serverWidget, message, format, CONSTANTES) => {

    // ─────────────────────────────────────────────────────────────────────────
    // Principales
    // ─────────────────────────────────────────────────────────────────────────

    function construirFormulario(cabecera, articulos, seleccionados, cuentas, ubicaciones, alerta) {
        const form = serverWidget.createForm({ title: CONSTANTES.FORMULARIO.TITULO });

        form.clientScriptModulePath = CONSTANTES.FORMULARIO.CLIENT_SCRIPT;
        if (alerta) form.addPageInitMessage({ type: message.Type.ERROR, title: CONSTANTES.FORMULARIO.ALERTA_TITULO, message: alerta });
        form.addButton({ id: CONSTANTES.BOTONES.CSV, label: CONSTANTES.BOTONES.CSV_LABEL, functionName: 'abrirCarga' });
        form.addButton({ id: CONSTANTES.BOTONES.MAESTRO, label: CONSTANTES.BOTONES.MAESTRO_LABEL, functionName: 'abrirTxtMaestro' });
        agregarCabecera(form, cabecera, cuentas, ubicaciones);
        if (!cabecera.ubicacion) return form;
        agregarArticulos(form, articulos, seleccionados);
        form.addSubmitButton({ label: CONSTANTES.FORMULARIO.BOTON_GENERAR });

        return form;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Secundarias
    // ─────────────────────────────────────────────────────────────────────────

    function agregarCabecera(form, cabecera, cuentas, ubicaciones) {
        const grupo = CONSTANTES.GRUPOS.CABECERA;

        form.addFieldGroup({ id: grupo, label: 'Recuento' });

        const campoSubsidiaria = form.addField({
            id       : CONSTANTES.CAMPOS.SUBSIDIARIA,
            type     : serverWidget.FieldType.SELECT,
            label    : 'Subsidiaria',
            source   : 'subsidiary',
            container: grupo,
        });
        campoSubsidiaria.isMandatory  = true;
        campoSubsidiaria.defaultValue = cabecera.subsidiaria || '';
        const campoUbicacion = form.addField({
            id       : CONSTANTES.CAMPOS.UBICACION,
            type     : serverWidget.FieldType.SELECT,
            label    : 'Ubicacion',
            container: grupo,
        });
        campoUbicacion.isMandatory = true;
        campoUbicacion.addSelectOption({ value: '', text: '' });
        ubicaciones.forEach((ubicacion) => {
            if (ubicacion.subsidiaria !== cabecera.subsidiaria) return;
            campoUbicacion.addSelectOption({ value: ubicacion.id, text: ubicacion.nombre });
        });
        campoUbicacion.defaultValue = cabecera.ubicacion || '';
        const campoUbicacionesData = form.addField({
            id   : CONSTANTES.CAMPOS.UBICACIONES_DATA,
            type : serverWidget.FieldType.LONGTEXT,
            label: 'Ubicaciones',
        });
        campoUbicacionesData.defaultValue = JSON.stringify(ubicaciones);
        campoUbicacionesData.updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN });
        const campoDepartamento = form.addField({
            id       : CONSTANTES.CAMPOS.DEPARTAMENTO,
            type     : serverWidget.FieldType.SELECT,
            label    : 'Departamento',
            source   : 'department',
            container: grupo,
        });
        campoDepartamento.defaultValue = cabecera.departamento || '';
        const campoClase = form.addField({
            id       : CONSTANTES.CAMPOS.CLASE,
            type     : serverWidget.FieldType.SELECT,
            label    : 'Clase',
            source   : 'classification',
            container: grupo,
        });
        campoClase.defaultValue = cabecera.clase || '';
        const campoFecha = form.addField({
            id       : CONSTANTES.CAMPOS.FECHA,
            type     : serverWidget.FieldType.DATE,
            label    : 'Fecha',
            container: grupo,
        });
        campoFecha.isMandatory  = true;
        campoFecha.defaultValue = cabecera.fecha || format.format({ value: new Date(), type: format.Type.DATE });
        const campoCuenta = form.addField({
            id       : CONSTANTES.CAMPOS.CUENTA,
            type     : serverWidget.FieldType.SELECT,
            label    : 'Cuenta',
            container: grupo,
        });
        campoCuenta.isMandatory = true;
        campoCuenta.addSelectOption({ value: '', text: '' });
        cuentas.forEach((cuenta) => {
            if (cuenta.subsidiaria !== cabecera.subsidiaria) return;
            campoCuenta.addSelectOption({ value: cuenta.id, text: cuenta.nombre });
        });
        campoCuenta.defaultValue = cabecera.cuenta || '';
        const campoCuentasData = form.addField({
            id   : CONSTANTES.CAMPOS.CUENTAS_DATA,
            type : serverWidget.FieldType.LONGTEXT,
            label: 'Cuentas',
        });
        campoCuentasData.defaultValue = JSON.stringify(cuentas);
        campoCuentasData.updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN });
        const campoNota = form.addField({
            id       : CONSTANTES.CAMPOS.NOTA,
            type     : serverWidget.FieldType.TEXT,
            label    : 'Nota',
            container: grupo,
        });
        campoNota.defaultValue = cabecera.nota || '';
    }

    function agregarArticulos(form, articulos, seleccionados) {
        const columnas = CONSTANTES.SUBLISTA.COLUMNAS;

        const sublista = form.addSublist({
            id   : CONSTANTES.SUBLISTA.ID,
            type : serverWidget.SublistType.LIST,
            label: 'Articulos (' + articulos.length + ' en la ubicacion)',
        });
        sublista.addMarkAllButtons();
        const campoCargando = form.addField({
            id   : CONSTANTES.CAMPOS.CARGANDO,
            type : serverWidget.FieldType.INLINEHTML,
            label: 'Cargando',
        });
        campoCargando.defaultValue = '<div id="' + CONSTANTES.FORMULARIO.CARGANDO_ID + '" style="position:fixed;inset:0;'
                                   + 'z-index:9999;background:rgba(255,255,255,.5);display:flex;align-items:center;'
                                   + 'justify-content:center">'
                                   + '<div style="background:#d8e6f4;border:1px solid #a9c4e0;border-radius:3px;'
                                   + 'padding:12px 20px;min-width:360px;font-size:10pt;color:#222">'
                                   + '<div style="font-weight:bold;margin-bottom:4px">&#9432; ' + CONSTANTES.FORMULARIO.CARGANDO_TITULO + '</div>'
                                   + CONSTANTES.FORMULARIO.CARGANDO_TEXTO
                                   + '</div></div>';
        sublista.addField({
            id   : columnas.CONTAR,
            type : serverWidget.FieldType.CHECKBOX,
            label: 'Contar',
        });
        const columnaArticulo = sublista.addField({
            id   : columnas.ARTICULO,
            type : serverWidget.FieldType.TEXT,
            label: 'Id',
        });
        columnaArticulo.updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN });
        const columnaNombre = sublista.addField({
            id   : columnas.NOMBRE,
            type : serverWidget.FieldType.TEXT,
            label: 'Articulo',
        });
        columnaNombre.updateDisplayType({ displayType: serverWidget.FieldDisplayType.INLINE });
        const columnaUnidad = sublista.addField({
            id   : columnas.UNIDAD,
            type : serverWidget.FieldType.TEXT,
            label: 'Unidades',
        });
        columnaUnidad.updateDisplayType({ displayType: serverWidget.FieldDisplayType.INLINE });
        const columnaStock = sublista.addField({
            id   : columnas.STOCK,
            type : serverWidget.FieldType.FLOAT,
            label: 'Stock',
        });
        columnaStock.updateDisplayType({ displayType: serverWidget.FieldDisplayType.INLINE });

        articulos.forEach((articulo, fila) => {
            if (seleccionados.includes(articulo.id)) sublista.setSublistValue({ id: columnas.CONTAR, line: fila, value: 'T' });
            sublista.setSublistValue({ id: columnas.ARTICULO, line: fila, value: articulo.id });
            sublista.setSublistValue({ id: columnas.NOMBRE,   line: fila, value: articulo.nombre });
            if (articulo.unidad) sublista.setSublistValue({ id: columnas.UNIDAD, line: fila, value: articulo.unidad });
            sublista.setSublistValue({ id: columnas.STOCK,    line: fila, value: String(articulo.stock) });
        });
    }

    return {
        construirFormulario: construirFormulario,
    };
});
