/**
 * @NApiVersion 2.1
 * AS_NSP_029 - Constantes del Suitelet de Impresión de Cheques.
 * Compartidas por el Suitelet (servidor) y su Client Script.
 */
define([], () => {

    const SCRIPT = {
        SUITELET_ID:   'customscript_as_impresion_cheques_sl',
        DEPLOYMENT_ID: 'customdeploy_as_impresion_cheques_sl',
        CLIENT_PATH:   '/SuiteScripts/AndesScripts/Proyectos/ImpresionCheques/AS_ImpresionCheques_CS_2.1.js'
    };

    /** API global de impresión (AS Impresión PDF STLT) */
    const API_IMPRESION = {
        SCRIPT_ID:     'customscript_as_impresion_pdf_stlt',
        DEPLOYMENT_ID: 'customdeploy_as_impresion_pdf_stlt',
        RECORD_TYPE:   'vendorpayment',
        REPORT_NAME:   'pagofactura_cheque_pdf',
        FILE_TYPE:     'pdf',
        MODE:          'view'
    };

    /** Record de configuración de impresión (una por impresora y subsidiaria) */
    const CONFIG_CHEQUE = {
        RECORD_TYPE:    'customrecord_as_config_cheque',
        SUBSIDIARIA:    'custrecord_as_cchq_subsidiaria',
        PREDETERMINADA: 'custrecord_as_cchq_predeterminada',
        INACTIVO:       'isinactive'
    };

    /** Campos del Pago de Factura (vendorpayment) para el control de cheques impresos */
    const PAGO = {
        RECORD_TYPE:          'vendorpayment',
        CHEQUE_IMPRESO:       'custbody_as_cheque_impreso',
        ULT_FECHA_IMPRESION:  'custbody_as_ult_fecha_impresion',
        NUM_CHEQUE_FISICO:    'custbody_as_num_cheque_fisico',
        METODO_PAGO:          'custbody_as_metodo_pago'
    };

    /** Lista AS Metodo de Pago: solo se listan los pagos con el valor "Cheque" */
    const METODO_PAGO = {
        LISTA:          'customlist_as_metodo_pago',
        VALOR_CHEQUE:   'Cheque'
    };

    /** Largo máximo del N° de cheque físico */
    const MAX_LARGO_NUM_CHEQUE = 30;

    const MAX_CHEQUES     = 4;
    const LIMITE_RESULTADOS = 500;

    /** Máximo de caracteres de un campo TEXT en una sublista de serverWidget */
    const LIMITE_TEXTO_SUBLISTA = 300;

    /** Ids de campos del formulario (también son los nombres de los parámetros GET) */
    const CAMPOS = {
        GRUPO_FILTROS: 'custpage_grp_filtros',
        SUBSIDIARIA:   'custpage_subsidiaria',
        CUENTA:        'custpage_cuenta',
        IMPRESORA:     'custpage_impresora',
        PROVEEDOR:     'custpage_proveedor',
        FECHA_DESDE:   'custpage_fecha_desde',
        FECHA_HASTA:   'custpage_fecha_hasta',
        INCLUIR_IMPRESOS: 'custpage_incluir_impresos'
    };

    const SUBLISTA = {
        ID:           'custpage_pagos',
        SELECCIONAR:  'custpage_sel',
        POSICION:     'custpage_posicion',
        ID_PAGO:      'custpage_id_pago',
        DOCUMENTO:    'custpage_documento',
        FECHA:        'custpage_fecha',
        BENEFICIARIO: 'custpage_beneficiario',
        MONTO:        'custpage_monto',
        NOTA:         'custpage_nota',
        ULT_FECHA:    'custpage_ult_fecha_impresion',
        NUM_CHEQUE:   'custpage_num_cheque'
    };

    const BOTONES = {
        BUSCAR:      { id: 'custpage_btn_buscar',      label: 'Buscar',              fn: 'buscar' },
        IMPRIMIR:    { id: 'custpage_btn_imprimir',    label: 'Imprimir cheques',    fn: 'imprimirCheques' },
        CALIBRACION: { id: 'custpage_btn_calibracion', label: 'Hoja de calibración', fn: 'imprimirCalibracion' }
    };

    return { SCRIPT, API_IMPRESION, CONFIG_CHEQUE, PAGO, METODO_PAGO, MAX_LARGO_NUM_CHEQUE, MAX_CHEQUES, LIMITE_RESULTADOS, LIMITE_TEXTO_SUBLISTA, CAMPOS, SUBLISTA, BOTONES };
});
