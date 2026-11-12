/**
 * AS_NSP_036 — Nomina de Reembolso al Cliente
 * @description Valores fijos del modulo: ids de los campos, la sublista y los
 *              textos de la pantalla, y los ids de la nomina y su detalle.
 *
 * CHANGELOG v1.2.0 (2026-11-11):
 * - [FEAT] BANCOS_CHILE: la lista de bancos de 2WIN que usa el select Banco.
 * - [FEAT] VISTA: la ficha Detalle de la nomina con sus reembolsos.
 *
 * CHANGELOG v1.1.0 (2026-11-11):
 * - [FEAT] Boton Descargar TXT, el Suitelet que lo atiende, la AS Plantilla
 *          Banco y los campos bancarios del cliente.
 *
 * CHANGELOG v1.0.0 (2026-11-10):
 * - [FEAT] Constantes de la pantalla Generar Nomina de Reembolso y de los
 *          records AS Nomina Reembolso y su detalle.
 *
 * @NApiVersion 2.1
 * @NModuleScope Public
 * @author Andes Salud
 * @version 1.2.0
 *
 */
define([], () => {

    const FORMULARIO = {
        TITULO              : 'Generar Nomina de Reembolso',
        BOTON_GENERAR       : 'Generar Nomina de Reembolso',
        BOTON_MARCAR        : 'Marcar Todo',
        BOTON_DESMARCAR     : 'Desmarcar Todo',
        ALERTA_TITULO       : 'No se pudo generar la nomina de reembolso',
        SIN_REEMBOLSOS      : 'Sin reembolsos pendientes',
        SIN_REEMBOLSOS_TEXTO: 'No hay reembolsos al cliente pendientes para esta Subsidiaria y Cuenta Banco.',
        CLIENT_SCRIPT       : '/SuiteScripts/AndesScripts/Proyectos/NominaReembolso/AS_NominaReembolso_CS_2.1.js',
    };

    const GRUPOS = {
        CABECERA : 'custpage_grp_cabecera',
        ADICIONAL: 'custpage_grp_adicional',
    };

    const CAMPOS = {
        SUBSIDIARIA  : 'custpage_subsidiaria',
        BANCO        : 'custpage_banco',
        CUENTA_BANCO : 'custpage_cuenta_banco',
        CUENTAS_DATA : 'custpage_cuentas_data',
        FECHA        : 'custpage_fecha',
        DESCRIPCION  : 'custpage_descripcion',
        TOTAL        : 'custpage_total',
        OPERACION    : 'custpage_operacion',
        NOMINA       : 'custpage_nomina',
    };

    const BOTONES = {
        MARCAR   : 'custpage_btn_marcar',
        DESMARCAR: 'custpage_btn_desmarcar',
        TXT      : 'custpage_btn_descargar_txt',
        TXT_LABEL: 'Descargar TXT',
    };

    const SUITELET = {
        SCRIPT    : 'customscript_as_nom_reemb_generar_stlt',
        DEPLOYMENT: 'customdeploy_as_nom_reemb_generar_stlt',
    };

    const OPERACIONES = {
        BUSCAR : 'buscar',
        GENERAR: 'generar',
    };

    const SUBLISTA = {
        ID      : 'custpage_reembolsos',
        LABEL   : 'Reembolsos Pendientes',
        COLUMNAS: {
            INCLUIR: 'custpage_col_incluir',
            FECHA  : 'custpage_col_fecha',
            CLIENTE: 'custpage_col_cliente',
            NUMERO : 'custpage_col_numero',
            MONTO  : 'custpage_col_monto',
            ID     : 'custpage_col_id',
        },
    };

    const VISTA = {
        TAB      : 'custpage_tab_detalle',
        TAB_LABEL: 'Detalle',
        SUBLISTA : 'custpage_sl_detalle',
        LABEL    : 'Reembolsos de la Nomina',
    };

    const NOMINA = {
        TIPO  : 'customrecord_as_nom_reemb',
        CAMPOS: {
            SUBSIDIARIA : 'custrecord_as_nom_reemb_subsidiaria',
            BANCO       : 'custrecord_as_nom_reemb_banco',
            CUENTA_BANCO: 'custrecord_as_nom_reemb_cuenta_banco',
            FECHA       : 'custrecord_as_nom_reemb_fecha',
            DESCRIPCION : 'custrecord_as_nom_reemb_descripcion',
            TOTAL       : 'custrecord_as_nom_reemb_total',
        },
    };

    const DETALLE = {
        TIPO  : 'customrecord_as_nom_reemb_det',
        CAMPOS: {
            NOMINA     : 'custrecord_as_nom_reemb_det_nomina',
            TRANSACCION: 'custrecord_as_nom_reemb_det_transaccion',
            MONTO      : 'custrecord_as_nom_reemb_det_monto',
        },
    };

    const CUENTA_BANCO = {
        BANCO          : 'custrecord_2w_acc_banco',
        SUBSIDIARIA    : 'custrecord_2w_empresa_de_cuenta_banco',
        NUMERO_BANCARIO: 'custrecord_2win_numero_cuenta_bancaria',
    };

    const BANCOS_CHILE = {
        TIPO: 'customrecord_2w_codigos_bancos_chile',
    };

    const REEMBOLSO = {
        TIPO: 'CustRfnd',
    };

    const PLANTILLA = {
        TIPO  : 'customrecord_as_plant_banco',
        CAMPOS: {
            BANCO    : 'custrecord_as_plant_banco_banco',
            CONTENIDO: 'custrecord_as_plant_banco_contenido',
        },
    };

    const ARCHIVO = {
        PREFIJO: 'NominaReembolso',
    };

    const CLIENTE = {
        JOIN        : 'customer',
        RUT         : 'custentity_2wrut',
        CUENTA      : 'custentity_2w_cuenta_prov_cli_empl',
        CODIGO_BANCO: 'custentity_2w_prov_emp_codigo_sbif_banco',
        TIPO_CUENTA : 'custentity_2w_tipocuentabco',
        CORREO      : 'email',
    };

    return {
        FORMULARIO  : FORMULARIO,
        GRUPOS      : GRUPOS,
        CAMPOS      : CAMPOS,
        BOTONES     : BOTONES,
        SUITELET    : SUITELET,
        OPERACIONES : OPERACIONES,
        SUBLISTA    : SUBLISTA,
        VISTA       : VISTA,
        NOMINA      : NOMINA,
        DETALLE     : DETALLE,
        CUENTA_BANCO: CUENTA_BANCO,
        BANCOS_CHILE: BANCOS_CHILE,
        REEMBOLSO   : REEMBOLSO,
        PLANTILLA   : PLANTILLA,
        ARCHIVO     : ARCHIVO,
        CLIENTE     : CLIENTE,
    };
});
