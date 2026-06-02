/**
 * @module constants
 * @description Constantes globales del proyecto FacturacionRecepcionesAcepta.
 *              Centraliza scriptIds de records, campos, estados y configuración
 *              de transformación para facilitar el mantenimiento.
 *
 * SUPUESTOS DE IMPLEMENTACIÓN:
 *  - Campos de cabecera copiados desde la factura del CSV: memo, terms, duedate.
 *    Si se requieren otros campos, agregarlos en CAMPOS_CABECERA_A_COPIAR.
 *  - Comparación de líneas: se compara el campo 'rate' (precio unitario) por item.
 *    Si hay diferencia, se sobreescribe el rate en la factura nueva.
 */
define([], function () {

    /** ScriptIds de custom records del proyecto */
    var RECORDS = {
        CONTROL_CARGA:         'customrecord_as_control_carga',
        DETALLE_CONTROL_CARGA: 'customrecord_as_detalle_control_carga',
    };

    /** ScriptIds de campos del record AS Control de Carga (cabecera) */
    var FIELDS_CONTROL_CARGA = {
        ID_INTERNO:  'internalid',
        FECHA:       'custrecord_as_control_carga_fecha',
        ESTADO:      'custrecord_as_control_carga_estado',
        URL_ARCHIVO: 'custrecord_as_control_carga_url_archivo',
        ID_ARCHIVO:  'custrecord_as_control_carga_id_archivo',
        USUARIO:     'custrecord_as_control_carga_usuario',
        DETALLE:     'custrecord_as_control_carga_detalle',
    };

    /** ScriptIds de campos del record AS Detalle Control de Carga */
    var FIELDS_DETALLE = {
        CABECERA:              'custrecord_as_det_ctrl_carga_cabecera',
        RECEPCION:             'custrecord_as_det_ctrl_carga_recepcion',
        FACTURA_ACEPTA_ORIGEN: 'custrecord_as_det_ctrl_carga_fact_ac_ori',
        FACTURA_NUEVA:         'custrecord_as_det_ctrl_carga_fact_nueva',
        ESTADO:                'custrecord_as_det_ctrl_carga_estado',
        DETALLE:               'custrecord_as_det_ctrl_carga_detalle',
    };

    /**
     * Valores de texto del customlist_as_estado_procesamiento.
     * Se usan con record.setText() para evitar dependencia de IDs internos
     * entre ambientes. Para filtros de búsqueda usar resolverIdEstado() del repositorio.
     */
    var ESTADOS = {
        PENDIENTE:              'Pendiente',
        EN_PROCESO:             'En Proceso',
        COMPLETADO:             'Completado',
        COMPLETADO_CON_ERRORES: 'Completado con Errores',
        ERROR:                  'Error',
    };

    /** Tipos de transacción NetSuite usados en este proyecto */
    var TIPOS_TRANSACCION = {
        RECEPCION:      'itemreceipt',
        FACTURA_COMPRA: 'vendorbill',
    };

    /**
     * Campos de cabecera que se copian desde la factura del CSV
     * hacia la nueva factura generada desde la recepción.
     */
    var CAMPOS_CABECERA_A_COPIAR = [
        'custbody_2wintipodtesii',
        'custbody_2win_fecha_emision',
        'custbody_2win_fecha_recepcion_sii',
        'custbody_2win_fecha_recepcion_acepta',
        'custbody_2win_fecha_envio',
        'trandate',
        'duedate',
        'custbody_2w_forma_pago',
        'currency',
        'exchangerate',
        'memo',
        'custbody_2win_url',
        'custbody_2win_estado_compras',
        'custbody_2win_monto_neto',
        'custbody_2win_monto_exento',
        'custbody_2win_monto_iva',
        'custbody_2win_monto_otros_impuestos',
        'custbody_2win_monto_total',
        'custbody2w_tipo_de_operacion_compras',
        'custbody_2w_as_vencimiento_original'
    ];

    /**
     * Campo de línea que se compara entre la factura del CSV y la nueva factura.
     * Si existe diferencia de valor, se sobreescribe en la factura nueva.
     */
    var CAMPO_IMPORTE_LINEA = 'rate';

    return {
        RECORDS:                  RECORDS,
        FIELDS_CONTROL_CARGA:     FIELDS_CONTROL_CARGA,
        FIELDS_DETALLE:           FIELDS_DETALLE,
        ESTADOS:                  ESTADOS,
        TIPOS_TRANSACCION:        TIPOS_TRANSACCION,
        CAMPOS_CABECERA_A_COPIAR: CAMPOS_CABECERA_A_COPIAR,
        CAMPO_IMPORTE_LINEA:      CAMPO_IMPORTE_LINEA,
    };
});
