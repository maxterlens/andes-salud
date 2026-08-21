/**
 * AS_NSP_014 — Reporte Analítico de Cuentas Consolidado
 * @description Handler de la vista de detalle histórico (op=detail).
 *              Recibe el parámetro fileId (= custrecord_as_log_rep_anal_cta_id_a_data)
 *              y renderiza la cabecera del log + sección de detalle del contenido del archivo.
 *
 *              TODO: Completar _buildDetalleSection con campos y/o sublista
 *              según la estructura del archivo de datos (idCsv).
 *
 * @NApiVersion 2.1
 * @NModuleScope Public
 */
define([
    'N/ui/serverWidget',
    'N/url',
    '../../repositories/LogReporteAnaliticoCuentasRepository',
], function (serverWidget, url, repository) {

    const SL_SCRIPT_ID = 'customscript_as_rpt_anlt_cuenta_cons_sl';
    const SL_DEPLOY_ID = 'customdeploy_as_rpt_anlt_cuenta_cons_sl';

    /* ─────────────────────────────────────────────────────────────── */
    /*  GET — Renderiza el formulario de detalle                       */
    /* ─────────────────────────────────────────────────────────────── */
    /**
     * @param {Object}        context  - Contexto del Suitelet
     * @param {string|number} fileId   - ID del archivo de datos (parámetro de URL)
     */
    function handleGet(context, fileId) {

        /* URL base del suitelet para el link de volver */
        const suiteletUrl = url.resolveScript({
            scriptId         : SL_SCRIPT_ID,
            deploymentId     : SL_DEPLOY_ID,
            returnExternalUrl: false,
        });

        /* Crear formulario de detalle */
        const form = serverWidget.createForm({
            title: 'Detalle del Reporte Analítico de Cuentas Consolidado',
        });

        /* ── Link de regreso ────────────────────────────────────── */
        form.addField({
            id   : 'custpage_det_link_volver',
            type : serverWidget.FieldType.INLINEHTML,
            label: ' ',
        }).defaultValue = `<a href="${suiteletUrl}" style="font-weight:bold;">&#8592; Volver al listado</a>`;

        /* ── Validación de fileId ────────────────────────────────── */
        if (!fileId) {
            form.addField({
                id   : 'custpage_det_no_fileid',
                type : serverWidget.FieldType.INLINEHTML,
                label: ' ',
            }).defaultValue = _banner('No se recibió el parámetro fileId. Por favor vuelva al listado y seleccione un reporte.', 'warning');

            context.response.writePage(form);
            return;
        }

        /* ── Sección de cabecera (info del log) ─────────────────── */
        _buildCabeceraSection(form, fileId);

        /* ── Sección de detalle (contenido del archivo) ─────────── */
        _buildDetalleSection(form, fileId);

        context.response.writePage(form);
    }

    /* ─────────────────────────────────────────────────────────────── */
    /*  Sección cabecera — info del registro de log                   */
    /* ─────────────────────────────────────────────────────────────── */
    function _buildCabeceraSection(form, fileId) {
        form.addFieldGroup({ id: 'custpage_grp_cab', label: 'Información del Reporte' });

        /* Buscar el registro del log por idCsv */
        let logData = null;
        try {
            logData = repository.getByArchivoDataId(fileId);
        } catch (e) {
            log.error({ title: '_buildCabeceraSection — Error buscando log', details: e });
        }

        /* Poblar campos de cabecera (INLINE = solo lectura) */
        _addInlineField(form, 'custpage_det_id_arch',    'ID Archivo Datos', fileId,                          'custpage_grp_cab');
        _addInlineField(form, 'custpage_det_estado',     'Estado',           logData ? logData.estado    : '—', 'custpage_grp_cab');
        _addInlineField(form, 'custpage_det_subsidiar',  'Subsidiaria',      logData ? logData.subsidiaria: '—', 'custpage_grp_cab');
        _addInlineField(form, 'custpage_det_fec_corte',  'Fecha de Corte',   logData ? logData.fechaCorte : '—', 'custpage_grp_cab');
        _addInlineField(form, 'custpage_det_usuario',    'Usuario',          logData ? logData.usuario    : '—', 'custpage_grp_cab');
        _addInlineField(form, 'custpage_det_nom_xls',    'Nombre Archivo',   logData ? logData.nombreXls  : '—', 'custpage_grp_cab');

        /* Link de descarga del XLS desde cabecera */
        if (logData && logData.idXls) {
            form.addField({
                id       : 'custpage_det_link_xls',
                type     : serverWidget.FieldType.INLINEHTML,
                label    : 'Descargar Excel',
                container: 'custpage_grp_cab',
            }).defaultValue = `<a href="/core/media/media.nl?id=${logData.idXls}" target="_blank">&#11015; Descargar archivo Excel</a>`;
        }
    }

    /* ─────────────────────────────────────────────────────────────── */
    /*  Sección detalle — contenido del archivo de datos              */
    /*                                                                 */
    /*  TODO: Implementar cuando se defina la estructura del archivo  */
    /*  El fileId corresponde a custrecord_as_log_rep_anal_cta_id_a_data  */
    /*  que almacena el ID del archivo de datos en el File Cabinet.   */
    /* ─────────────────────────────────────────────────────────────── */
    function _buildDetalleSection(form, fileId) {
        form.addFieldGroup({ id: 'custpage_grp_det', label: 'Detalle del Contenido' });

        /* ── Placeholder hasta implementación completa ────────────── */
        form.addField({
            id       : 'custpage_det_pendiente',
            type     : serverWidget.FieldType.INLINEHTML,
            label    : ' ',
            container: 'custpage_grp_det',
        }).defaultValue = _banner(
            `Sección de detalle pendiente de implementación (fileId: <strong>${fileId}</strong>). ` +
            'Se completará cuando se defina la estructura del archivo de datos.',
            'warning'
        );

        /* ══════════════════════════════════════════════════════════
         *  PUNTO DE EXTENSIÓN — Sublista de detalle
         *  Descomentar y completar cuando se defina la estructura.
         * ══════════════════════════════════════════════════════════
         *
         * Opción A — Sublista de líneas del reporte:
         *
         * const slDetalle = form.addSublist({
         *     id   : 'custpage_sl_detalle',
         *     type : serverWidget.SublistType.LIST,
         *     label: 'Líneas del Reporte',
         * });
         * slDetalle.addField({ id: 'custpage_det_col_cuenta', type: serverWidget.FieldType.TEXT,  label: 'Cuenta'     });
         * slDetalle.addField({ id: 'custpage_det_col_nombre', type: serverWidget.FieldType.TEXT,  label: 'Nombre'     });
         * slDetalle.addField({ id: 'custpage_det_col_saldo',  type: serverWidget.FieldType.TEXT,  label: 'Saldo'      });
         * // ... agregar más columnas según estructura del archivo
         *
         * // Cargar y parsear el archivo de datos:
         * // const archivoData = file.load({ id: fileId });
         * // const lineas = JSON.parse(archivoData.getContents());
         * // lineas.forEach(function(linea, i) {
         * //     slDetalle.setSublistValue({ id: 'custpage_det_col_cuenta', line: i, value: linea.cuenta });
         * //     ...
         * // });
         *
         * ══════════════════════════════════════════════════════════ */
    }

    /* ─── Utilidades privadas ────────────────────────────────────── */

    function _addInlineField(form, id, label, value, container) {
        const opts = { id, type: serverWidget.FieldType.TEXT, label };
        if (container) opts.container = container;
        const fld = form.addField(opts);
        fld.defaultValue = value || '';
        fld.updateDisplayType({ displayType: serverWidget.FieldDisplayType.INLINE });
        return fld;
    }

    function _banner(mensaje, tipo) {
        const colores = {
            success : 'color:#155724;background:#d4edda;border-color:#c3e6cb;',
            error   : 'color:#721c24;background:#f8d7da;border-color:#f5c6cb;',
            warning : 'color:#856404;background:#fff3cd;border-color:#ffc107;',
        };
        const iconos = { success: '&#10003;', error: '&#9888;', warning: '&#9888;' };
        const estilo = colores[tipo] || colores.warning;
        return `<div style="${estilo}padding:10px 16px;border:1px solid;border-radius:4px;margin:4px 0;">${iconos[tipo] || ''} ${mensaje}</div>`;
    }

    return { handleGet };
});
