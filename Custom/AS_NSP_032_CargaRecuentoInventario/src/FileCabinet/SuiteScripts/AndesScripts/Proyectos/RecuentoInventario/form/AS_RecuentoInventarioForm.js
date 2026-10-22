/**
 * AS_NSP_032 — Carga de Recuento de Inventario
 * @description Dibuja la pantalla de carga. No busca ni guarda records.
 *
 *              construirFormulario se lee como indice: formulario, cabecera,
 *              archivo, articulos cargados, el boton Cargar y, si el CSV paso
 *              la validacion, el boton Generar.
 * @NApiVersion 2.1
 * @NModuleScope Public
 * @author Andes Salud
 * @version 1.7.0

 */

define(['N/ui/serverWidget', 'N/ui/message', 'N/format', '../constants/AS_RecuentoInventarioConstants'],
    (serverWidget, message, format, CONSTANTES) => {

    // ─────────────────────────────────────────────────────────────────────────
    // Principales
    // ─────────────────────────────────────────────────────────────────────────

    function construirFormulario(cabecera, lineas, errores, cuentas, ubicaciones, alerta) {
        const form = serverWidget.createForm({ title: CONSTANTES.FORMULARIO.TITULO });

        form.clientScriptModulePath = CONSTANTES.FORMULARIO.CLIENT_SCRIPT;
        if (alerta) form.addPageInitMessage({ type: message.Type.ERROR, title: CONSTANTES.FORMULARIO.ALERTA_TITULO, message: alerta });
        agregarCabecera(form, cabecera, cuentas, ubicaciones);
        agregarArchivo(form);
        if (errores.length) agregarErrores(form, errores);
        if (lineas.length) agregarArticulos(form, lineas);
        agregarOperacion(form, cabecera);
        form.addSubmitButton({ label: CONSTANTES.FORMULARIO.BOTON_CARGAR });
        if (lineas.length && !errores.length) {
            form.addButton({ id: CONSTANTES.BOTONES.GENERAR, label: CONSTANTES.FORMULARIO.BOTON_GENERAR, functionName: 'generarRecuento' });
        }

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

    function agregarArchivo(form) {
        form.addField({
            id   : CONSTANTES.CAMPOS.ARCHIVO,
            type : serverWidget.FieldType.FILE,
            label: 'Archivo CSV (UBICACION, ITEM)',
        });
    }

    /**
     * Las filas del CSV que no pasaron la validacion, una por linea: se avisan
     * antes de la lista para que el usuario corrija el archivo.
     */
    function agregarErrores(form, errores) {
        const campoErrores = form.addField({
            id   : CONSTANTES.CAMPOS.ERRORES,
            type : serverWidget.FieldType.LONGTEXT,
            label: 'Errores del archivo (' + errores.length + ')',
        });
        campoErrores.defaultValue = errores.join('\n');
        campoErrores.updateDisplayType({ displayType: serverWidget.FieldDisplayType.INLINE });
    }

    /**
     * Una fila por articulo valido, igual que la lista del recuento nativo.
     * NetSuite no acepta un valor vacio en setSublistValue: la unidad se escribe
     * solo si el articulo la tiene.
     */
    function agregarArticulos(form, lineas) {
        const columnas = CONSTANTES.SUBLISTA.COLUMNAS;

        const sublista = form.addSublist({
            id   : CONSTANTES.SUBLISTA.ID,
            type : serverWidget.SublistType.LIST,
            label: 'Articulos (' + lineas.length + ')',
        });
        sublista.addField({ id: columnas.ARTICULO,    type: serverWidget.FieldType.TEXT, label: 'Articulo' });
        sublista.addField({ id: columnas.ARTICULO_ID, type: serverWidget.FieldType.TEXT, label: 'Id articulo' })
            .updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN });
        sublista.addField({ id: columnas.UNIDAD,      type: serverWidget.FieldType.TEXT, label: 'Unidades' });

        lineas.forEach((linea, fila) => {
            sublista.setSublistValue({ id: columnas.ARTICULO_ID, line: fila, value: linea.articuloId });
            sublista.setSublistValue({ id: columnas.ARTICULO,    line: fila, value: linea.articulo });
            if (linea.unidad) sublista.setSublistValue({ id: columnas.UNIDAD, line: fila, value: linea.unidad });
        });
    }

    /**
     * Cargar envia el formulario con la operacion por defecto; Generar la cambia
     * en el client script antes de enviarlo. La ubicacion cargada es con la que
     * se valido el CSV: si el usuario la cambia, el handler pide cargar de nuevo.
     */
    function agregarOperacion(form, cabecera) {
        const campoOperacion = form.addField({
            id   : CONSTANTES.CAMPOS.OPERACION,
            type : serverWidget.FieldType.TEXT,
            label: 'Operacion',
        });
        campoOperacion.defaultValue = CONSTANTES.OPERACIONES.CARGAR;
        campoOperacion.updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN });
        const campoUbicacionCargada = form.addField({
            id   : CONSTANTES.CAMPOS.UBICACION_CARGADA,
            type : serverWidget.FieldType.TEXT,
            label: 'Ubicacion cargada',
        });
        campoUbicacionCargada.defaultValue = cabecera.ubicacion || '';
        campoUbicacionCargada.updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN });
    }

    return {
        construirFormulario: construirFormulario,
    };
});
