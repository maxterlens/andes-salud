/**
 * @NApiVersion 2.1
 * @NModuleScope Public
 *
 * GSC_Form_Header — Construcción de los campos del header en el formulario serverWidget.
 *
 * Responsabilidades:
 *  - Agregar los grupos de campos (izquierdo, central, derecho) al form.
 *  - Renderizar cada campo del header con su tipo, valor por defecto y displayType
 *    según el modo (view | create | edit).
 *  - Cargar opciones de SELECTs (subsidiaria, departamento, clase, ubicación) desde
 *    los catálogos provistos como parámetro (evita llamadas duplicadas al DAO).
 *
 * No realiza búsquedas ni accede a registros de NetSuite directamente.
 */
define(['N/ui/serverWidget', '../lib/GSC_Lib_Utils'], function (serverWidget, utils) {

    const ESTADO_LABEL = {
        '7': 'Envío Pendiente',
        '8': 'Enviada',
        '9': 'Cerrada'
    };

    /**
     * Agrega al formulario todos los campos del header de la Solicitud de Consumo.
     *
     * @param {serverWidget.Form} form      - Formulario serverWidget
     * @param {object}            datos     - Objeto plano con valores del registro (de GSC_Dao_SolicitudConsumo.cargar)
     *                                        o valores por defecto para modo create
     * @param {string}            modo      - 'view' | 'create' | 'edit'
     * @param {object}            catalogos - { subsidiarias, departamentos, clases, ubicaciones }
     *                                        arrays precargados desde GSC_Dao_Catalogos
     */
    function agregarCamposHeader(form, datos, modo, catalogos, opciones) {
        opciones = opciones || {};
        var isView   = modo === 'view';
        var isCreate = modo === 'create';

        var INLINE   = serverWidget.FieldDisplayType.INLINE;
        var HIDDEN   = serverWidget.FieldDisplayType.HIDDEN;

        // ── Grupo izquierdo ────────────────────────────────────────────────
        /*var grpLeft = form.addFieldGroup({ id: 'custpage_grp_left', label: ' ' });
        grpLeft.isBorderHidden = true;*/

        // ID del registro (solo view/edit)
        //if (!isCreate) {
            var fldId = form.addField({
                id       : 'custpage_sol_id',
                type     : serverWidget.FieldType.TEXT,
                label    : 'InternaldId',
                //container: 'custpage_grp_left'
            });
            fldId.defaultValue = isCreate ? 'A generar' : datos.id || '';
            fldId.updateDisplayType({ displayType: HIDDEN });
        //}
        
        // ID del registro (solo view/edit)
        //if (!isCreate) {
            var fldName = form.addField({
                id       : 'custpage_sol_name',
                type     : serverWidget.FieldType.TEXT,
                label    : 'ID',
                //container: 'custpage_grp_left'
            });
            fldName.defaultValue = isCreate ? 'A generar' : datos.name || '';
            fldName.updateDisplayType({ displayType: INLINE });
        //}

        // Solicitante (siempre inline — auto-poblado en creación)
        var fldSol = form.addField({
            id       : 'custpage_solicitante',
            type     : serverWidget.FieldType.SELECT,
            label    : 'Solicitante',
            source   : 'employee',
            //container: 'custpage_grp_left'
        });
        fldSol.defaultValue = datos.custrecord_2win_consumo_solicitante || '';
        fldSol.updateDisplayType({ displayType: INLINE });

        // Fecha
        var fldFecha = form.addField({
            id       : 'custpage_fecha',
            type     : serverWidget.FieldType.DATE,
            label    : 'Fecha *',
            //container: 'custpage_grp_left'
        });
        fldFecha.defaultValue = utils.formatDate(datos.custrecord_2win_consumo_fecha) || utils.formatDate(new Date());
        if (isView) fldFecha.updateDisplayType({ displayType: INLINE });

        // Nota
        var fldNota = form.addField({
            id       : 'custpage_nota',
            type     : serverWidget.FieldType.TEXTAREA,
            label    : 'Nota',
            //container: 'custpage_grp_left'
        });
        fldNota.defaultValue = datos.custrecord_2win_consumo_nota || '';
        if (isView) fldNota.updateDisplayType({ displayType: INLINE });

        // ── Grupo central ──────────────────────────────────────────────────
        var grpCenter = form.addFieldGroup({ id: 'custpage_grp_center', label: ' ' });
        grpCenter.isBorderHidden = true;

        // Estado (siempre inline)
        var fldEstado = form.addField({
            id       : 'custpage_estado_txt',
            type     : serverWidget.FieldType.TEXT,
            label    : 'Estado del Documento',
            //container: 'custpage_grp_center'
        });
        var estadoId = datos.custrecord_2win_consumo_estado || '7';
        fldEstado.defaultValue = ESTADO_LABEL[estadoId] || estadoId;
        fldEstado.updateDisplayType({ displayType: INLINE });
        fldEstado.isMandatory = true;

        // Cuenta de Consumo (siempre inline)
        var fldCuenta = form.addField({
            id       : 'custpage_cuenta',
            type     : serverWidget.FieldType.SELECT,
            label    : 'Cuenta de Consumo',
            source   : 'account'
            //container: 'custpage_grp_center'
        });
        fldCuenta.defaultValue = datos.custrecord_2win_consumo_cuenta_consumo || '';
        fldCuenta.updateDisplayType({ displayType: INLINE });
        fldCuenta.isMandatory = true;

        // Subsidiaria
        var fldSubsidiaria = form.addField({
            id       : 'custpage_subsidiaria',
            type     : serverWidget.FieldType.SELECT,
            label    : 'Subsidiaria',
            //container: 'custpage_grp_center'
        });
        fldSubsidiaria.isMandatory = true;
        fldSubsidiaria.addSelectOption({ value: '', text: '' });
        (catalogos.subsidiarias || []).forEach(function (s) {
            fldSubsidiaria.addSelectOption({ value: s.id, text: s.name });
        });
        fldSubsidiaria.defaultValue = String(datos.custrecord_2win_consumo_subsidiaria || '');
        if (isView) fldSubsidiaria.updateDisplayType({ displayType: INLINE });
        //else if (opciones.disableSubsidiaria) fldSubsidiaria.updateDisplayType({ displayType: serverWidget.FieldDisplayType.DISABLED });

        // Centro de Costo (Departamento)
        var fldDepart = form.addField({
            id       : 'custpage_departamento',
            type     : serverWidget.FieldType.SELECT,
            label    : 'Centro de Costo',
            //container: 'custpage_grp_center'
        });
        fldDepart.isMandatory = true;
        fldDepart.addSelectOption({ value: '', text: '' });
        (catalogos.departamentos || []).forEach(function (d) {
            fldDepart.addSelectOption({ value: d.id, text: d.name });
        });
        fldDepart.defaultValue = String(datos.custrecord_2win_consumo_departamento || '');
        if (isView) fldDepart.updateDisplayType({ displayType: INLINE });

        // Clase
        var fldClase = form.addField({
            id       : 'custpage_clase',
            type     : serverWidget.FieldType.SELECT,
            label    : 'Clase',
            //container: 'custpage_grp_center'
        });
        fldClase.addSelectOption({ value: '', text: '' });
        (catalogos.clases || []).forEach(function (c) {
            fldClase.addSelectOption({ value: c.id, text: c.name });
        });
        fldClase.defaultValue = String(datos.custrecord_2win_consumo_clase || '');
        if (isView) fldClase.updateDisplayType({ displayType: INLINE });

        // Ubicación — opciones cargadas vía N/search (bypass restricción rol)
        var fldUbicacion = form.addField({
            id       : 'custpage_ubicacion',
            type     : serverWidget.FieldType.SELECT,
            label    : 'Ubicación',
            //container: 'custpage_grp_center'
        });
        fldUbicacion.isMandatory = true;
        fldUbicacion.addSelectOption({ value: '', text: '' });
        (catalogos.ubicaciones || []).forEach(function (u) {
            fldUbicacion.addSelectOption({ value: u.id, text: u.name });
        });
        fldUbicacion.defaultValue = String(datos.custrecord_2win_consumo_ubicacion || '');
        if (isView) fldUbicacion.updateDisplayType({ displayType: INLINE });

        // ── Grupo derecho ──────────────────────────────────────────────────
        var grpRight = form.addFieldGroup({ id: 'custpage_grp_right', label: ' ' });
        grpRight.isBorderHidden = true;

        // Comentarios (siempre editable en todos los modos)
        var fldComentarios = form.addField({
            id       : 'custpage_comentarios',
            type     : serverWidget.FieldType.TEXTAREA,
            label    : 'Comentarios',
            //container: 'custpage_grp_right'
        });
        fldComentarios.defaultValue = datos.custrecord_2win_consumo_comentarios || '';
        if (isView) fldComentarios.updateDisplayType({ displayType: INLINE });

        // IDs de Ajustes (siempre inline, solo en view/edit)
        if (!isCreate) {
            var fldAjustes = form.addField({
                id       : 'custpage_ajustes_ids_txt',
                type     : serverWidget.FieldType.TEXTAREA,
                label    : 'IDs de Ajustes',
                //container: 'custpage_grp_right'
            });
            fldAjustes.defaultValue = datos.custrecord_2win_consumo_ajustes_ids || '';
            fldAjustes.updateDisplayType({ displayType: INLINE });
        }
    }

    return {
        agregarCamposHeader
    };
});
