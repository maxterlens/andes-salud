/**
 * AS_NSP_022 — Reclasificacion de Factura de Compra a Factoring
 * @description Ids, textos y mensajes del proyecto en un solo lugar. Los campos y
 *              las columnas ya existen en la cuenta: este proyecto no crea ninguno.
 *
 * @NApiVersion 2.1
 * @NModuleScope Public
 */
define([], () => {

    // Campos que ya existen en la cuenta. No se crea ninguno nuevo.
    const CAMPOS = {
        FACTORING: 'custbody_factoring',
        FACTOR   : 'custbody_factoring_vendor',
        HOLD     : 'paymenthold',
        DIARIO   : 'custbody_2win_factoring_journal',
        TIPO_DIARIO: 'custbody_tipo_de_diario',
        APROBACION : 'approvalstatus',
    };

    // Columnas del AS_NSP_003. Marcarlas es lo que aplica el diario a la factura
    // y deja la factura pagada: es la unica diferencia con el flujo actual.
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

    const MAPREDUCE = {
        SCRIPT    : 'customscript_as_mr_reclasif_factoring',
        DEPLOYMENT: 'customdeploy_as_mr_reclasif_factoring',
        FACTURA   : 'custscript_as_rf_factura',
    };

    // Los dos valores estan confirmados en customrecord_2w_parametros_facturacion:
    //   andes_salud_factoring_cta_credito_diario = 577  -> 2120005 Factoring por pagar
    //   andes_salud_factoring_tipo_diario        = 3    -> Factoring
    // Verificar los dos antes de pasar a Produccion: son ids internos de esta cuenta.
    const CUENTA_FACTORING      = '577';

    const TIPO_DIARIO_FACTORING = '3';

    // approvalstatus, mismo campo y mismos valores en la Factura de Compra y en el Diario:
    // 1 Pendiente de aprobacion, 2 Aprobada, 3 Rechazada
    const APROBACION_APROBADA = '2';

    const LOGS = {
        ENCOLADA: 'FACTORING ENCOLADA',
        OCUPADO : 'FACTORING PROCESO OCUPADO',
        CREADO  : 'FACTORING DIARIO CREADO',
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
        TITULO_OCUPADO  : 'Hay otra reclasificacion en curso',

        ENCABEZADO_PENDIENTE: 'Edita la factura y completa lo siguiente antes de reclasificarla a factoring:',
        SIN_APROBAR         : '<b>Estado de aprobación</b>: la factura debe estar <b>Aprobado</b>. Aprueba la'
                            + ' factura antes de reclasificarla a factoring.',
        SIN_FACTORING       : '<b>Factoring</b>: marca el check para indicar que esta deuda se cede a un factor.',
        SIN_FACTOR          : '<b>Proveedor Factoring</b>: elige la entidad que compra la deuda.',
        CON_HOLD            : '<b>Retención del pago</b>: desmarcalo. Con la factura retenida NetSuite no permite'
                            + ' vincularla al diario de factoring. Una vez reclasificada queda pagada, asi que'
                            + ' ya nadie puede pagarle al proveedor original.',

        CON_DIARIO: 'Esta factura ya se reclasifico y no se puede volver a reclasificar.'
                  + ' El diario generado es el ',

        OCUPADO: 'El proceso esta ocupado reclasificando otra factura. Espera unos segundos y vuelve'
               + ' a presionar el boton: solo puede procesarse una factura a la vez.',

        ENCOLADA: 'Se esta generando el diario que traspasa la deuda al factoring.'
                + ' Puede demorar unos minutos: vuelve a cargar la factura para ver el resultado.',
    };

    return {
        CAMPOS       : CAMPOS,
        COLUMNAS     : COLUMNAS,
        BOTON        : BOTON,
        CLIENT_SCRIPT: CLIENT_SCRIPT,
        MAPREDUCE    : MAPREDUCE,
        CUENTA_FACTORING     : CUENTA_FACTORING,
        TIPO_DIARIO_FACTORING: TIPO_DIARIO_FACTORING,
        APROBACION_APROBADA  : APROBACION_APROBADA,
        LOGS         : LOGS,
        MEMOS        : MEMOS,
        MENSAJES     : MENSAJES,
    };
});
