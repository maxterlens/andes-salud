/**
 * AS_NSP_022 — Reclasificacion de Factura de Compra a Factoring
 * @description Ids, textos y mensajes del proyecto en un solo lugar. Los campos y
 *              las columnas ya existen en la cuenta: este proyecto no crea ninguno.
 *
 * @NApiVersion 2.1
 * @NModuleScope Public
 */
define([], () => {

    const CAMPOS = {
        FACTORING: 'custbody_factoring',
        FACTOR   : 'custbody_factoring_vendor',
        HOLD     : 'paymenthold',
        DIARIO   : 'custbody_2win_factoring_journal',
        TIPO_DIARIO: 'custbody_tipo_de_diario',
        APROBACION : 'approvalstatus',
    };

    const COLUMNAS = {
        APLICAR    : 'custcol_as_aplicar_trans_relacionada',
        TRANSACCION: 'custcol_as_transaccion_relacionada',
        FOLIO      : 'custcol_2w_folio',
    };

    const BOTON = {
        ID       : 'custpage_btn_factoring',
        LABEL    : 'Reclasificar a Factoring',
        ACCION   : 'reclasificarFactoring',
        PARAMETRO: 'as_factoring',
        MARCA    : 'T',
    };

    const CLIENT_SCRIPT = '/SuiteScripts/AndesScripts/Transacciones/AS_FacturaFactoring_CS_2.1.js';
    const ROLES_AUTORIZADOS = [3, 1484, 1520, 1461];

    const MAPREDUCE = {
        SCRIPT    : 'customscript_as_mr_reclasif_factoring',
        DEPLOYMENT: 'customdeploy_as_mr_reclasif_factoring',
        FACTURA   : 'custscript_as_rf_factura',
    };

    const CUENTA_FACTORING      = '577';
    const TIPO_DIARIO_FACTORING = '3';
    const APROBACION_APROBADA = '2';

    const LOGS = {
        ENCOLADA: 'FACTORING ENCOLADA',
        OCUPADO : 'FACTORING PROCESO OCUPADO',
        CREADO  : 'FACTORING DIARIO CREADO',
        ASIENTO : 'FACTORING ASIENTO',
        YA_HECHA: 'FACTORING YA RECLASIFICADA',
        DATOS   : 'FACTORING DATOS',
        ERROR   : 'FACTORING ERROR',
    };

    const MEMOS = {
        DEBE : 'Pago de factoring',
        HABER: 'Traspaso de deuda al factoring',
    };

    const MENSAJES = {
        TITULO_PENDIENTE: 'Falta completar la factura para reclasificarla',
        TITULO_LISTA    : 'Factura ya reclasificada',
        TITULO_ENCOLADA : 'Reclasificacion en proceso',
        TITULO_OCUPADO  : 'Reclasificacion en curso',

        ENCABEZADO_PENDIENTE: 'Edita la factura y completa lo siguiente antes de reclasificarla a factoring:',
        SIN_APROBAR         : '<b>Estado de aprobación</b>: la factura debe estar <b>Aprobado</b>. Aprueba la'
                            + ' factura antes de reclasificarla a factoring.',
        SIN_FACTORING       : '<b>Factoring</b>: marca el check para indicar que esta deuda se cede a un factor.',
        SIN_FACTOR          : '<b>Proveedor Factoring</b>: elige la entidad que compra la deuda.',
        CON_HOLD            : '<b>Retención del pago</b>: desmarcalo. Con la factura retenida NetSuite no permite'
                            + ' vincularla al diario de factoring. Una vez reclasificada queda pagada, asi que'
                            + ' ya nadie puede pagarle al proveedor original.',

        SIN_SUBSIDIARIA_INICIO: '<b>Proveedor Factoring</b>: ',
        SIN_SUBSIDIARIA_MEDIO : ' no está habilitado en la subsidiaria ',

        CON_DIARIO: 'Esta factura ya se reclasifico y no se puede volver a reclasificar.'
                  + ' El diario generado es el ',

        OCUPADO: ' Espera unos segundos y recarga la factura'
               + ' para ver el resultado.',

        ENCOLADA: 'Se esta generando el diario que traspasa la deuda al factoring.'
                + ' Puede demorar unos minutos: vuelve a cargar la factura para ver el resultado.',
    };

    return {
        CAMPOS       : CAMPOS,
        COLUMNAS     : COLUMNAS,
        BOTON        : BOTON,
        CLIENT_SCRIPT: CLIENT_SCRIPT,
        ROLES_AUTORIZADOS: ROLES_AUTORIZADOS,
        MAPREDUCE    : MAPREDUCE,
        CUENTA_FACTORING     : CUENTA_FACTORING,
        TIPO_DIARIO_FACTORING: TIPO_DIARIO_FACTORING,
        APROBACION_APROBADA  : APROBACION_APROBADA,
        LOGS         : LOGS,
        MEMOS        : MEMOS,
        MENSAJES     : MENSAJES,
    };
});
