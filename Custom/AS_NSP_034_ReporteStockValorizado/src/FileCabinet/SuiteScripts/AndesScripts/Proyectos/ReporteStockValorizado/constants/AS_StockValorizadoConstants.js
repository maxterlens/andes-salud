/**
 * AS_NSP_035 — Reporte de Stock Valorizado
 * @description Valores fijos del modulo: scripts y sus parametros, el record del
 *              historial, los campos del formulario, las cuentas de inventario y
 *              las columnas del Excel.
 * @NApiVersion 2.1
 * @NModuleScope Public
 * @author Andes Salud
 * @version 1.0.0
 *
 */
define([], () => {

    const FORMULARIO = {
        TITULO          : 'Reporte de Stock Valorizado',
        BOTON_GENERAR   : 'Generar reporte',
        SOLICITUD_TITULO: 'Reporte en proceso',
        SOLICITUD_TEXTO : 'El reporte se está generando. Cuando termine aparece en el historial con sus enlaces de descarga: use Actualizar para verlo.',
    };

    const GRUPOS = {
        FILTROS: 'custpage_grp_filtros',
    };

    const CAMPOS = {
        SUBSIDIARIA: 'custpage_subsidiaria',
        FECHA_CORTE: 'custpage_fecha_corte',
    };

    const SUBLISTA = {
        ID      : 'custpage_historial',
        COLUMNAS: {
            FECHA      : 'custpage_col_fecha',
            USUARIO    : 'custpage_col_usuario',
            SUBSIDIARIA: 'custpage_col_subsidiaria',
            FECHA_CORTE: 'custpage_col_fecha_corte',
            ESTADO     : 'custpage_col_estado',
            EXCEL      : 'custpage_col_excel',
            CSV        : 'custpage_col_csv',
            ERROR      : 'custpage_col_error',
        },
    };

    const URL = {
        SOLICITADO: 'solicitado',
    };

    const SCRIPTS = {
        SUITELET  : { ID: 'customscript_as_stock_valorizado_stlt', DESPLIEGUE: 'customdeploy_as_stock_valorizado_stlt' },
        GENERACION: { ID: 'customscript_as_stock_valorizado_ss',   DESPLIEGUE: 'customdeploy_as_stock_valorizado_ss' },
    };

    const PARAMETROS = {
        CARPETA: 'custscript_as_stock_val_carpeta',
        LOG    : 'custscript_as_stock_val_log',
        CSV    : 'custscript_as_stock_val_csv',
    };

    const LOG = {
        TIPO   : 'customrecord_as_stock_valorizado',
        CAMPOS : {
            SUBSIDIARIA: 'custrecord_as_stock_val_subsidiaria',
            FECHA_CORTE: 'custrecord_as_stock_val_fecha_corte',
            ESTADO     : 'custrecord_as_stock_val_estado',
            URL_EXCEL  : 'custrecord_as_stock_val_url_excel',
            URL_CSV    : 'custrecord_as_stock_val_url_csv',
            ERROR      : 'custrecord_as_stock_val_error',
        },
        ESTADOS: {
            EN_PROCESO: 'En proceso',
            COMPLETADO: 'Completado',
            ERROR     : 'Error',
        },
        HISTORIAL_MAXIMO: 50,
    };

    const SUBSIDIARIA_DEFECTO = '5';

    const LIBRO_CONTABLE = 1;
    
    const CUENTAS_INVENTARIO = [213, 490, 491, 492, 495, 498];

    const EXCEL = {
        HOJA               : 'Stock valorizado',
        ENCABEZADOS        : ['Código de existencia', 'Descripción', 'Ubicación', 'Familia WMS', 'Cantidad',
                              'Valorización individual', 'Valorización total', 'Fecha de último consumo', 'Fecha de compra'],
        COLUMNAS_NUMERICAS : [4, 5, 6],
    };

    return {
        FORMULARIO         : FORMULARIO,
        GRUPOS             : GRUPOS,
        CAMPOS             : CAMPOS,
        SUBLISTA           : SUBLISTA,
        URL                : URL,
        SCRIPTS            : SCRIPTS,
        PARAMETROS         : PARAMETROS,
        LOG                : LOG,
        SUBSIDIARIA_DEFECTO: SUBSIDIARIA_DEFECTO,
        LIBRO_CONTABLE     : LIBRO_CONTABLE,
        CUENTAS_INVENTARIO : CUENTAS_INVENTARIO,
        EXCEL              : EXCEL,
    };
});
