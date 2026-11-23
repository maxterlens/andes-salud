/**
 * @NApiVersion 2.1
 * @NModuleScope SameAccount
 *
 * @description AS_NSP_038 - Constantes del Map/Reduce de cuadre de facturas contra el JSON de la integración
 *              (CuadreFacturaJson). Parámetros del script, columnas del CSV, campos de NetSuite y reglas.
 */
define([], () => {
    /** Script y parámetros del deployment */
    const SCRIPT = {
        ID: "customscript_as_adfv_cuadre_mr",
        DEPLOY: "customdeploy_as_adfv_cuadre_mr",
        PARAMS: {
            ARCHIVO: "custscript_as_adfv_cuadre_archivo", // ID interno del CSV en el File Cabinet
            SIMULACION: "custscript_as_adfv_cuadre_simulacion", // T = calcula y deja log, no guarda
            LIMITE: "custscript_as_adfv_cuadre_limite", // máximo de facturas a procesar (0 = todas)
            ARTICULO_REDONDEO: "custscript_as_adfv_cuadre_art_redondeo", // ID interno del artículo de redondeo
            IMPUESTO_REDONDEO: "custscript_as_adfv_cuadre_imp_redondeo", // ID del código de impuesto de la línea de redondeo (opcional)
            TOPE_AJUSTE_IVA: "custscript_as_adfv_cuadre_tope_iva", // ajuste máximo del impuesto por línea
            RANGO_REDONDEO: "custscript_as_adfv_cuadre_rango_red", // diferencia máxima pagado − total JSON aceptada como redondeo
            REGISTRAR: "custscript_as_adfv_cuadre_registrar" // T = crea los registros de trazabilidad (ejecución y detalle)
        }
    };

    /** Valores por defecto si el parámetro viene vacío */
    const DEFECTO = {
        TOPE_AJUSTE_IVA: 100,
        RANGO_REDONDEO: 5
    };

    /** Columnas del CSV (se comparan sin tildes, sin mayúsculas y sin espacios) */
    const COLUMNAS_CSV = {
        ID: ["idinterno", "id", "internalid"],
        FACTURA: ["factura", "numerodedocumento", "numero"],
        JSON: ["json"]
    };

    /** Campos de la factura y de la sublista de artículos */
    const CAMPOS = {
        SUBLISTA: "item",
        LINEA: "line",
        ARTICULO: "item",
        TIPO_ARTICULO: "itemtype",
        CANTIDAD: "quantity",
        TARIFA: "rate",
        IMPORTE: "amount",
        IMPUESTO: "tax1amt",
        CODIGO_IMPUESTO: "taxcode",
        // Campos de clasificación que se copian del primer artículo a la línea de redondeo (si existen)
        COPIAR_EN_REDONDEO: ["department", "class", "location"]
    };

    /** Reglas de negocio */
    const REGLAS = {
        TIPO_DESCUENTO: "Service",
        TEXTO_DESCUENTO: "descuento",
        FORMA_PAGO_EFECTIVO: "EFECTIVO",
        ESTADO_FACTURA_ABIERTA: "open",
        // El monto pagado en efectivo debe ser múltiplo de este valor para considerarse redondeo
        MULTIPLO_EFECTIVO: 10,
        // Decimales de la moneda (CLP = 0): importes de línea redondeados como en NetSuite
        DECIMALES_MONEDA: 0,
        // Diferencia aceptada por precisión de decimales al comparar importes
        EPSILON: 0.005,
        LIMITE_LOG: 3900
    };

    /** Resultado de cada factura (clave del write del reduce) */
    const RESULTADO = {
        CORREGIDA: "CORREGIDA",
        SIMULADA: "SIMULADA",
        SIN_CAMBIO: "SIN_CAMBIO",
        OMITIDA: "OMITIDA",
        REVISION_MANUAL: "REVISION_MANUAL",
        ERROR: "ERROR"
    };

    /**
     * Trazabilidad: registro de la ejecución (cabecera) y detalle por cambio (hijo).
     * Las listas se escriben por scriptid del valor (ListaRepository resuelve el ID interno).
     */
    const TRAZA = {
        EJECUCION: {
            TIPO: "customrecord_as_adfv_cuadre_ejec",
            PREFIJO_NOMBRE: "ADFC-",
            CAMPOS: {
                ARCHIVO: "custrecord_as_adfc_ej_archivo",
                SIMULACION: "custrecord_as_adfc_ej_simulacion",
                LIMITE: "custrecord_as_adfc_ej_limite",
                ARTICULO_REDONDEO: "custrecord_as_adfc_ej_art_redondeo",
                IMPUESTO_REDONDEO: "custrecord_as_adfc_ej_imp_redondeo",
                TOPE_IVA: "custrecord_as_adfc_ej_tope_iva",
                RANGO_REDONDEO: "custrecord_as_adfc_ej_rango_red",
                ESTADO: "custrecord_as_adfc_ej_estado",
                FECHA_INICIO: "custrecord_as_adfc_ej_fecha_inicio",
                FECHA_FIN: "custrecord_as_adfc_ej_fecha_fin",
                FILAS: "custrecord_as_adfc_ej_filas",
                A_PROCESAR: "custrecord_as_adfc_ej_a_procesar",
                CORREGIDAS: "custrecord_as_adfc_ej_corregidas",
                SIMULADAS: "custrecord_as_adfc_ej_simuladas",
                SIN_CAMBIO: "custrecord_as_adfc_ej_sin_cambio",
                OMITIDAS: "custrecord_as_adfc_ej_omitidas",
                REVISION: "custrecord_as_adfc_ej_revision",
                ERRORES: "custrecord_as_adfc_ej_errores",
                ERROR: "custrecord_as_adfc_ej_error"
            }
        },
        DETALLE: {
            TIPO: "customrecord_as_adfv_cuadre_det",
            CAMPOS: {
                EJECUCION: "custrecord_as_adfc_det_ejecucion",
                FACTURA: "custrecord_as_adfc_det_factura",
                RESULTADO: "custrecord_as_adfc_det_resultado",
                TIPO: "custrecord_as_adfc_det_tipo",
                SIMULACION: "custrecord_as_adfc_det_simulacion",
                LINEA: "custrecord_as_adfc_det_linea",
                PRODUCTO: "custrecord_as_adfc_det_producto",
                ARTICULO: "custrecord_as_adfc_det_articulo",
                CANT_ANTES: "custrecord_as_adfc_det_cant_antes",
                CANT_DESPUES: "custrecord_as_adfc_det_cant_despues",
                IMP_ANTES: "custrecord_as_adfc_det_imp_antes",
                IMP_DESPUES: "custrecord_as_adfc_det_imp_despues",
                IVA_ANTES: "custrecord_as_adfc_det_iva_antes",
                IVA_DESPUES: "custrecord_as_adfc_det_iva_despues",
                TOTAL_JSON: "custrecord_as_adfc_det_total_json",
                PAGADO: "custrecord_as_adfc_det_pagado",
                EFECTIVO: "custrecord_as_adfc_det_efectivo",
                TOTAL_ANTES: "custrecord_as_adfc_det_total_antes",
                TOTAL_DESPUES: "custrecord_as_adfc_det_total_despues",
                REST_ANTES: "custrecord_as_adfc_det_rest_antes",
                REST_DESPUES: "custrecord_as_adfc_det_rest_despues",
                MENSAJE: "custrecord_as_adfc_det_mensaje"
            }
        },
        LISTAS: {
            ESTADO_EJECUCION: "customlist_as_adfv_estado_proceso",
            RESULTADO: "customlist_as_adfv_cuadre_resultado",
            TIPO_CAMBIO: "customlist_as_adfv_cuadre_tipo"
        },
        /** Estado de la ejecución (valores de customlist_as_adfv_estado_proceso, compartida con el Suitelet del 038) */
        ESTADO: {
            EN_PROCESO: "val_as_adfv_ep_en_proceso",
            COMPLETADO: "val_as_adfv_ep_completado",
            COMPLETADO_ERRORES: "val_as_adfv_ep_completado_err",
            ERROR: "val_as_adfv_ep_error"
        },
        /** Resultado de la factura → valor de customlist_as_adfv_cuadre_resultado */
        RESULTADO: {
            CORREGIDA: "val_as_adfv_cr_corregida",
            SIMULADA: "val_as_adfv_cr_simulada",
            SIN_CAMBIO: "val_as_adfv_cr_sin_cambio",
            OMITIDA: "val_as_adfv_cr_omitida",
            REVISION_MANUAL: "val_as_adfv_cr_revision",
            ERROR: "val_as_adfv_cr_error"
        },
        /** Tipo de cambio → valor de customlist_as_adfv_cuadre_tipo */
        TIPO_CAMBIO: {
            A: "val_as_adfv_ct_cant_desc",
            B_DESCUENTO: "val_as_adfv_ct_imp_desc",
            B_ARTICULO: "val_as_adfv_ct_imp_art",
            C: "val_as_adfv_ct_redondeo",
            NINGUNO: "val_as_adfv_ct_ninguno"
        }
    };

    return { SCRIPT, DEFECTO, COLUMNAS_CSV, CAMPOS, REGLAS, RESULTADO, TRAZA };
});
