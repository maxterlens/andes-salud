/**
 * AS_NSP_027 — Facturas DTE Rechazadas
 * @description Record, paginacion, seguimiento y textos del modulo. Los scriptid de
 *              cada campo de customrecord_2win_recepcion_dte_rechaza se escriben
 *              literales donde se usan -en el repository-, no se centralizan aca.
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

    const SUITELET = {
        SCRIPT    : 'customscript_as_stlt_dte_rechazadas',
        DEPLOYMENT: 'customdeploy_as_stlt_dte_rechazadas',
    };

    const ETIQUETAS_COLUMNA = {
        FECHA        : 'Fecha',
        FOLIO        : 'Folio',
        TIPO_DTE     : 'Tipo DTE',
        RUT_EMISOR   : 'Rut Emisor',
        PROVEEDOR    : 'Proveedor',
        SUBSIDIARIA  : 'Subsidiaria',
        ESTADO_DTE   : 'Estado DTE',
        COD_ERROR    : 'Cod. Error',
        DESC_ERROR   : 'Descripcion Error',
        AVISO        : 'Aviso al proveedor',
        FECHA_AVISO  : 'Fecha aviso',
        USUARIO_AVISO: 'Avisado por',
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
        SUITELET         : SUITELET,
        ETIQUETAS_COLUMNA: ETIQUETAS_COLUMNA,
        LOGS             : LOGS,
    };
});
