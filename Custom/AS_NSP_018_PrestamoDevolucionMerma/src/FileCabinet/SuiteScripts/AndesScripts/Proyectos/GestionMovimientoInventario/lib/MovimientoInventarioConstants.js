/**
 * AS_NSP_018 — Prestamo, Devolucion y Merma
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

    const ESTADOS = {
        PENDIENTE_PROCESAR  : 'Pendiente de Procesar',
        PENDIENTE_DEVOLUCION: 'Pendiente de Devolucion',
        DEVUELTO_PARCIAL    : 'Devuelto Parcial',
        DEVUELTO_TOTAL      : 'Devuelto Total',
        PROCESADO           : 'Procesado',
        ANULADO             : 'Anulado',
    };

    const ESTADOS_EDITABLES = [ESTADOS.PENDIENTE_PROCESAR, ESTADOS.PENDIENTE_DEVOLUCION];

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
        MOVIMIENTO: 'customrecord_as_movimiento_inventario',
        DETALLE   : 'customrecord_as_mov_inventario_det',
        RECEPTOR  : 'customrecord_as_receptor_subsidiaria',
        TRASLADO  : 'inventorytransfer',
    };

    const LISTAS = {
        TIPO_MOVIMIENTO  : 'customlist_as_tipo_movimiento',
        ESTADO_MOVIMIENTO: 'customlist_as_estado_movimiento',
        MOTIVO_BAJA      : 'customlist_as_motivo_baja',
    };

    const PLANTILLAS = {
        PRESTAMO  : '/SuiteScripts/AndesScripts/Proyectos/GestionMovimientoInventario/templates/AS.FTL.PrestamoPDF.ftl',
        DEVOLUCION: '/SuiteScripts/AndesScripts/Proyectos/GestionMovimientoInventario/templates/AS.FTL.DevolucionPDF.ftl',
    };

    const OPERACIONES = {
        FORMULARIO: 'formulario',
        GUARDADO  : 'guardado',
        PROCESAR  : 'procesar',
        DEVOLVER  : 'devolver',
        ANULAR    : 'anular',
        IMPRIMIR  : 'imprimir',
        DISPONIBLE: 'disponible',
    };

    const SUITELET = {
        SCRIPT    : 'customscript_as_stlt_movimiento_inv',
        DEPLOYMENT: 'customdeploy_as_stlt_movimiento_inv',
    };

    const CLIENT_SCRIPT = '/SuiteScripts/AndesScripts/Proyectos/GestionMovimientoInventario/AS_MovimientoInventario_CS_2.1.js';
    
    const ROLES_AUTORIZADOS = [3, 1371];

    return {
        TIPOS      : TIPOS,
        ORDEN_TIPOS: ORDEN_TIPOS,

        ESTADOS          : ESTADOS,
        ESTADOS_EDITABLES: ESTADOS_EDITABLES,

        ETIQUETAS_FECHA      : ETIQUETAS_FECHA,
        ETIQUETAS_RESPONSABLE: ETIQUETAS_RESPONSABLE,
        ETIQUETAS_DETALLE    : ETIQUETAS_DETALLE,

        RECORDS: RECORDS,
        LISTAS : LISTAS,

        SUITELET     : SUITELET,
        OPERACIONES  : OPERACIONES,
        CLIENT_SCRIPT: CLIENT_SCRIPT,
        PLANTILLAS   : PLANTILLAS,

        LOGS             : LOGS,
        ROLES_AUTORIZADOS: ROLES_AUTORIZADOS,
    };
});
