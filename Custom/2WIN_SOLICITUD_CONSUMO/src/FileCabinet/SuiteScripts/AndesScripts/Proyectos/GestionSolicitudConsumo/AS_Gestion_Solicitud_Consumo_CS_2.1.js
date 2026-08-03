/**
 * @NApiVersion 2.1
 * @NScriptType ClientScript
 * @NModuleScope Public
 *
 * Client Script para el Suitelet de Gestión de Solicitud de Consumo.
 *
 * Responsabilidades:
 *  - Exponer como exports del módulo todas las funciones invocadas por los botones
 *    del formulario para que NetSuite las resuelva correctamente cuando
 *    form.clientScriptModulePath está configurado.
 *  - Detectar el cambio del campo Artículo en la sublista de detalle (fieldChanged).
 *  - Consultar la unidad del ítem seleccionado y poblar la columna Unidad.
 *  - Consultar el stock disponible y poblar la columna Disponible.
 *
 * Las constantes de URL (GS_BASE_URL, GS_CONSUMIR, GS_PDF, GS_MODO) son inyectadas
 * como variables globales en window por GSC_Form_Scripts.inyectarScriptsCliente.
 */
define(['N/currentRecord'], function (currentRecord) {

    currentRecord = currentRecord.get();
    const SUBLIST_ID = 'custpage_sublist_detalle';

    /**
     * pageInit — hook requerido por ClientScript.
     */
    function pageInit(context) {
        console.log('pageInit', 'CS Suitelet Solicitud Consumo iniciado');
    }

    /**
     * saveRecord — se ejecuta al hacer clic en el botón submit (addSubmitButton).
     * No se dispara cuando se llama form.submit() directamente (ej. enviarABodega).
     *
     * En modo view el único submit posible es el botón "Editar", por lo que
     * forzamos custpage_accion = 'editar' aquí para garantizar que el POST
     * llegue con la acción correcta independientemente del defaultValue del campo.
     */
    function saveRecord(context) {
        try {
            // GS_MODO es inyectado como global por GSC_Form_Scripts.inyectarScriptsCliente
            if (typeof GS_MODO !== 'undefined' && GS_MODO === 'view') {
                currentRecord.setValue('custpage_accion', 'editar');
            }
        } catch (e) {
            console.log('saveRecord - error', e);
        }
        return true;
    }

    /**
     * lineInit — se activa cuando el usuario abre una nueva línea en la sublista.
     * Copia la ubicación del header a la columna custpage_det_ubicacion de la línea nueva.
     *
     * @param {Object} context - Contexto del evento (currentRecord, sublistId)
     */
    function lineInit(context) {
        try {
            if (context.sublistId !== SUBLIST_ID) return;
            debugger;

            var rec         = context.currentRecord;
            var ubicacionId = rec.getValue({ fieldId: 'custpage_ubicacion' });
            if (ubicacionId) {
                rec.setCurrentSublistValue({
                    sublistId       : SUBLIST_ID,
                    fieldId         : 'custpage_det_ubicacion',
                    value           : ubicacionId,
                    ignoreFieldChange: true
                });
            }
            var departamentoId = rec.getValue({ fieldId: 'custpage_departamento' });
            if (departamentoId) {
                rec.setCurrentSublistValue({
                    sublistId       : SUBLIST_ID,
                    fieldId         : 'custpage_det_departamento',
                    value           : departamentoId,
                    ignoreFieldChange: true
                });
            }

        } catch (e) {
            console.log('lineInit - error', e);
        }
    }

    /**
     * fieldChanged — se activa cada vez que cambia un campo del formulario o la sublista.
     *
     * Casos manejados:
     *  1. custpage_ubicacion (header)   → actualiza custpage_det_ubicacion y recalcula
     *                                     custpage_det_disponible en TODAS las líneas.
     *  2. custpage_departamento (header) → actualiza custpage_det_departamento en TODAS las líneas.
     *  3. custpage_det_articulo (sublista) → actualiza Unidad, Disponible, Ubicación
     *                                        y Centro de Costo de la línea activa.
     *
     * @param {Object} context - Contexto del evento (currentRecord, sublistId, fieldId, line)
     */
    /**
     * fieldChanged — async para poder usar fetch() al llamar al Suitelet.
     * N/search y N/record no se usan aquí; todas las consultas van al servidor.
     */
    async function fieldChanged(context) {
        try {
            // ── Cambio de Subsidiaria en el header ────────────────────────────
            // Limpia el select de ubicaciones y lo repuebla con las ubicaciones
            // de la nueva subsidiaria, consultando al Suitelet para evitar N/search.
            if (!context.sublistId && context.fieldId === 'custpage_subsidiaria') {
                var rec           = context.currentRecord;
                var subsidiariaId = rec.getValue({ fieldId: 'custpage_subsidiaria' });

                // Limpiar el select de ubicaciones en el DOM
                let ubicacionField = rec.getField('custpage_ubicacion');
                if (ubicacionField) ubicacionField.removeSelectOption({ value: null });

                if (!subsidiariaId) return;
                // Consultar ubicaciones de la subsidiaria al Suitelet
                var apiUrl     = window.GS_BASE_URL + '&op=buscarUbicaciones'
                    + '&subsidiaria=' + encodeURIComponent(subsidiariaId);
                var resp       = await fetch(apiUrl);
                var ubicaciones = await resp.json();
                ubicacionField.insertSelectOption({ value: '', text: '' })
                ubicaciones.forEach(function (u) {
                    ubicacionField.insertSelectOption({
                        value: u.id,
                        text: u.name
                    })
                });
                currentRecord.cancelLine({ sublistId: SUBLIST_ID })
                return;
            }

            // ── Cambio de Ubicación en el header ─────────────────────────────
            if (!context.sublistId && context.fieldId === 'custpage_ubicacion') {
                var rec         = context.currentRecord;
                var ubicacionId = rec.getValue({ fieldId: 'custpage_ubicacion' });
                var lineCount   = rec.getLineCount({ sublistId: SUBLIST_ID });
                for (var i = 0; i < lineCount; i++) {
                    rec.selectLine({ sublistId: SUBLIST_ID, line: i });

                    rec.setCurrentSublistValue({
                        sublistId       : SUBLIST_ID,
                        fieldId         : 'custpage_det_ubicacion',
                        value           : ubicacionId || '',
                        ignoreFieldChange: true
                    });

                    var articuloId = rec.getCurrentSublistValue({ sublistId: SUBLIST_ID, fieldId: 'custpage_det_articulo' });
                    var disponible = 0;
                    if (articuloId && ubicacionId) {
                        var apiUrl = window.GS_BASE_URL + '&op=buscarArticulo'
                            + '&articulo='  + encodeURIComponent(articuloId)
                            + '&ubicacion=' + encodeURIComponent(ubicacionId);
                        var resp  = await fetch(apiUrl);
                        var datos = await resp.json();
                        disponible = datos.disponible || 0;
                    }

                    rec.setCurrentSublistValue({
                        sublistId       : SUBLIST_ID,
                        fieldId         : 'custpage_det_disponible',
                        value           : disponible,
                        ignoreFieldChange: true
                    });

                    rec.commitLine({ sublistId: SUBLIST_ID });
                }
                currentRecord.cancelLine({ sublistId: SUBLIST_ID })
                return;
            }

            // ── Cambio de Departamento en el header ───────────────────────────
            if (!context.sublistId && context.fieldId === 'custpage_departamento') {
                var rec            = context.currentRecord;
                var departamentoId = rec.getValue({ fieldId: 'custpage_departamento' });
                var lineCount      = rec.getLineCount({ sublistId: SUBLIST_ID });
                for (var i = 0; i < lineCount; i++) {
                    rec.selectLine({ sublistId: SUBLIST_ID, line: i });
                    rec.setCurrentSublistValue({
                        sublistId        : SUBLIST_ID,
                        fieldId          : 'custpage_det_departamento',
                        value            : departamentoId || '',
                        ignoreFieldChange: true
                    });
                    rec.commitLine({ sublistId: SUBLIST_ID });
                }
                currentRecord.cancelLine({ sublistId: SUBLIST_ID })
                return;
            }

            if (context.sublistId !== SUBLIST_ID)             return;
            if (context.fieldId  !== 'custpage_det_articulo') return;

            var rec         = context.currentRecord;
            var articuloId  = rec.getCurrentSublistValue({ sublistId: SUBLIST_ID, fieldId: 'custpage_det_articulo' });
            var ubicacionId = rec.getValue({ fieldId: 'custpage_ubicacion' });

            // Sin artículo: limpiar campos derivados
            if (!articuloId) {
                rec.setCurrentSublistValue({ sublistId: SUBLIST_ID, fieldId: 'custpage_det_unidad',       value: '',  ignoreFieldChange: true });
                rec.setCurrentSublistValue({ sublistId: SUBLIST_ID, fieldId: 'custpage_det_unidad_id',    value: '',  ignoreFieldChange: true });
                rec.setCurrentSublistValue({ sublistId: SUBLIST_ID, fieldId: 'custpage_det_disponible',   value: 0,   ignoreFieldChange: true });
                rec.setCurrentSublistValue({ sublistId: SUBLIST_ID, fieldId: 'custpage_det_ubicacion',    value: '',  ignoreFieldChange: true });
                rec.setCurrentSublistValue({ sublistId: SUBLIST_ID, fieldId: 'custpage_det_departamento', value: '',  ignoreFieldChange: true });
                return;
            }

            // ── Consultar unidad y stock al Suitelet (sin N/search en cliente) ──
            var apiUrl = window.GS_BASE_URL + '&op=buscarArticulo'
                + '&articulo='  + encodeURIComponent(articuloId)
                + '&ubicacion=' + encodeURIComponent(ubicacionId || '');
            var resp  = await fetch(apiUrl);
            var datos = await resp.json();

            rec.setCurrentSublistValue({ sublistId: SUBLIST_ID, fieldId: 'custpage_det_unidad',     value: datos.unidadTxt || '', ignoreFieldChange: true });
            rec.setCurrentSublistValue({ sublistId: SUBLIST_ID, fieldId: 'custpage_det_unidad_id',  value: datos.unidadId  || '', ignoreFieldChange: true });
            rec.setCurrentSublistValue({ sublistId: SUBLIST_ID, fieldId: 'custpage_det_disponible', value: datos.disponible || 0, ignoreFieldChange: true });

            // ── Ubicación y Centro de Costo heredados del header ──────────────
            var departamentoId = rec.getValue({ fieldId: 'custpage_departamento' });
            if (ubicacionId)    rec.setCurrentSublistValue({ sublistId: SUBLIST_ID, fieldId: 'custpage_det_ubicacion',    value: ubicacionId,    ignoreFieldChange: true });
            if (departamentoId) rec.setCurrentSublistValue({ sublistId: SUBLIST_ID, fieldId: 'custpage_det_departamento', value: departamentoId, ignoreFieldChange: true });

        } catch (e) {
            console.error('fieldChanged - error', e);
        }
    }

    /* =========================================================
     * FUNCIONES DE ACCIÓN DE BOTONES
     * Las constantes GS_BASE_URL, GS_CONSUMIR, GS_PDF, GS_MODO
     * son inyectadas como globales por GSC_Form_Scripts.inyectarScriptsCliente.
     * ========================================================= */

    /** Navega al modo edición del registro. */
    function irAEditar(id) {
        window.location.href = window.GS_BASE_URL + '&op=edit&recid=' + id;
    }

    /** Navega al modo vista del registro. */
    function irAVer(id) {
        window.location.href = window.GS_BASE_URL + '&op=view&recid=' + id;
    }

    /** Vuelve a la página anterior. */
    function cancelar() {
        history.back();
    }

    /**
     * Envía la solicitud a bodega desde el modo vista.
     * Redirige al Suitelet (op=enviar) para que el cambio de estado
     * se ejecute en servidor, evitando usar N/record en el cliente.
     */
    function enviarABodega(id) {
        if (!confirm('¿Enviar esta solicitud a bodega?')) return;
        window.location.href = window.GS_BASE_URL + '&op=enviar&recid=' + id;
    }

    /**
     * Confirma el envío a bodega desde el modo edición.
     * Los campos del header ya están en el formulario; solo cambia la acción.
     */
    function confirmarEnvio() {
        if (!confirm('¿Guardar y enviar esta solicitud a bodega?')) return;
        currentRecord.setValue('custpage_accion', 'enviar');
        document.querySelector('form').submit();
    }

    /** Redirige al Suitelet de consumo para generar los ajustes de inventario. */
    function consumirSolicitud(id) {
        if (!confirm('¿Confirmar consumo? Se generarán los ajustes de inventario.')) return;
        window.location.href = window.GS_CONSUMIR + '&solicitud=' + id;
    }

    /**
     * Abre en nueva pestaña el PDF de constancia de entrega.
     * Usa AS_ImpresionPDF_STLT_2.1.js en modo B (FTL personalizado),
     * que carga los datos desde el custom record sin requerir permisos
     * sobre ningún Advanced PDF Template nativo de NetSuite.
     */
    function generarPdf(id) {
        if (!confirm('¿Generar PDF de constancia de entrega?')) return;
        var pdfUrl = window.GS_PDF
            + '&id='         + id
            + '&recordtype=customrecord_2win_solicitud_consumo'
            + '&reportname=solicitudconsumo_pdf'
            + '&filetype=pdf'
            + '&mode=view';
        window.open(pdfUrl, '_blank');
    }

    return {
        // Hooks
        pageInit,
        saveRecord,
        lineInit,
        fieldChanged,
        // Acciones de botones
        irAEditar,
        irAVer,
        cancelar,
        enviarABodega,
        confirmarEnvio,
        consumirSolicitud,
        generarPdf
    };
});
