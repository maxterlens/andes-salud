/**
 * @NApiVersion 2.1
 * @NModuleScope SameAccount
 *
 * @description AS_NSP_031 - Constantes del reproceso de autopicking.
 *              Centraliza IDs de parámetros, campos, registros y reglas de negocio
 *              para que ningún otro módulo tenga valores "en duro".
 */
define([], () => {
    /** Parámetros del script Map/Reduce */
    const PARAMETROS = {
        IDS_ORDEN_VENTA: "custscript_as_rap_ids_ov",
        DIAS_ATRAS: "custscript_as_rap_dias_atras",
        LIMITE_OV: "custscript_as_rap_limite_ov",
        SIMULACION: "custscript_as_rap_simulacion",
        USAR_FECHA_LINEA: "custscript_as_rap_usar_fecha_linea",
        LOG_SIN_CAMBIOS: "custscript_as_rap_log_sin_cambios"
    };

    /** Valores por defecto cuando el parámetro viene vacío */
    const DEFAULTS = {
        DIAS_ATRAS: 30,
        LIMITE_OV: 1000
    };

    /** Reglas de selección de líneas de la Orden de Venta */
    const REGLAS = {
        // Tipos de ítem que requieren Ejecución de Orden de Artículo.
        // Los Kit se excluyen: sus componentes se ejecutan con otra estructura de líneas.
        TIPOS_ITEM: ["InvtPart", "Assembly"],
        // Estados de OV con ejecución pendiente:
        // B = Ejecución de la orden pendiente, D = Parcialmente ejecutada,
        // E = Facturación pendiente / parcialmente ejecutada
        ESTADOS_OV: ["B", "D", "E"],
        // Estados de inventario que NO se pueden consumir
        ESTADOS_INVENTARIO_EXCLUIDOS: ["Bloqueado", "En Inspección", "Damaged"],
        EPSILON: 0.00001
    };

    /** Campos de NetSuite (estándar y personalizados existentes en la cuenta) */
    const CAMPOS = {
        LINEA_PROVISIONAL: "custcol_2win_flag_item_provisional",
        UBICACION_ES_AUTOPICKING: "custrecord_2win_is_autopicking",
        IF_AUTO_SELECCION: "custbody_2win_auto_seleccion",
        IF_ESTADO_ENVIADO: "C"
    };

    /** Cola de autopicking existente (solo lectura, para no competir con ese proceso) */
    const COLA_AUTOPICKING = {
        TIPO: "customrecord_2win_autopicking_queue",
        CAMPO_ORDEN_VENTA: "custrecord_2win_apq_sales_order",
        CAMPO_ESTADO: "custrecord_2win_apq_estado",
        ESTADO_PENDIENTE: 1
    };

    /** Registro de log propio del proyecto */
    const LOG = {
        TIPO: "customrecord_as_autopicking_log",
        CAMPOS: {
            ORDEN_VENTA: "custrecord_as_apl_orden_venta",
            ESTADO: "custrecord_as_apl_estado",
            SIMULACION: "custrecord_as_apl_simulacion",
            ID_PROCESO: "custrecord_as_apl_id_proceso",
            EJECUCIONES: "custrecord_as_apl_ejecuciones",
            CANT_PENDIENTE_INICIAL: "custrecord_as_apl_cant_pend_ini",
            CANT_EJECUTADA: "custrecord_as_apl_cant_ejecutada",
            CANT_PENDIENTE_FINAL: "custrecord_as_apl_cant_pend_fin",
            DETALLE: "custrecord_as_apl_detalle",
            ERROR: "custrecord_as_apl_error"
        },
        // Textos exactos de la lista customlist_as_apl_estado
        ESTADOS: {
            EJECUTADA: "Ejecutada",
            PARCIAL: "Parcial",
            SIN_STOCK: "Sin stock",
            ERROR: "Error",
            OMITIDA_COLA: "Omitida (en cola)",
            SIMULACION: "Simulación"
        },
        MAX_TEXTO: 100000
    };

    /** Claves de salida del reduce hacia summarize */
    const RESULTADO = {
        EJECUTADA: "EJECUTADA",
        PARCIAL: "PARCIAL",
        SIN_STOCK: "SIN_STOCK",
        ERROR: "ERROR",
        OMITIDA_COLA: "OMITIDA_COLA",
        SIN_PENDIENTES: "SIN_PENDIENTES",
        SIMULACION: "SIMULACION"
    };

    return { PARAMETROS, DEFAULTS, REGLAS, CAMPOS, COLA_AUTOPICKING, LOG, RESULTADO };
});
