/**
 * AS_NSP_035 — Reporte de Stock Valorizado
 * @description Valores fijos del modulo: scripts y sus parametros, el record del
 *              historial, los campos del formulario y las columnas del Excel.
 * @NApiVersion 2.1
 * @NModuleScope Public
 * @author Andes Salud
 * @version 1.2.0
 *
 * CHANGELOG v1.2.0:
 * - [FEAT] Aviso y limite de tiempo para el reporte en proceso.
 *
 * CHANGELOG v1.1.0:
 * - [FEAT] Campo Ubicacion en el formulario, en el historial y en el log.
 * - [FIX]  Se quitan SUBSIDIARIA_DEFECTO y CUENTAS_INVENTARIO: nada fijo.
 *
 */
define([], () => {

    const FORMULARIO = {
        TITULO          : 'Reporte de Stock Valorizado',
        CLIENT_SCRIPT   : '/SuiteScripts/AndesScripts/Proyectos/ReporteStockValorizado/AS_StockValorizado_CS_2.1.js',
        BOTON_GENERAR   : 'Generar reporte',
        UBICACION_TODAS : 'Todas',
        SOLICITUD_TITULO: 'Reporte en proceso',
        SOLICITUD_TEXTO : 'El reporte se está generando. Cuando termine aparece en el historial con sus enlaces de descarga: use Actualizar para verlo.',
        OCUPADO_TITULO  : 'Hay un reporte en proceso',
        OCUPADO_TEXTO   : 'Ya se está generando un reporte. Espere a que termine y vuelva a pedir el suyo: use Actualizar para ver el historial.',
    };

    const GRUPOS = {
        FILTROS: 'custpage_grp_filtros',
    };

    const CAMPOS = {
        SUBSIDIARIA     : 'custpage_subsidiaria',
        UBICACION       : 'custpage_ubicacion',
        UBICACIONES_DATA: 'custpage_ubicaciones_data',
        FECHA_CORTE     : 'custpage_fecha_corte',
    };

    const SUBLISTA = {
        ID      : 'custpage_historial',
        COLUMNAS: {
            FECHA      : 'custpage_col_fecha',
            USUARIO    : 'custpage_col_usuario',
            SUBSIDIARIA: 'custpage_col_subsidiaria',
            UBICACION  : 'custpage_col_ubicacion',
            FECHA_CORTE: 'custpage_col_fecha_corte',
            ESTADO     : 'custpage_col_estado',
            EXCEL      : 'custpage_col_excel',
            CSV        : 'custpage_col_csv',
            ERROR      : 'custpage_col_error',
        },
    };

    const URL = {
        SOLICITADO: 'solicitado',
        OCUPADO   : 'ocupado',
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
            UBICACIONES: 'custrecord_as_stock_val_ubicaciones',
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
        HISTORIAL_MAXIMO  : 50,
        MINUTOS_EN_PROCESO: 30,
    };

    const LIBRO_CONTABLE = 1;

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
        LIBRO_CONTABLE     : LIBRO_CONTABLE,
        EXCEL              : EXCEL,
    };
});
