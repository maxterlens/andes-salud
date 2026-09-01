/**
 * AS_NSP_018 — Prestamo, Devolucion y Merma
 * @description Cabecera central del modulo: todo lo que mas de un archivo
 *              necesita nombrar igual. Los valores de las customlists, los
 *              custom records, las listas, el Suitelet, el client script, los
 *              roles que pueden escribir y las plantillas del comprobante.
 *
 *              Son el contrato entre pantallas, handlers y repositorios: un
 *              valor de lista que se renombre en NetSuite se corrige aqui y en
 *              ningun otro lado.
 *
 *              Los ids de campo NO viven aqui a proposito. Cada uno se usa en la
 *              operacion que lo lee o lo escribe, y verlo literal ahi dice mas
 *              que un nombre que obliga a saltar a este archivo. La excepcion es
 *              lo de arriba: nombres que si cruzan de un archivo a otro.
 *
 * @NApiVersion 2.1
 * @NModuleScope Public
 */
define([], () => {

    // customlist_as_tipo_movimiento
    const TIPOS = {
        PRESTAMO  : 'Prestamo',
        DEVOLUCION: 'Devolucion',
        MERMA     : 'Merma',
    };

    // El combo del formulario se muestra en el orden del proceso, no alfabetico:
    // la busqueda de la lista devuelve los valores ordenados por nombre. Un tipo
    // nuevo se suma aqui y aparece en la pantalla de captura.
    const ORDEN_TIPOS = [TIPOS.PRESTAMO, TIPOS.DEVOLUCION, TIPOS.MERMA];

    // customlist_as_estado_movimiento. El recorrido es:
    // Prestamo   Pendiente de Procesar -> Pendiente de Devolucion -> Devuelto Parcial -> Devuelto Total
    // Devolucion Pendiente de Procesar -> Procesado
    // Cualquiera Pendiente de Procesar -> Anulado
    const ESTADOS = {
        PENDIENTE_PROCESAR  : 'Pendiente de Procesar',
        PENDIENTE_DEVOLUCION: 'Pendiente de Devolucion',
        DEVUELTO_PARCIAL    : 'Devuelto Parcial',
        DEVUELTO_TOTAL      : 'Devuelto Total',
        PROCESADO           : 'Procesado',
        ANULADO             : 'Anulado',
    };

    // Hasta donde se deja corregir un movimiento. Es una sola regla leida desde
    // tres lados: el User Event manda estos estados al Suitelet en vez de abrir
    // el registro, les deja el boton Edit, y corta el guardado del resto.
    const ESTADOS_EDITABLES = [ESTADOS.PENDIENTE_PROCESAR, ESTADOS.PENDIENTE_DEVOLUCION];

    // El mismo movimiento se lee igual en la pantalla de captura y en la vista del
    // registro: cada tipo nombra su fecha y su responsable con lo que significan
    // ahi. Estan aqui para que las dos pantallas no puedan separarse.
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

    // Los tres unicos logs del modulo. Estan aqui porque dos de ellos se emiten
    // desde mas de un archivo y el titulo es con lo que se filtra el Execution
    // Log: si uno se escribe distinto, la busqueda deja de encontrarlo.
    const LOGS = {
        REGISTRADO: 'MOVIMIENTO REGISTRADO',
        PROCESADO : 'MOVIMIENTO PROCESADO',
        ERROR     : 'MOVIMIENTO ERROR',
    };

    // Las columnas del detalle se llaman igual en la pantalla de captura y en la
    // vista del registro: es el mismo movimiento visto en dos pantallas. Mismo
    // motivo que ETIQUETAS_FECHA y ETIQUETAS_RESPONSABLE. Las que existen en una
    // sola -Disponible, Cantidad a Devolver- se quedan donde se usan.
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
        TRASLADO  : 'inventorytransfer',
    };

    const LISTAS = {
        TIPO_MOVIMIENTO  : 'customlist_as_tipo_movimiento',
        ESTADO_MOVIMIENTO: 'customlist_as_estado_movimiento',
        MOTIVO_BAJA      : 'customlist_as_motivo_baja',
    };

    // Las dos plantillas del comprobante. Son dos y no una con condicionales: el
    // de prestamo lleva el seguimiento por linea y firma quien recibe; el de
    // devolucion solo dice cuanto volvio y firma al reves.
    const PLANTILLAS = {
        PRESTAMO  : '/SuiteScripts/AndesScripts/Proyectos/GestionMovimientoInventario/templates/AS.FTL.PrestamoPDF.ftl',
        DEVOLUCION: '/SuiteScripts/AndesScripts/Proyectos/GestionMovimientoInventario/templates/AS.FTL.DevolucionPDF.ftl',
    };

    // Lo que el Suitelet sabe hacer. El client script las escribe en la URL y el
    // Suitelet las rutea: es el contrato entre las dos, y por eso viven aqui.
    // FORMULARIO y GUARDADO no viajan en la URL -son el GET sin op y el POST-
    // pero se nombran igual para que el router se lea parejo.
    const OPERACIONES = {
        FORMULARIO: 'formulario',
        GUARDADO  : 'guardado',
        PROCESAR  : 'procesar',
        DEVOLVER  : 'devolver',
        ANULAR    : 'anular',
        IMPRIMIR  : 'imprimir',
        DISPONIBLE: 'disponible',
    };

    // La pantalla de captura. La usan el client script para navegar y el User
    // Event para redirigir la creacion y la edicion.
    const SUITELET = {
        SCRIPT    : 'customscript_as_stlt_movimiento_inv',
        DEPLOYMENT: 'customdeploy_as_stlt_movimiento_inv',
    };

    // Las dos pantallas del modulo cargan el mismo client script: el Suitelet
    // para el comportamiento del formulario y la vista del registro para las
    // funciones de los botones.
    const CLIENT_SCRIPT = '/SuiteScripts/AndesScripts/Proyectos/GestionMovimientoInventario/AS_MovimientoInventario_CS_2.1.js';

    // Quien puede crear, editar, procesar y anular. Cualquier otro rol entra al
    // modulo en modo lectura: ve la lista, abre el movimiento con su detalle e
    // imprime el comprobante, y nada mas.
    //   3    Administrator
    //   1371 QF CASPM
    // Son ids internos de esta cuenta: hay que verificarlos en Produccion antes
    // del pase, porque no coinciden si el rol se creo a mano en cada una.
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
