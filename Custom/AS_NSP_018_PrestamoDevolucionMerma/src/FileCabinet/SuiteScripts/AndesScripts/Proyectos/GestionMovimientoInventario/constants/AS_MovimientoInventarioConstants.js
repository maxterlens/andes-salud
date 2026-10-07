/**
 * AS_NSP_018 — Prestamo, Devolucion y Merma
 * @description Valores fijos del modulo: ids de records, listas y scripts,
 *              estados, etiquetas y rutas del File Cabinet.
 *
 * @NApiVersion 2.1
 * @NModuleScope Public
 */
define([], () => {

    const TIPOS = {
        PRESTAMO  : 'Prestamo',
        DEVOLUCION: 'Devolucion',
        MERMA     : 'Merma',
    };

    const ORDEN_TIPOS = [TIPOS.PRESTAMO, TIPOS.DEVOLUCION, TIPOS.MERMA];

    const SENTIDOS = {
        DE_LA_CLINICA: 'de',
        A_LA_CLINICA : 'a',
    };

    const ESTADOS = {
        PENDIENTE_PROCESAR  : 'Pendiente de Procesar',
        PENDIENTE_DEVOLUCION: 'Pendiente de Devolucion',
        DEVUELTO_PARCIAL    : 'Devuelto Parcial',
        DEVUELTO_TOTAL      : 'Devuelto Total',
        PROCESADO           : 'Procesado',
        ANULADO             : 'Anulado',
    };

    const ESTADOS_EDITABLES = [ESTADOS.PENDIENTE_PROCESAR];

    const ETIQUETAS_FECHA = {
        Prestamo  : 'Fecha de Prestamo',
        Devolucion: 'Fecha de Devolucion',
        Merma     : 'Fecha de la Merma',
    };

    const ETIQUETAS_RESPONSABLE = {
        Prestamo  : 'Responsable del Prestamo',
        Devolucion: 'Responsable de la Devolucion',
        Merma     : 'Responsable de la Merma',
    };

    const ETIQUETAS_UBICACION = {
        Prestamo  : 'Ubicacion Origen',
        Devolucion: 'Ubicacion Origen',
        Merma     : 'Ubicacion de la Merma',
    };

    const LOGS = {
        REGISTRADO: 'MOVIMIENTO REGISTRADO',
        PROCESADO : 'MOVIMIENTO PROCESADO',
        ERROR     : 'MOVIMIENTO ERROR',
    };

    const ETIQUETAS_DETALLE = {
        TITULO   : 'Detalle de Productos',
        ARTICULO : 'Articulo',
        UNIDAD   : 'Unidad',
        LOTE     : 'Lote',
        PRESTADA : 'Prestada',
        DEVUELTA : 'Devuelta',
        PENDIENTE: 'Pendiente',
        CANTIDAD : 'Cantidad',
    };

    const RECORDS = {
        MOVIMIENTO : 'customrecord_as_movimiento_inventario',
        DETALLE    : 'customrecord_as_mov_inventario_det',
        CORRELATIVO: 'customrecord_as_mov_correlativo',
        RECEPTOR   : 'customrecord_as_receptor_subsidiaria',
        TRASLADO   : 'inventorytransfer',
        AJUSTE     : 'inventoryadjustment',
    };

    const CAMPOS_CORRELATIVO = {
        TIPO  : 'custrecord_as_mov_corr_tipo',
        ULTIMO: 'custrecord_as_mov_corr_ultimo',
    };

    const CORRELATIVO = {
        DIGITOS   : 6,
        REINTENTOS: 5,
        PREFIJOS  : {
            Prestamo  : 'PRE#',
            Devolucion: 'DEV#',
            Merma     : 'MER#',
        },
    };

    const LISTAS = {
        TIPO_MOVIMIENTO  : 'customlist_as_tipo_movimiento',
        ESTADO_MOVIMIENTO: 'customlist_as_estado_movimiento',
        MOTIVO_BAJA      : 'customlist_as_motivo_baja',
    };

    const PLANTILLAS = {
        PRESTAMO  : '/SuiteScripts/AndesScripts/Proyectos/GestionMovimientoInventario/templates/AS_ComprobantePrestamo.ftl',
        DEVOLUCION: '/SuiteScripts/AndesScripts/Proyectos/GestionMovimientoInventario/templates/AS_ComprobanteDevolucion.ftl',
        MERMA     : '/SuiteScripts/AndesScripts/Proyectos/GestionMovimientoInventario/templates/AS_ComprobanteMerma.ftl',
    };

    const OPERACIONES = {
        FORMULARIO         : 'formulario',
        GUARDADO           : 'guardado',
        PROCESAR_PRESTAMO  : 'procesar_prestamo',
        PROCESAR_DEVOLUCION: 'procesar_devolucion',
        PROCESAR_MERMA     : 'procesar_merma',
        ANULAR             : 'anular',
        IMPRIMIR           : 'imprimir',
        DISPONIBLE         : 'disponible',
    };

    const SUITELET = {
        SCRIPT    : 'customscript_as_stlt_movimiento_inv',
        DEPLOYMENT: 'customdeploy_as_stlt_movimiento_inv',
    };

    const CLIENT_SCRIPT = '/SuiteScripts/AndesScripts/Proyectos/GestionMovimientoInventario/AS_MovimientoInventario_CS_2.1.js';

    const CONSULTA_STOCK = {
        SCRIPT        : 'customscript_as_stlt_consulta_stock',
        DEPLOYMENT    : 'customdeploy_as_stlt_consulta_stock',
        CLIENT_SCRIPT : '/SuiteScripts/AndesScripts/Proyectos/GestionMovimientoInventario/AS_ConsultaStock_CS_2.1.js',
        TOPE_ARTICULOS: 200,
    };

    const ROLES_AUTORIZADOS = [3, 1371];

    return {
        TIPOS      : TIPOS,
        ORDEN_TIPOS: ORDEN_TIPOS,
        SENTIDOS   : SENTIDOS,

        ESTADOS          : ESTADOS,
        ESTADOS_EDITABLES: ESTADOS_EDITABLES,

        ETIQUETAS_FECHA      : ETIQUETAS_FECHA,
        ETIQUETAS_RESPONSABLE: ETIQUETAS_RESPONSABLE,
        ETIQUETAS_UBICACION  : ETIQUETAS_UBICACION,
        ETIQUETAS_DETALLE    : ETIQUETAS_DETALLE,

        RECORDS           : RECORDS,
        CAMPOS_CORRELATIVO: CAMPOS_CORRELATIVO,
        CORRELATIVO       : CORRELATIVO,
        LISTAS            : LISTAS,

        SUITELET     : SUITELET,
        OPERACIONES  : OPERACIONES,
        CLIENT_SCRIPT: CLIENT_SCRIPT,
        PLANTILLAS   : PLANTILLAS,

        CONSULTA_STOCK: CONSULTA_STOCK,

        LOGS             : LOGS,
        ROLES_AUTORIZADOS: ROLES_AUTORIZADOS,
    };
});
