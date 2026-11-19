/**
 * @NApiVersion 2.1
 * @NModuleScope SameAccount
 *
 * @description AS_NSP_037 - Constantes de FixArticuloOrdenVenta.
 *              Centraliza IDs de scripts, parámetros, registros, listas, campos de pantalla y
 *              reglas de negocio para que ningún otro módulo tenga valores "en duro".
 */
define([], () => {
    const RUTA_BASE = "/SuiteScripts/AndesScripts/Proyectos/FixArticuloOrdenVenta";

    /** Scripts del proyecto con sus deployments y parámetros */
    const SCRIPTS = {
        SUITELET: {
            ID: "customscript_as_faov_sl",
            DEPLOY: "customdeploy_as_faov_sl",
            PARAM_CARPETA: "custscript_as_faov_carpeta"
        },
        MAP_REDUCE: {
            ID: "customscript_as_faov_mr",
            DEPLOY: "customdeploy_as_faov_mr",
            PARAM_PROCESO: "custscript_as_faov_proceso"
        },
        CS_PATH: `${RUTA_BASE}/ui/AS_FixArticuloOrdenVenta_CS_2.1.js`
    };

    /** Parámetros de URL del Suitelet */
    const PARAMS = {
        PANTALLA: "pantalla",
        PROCESO_ID: "proceso_id",
        MSG: "msg"
    };

    /** Pantallas del Suitelet (GET) */
    const PANTALLAS = {
        CARGA: "carga",
        VALIDACION: "validacion",
        HISTORIAL: "historial",
        DETALLE: "detalle",
        PLANTILLA: "plantilla",
        DESCARGAR_VALIDACION: "descargar_validacion",
        DESCARGAR_RESULTADO: "descargar_resultado"
    };

    /** Acciones POST del Suitelet */
    const ACCIONES = {
        VALIDAR: "validar",
        PROCESAR: "procesar",
        REVALIDAR: "revalidar",
        ANULAR: "anular"
    };

    /** Campos custpage_* de la pantalla de Carga */
    const CAMPOS_CARGA = {
        ACCION: "custpage_accion",
        ARCHIVO: "custpage_archivo",
        SUBSIDIARIA: "custpage_subsidiaria",
        OBSERVACION: "custpage_observacion"
    };

    /** Campos custpage_* de las pantallas de Validación y Detalle */
    const CAMPOS_VALIDACION = {
        ACCION: "custpage_accion",
        PROCESO_ID: "custpage_proceso_id"
    };

    /** Filtros del Historial (también son parámetros de URL) */
    const FILTROS_HISTORIAL = {
        ESTADO: "custpage_f_estado",
        SUBSIDIARIA: "custpage_f_subsidiaria",
        DESDE: "custpage_f_desde",
        HASTA: "custpage_f_hasta"
    };

    /** Sublistas de las pantallas */
    const SUBLISTAS = {
        POR_PROCESAR: "custpage_sl_procesar",
        REEMPLAZOS: "custpage_sl_reemplazos",
        SIN_CAMBIO: "custpage_sl_sin_cambio",
        NO_PROCESABLES: "custpage_sl_no_procesables",
        HISTORIAL: "custpage_sl_historial"
    };

    /** Columnas de la sublista de reemplazos que lee el handler y el client script */
    const COLUMNAS_REEMPLAZO = {
        REEMPLAZAR: "custpage_r_reemplazar",
        CLAVE: "custpage_r_clave"
    };

    /** Mensajes que llegan por el parámetro "msg" después de una redirección */
    const MENSAJES = {
        validado: { tipo: "CONFIRMATION", titulo: "Validación generada", texto: "Revise las líneas y presione Procesar para aplicar los cambios." },
        procesando: { tipo: "CONFIRMATION", titulo: "Proceso iniciado", texto: "El proceso se está ejecutando en segundo plano. Abra el proceso para ver su avance." },
        revalidado: { tipo: "CONFIRMATION", titulo: "Validación actualizada", texto: "Se volvió a validar el CSV cargado con los datos actuales de NetSuite." },
        anulado: { tipo: "CONFIRMATION", titulo: "Proceso anulado", texto: "El proceso se anuló y ya no se puede procesar." },
        ya_enviado: { tipo: "WARNING", titulo: "Proceso ya enviado", texto: "Este proceso ya no está en estado Validado." },
        no_encontrado: { tipo: "ERROR", titulo: "Proceso no encontrado", texto: "No se encontró el proceso indicado." }
    };

    /** Registro cabecera del proceso */
    const PROCESO = {
        TIPO: "customrecord_as_faov_proceso",
        PREFIJO_NOMBRE: "FAOV-",
        CAMPOS: {
            SUBSIDIARIA: "custrecord_as_faov_subsidiaria",
            ESTADO: "custrecord_as_faov_estado",
            USUARIO: "custrecord_as_faov_usuario",
            OBSERVACION: "custrecord_as_faov_observacion",
            ARCHIVO_ORIGEN: "custrecord_as_faov_archivo_origen",
            ARCHIVO_DATOS: "custrecord_as_faov_archivo_datos",
            TOTAL_LINEAS: "custrecord_as_faov_total_lineas",
            TOTAL_PROCESAR: "custrecord_as_faov_total_procesar",
            TOTAL_PROCESADAS: "custrecord_as_faov_total_procesadas",
            TOTAL_OMITIDAS: "custrecord_as_faov_total_omitidas",
            TOTAL_ERRORES: "custrecord_as_faov_total_errores",
            RESUMEN: "custrecord_as_faov_resumen",
            TASK_ID: "custrecord_as_faov_task_id",
            FECHA_INICIO: "custrecord_as_faov_fecha_inicio",
            FECHA_FIN: "custrecord_as_faov_fecha_fin",
            ERROR: "custrecord_as_faov_error"
        }
    };

    /** Registro de detalle por línea (hijo del proceso) */
    const DETALLE = {
        TIPO: "customrecord_as_faov_detalle",
        CAMPOS: {
            PROCESO: "custrecord_as_faov_det_proceso",
            FILA: "custrecord_as_faov_det_fila",
            CUENTA: "custrecord_as_faov_det_cuenta",
            CRG_CORREL: "custrecord_as_faov_det_crg",
            ORDEN_VENTA: "custrecord_as_faov_det_orden_venta",
            ARTICULO_OV: "custrecord_as_faov_det_articulo_ov",
            ARTICULO_CSV: "custrecord_as_faov_det_articulo_csv",
            ACCION: "custrecord_as_faov_det_accion",
            ESTADO: "custrecord_as_faov_det_estado",
            CANT_OV: "custrecord_as_faov_det_cant_ov",
            CANT_DESPACHADA: "custrecord_as_faov_det_cant_desp",
            CANT_FINAL: "custrecord_as_faov_det_cant_final",
            CANT_RESULTANTE: "custrecord_as_faov_det_cant_result",
            PRECIO_OV: "custrecord_as_faov_det_precio_ov",
            PRECIO_NUEVO: "custrecord_as_faov_det_precio_nuevo",
            EJECUCIONES: "custrecord_as_faov_det_ejecuciones",
            EJECUCIONES_JSON: "custrecord_as_faov_det_ejec_json",
            LOTES: "custrecord_as_faov_det_lotes",
            MENSAJE: "custrecord_as_faov_det_mensaje"
        }
    };

    /** Listas personalizadas */
    const LISTAS = {
        ESTADO_PROCESO: "customlist_as_faov_estado_proceso",
        ESTADO_LINEA: "customlist_as_faov_estado_linea",
        ACCION: "customlist_as_faov_accion"
    };

    /**
     * Estados del proceso: scriptid del valor de customlist_as_faov_estado_proceso y texto.
     * La lógica usa el scriptid (ListaRepository resuelve el ID interno), nunca el texto.
     */
    const ESTADO_PROCESO = {
        VALIDADO: { scriptid: "val_as_faov_ep_validado", texto: "Validado" },
        EN_PROCESO: { scriptid: "val_as_faov_ep_en_proceso", texto: "En proceso" },
        COMPLETADO: { scriptid: "val_as_faov_ep_completado", texto: "Completado" },
        COMPLETADO_ERRORES: { scriptid: "val_as_faov_ep_completado_err", texto: "Completado con errores" },
        ERROR: { scriptid: "val_as_faov_ep_error", texto: "Error" },
        ANULADO: { scriptid: "val_as_faov_ep_anulado", texto: "Anulado" }
    };

    /** Estados de línea (customlist_as_faov_estado_linea) */
    const ESTADO_LINEA = {
        PROCESADA: { scriptid: "val_as_faov_el_procesada", texto: "Procesada" },
        SIN_CAMBIO: { scriptid: "val_as_faov_el_sin_cambio", texto: "Sin cambio" },
        OMITIDA: { scriptid: "val_as_faov_el_omitida", texto: "Omitida" },
        NO_PROCESABLE: { scriptid: "val_as_faov_el_no_procesable", texto: "No procesable" },
        ERROR: { scriptid: "val_as_faov_el_error", texto: "Error" }
    };

    /**
     * Acciones por línea (customlist_as_faov_accion).
     * `procesable` = la acción modifica la OV (y eventualmente la Ejecución).
     */
    const ACCIONES_LINEA = {
        ELIMINAR: { codigo: "ELIMINAR", scriptid: "val_as_faov_ac_eliminar", texto: "Eliminar línea", procesable: true },
        REDUCIR: { codigo: "REDUCIR", scriptid: "val_as_faov_ac_reducir", texto: "Reducir cantidad", procesable: true },
        AUMENTAR: { codigo: "AUMENTAR", scriptid: "val_as_faov_ac_aumentar", texto: "Aumentar cantidad", procesable: true },
        REEMPLAZAR: { codigo: "REEMPLAZAR", scriptid: "val_as_faov_ac_reemplazar", texto: "Reemplazar artículo", procesable: true },
        ACTUALIZAR_PRECIO: { codigo: "ACTUALIZAR_PRECIO", scriptid: "val_as_faov_ac_precio", texto: "Actualizar precio", procesable: true },
        SIN_CAMBIO: { codigo: "SIN_CAMBIO", scriptid: "val_as_faov_ac_sin_cambio", texto: "Sin cambio", procesable: false },
        NO_PROCESABLE: { codigo: "NO_PROCESABLE", scriptid: "val_as_faov_ac_no_procesable", texto: "No procesable", procesable: false }
    };

    /** Ajuste que requiere la Ejecución de Orden de Artículo (Item Fulfillment) */
    const AJUSTES_EJECUCION = {
        NINGUNO: "NINGUNO",
        QUITAR: "QUITAR", // desmarcar la línea en todas sus Ejecuciones (o eliminar la Ejecución si queda vacía)
        REDUCIR: "REDUCIR", // bajar la cantidad ejecutada, desde la Ejecución más reciente y el último lote
        AUMENTAR: "AUMENTAR", // subir la cantidad en la Ejecución más reciente con lotes FEFO
        CREAR: "CREAR" // crear una Ejecución para la línea nueva del reemplazo
    };

    /** Columnas del CSV: nombre oficial y alias aceptados (se comparan normalizados) */
    const COLUMNAS_CSV = {
        CUENTA: { oficial: "CUENTA", alias: ["CUENTA", "NRO_CUENTA", "NRO CUENTA", "NUMERO CUENTA"], obligatoria: true },
        CRG_CORREL: { oficial: "CRG_CORREL", alias: ["CRG_CORREL", "LINEA (CRG_CORREL)", "LINEA", "CRGCORREL"], obligatoria: true },
        ID_ARTICULO: { oficial: "ID_ARTICULO", alias: ["ID_ARTICULO", "ID_NETSUIT", "ID_NETSUITE", "ID ARTICULO"], obligatoria: true },
        CANTIDAD_FINAL: { oficial: "CANTIDAD_FINAL", alias: ["CANTIDAD_FINAL", "CANTIDAD FINAL"], obligatoria: true },
        VALOR_UNITARIO: { oficial: "VALOR_UNITARIO", alias: ["VALOR_UNITARIO", "VALOR UNITARIO"], obligatoria: false }
    };

    /** Reglas de negocio */
    const REGLAS = {
        // Estados de OV que no se pueden modificar: C = Cancelada, G = Facturada, H = Cerrada
        ESTADOS_OV_NO_EDITABLES: ["C", "G", "H"],
        // Tipos de ítem que se ejecutan con Item Fulfillment
        TIPOS_ITEM_INVENTARIO: ["InvtPart", "Assembly"],
        // Tipos de ítem que no se pueden corregir con esta herramienta
        TIPOS_ITEM_NO_SOPORTADOS: ["Kit", "Group", "Description", "Subtotal", "Discount", "Markup", "Payment", "EndGroup"],
        // Vínculo OV -> Ejecución en NextTransactionLineLink
        TIPO_VINCULO_EJECUCION: "ShipRcpt",
        // Estados de inventario que no se pueden consumir (mismo criterio de AS_NSP_031)
        ESTADOS_INVENTARIO_EXCLUIDOS: ["Bloqueado", "En Inspección", "Damaged"],
        // Estados de OV cuyos lotes asignados se consideran comprometidos (mismo criterio de AS_NSP_031)
        ESTADOS_OV_COMPROMISO: ["B", "D", "E"],
        EPSILON: 0.00001,
        // Límite de elementos por cláusula IN en SuiteQL
        TAMANO_LOTE_IN: 500,
        // Cantidad de procesos que muestra el historial
        LIMITE_HISTORIAL: 200
    };

    /** Campos de NetSuite existentes en la cuenta (2WIN) */
    const CAMPOS = {
        CUENTA_PACIENTE: "custbody_2win_nro_cuenta_paciente",
        IDENTIFICADOR_FILA: "custcol_2win_as_identificador_fila",
        UBICACION_ES_AUTOPICKING: "custrecord_2win_is_autopicking",
        IF_AUTO_SELECCION: "custbody_2win_auto_seleccion",
        IF_ESTADO_ENVIADO: "C",
        // Campos de línea que se copian de la línea original a la línea nueva en un reemplazo
        COPIAR_EN_REEMPLAZO: [
            "department",
            "class",
            "custcol_2win_as_codigo_servicio",
            "custcol_2win_as_codigo_convenio",
            "custcol_2win_as_nombre_convenio",
            "custcol_2win_as_codigo_paquete",
            "custcol_2win_as_nombre_paquete",
            "custcol_2win_as_rut_financiador"
        ]
    };

    /** Cola de autopicking del partner (solo lectura, para no competir con ese proceso) */
    const COLA_AUTOPICKING = {
        TIPO: "customrecord_2win_autopicking_queue",
        CAMPO_ORDEN_VENTA: "custrecord_2win_apq_sales_order",
        CAMPO_ESTADO: "custrecord_2win_apq_estado",
        ESTADO_PENDIENTE: 1
    };

    /** Límites de texto */
    const LIMITES = {
        TEXTO: 3900,
        CLOB: 100000
    };

    return {
        RUTA_BASE,
        SCRIPTS,
        PARAMS,
        PANTALLAS,
        ACCIONES,
        CAMPOS_CARGA,
        CAMPOS_VALIDACION,
        FILTROS_HISTORIAL,
        SUBLISTAS,
        COLUMNAS_REEMPLAZO,
        MENSAJES,
        PROCESO,
        DETALLE,
        LISTAS,
        ESTADO_PROCESO,
        ESTADO_LINEA,
        ACCIONES_LINEA,
        AJUSTES_EJECUCION,
        COLUMNAS_CSV,
        REGLAS,
        CAMPOS,
        COLA_AUTOPICKING,
        LIMITES
    };
});
