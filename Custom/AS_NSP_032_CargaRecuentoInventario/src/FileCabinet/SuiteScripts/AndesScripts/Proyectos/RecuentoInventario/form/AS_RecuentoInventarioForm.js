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
 * @version 1.5.0
 *
 * CHANGELOG v1.5.0 (2026-10-14):
 *   - [FEAT] Boton Generar: aparece cuando el CSV cargo articulos sin errores.
 *            Viajan ocultas la operacion y la ubicacion con la que se valido.
 *   - [FEAT] El archivo deja de ser obligatorio en pantalla: Generar no lo
 *            vuelve a pedir; el handler lo exige solo al Cargar.
 *
 * CHANGELOG v1.4.0 (2026-10-13):
 *   - [FEAT] Cuenta deja de listar todas las cuentas: muestra solo las de AS
 *            Recuento Inventario Cuenta para la subsidiaria, y el client script
 *            la vuelve a filtrar al cambiar la subsidiaria.
 *
 * CHANGELOG v1.3.0 (2026-10-13):
 *   - [FEAT] El campo de solo lectura lista los errores de validacion del CSV
 *            por fila; el archivo pasa a (UBICACION, ITEM, UPC).
 *
 * CHANGELOG v1.2.0 (2026-10-13):
 *   - [FEAT] La lista queda como la del recuento nativo (UPC, Articulo, Unidades):
 *            sin FISICO ni OBSERVACION. Los codigos que no existen se muestran
 *            aparte, en un campo de solo lectura.
 *
 * CHANGELOG v1.1.0 (2026-10-09):
 *   - [FEAT] La cabecera conserva lo que lleno el usuario al cargar y debajo se
 *            listan los articulos del CSV con su observacion.
 *
 * CHANGELOG v1.0.5 (2026-10-09):
 *   - [FIX] El campo del archivo va sin grupo: NetSuite rechaza un FILE dentro de
 *           un addFieldGroup (USER_ERROR al abrir el Suitelet).
 *
 * CHANGELOG v1.0.4 (2026-10-09):
 *   - [FIX] Cabecera campo por campo, como el FormMain de AS_NSP_018: sin lista
 *           ni recorrido, cada campo se lee donde se crea.
 *
 * CHANGELOG v1.0.0 (2026-10-09):
 *   - [FEAT] construirFormulario: cabecera (subsidiaria, ubicacion, departamento,
 *            clase, fecha, cuenta, nota), campo de archivo CSV y boton Cargar.
 */
define(['N/ui/serverWidget', 'N/format', '../constants/AS_RecuentoInventarioConstants'],
    (serverWidget, format, CONSTANTES) => {

    // ─────────────────────────────────────────────────────────────────────────
    // Principales
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @param {Object} cabecera  lo que lleno el usuario; vacio la primera vez
     * @param {Array}  lineas    los articulos validos del CSV; vacio hasta que se carga
     * @param {Array}  errores   los errores de validacion del CSV, uno por fila
     * @param {Array}  cuentas   las cuentas configuradas, [{ subsidiaria, id, nombre }]
     */
    function construirFormulario(cabecera, lineas, errores, cuentas) {
        const form = serverWidget.createForm({ title: CONSTANTES.FORMULARIO.TITULO });

        form.clientScriptModulePath = CONSTANTES.FORMULARIO.CLIENT_SCRIPT;
        agregarCabecera(form, cabecera, cuentas);
        agregarArchivo(form);
        if (errores.length) agregarErrores(form, errores);
        if (lineas.length) agregarArticulos(form, lineas);
        agregarOperacion(form, cabecera);
        form.addSubmitButton({ label: CONSTANTES.FORMULARIO.BOTON_CARGAR });
        if (lineas.length && !errores.length) agregarBotonGenerar(form);

        return form;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Secundarias
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Los mismos campos y en el mismo orden que la cabecera del recuento nativo.
     * Cuenta lista solo las configuradas para la subsidiaria elegida; todas las
     * configuradas viajan en un campo oculto para que el client script la
     * vuelva a filtrar cuando cambia la subsidiaria.
     */
    function agregarCabecera(form, cabecera, cuentas) {
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
            source   : 'location',
            container: grupo,
        });
        campoUbicacion.isMandatory  = true;
        campoUbicacion.defaultValue = cabecera.ubicacion || '';
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

    /**
     * NetSuite no acepta un campo FILE dentro de un grupo, ficha o sublista
     * (USER_ERROR "Se agrego un campo no valido para cargar el archivo"): va
     * suelto en el formulario, sin container. No es obligatorio en pantalla:
     * un FILE no conserva el archivo despues del POST y Generar no lo necesita.
     */
    function agregarArchivo(form) {
        const campoArchivo = form.addField({
            id   : CONSTANTES.CAMPOS.ARCHIVO,
            type : serverWidget.FieldType.FILE,
            label: 'Archivo CSV (UBICACION, ITEM, UPC)',
        });
    }

    /**
     * Las filas del CSV que no pasaron la validacion, una por linea: se avisan
     * antes de la lista para que el usuario corrija el archivo.
     */
    function agregarErrores(form, errores) {
        const campoErrores = form.addField({
            id   : CONSTANTES.CAMPOS.ERRORES,
            type : serverWidget.FieldType.TEXTAREA,
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
        sublista.addField({ id: columnas.CODIGO,      type: serverWidget.FieldType.TEXT, label: 'UPC' });
        sublista.addField({ id: columnas.ARTICULO,    type: serverWidget.FieldType.TEXT, label: 'Articulo' });
        sublista.addField({ id: columnas.ARTICULO_ID, type: serverWidget.FieldType.TEXT, label: 'Id articulo' })
            .updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN });
        sublista.addField({ id: columnas.UNIDAD,      type: serverWidget.FieldType.TEXT, label: 'Unidades' });

        lineas.forEach((linea, fila) => {
            sublista.setSublistValue({ id: columnas.CODIGO,      line: fila, value: linea.codigo });
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

    function agregarBotonGenerar(form) {
        form.addButton({
            id          : CONSTANTES.BOTONES.GENERAR,
            label       : CONSTANTES.FORMULARIO.BOTON_GENERAR,
            functionName: 'generarRecuento',
        });
    }

    return {
        construirFormulario: construirFormulario,
    };
});
