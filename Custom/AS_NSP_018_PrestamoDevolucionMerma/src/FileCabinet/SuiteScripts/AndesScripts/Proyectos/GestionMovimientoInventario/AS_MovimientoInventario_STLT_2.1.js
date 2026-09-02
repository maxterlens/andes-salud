/**
 * AS_NSP_018 — Prestamo, Devolucion y Merma
 * @description Entry point del Suitelet de movimientos de inventario. Hace dos
 *              cosas y nada mas: rutear y registrar el error.
 *
 *              GET                → muestra el formulario de captura.
 *              GET movimiento     → abre el formulario cargado para editar ese
 *                                   movimiento.
 *              GET op=procesar    → genera el traslado del prestamo indicado.
 *              GET op=devolver    → genera el traslado de la devolucion indicada.
 *              GET op=disponible  → responde en JSON el stock de un articulo.
 *              GET op=anular      → anula el movimiento indicado.
 *              GET op=imprimir    → devuelve el comprobante en PDF.
 *              POST               → guarda la cabecera y sus lineas de detalle,
 *                                   o actualiza el movimiento que se edita.
 *
 *              Las cuatro que escriben -guardar, procesar, devolver y anular-
 *              pasan antes por validarPermisoEscritura. Las tres que solo leen
 *              van directo: el formulario no guarda nada por si solo, el
 *              comprobante lo necesita quien recibe el material, y el stock lo
 *              consulta el propio formulario.
 *
 *              El catch es el unico lugar del modulo que emite MOVIMIENTO ERROR:
 *              por aqui entra todo, asi que cualquier fallo sale con el id, la
 *              operacion y el motivo, sin que los handlers loguen nada.
 *
 * @NApiVersion 2.1
 * @NScriptType Suitelet
 * @NModuleScope Public
 * @scriptid     customscript_as_stlt_movimiento_inv
 * @deploymentid customdeploy_as_stlt_movimiento_inv
 */
define(['./lib/MovimientoInventarioConstants', './handlers/MovimientoInventarioForm', './handlers/MovimientoInventarioHandler', './handlers/PrestamoHandler', './handlers/DevolucionHandler', './handlers/ImpresionHandler'],
    (CONSTANTES, formulario, movimientoHandler, prestamoHandler, devolucionHandler, impresionHandler) => {

    const OPERACIONES = CONSTANTES.OPERACIONES;
    
    function onRequest(context) {
        const parametros = obtenerParametros(context);

        try {
            if (parametros.operacion === OPERACIONES.GUARDADO) {
                movimientoHandler.validarPermisoEscritura();
                movimientoHandler.guardarMovimiento(context);
            } else if (parametros.operacion === OPERACIONES.PROCESAR) {
                movimientoHandler.validarPermisoEscritura();
                prestamoHandler.generarTransferPrestamo(context);
            } else if (parametros.operacion === OPERACIONES.DEVOLVER) {
                movimientoHandler.validarPermisoEscritura();
                devolucionHandler.generarTransferDevolucion(context);
            } else if (parametros.operacion === OPERACIONES.ANULAR) {
                movimientoHandler.validarPermisoEscritura();
                movimientoHandler.anularMovimientoInventario(context);
            } else if (parametros.operacion === OPERACIONES.DISPONIBLE) {
                movimientoHandler.consultarDisponible(context);
            } else if (parametros.operacion === OPERACIONES.IMPRIMIR) {
                impresionHandler.imprimirMovimiento(context);
            } else {
                formulario.renderizarFormulario(context);
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
