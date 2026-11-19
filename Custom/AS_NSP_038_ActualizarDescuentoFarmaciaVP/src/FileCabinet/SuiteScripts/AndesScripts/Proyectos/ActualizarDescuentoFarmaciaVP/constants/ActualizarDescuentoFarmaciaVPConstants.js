/**
 * @NApiVersion 2.1
 * @NModuleScope SameAccount
 *
 * @description AS_NSP_038 - Constantes de ActualizarDescuentoFarmaciaVP.
 *              Centraliza IDs de scripts, parámetros, registros, listas, campos de pantalla y
 *              reglas de negocio para que ningún otro módulo tenga valores "en duro".
 */
define([], () => {
    const RUTA_BASE = "/SuiteScripts/AndesScripts/Proyectos/ActualizarDescuentoFarmaciaVP";

    /** Scripts del proyecto con sus deployments y parámetros */
    const SCRIPTS = {
        SUITELET: {
            ID: "customscript_as_adfv_sl",
            DEPLOY: "customdeploy_as_adfv_sl",
            PARAM_CARPETA: "custscript_as_adfv_carpeta",
            PARAM_DEPARTAMENTOS: "custscript_as_adfv_departamentos",
            PARAM_UBICACIONES_EXCLUIDAS: "custscript_as_adfv_ubic_excluidas",
            PARAM_RESTANTE_MINIMO: "custscript_as_adfv_restante_min",
            PARAM_TOLERANCIA: "custscript_as_adfv_tolerancia",
            PARAM_IVA: "custscript_as_adfv_iva"
        },
        MAP_REDUCE: {
            ID: "customscript_as_adfv_mr",
            DEPLOY: "customdeploy_as_adfv_mr",
            PARAM_PROCESO: "custscript_as_adfv_proceso"
        },
        CS_PATH: `${RUTA_BASE}/ui/AS_ActualizarDescuentoFarmaciaVP_CS_2.1.js`
    };

    /** Valores por defecto de los parámetros del Suitelet (si el deployment los deja vacíos) */
    const PARAMETROS_DEFECTO = {
        DEPARTAMENTOS: "136", // FARMACIA : FARMACIA VENTA PUBLICO
        UBICACIONES_EXCLUIDAS: "511",
        RESTANTE_MINIMO: 9,
        TOLERANCIA: 5,
        IVA: 19
    };

    /** Parámetros de URL del Suitelet */
    const PARAMS = {
        PANTALLA: "pantalla",
        PROCESO_ID: "proceso_id",
        ARCHIVO: "archivo",
        TOKEN: "token",
        MSG: "msg"
    };

    /** Pantallas del Suitelet (GET) */
    const PANTALLAS = {
        PARAMETROS: "parametros",
        VALIDACION: "validacion",
        HISTORIAL: "historial",
        DETALLE: "detalle",
        DESCARGAR_VALIDACION: "descargar_validacion",
        DESCARGAR_RESULTADO: "descargar_resultado"
    };

    /** Acciones POST del Suitelet */
    const ACCIONES = {
        BUSCAR: "buscar",
        PROCESAR: "procesar",
        REVALIDAR: "revalidar"
    };

    /** Campos custpage_* de la pantalla de Parámetros */
    const CAMPOS_PARAMETROS = {
        ACCION: "custpage_accion",
        SUBSIDIARIA: "custpage_subsidiaria",
        DESDE: "custpage_desde",
        HASTA: "custpage_hasta",
        OBSERVACION: "custpage_observacion"
    };

    /** Campos custpage_* (ocultos) de la pantalla de Validación */
    const CAMPOS_VALIDACION = {
        ACCION: "custpage_accion",
        ARCHIVO_ID: "custpage_archivo_id",
        TOKEN: "custpage_token"
    };

    /**
     * Búsqueda pendiente de procesar: JSON temporal por usuario en la carpeta de archivos.
     * Se sobrescribe en cada búsqueda; el registro del proceso se crea recién al presionar Procesar.
     */
    const BUSQUEDA_TEMPORAL = {
        PREFIJO: "ADFV_busqueda_usuario_"
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
        NO_PROCESABLES: "custpage_sl_no_procesables",
        SIN_DIFERENCIA: "custpage_sl_sin_diferencia",
        HISTORIAL: "custpage_sl_historial"
    };

    /** Columnas de la sublista Por procesar que leen el handler y el client script */
    const COLUMNAS_SELECCION = {
        PROCESAR: "custpage_p_procesar",
        FACTURA_ID: "custpage_p_factura_id"
    };

    /** Mensajes que llegan por el parámetro "msg" después de una redirección */
    const MENSAJES = {
        validado: { tipo: "CONFIRMATION", titulo: "Búsqueda realizada", texto: "Revise las facturas, desmarque las que no desea corregir y presione Procesar." },
        procesando: { tipo: "CONFIRMATION", titulo: "Proceso iniciado", texto: "El proceso se está ejecutando en segundo plano. Abra el proceso para ver su avance." },
        revalidado: { tipo: "CONFIRMATION", titulo: "Validación actualizada", texto: "Se volvió a buscar y validar las facturas con los datos actuales de NetSuite." },
        busqueda_no_vigente: { tipo: "WARNING", titulo: "Búsqueda no vigente", texto: "La búsqueda ya no está disponible (se hizo otra búsqueda o ya se procesó). Vuelva a buscar." },
        no_encontrado: { tipo: "ERROR", titulo: "Proceso no encontrado", texto: "No se encontró el proceso indicado." }
    };

    /** Registro cabecera del proceso */
    const PROCESO = {
        TIPO: "customrecord_as_adfv_proceso",
        PREFIJO_NOMBRE: "ADFV-",
        CAMPOS: {
            SUBSIDIARIA: "custrecord_as_adfv_subsidiaria",
            FECHA_DESDE: "custrecord_as_adfv_fecha_desde",
            FECHA_HASTA: "custrecord_as_adfv_fecha_hasta",
            ESTADO: "custrecord_as_adfv_estado",
            USUARIO: "custrecord_as_adfv_usuario",
            OBSERVACION: "custrecord_as_adfv_observacion",
            ARCHIVO_DATOS: "custrecord_as_adfv_archivo_datos",
            TOTAL_REVISADAS: "custrecord_as_adfv_total_revisadas",
            TOTAL_CON_DIFERENCIA: "custrecord_as_adfv_total_con_dif",
            TOTAL_PROCESABLES: "custrecord_as_adfv_total_procesables",
            TOTAL_SELECCIONADAS: "custrecord_as_adfv_total_seleccion",
            TOTAL_PROCESADAS: "custrecord_as_adfv_total_procesadas",
            TOTAL_OMITIDAS: "custrecord_as_adfv_total_omitidas",
            TOTAL_ERRORES: "custrecord_as_adfv_total_errores",
            RESUMEN: "custrecord_as_adfv_resumen",
            TASK_ID: "custrecord_as_adfv_task_id",
            FECHA_INICIO: "custrecord_as_adfv_fecha_inicio",
            FECHA_FIN: "custrecord_as_adfv_fecha_fin",
            ERROR: "custrecord_as_adfv_error"
        }
    };

    /** Registro de detalle: una fila por línea de descuento revisada (hijo del proceso) */
    const DETALLE = {
        TIPO: "customrecord_as_adfv_detalle",
        CAMPOS: {
            PROCESO: "custrecord_as_adfv_det_proceso",
            FACTURA: "custrecord_as_adfv_det_factura",
            LINEA_ARTICULO: "custrecord_as_adfv_det_linea_art",
            ARTICULO: "custrecord_as_adfv_det_articulo",
            CANT_ARTICULO: "custrecord_as_adfv_det_cant_art",
            LINEA_DESCUENTO: "custrecord_as_adfv_det_linea_desc",
            DESCUENTO: "custrecord_as_adfv_det_descuento",
            CANT_DESC_ANTES: "custrecord_as_adfv_det_cant_desc_ant",
            CANT_DESC_DESPUES: "custrecord_as_adfv_det_cant_desc_des",
            TARIFA_DESC: "custrecord_as_adfv_det_tarifa_desc",
            IMPORTE_DESC_ANTES: "custrecord_as_adfv_det_imp_desc_ant",
            IMPORTE_DESC_DESPUES: "custrecord_as_adfv_det_imp_desc_des",
            RESTANTE_ANTES: "custrecord_as_adfv_det_rest_antes",
            RESTANTE_ESPERADO: "custrecord_as_adfv_det_rest_esperado",
            RESTANTE_DESPUES: "custrecord_as_adfv_det_rest_despues",
            ESTADO: "custrecord_as_adfv_det_estado",
            MENSAJE: "custrecord_as_adfv_det_mensaje"
        }
    };

    /** Listas personalizadas */
    const LISTAS = {
        ESTADO_PROCESO: "customlist_as_adfv_estado_proceso",
        ESTADO_LINEA: "customlist_as_adfv_estado_linea"
    };

    /**
     * Estados del proceso: scriptid del valor de customlist_as_adfv_estado_proceso y texto.
     * La lógica usa el scriptid (ListaRepository resuelve el ID interno), nunca el texto.
     */
    const ESTADO_PROCESO = {
        EN_PROCESO: { scriptid: "val_as_adfv_ep_en_proceso", texto: "En proceso" },
        COMPLETADO: { scriptid: "val_as_adfv_ep_completado", texto: "Completado" },
        COMPLETADO_ERRORES: { scriptid: "val_as_adfv_ep_completado_err", texto: "Completado con errores" },
        ERROR: { scriptid: "val_as_adfv_ep_error", texto: "Error" }
    };

    /** Estados de la factura / línea en el detalle (customlist_as_adfv_estado_linea) */
    const ESTADO_LINEA = {
        PROCESADA: { scriptid: "val_as_adfv_el_procesada", texto: "Procesada" },
        SIN_CAMBIO: { scriptid: "val_as_adfv_el_sin_cambio", texto: "Sin cambio" },
        OMITIDA: { scriptid: "val_as_adfv_el_omitida", texto: "Omitida" },
        NO_PROCESABLE: { scriptid: "val_as_adfv_el_no_procesable", texto: "No procesable" },
        ERROR: { scriptid: "val_as_adfv_el_error", texto: "Error" }
    };

    /** Clasificación de cada factura en la validación */
    const CLASIFICACION = {
        POR_PROCESAR: { codigo: "POR_PROCESAR", texto: "Actualizar cantidad del descuento" },
        NO_PROCESABLE: { codigo: "NO_PROCESABLE", texto: "No procesable" },
        SIN_DIFERENCIA: { codigo: "SIN_DIFERENCIA", texto: "Sin diferencia" }
    };

    /** Reglas de negocio */
    const REGLAS = {
        // Tipo de artículo de la línea de descuento (itemtype de NetSuite)
        TIPO_DESCUENTO: "Service",
        // Texto que debe contener el nombre del artículo de descuento (se compara sin tildes ni mayúsculas)
        TEXTO_DESCUENTO: "descuento",
        // Estado de la factura que se puede corregir (statusref)
        ESTADO_FACTURA_ABIERTA: "open",
        // Diferencia máxima aceptada entre el importe restante validado y el actual antes de modificar
        TOLERANCIA_CAMBIO_RESTANTE: 1,
        // Decimales de la moneda (CLP = 0): el IVA de cada línea se redondea a esta precisión, como en NetSuite
        DECIMALES_MONEDA: 0,
        EPSILON: 0.00001,
        // Límite de elementos por cláusula IN en SuiteQL
        TAMANO_LOTE_IN: 500,
        // Cantidad de procesos que muestra el historial
        LIMITE_HISTORIAL: 200
    };

    /** Límites de texto */
    const LIMITES = {
        TEXTO: 3900,
        CLOB: 100000
    };

    return {
        RUTA_BASE,
        SCRIPTS,
        PARAMETROS_DEFECTO,
        PARAMS,
        PANTALLAS,
        ACCIONES,
        CAMPOS_PARAMETROS,
        CAMPOS_VALIDACION,
        FILTROS_HISTORIAL,
        BUSQUEDA_TEMPORAL,
        SUBLISTAS,
        COLUMNAS_SELECCION,
        MENSAJES,
        PROCESO,
        DETALLE,
        LISTAS,
        ESTADO_PROCESO,
        ESTADO_LINEA,
        CLASIFICACION,
        REGLAS,
        LIMITES
    };
});
