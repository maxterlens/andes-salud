/**
 * AS_NSP_027 — Facturas DTE Rechazadas
 * @description Record, paginacion, seguimiento y textos del modulo. Los scriptid de
 *              cada campo de customrecord_2win_recepcion_dte_rechaza se escriben
 *              literales donde se usan -en el repository-, no se centralizan aca.
 *
 *              TIPOS_DTE traduce el codigo TipoDTE del SII que 2WIN guarda en
 *              custrecord_2win_dterech_codigo_dte. Los nombres son los del catalogo
 *              "DTE Tipo" de 2WIN (customrecord_2w_dte_tipo), para que la bandeja diga
 *              lo mismo que el resto de la cuenta. Solo van los DTE electronicos: el
 *              catalogo mezcla documentos de referencia (801-815), codigos propios
 *              (HES, OV, SAP) y repite el 802 y el 804, por eso no se consulta directo.
 * @NApiVersion 2.1
 * @NModuleScope Public
 */
define([], () => {

    const RECORD = {
        RECHAZO      : 'customrecord_2win_recepcion_dte_rechaza',
        DTE_RECHAZADO: 'customrecord_as_dte_rechazado',
    };

    const PAGINACION = {
        TAMANO_PAGINA: 50,
    };

    const SEGUIMIENTO = {
        PENDIENTE: 'pendiente',
        AVISADO  : 'avisado',
    };

    const TIPOS_DTE = {
        '33' : 'Factura Afecta Electrónica',
        '34' : 'Factura Exenta Electrónica',
        '39' : 'Boleta Electrónica',
        '41' : 'Boleta Exenta Electrónica',
        '43' : 'Liquidación Factura Electrónica',
        '46' : 'Factura de Compra Electrónica',
        '52' : 'Guía de Despacho Electrónica',
        '56' : 'Nota de Débito Electrónica',
        '61' : 'Nota de Crédito Electrónica',
        '110': 'Factura de Exportación Electrónica',
        '111': 'Nota de Débito de Exportación Electrónica',
        '112': 'Nota de Crédito de Exportación Electrónica',
    };

    const SUITELET = {
        SCRIPT    : 'customscript_as_stlt_dte_rechazadas',
        DEPLOYMENT: 'customdeploy_as_stlt_dte_rechazadas',
    };

    const ETIQUETAS_COLUMNA = {
        FECHA         : 'Fecha',
        FOLIO         : 'Folio',
        TIPO          : 'Tipo',
        TIPO_DOCUMENTO: 'Tipo Documento',
        RUT_EMISOR    : 'Rut Emisor',
        PROVEEDOR     : 'Proveedor',
        SUBSIDIARIA   : 'Subsidiaria',
        ESTADO_DTE    : 'Estado DTE',
        COD_ERROR     : 'Cod. Error',
        DESC_ERROR    : 'Descripcion Error',
        AVISO         : 'Aviso al proveedor',
        FECHA_AVISO   : 'Fecha aviso',
        USUARIO_AVISO : 'Avisado por',
    };

    const LOGS = {
        ERROR : 'FACTURAS DTE RECHAZADAS ERROR',
        SYNC  : 'DTE RECHAZO SYNC',
        AVISOS: 'DTE RECHAZOS AVISOS',
    };

    return {
        RECORD           : RECORD,
        PAGINACION       : PAGINACION,
        SEGUIMIENTO      : SEGUIMIENTO,
        TIPOS_DTE        : TIPOS_DTE,
        SUITELET         : SUITELET,
        ETIQUETAS_COLUMNA: ETIQUETAS_COLUMNA,
        LOGS             : LOGS,
    };
});
