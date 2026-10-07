/**
 * AS_NSP_018 — Prestamo, Devolucion y Merma
 * @description Entry point del Suitelet de movimientos de inventario. Hace dos
 *              cosas y nada mas: repartir cada operacion a su handler y
 *              registrar el error.
 *
 *              GET                          → AS_RegistroHandler.mostrarFormulario
 *              GET movimiento               → el mismo formulario, cargado para editar
 *              POST                         → AS_RegistroHandler.guardarMovimiento
 *              GET op=anular                → AS_RegistroHandler.anularMovimiento
 *              GET op=disponible            → AS_RegistroHandler.consultarDisponible (JSON)
 *              GET op=procesar_prestamo     → AS_PrestamoHandler.procesarPrestamo
 *              GET op=procesar_devolucion   → AS_DevolucionHandler.procesarDevolucion
 *              GET op=procesar_merma        → AS_MermaHandler.procesarMerma
 *              GET op=imprimir              → AS_ComprobanteHandler.imprimirComprobante (PDF)
 *
 *              Las que escriben -guardar, anular y los tres procesar- pasan antes
 *              por validarPermisoEscritura. Las que solo leen van directo: el
 *              formulario no guarda nada por si solo, el comprobante lo necesita
 *              quien recibe el material, y el stock lo consulta el propio
 *              formulario.
 *
 *              El catch es el unico lugar del modulo que emite MOVIMIENTO ERROR:
 *              por aqui entra todo, asi que cualquier fallo sale con el id, la
 *              operacion y el motivo, sin que los handlers loguen nada.
 * @NApiVersion 2.1
 * @NScriptType Suitelet
 * @NModuleScope Public
 * @scriptid     customscript_as_stlt_movimiento_inv
 * @deploymentid customdeploy_as_stlt_movimiento_inv
 */
define(['./constants/AS_MovimientoInventarioConstants', './handler/AS_RegistroHandler', './handler/AS_PrestamoHandler', './handler/AS_DevolucionHandler', './handler/AS_MermaHandler', './handler/AS_ComprobanteHandler'],
    (CONSTANTES, registroHandler, prestamoHandler, devolucionHandler, mermaHandler, comprobanteHandler) => {

    const OPERACIONES = CONSTANTES.OPERACIONES;

    function onRequest(context) {
        const parametros = obtenerParametros(context);

        try {
            if (parametros.operacion === OPERACIONES.GUARDADO) {
                registroHandler.validarPermisoEscritura();
                registroHandler.guardarMovimiento(context);
            } else if (parametros.operacion === OPERACIONES.ANULAR) {
                registroHandler.validarPermisoEscritura();
                registroHandler.anularMovimiento(context);
            } else if (parametros.operacion === OPERACIONES.DISPONIBLE) {
                registroHandler.consultarDisponible(context);
            } else if (parametros.operacion === OPERACIONES.PROCESAR_PRESTAMO) {
                registroHandler.validarPermisoEscritura();
                prestamoHandler.procesarPrestamo(context);
            } else if (parametros.operacion === OPERACIONES.PROCESAR_DEVOLUCION) {
                registroHandler.validarPermisoEscritura();
                devolucionHandler.procesarDevolucion(context);
            } else if (parametros.operacion === OPERACIONES.PROCESAR_MERMA) {
                registroHandler.validarPermisoEscritura();
                mermaHandler.procesarMerma(context);
            } else if (parametros.operacion === OPERACIONES.IMPRIMIR) {
                comprobanteHandler.imprimirComprobante(context);
            } else {
                registroHandler.mostrarFormulario(context);
            }
        } catch (fallo) {
            log.error({
                title  : CONSTANTES.LOGS.ERROR,
                details: 'movimiento: ' + parametros.idMovimiento
                       + ' | operacion: ' + parametros.operacion
                       + ' | motivo: ' + (fallo.message || fallo),
            });

            throw fallo;
        }
    }

    function obtenerParametros(context) {
        const parametros = context.request.parameters;

        let operacion = OPERACIONES.GUARDADO;

        if (context.request.method === 'GET') {
            operacion = parametros.op || OPERACIONES.FORMULARIO;
        }

        return {
            operacion   : operacion,
            idMovimiento: parametros.idMovimiento
                       || parametros.movimiento
                       || parametros.custpage_movimiento
                       || 'nuevo',
        };
    }

    return { onRequest };
});
