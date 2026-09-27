/**
 * AS_NSP_025 — Consulta MCP con creacion controlada
 * @description Operaciones permitidas, whitelist de tablas, limites y mensajes.
 *              Este archivo es el contrato de seguridad del modulo: lo que no esta
 *              aca no se puede consultar.
 *
 *              TABLAS_PERMITIDAS aplica solo a la operacion suiteql, que es la
 *              unica donde la consulta llega escrita desde afuera. Las consultas
 *              SQL fijas tienen su texto dentro del repository.
 *
 *              No estan customer, entity, employee ni contact a proposito: la
 *              cuenta es de una clinica y esos records pueden contener datos de
 *              pacientes. Una tabla que no este en la lista se rechaza; no se abre
 *              una tabla solo porque una consulta la pida.
 *
 * @NApiVersion 2.1
 * @NModuleScope Public
 *
 * CHANGELOG v1.1.0 (2026-09-25):
 * - [FEAT] Lectura de registros, archivos, busquedas y datasets.
 * - [FEAT] Creacion exclusiva de Saved Searches y Datasets de consulta.
 */
define([], () => {

    const OPERACIONES = {
        SUITEQL          : 'suiteql',
        CAMPOS           : 'campos_de_registro',
        CUSTOM_RECORD    : 'describir_custom_record',
        CARPETA          : 'listar_carpeta',
        REGISTRO         : 'leer_registro',
        ARCHIVO          : 'leer_archivo',
        BUSQUEDA         : 'ejecutar_busqueda',
        BUSQUEDA_DINAMICA: 'buscar',
        CREAR_BUSQUEDA   : 'crear_busqueda',
        LISTAR_BUSQUEDAS : 'listar_busquedas',
        LISTAR_DATASETS  : 'listar_datasets',
        EJECUTAR_DATASET : 'ejecutar_dataset',
        CREAR_DATASET   : 'crear_dataset',
    };

    const TABLAS_PERMITIDAS = [
        'transaction',
        'transactionline',
        'transactionaccountingline',
        'vendor',
        'vendorsubsidiaryrelationship',
        'item',
        'account',
        'subsidiary',
        'location',
        'script',
        'scriptdeployment',
        'customrecordtype',
        'customfield',
        'customlist',
        'customrecord_2win_recepcion_dte_rechaza',
        'customrecord_as_dte_rechazado',
        'previoustransactionlinelink',
        'role',
        'rolepermissions',
    ];

    // Igual criterio que TABLAS_PERMITIDAS: customer, employee, contact y entity
    // quedan fuera por la posible presencia de datos de pacientes.
    const TIPOS_BUSQUEDA_PERMITIDOS = [
        'transaction', 'vendorbill', 'purchaseorder', 'vendorpayment',
        'vendorcredit', 'itemreceipt', 'inventorytransfer',
        'inventoryadjustment', 'journalentry', 'vendor', 'item',
        'account', 'subsidiary', 'location',
        'customrecord_2win_recepcion_dte_rechaza',
        'customrecord_as_dte_rechazado',
        'role', 'scriptdeployment', 'restlet', 'suitelet',
        'scheduledscript', 'mapreducescript', 'usereventscript',
        'clientscript', 'workflowactionscript',
    ];

    const TIPOS_REGISTRO_PERMITIDOS = TIPOS_BUSQUEDA_PERMITIDOS;

    const CARPETAS_ARCHIVOS_PERMITIDAS = ['SuiteScripts', 'SuiteApps'];

    const PALABRAS_PROHIBIDAS = [
        'INSERT',
        'UPDATE',
        'DELETE',
        'MERGE',
        'DROP',
        'ALTER',
        'CREATE',
        'TRUNCATE',
        'GRANT',
        'REVOKE',
        'EXEC',
        'EXECUTE',
    ];

    const INICIOS_PERMITIDOS = ['SELECT', 'WITH'];

    const LIMITES = {
        FILAS: 50,
        BYTES: 40000,
        TEXTO: 200,
        LINEAS: 50,
    };

    // Familias de campos custom de NetSuite. campos_de_registro devuelve los campos
    // custom de una familia, no los nativos: los nativos ya estan documentados y los
    // custom son los que no se pueden adivinar desde el repositorio.
    const TABLAS_CAMPOS = {
        transaccion: 'transactionbodycustomfield',
        linea      : 'transactioncolumncustomfield',
        entidad    : 'entitycustomfield',
        articulo   : 'itemcustomfield',
        otro       : 'othercustomfield',
    };

    const LOGS = {
        CONSULTA: 'MCP CONSULTA',
        ERROR   : 'MCP ERROR',
    };

    const ERRORES = {
        SIN_OPERACION        : 'Falta la operacion. Permitidas: ',
        OPERACION_INVALIDA   : 'Operacion no permitida: ',
        SIN_CONSULTA         : 'Falta el parametro consulta.',
        SIN_FAMILIA          : 'Falta el parametro familia. Permitidas: ',
        SIN_SCRIPTID         : 'Falta el parametro scriptid.',
        SIN_CARPETA          : 'Falta el parametro carpeta.',
        SIN_TIPO             : 'Falta el parametro tipo.',
        SIN_ID               : 'Falta el parametro id.',
        SIN_BUSQUEDA         : 'Falta el parametro busqueda.',
        SIN_TITULO           : 'Falta el parametro titulo.',
        SIN_COLUMNAS         : 'Faltan las columnas de la consulta.',
        COLUMNA_NO_PERMITIDA : 'Solo se permiten columnas base sin joins ni formulas.',
        FILTRO_NO_PERMITIDO  : 'Solo se permiten filtros sobre campos base sin joins ni formulas.',
        TIPO_NO_PERMITIDO    : 'Tipo fuera de la whitelist: ',
        ARCHIVO_NO_PERMITIDO : 'Solo se pueden leer archivos tecnicos de SuiteScripts y SuiteApps.',
        NO_LECTURA           : 'Solo se aceptan consultas que empiecen con SELECT o WITH.',
        SINTAXIS_NO_PERMITIDA: 'La consulta contiene comentarios, identificadores entre comillas o varias sentencias.',
        SELECT_ASTERISCO     : 'SELECT * no esta permitido. Nombra las columnas que necesitas.',
        PALABRA_PROHIBIDA    : 'La consulta contiene una palabra no permitida: ',
        TABLA_NO_PERMITIDA   : 'Tabla fuera de la whitelist: ',
        RESPUESTA_GRANDE     : 'La respuesta supera el limite de bytes. Acota la consulta con menos columnas,'
                             + ' un WHERE mas especifico o una agregacion COUNT/GROUP BY.',
    };

    return {
        OPERACIONES             : OPERACIONES,
        TABLAS_PERMITIDAS       : TABLAS_PERMITIDAS,
        TIPOS_BUSQUEDA_PERMITIDOS: TIPOS_BUSQUEDA_PERMITIDOS,
        TIPOS_REGISTRO_PERMITIDOS: TIPOS_REGISTRO_PERMITIDOS,
        CARPETAS_ARCHIVOS_PERMITIDAS: CARPETAS_ARCHIVOS_PERMITIDAS,
        PALABRAS_PROHIBIDAS     : PALABRAS_PROHIBIDAS,
        INICIOS_PERMITIDOS      : INICIOS_PERMITIDOS,
        LIMITES                : LIMITES,
        TABLAS_CAMPOS          : TABLAS_CAMPOS,
        LOGS                   : LOGS,
        ERRORES                : ERRORES,
    };
});
