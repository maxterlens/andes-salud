/**
 * AS_NSP_014 — Reporte Analítico de Cuentas Consolidado
 * @description Módulo constructor del formulario principal del Suitelet.
 *              Responsabilidad: definir la UI (campos, sublista, layout).
 *              No contiene lógica de negocio ni llamadas a N/search.
 *
 * @NApiVersion 2.1
 * @NModuleScope Public
 */
define(['N/ui/serverWidget'], function (serverWidget) {

    /* ─── IDs de campos de filtro ────────────────────────────────── */
    const FILTROS = Object.freeze({
        SUBSIDIARIA      : 'custpage_fil_subsidiaria',
        FECHA            : 'custpage_fil_fecha',
        CUENTA_CONTABLE  : 'custpage_fil_cuenta_cont',
        CLIENTE          : 'custpage_fil_cliente',
        PROVEEDOR        : 'custpage_fil_proveedor',
        FOLIO            : 'custpage_fil_folio',
    });

    /* ─── IDs de columnas de la sublista de logs ─────────────────── */
    const COLS = Object.freeze({
        FECHA_CREACION : 'custpage_col_fec_crea',
        USUARIO        : 'custpage_col_usuario',
        SUBSIDIARIA    : 'custpage_col_subsidiar',
        FECHA_CORTE    : 'custpage_col_fecha_corte',
        NOMBRE_XLS     : 'custpage_col_nom_xls',
        LINK_DESCARGA  : 'custpage_col_link_xls',
        LINK_DETALLE   : 'custpage_col_link_det',  // columna oculta (display:none)
    });

    const SUBLIST_ID = 'custpage_sl_logs';

    /* ─────────────────────────────────────────────────────────────── */
    /**
     * Construye y devuelve el formulario principal del Suitelet.
     *
     * @param {Object}  opts
     * @param {string}  opts.suiteletUrl     - URL base del suitelet (para armar links de detalle)
     * @param {Array}   opts.logs            - Resultados del repositorio (LogReporteAnaliticoCuentasRepository.getAll)
     * @param {Object}  [opts.filtros={}]    - Valores de filtros a repopular en el form
     * @param {string}  [opts.mensajeExito]  - Banner verde de éxito post-submit
     * @param {string}  [opts.mensajeError]  - Banner rojo de error
     * @returns {serverWidget.Form}
     */
    function buildForm(opts) {
        const {
            suiteletUrl,
            logs         = [],
            filtros      = {},
            mensajeExito = '',
            mensajeError = '',
        } = opts;

        /* ── Crear formulario ──────────────────────────────────────── */
        const form = serverWidget.createForm({
            title: 'Generador de Reporte Analítico de Cuentas Consolidado',
        });

        /* ── Banners de estado ─────────────────────────────────────── */
        if (mensajeExito) {
            form.addField({
                id   : 'custpage_banner_ok',
                type : serverWidget.FieldType.INLINEHTML,
                label: ' ',
            }).defaultValue = _banner(mensajeExito, 'success');
        }
        if (mensajeError) {
            form.addField({
                id   : 'custpage_banner_err',
                type : serverWidget.FieldType.INLINEHTML,
                label: ' ',
            }).defaultValue = _banner(mensajeError, 'error');
        }

        /* ── Grupo de filtros ──────────────────────────────────────── */
        form.addFieldGroup({ id: 'custpage_grp_filtros', label: 'Filtros' });

        _addField(form, {
            id       : FILTROS.SUBSIDIARIA,
            type     : serverWidget.FieldType.SELECT,
            label    : 'Subsidiaria',
            source   : 'subsidiary',
            container: 'custpage_grp_filtros',
            value    : filtros.subsidiaria,
        }).isMandatory = true;
        _addField(form, {
            id       : FILTROS.CUENTA_CONTABLE,
            type     : serverWidget.FieldType.SELECT,
            label    : 'Cuenta Contable',
            source   : 'account',
            container: 'custpage_grp_filtros',
            value    : filtros.cuentaContable,
        })
        _addField(form, {
            id       : FILTROS.FECHA,
            type     : serverWidget.FieldType.DATE,
            label    : 'Fecha de Corte',
            container: 'custpage_grp_filtros',
            value    : filtros.fecha,
        }).updateDisplaySize({
            height : 60,
            width : 25
        }).isMandatory = true;
        _addField(form, {
            id       : FILTROS.CLIENTE,
            type     : serverWidget.FieldType.SELECT,
            label    : 'Cliente',
            container: 'custpage_grp_filtros',
            value    : filtros.cliente,
            source   : 'customer'
        });
        _addField(form, {
            id       : FILTROS.PROVEEDOR,
            type     : serverWidget.FieldType.SELECT,
            label    : 'Proveedor',
            container: 'custpage_grp_filtros',
            value    : filtros.proveedor,
            source   : 'vendor'
        });
        _addField(form, {
            id       : FILTROS.FOLIO,
            type     : serverWidget.FieldType.TEXT,
            label    : 'Folio',
            container: 'custpage_grp_filtros',
            value    : filtros.folio,
        }).updateDisplaySize({
            height : 60,
            width : 20
        });

        /* ── Botón submit ──────────────────────────────────────────── */
        form.addSubmitButton({ label: 'Generar Reporte' });

        /* ── Sublista de histórico de logs ─────────────────────────── */
        const sl = form.addSublist({
            id   : SUBLIST_ID,
            type : serverWidget.SublistType.LIST,
            label: 'Reportes Generados',
        });
        sl.addRefreshButton();
        sl.addField({ id: COLS.FECHA_CREACION, type: serverWidget.FieldType.TEXT,       label: 'Fecha Creación'        });
        sl.addField({ id: COLS.USUARIO,        type: serverWidget.FieldType.TEXT,       label: 'Usuario'               });
        sl.addField({ id: COLS.SUBSIDIARIA,    type: serverWidget.FieldType.TEXT,       label: 'Subsidiaria'           });
        sl.addField({ id: COLS.FECHA_CORTE,    type: serverWidget.FieldType.TEXT,       label: 'Fecha de Corte'        });
        sl.addField({ id: COLS.NOMBRE_XLS,     type: serverWidget.FieldType.TEXT,       label: 'Nombre Archivo Excel'  });
        sl.addField({ id: COLS.LINK_DESCARGA,  type: serverWidget.FieldType.TEXT, label: 'Descargar Excel'       });
        //sl.addField({ id: COLS.LINK_DETALLE,   type: serverWidget.FieldType.TEXT, label: 'URL Detalle'           });

        /* ── Poblar sublista con los logs del repositorio ─────────── */
        logs.forEach(function (log, i) {
            if (log.fechaCreacion) sl.setSublistValue({ id: COLS.FECHA_CREACION, line: i, value: log.fechaCreacion || '' });
            sl.setSublistValue({ id: COLS.USUARIO,        line: i, value: log.usuario       || '' });
            sl.setSublistValue({ id: COLS.SUBSIDIARIA,    line: i, value: log.subsidiaria   || '' });
            if (log.fechaCorte) sl.setSublistValue({ id: COLS.FECHA_CORTE,    line: i, value: log.fechaCorte    || '' });
            if (log.nombreXls) sl.setSublistValue({ id: COLS.NOMBRE_XLS,     line: i, value: log.nombreXls     || '—' });

            // Link de descarga directa del Excel desde el File Cabinet
            if (log.urlXls)
            sl.setSublistValue({
                id   : COLS.LINK_DESCARGA,
                line : i,
                value: `<a href="${log.urlXls}" target="_blank">Descargar</a>`
            });

            // Columna oculta (display:none) con el link al detalle del histórico.
            // Parámetro fileId = idCsv → el Suitelet carga op=detail con el contenido del archivo.
            // Puede ser consumida por el Client Script para navegar programáticamente.
            //if (log.idCsv)
            /*sl.setSublistValue({
                id   : COLS.LINK_DETALLE,
                line : i,
                value: log.idCsv
                    ? `<a href="${suiteletUrl}&op=detail&fileId=${log.idCsv}"
                          class="as-link-detalle"
                          data-file-id="${log.idCsv}"
                          style="display:none;">${suiteletUrl}&op=detail&fileId=${log.idCsv}</a>`
                    : '',
            });*/
        });

        return form;
    }

    /* ─── Utilidades privadas ────────────────────────────────────── */

    function _addField(form, p) {
        const opts = { id: p.id, type: p.type, label: p.label };
        if (p.source)    opts.source    = p.source;
        if (p.container) opts.container = p.container;
        const fld = form.addField(opts);
        if (p.value) fld.defaultValue = p.value;
        return fld;
    }

    function _banner(mensaje, tipo) {
        const estilos = {
            success: 'color:#155724;background:#d4edda;border:1px solid #c3e6cb;',
            error  : 'color:#721c24;background:#f8d7da;border:1px solid #f5c6cb;',
        };
        const icono = tipo === 'success' ? '&#10003;' : '&#9888;';
        return `<div style="${estilos[tipo] || estilos.error}padding:10px 16px;border-radius:4px;margin-bottom:4px;">${icono} ${mensaje}</div>`;
    }

    return { FILTROS, COLS, SUBLIST_ID, buildForm };
});
