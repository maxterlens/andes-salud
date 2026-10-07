/**
 * AS_NSP_018 — Prestamo, Devolucion y Merma
 * @description Todo el comportamiento del User Event sobre la cabecera.
 *
 *              construirVista decide a donde va cada evento: la creacion y la
 *              edicion se mandan al Suitelet, y en modo ver lee las lineas y el
 *              estado del prestamo y le pasa todo a AS_VistaForm,
 *              que oculta los campos que no aplican, pinta el detalle y agrega
 *              los botones. Si algo se ve mal en pantalla, es en ese form.
 *
 *              Editar solo abre el formulario en Pendiente de Procesar. En
 *              cualquier otro estado ya hay una transaccion generada: el Editar
 *              de la lista nativa devuelve al registro en modo ver con un aviso,
 *              en vez de abrir un formulario que no se va a dejar guardar.
 *
 *              validarEdicion es la otra cara: corta el guardado de un movimiento
 *              que ya no se corrige. Las dos cosas viven juntas porque son la
 *              misma regla vista desde los dos lados, lo que se muestra y lo que
 *              se deja guardar.
 * @NApiVersion 2.1
 * @NModuleScope Public
 */
define(['N/redirect', 'N/error', 'N/runtime', '../constants/AS_MovimientoInventarioConstants', '../data/search/AS_MovimientoInventarioSearch', '../form/AS_VistaForm'],
    (redirect, error, runtime, CONSTANTES, movimientoSearch, vistaForm) => {

    // ─────────────────────────────────────────────────────────────────────────
    // Principales
    // ─────────────────────────────────────────────────────────────────────────

    function construirVista(context) {
        const rolAutorizado = CONSTANTES.ROLES_AUTORIZADOS.includes(runtime.getCurrentUser().role);

        if (context.type !== context.UserEventType.VIEW) {
            redirigirEscritura(context, rolAutorizado);
            return;
        }

        vistaForm.ajustarVista(context.form, context.newRecord, leerDatosVista(context, rolAutorizado));
    }

    function validarEdicion(context) {
        const esEscritura = context.type === context.UserEventType.CREATE
                         || context.type === context.UserEventType.COPY
                         || context.type === context.UserEventType.EDIT
                         || context.type === context.UserEventType.XEDIT
                         || context.type === context.UserEventType.DELETE;

        if (esEscritura
            && !CONSTANTES.ROLES_AUTORIZADOS.includes(runtime.getCurrentUser().role)) {
            throw error.create({
                name     : 'AS_ROL_NO_AUTORIZADO',
                message  : 'Tu rol es de solo consulta. No puedes crear, editar ni eliminar movimientos de inventario.',
                notifyOff: true,
            });
        }

        if (context.type !== context.UserEventType.EDIT) {
            return;
        }

        const estado = context.oldRecord.getText({ fieldId: 'custrecord_as_mov_estado' });

        if (CONSTANTES.ESTADOS_EDITABLES.includes(estado)) {
            return;
        }

        throw error.create({
            name     : 'AS_MOVIMIENTO_NO_EDITABLE',
            message  : 'El movimiento esta en estado ' + estado + ' y ya no se puede editar. '
                     + 'Registra un movimiento nuevo si necesitas corregirlo.',
            notifyOff: true,
        });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Secundarias
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Crear y copiar van al Suitelet. Editar abre el Suitelet solo en Pendiente de
     * Procesar; en otro estado vuelve al registro en modo ver con un aviso. Un rol
     * sin permiso que intenta escribir va al Suitelet, que le muestra el aviso de
     * solo consulta. Los demas eventos no hacen nada.
     */
    function redirigirEscritura(context, rolAutorizado) {
        const intentaEscribir = context.type === context.UserEventType.CREATE
                             || context.type === context.UserEventType.COPY
                             || context.type === context.UserEventType.EDIT;

        if (!rolAutorizado && intentaEscribir) {
            redirect.toSuitelet({
                scriptId    : CONSTANTES.SUITELET.SCRIPT,
                deploymentId: CONSTANTES.SUITELET.DEPLOYMENT,
            });

            return;
        }

        if (context.type === context.UserEventType.CREATE || context.type === context.UserEventType.COPY) {
            redirect.toSuitelet({
                scriptId    : CONSTANTES.SUITELET.SCRIPT,
                deploymentId: CONSTANTES.SUITELET.DEPLOYMENT,
            });

            return;
        }

        if (context.type !== context.UserEventType.EDIT) {
            return;
        }

        const registro = context.newRecord;

        if (CONSTANTES.ESTADOS_EDITABLES.includes(registro.getText({ fieldId: 'custrecord_as_mov_estado' }))) {
            redirect.toSuitelet({
                scriptId    : CONSTANTES.SUITELET.SCRIPT,
                deploymentId: CONSTANTES.SUITELET.DEPLOYMENT,
                parameters  : { movimiento: registro.id },
            });

            return;
        }

        redirect.toRecord({
            type      : CONSTANTES.RECORDS.MOVIMIENTO,
            id        : registro.id,
            parameters: { as_no_editable: 'T' },
        });
    }

    /**
     * Lo que el form necesita para pintar la vista: tipo y estado, las lineas, las
     * del prestamo si es una devolucion, y si la devolucion ya no tiene nada que
     * devolver porque otra cubrio todo el pendiente del prestamo.
     */
    function leerDatosVista(context, rolAutorizado) {
        const registro     = context.newRecord;
        const tipo         = registro.getText({ fieldId: 'custrecord_as_mov_tipo' });
        const estado       = registro.getText({ fieldId: 'custrecord_as_mov_estado' });
        const esDevolucion = tipo === CONSTANTES.TIPOS.DEVOLUCION;
        const idPrestamo   = registro.getValue({ fieldId: 'custrecord_as_mov_prestamo_ref' });

        return {
            tipo                  : tipo,
            estado                : estado,
            rolAutorizado         : rolAutorizado,
            noEditable            : context.request.parameters.as_no_editable === 'T',
            lineas                : movimientoSearch.obtenerLineasMovimiento(registro.id),
            lineasPrestamo        : esDevolucion ? movimientoSearch.obtenerLineasMovimiento(idPrestamo) : [],
            devolucionSinPendiente: esDevolucion
                                 && estado === CONSTANTES.ESTADOS.PENDIENTE_PROCESAR
                                 && movimientoSearch.obtenerEstadoMovimiento(idPrestamo) === CONSTANTES.ESTADOS.DEVUELTO_TOTAL,
        };
    }

    return {
        construirVista: construirVista,
        validarEdicion: validarEdicion,
    };
});
