/**
 * AS_NSP_018 — Prestamo, Devolucion y Merma
 * @description Todo el comportamiento del User Event sobre la cabecera.
 *
 *              construirVista arma la pantalla del registro: oculta los campos
 *              que no aplican al tipo, pinta el tab de detalle con las columnas
 *              que ese tipo usa y agrega el boton de proceso que corresponde. Si
 *              algo se ve mal en pantalla, es aqui.
 *
 *              El Prestamo se ve distinto al resto: es el unico que lleva el
 *              seguimiento de lo devuelto y lo pendiente por linea. Una Devolucion
 *              o una Merma solo muestran lo que movieron.
 *
 *              Los botones que escriben solo se pintan para los roles
 *              autorizados; un rol de solo lectura ve el movimiento y su
 *              comprobante, y nada mas.
 *
 *              validarEdicion es la otra cara: corta el guardado de un movimiento
 *              que ya no se corrige. Las dos cosas viven juntas porque son la
 *              misma regla vista desde los dos lados, lo que se muestra y lo que
 *              se deja guardar.
 *
 * @NApiVersion 2.1
 * @NModuleScope Public
 */
define(['N/ui/serverWidget', 'N/redirect', 'N/error', 'N/ui/message', 'N/runtime', '../lib/MovimientoInventarioConstants', '../repositories/MovimientoInventarioRepository'],
    (serverWidget, redirect, error, message, runtime, CONSTANTES, movimientoRepository) => {

    // A la edicion de un movimiento que ya no se corrige solo se llega por URL o
    // desde el link Edit de la lista: el boton del registro no esta. Los campos se
    // muestran bloqueados para que se vea antes de intentar guardar, que es donde
    // el User Event corta. Estado, Traslado, Procesado por y Fecha de Proceso ya
    // nacen bloqueados en la definicion del campo.
    const CAMPOS_BLOQUEADOS_EN_EDICION = [
        'custrecord_as_mov_tipo',
        'custrecord_as_mov_subsidiaria',
        'custrecord_as_mov_servicio',
        'custrecord_as_mov_ubicacion',
        'custrecord_as_mov_ubicacion_dest',
        'custrecord_as_mov_motivo',
        'custrecord_as_mov_prestamo_ref',
    ];

    function construirVista(context) {
        const esVista = (context.type === context.UserEventType.VIEW);

        // El formulario nativo del custom record solo captura la cabecera: el
        // detalle es un child record y se agrega despues, de a uno. Crear un
        // movimiento desde ahi deja un registro a medias, asi que el New de la
        // lista se manda a la misma pantalla de captura que usa la edicion.
        if (context.type === context.UserEventType.CREATE || context.type === context.UserEventType.COPY) {
            redirect.toSuitelet({
                scriptId    : CONSTANTES.SUITELET.SCRIPT,
                deploymentId: CONSTANTES.SUITELET.DEPLOYMENT,
            });

            return;
        }

        if (!esVista && context.type !== context.UserEventType.EDIT) {
            return;
        }

        const tipo   = context.newRecord.getText({ fieldId: 'custrecord_as_mov_tipo' });
        const estado = context.newRecord.getText({ fieldId: 'custrecord_as_mov_estado' });

        // Todo movimiento que todavia se corrige lo hace en la pantalla que lo
        // registro: es la unica que muestra el detalle junto a la cabecera. El
        // detalle es un child record y NetSuite no lo pinta al editar el registro,
        // asi que desde aqui el usuario editaria a ciegas. Si el rol no puede
        // editar, el corte lo da el Suitelet al recibirlo.
        if (!esVista && CONSTANTES.ESTADOS_EDITABLES.includes(estado)) {
            redirect.toSuitelet({
                scriptId    : CONSTANTES.SUITELET.SCRIPT,
                deploymentId: CONSTANTES.SUITELET.DEPLOYMENT,
                parameters  : { movimiento: context.newRecord.id },
            });

            return;
        }

        context.form.getField({ id: 'custrecord_as_mov_fecha' }).label          = CONSTANTES.ETIQUETAS_FECHA[tipo] || 'Fecha';
        context.form.getField({ id: 'custrecord_as_mov_usuario_resp' }).label   = CONSTANTES.ETIQUETAS_RESPONSABLE[tipo] || 'Usuario Responsable';

        // Va antes de ocultar Motivo y Prestamo Relacionado: si se bloquearan
        // despues, el updateDisplayType los volveria a mostrar.
        if (!esVista) {
            CAMPOS_BLOQUEADOS_EN_EDICION.forEach((idCampo) => {
                context.form.getField({ id: idCampo })
                    .updateDisplayType({ displayType: serverWidget.FieldDisplayType.DISABLED });
            });
        }

        // Motivo solo aplica a Merma
        if (tipo !== CONSTANTES.TIPOS.MERMA) {
            context.form.getField({ id: 'custrecord_as_mov_motivo' })
                .updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN });
        }

        // Prestamo Relacionado solo aplica a Devolucion
        if (tipo !== CONSTANTES.TIPOS.DEVOLUCION) {
            context.form.getField({ id: 'custrecord_as_mov_prestamo_ref' })
                .updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN });
        }

        // Fecha de Devolucion no la llena nadie: en un prestamo es un campo de
        // devolucion y en una devolucion la fecha del movimiento ya es esa. Se
        // oculta en los tres tipos hasta decidir si se elimina o se usa.
        context.form.getField({ id: 'custrecord_as_mov_fecha_devolucion' })
            .updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN });

        // El traslado y el sello de quien proceso solo existen despues de
        // procesar: mientras no haya traslado los tres campos estan vacios y no
        // aportan nada a la pantalla.
        if (!context.newRecord.getValue({ fieldId: 'custrecord_as_mov_transfer' })) {
            context.form.getField({ id: 'custrecord_as_mov_transfer' })
                .updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN });
            context.form.getField({ id: 'custrecord_as_mov_procesado_por' })
                .updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN });
            context.form.getField({ id: 'custrecord_as_mov_fecha_proceso' })
                .updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN });
        }

        // De aqui en adelante solo aplica a la vista: en edicion el detalle no
        // se toca. Para corregir un movimiento se anula y se crea otro.
        if (!esVista) {
            return;
        }

        pintarDetalle(context, tipo);

        agregarBotones(context, tipo, estado, CONSTANTES.ROLES_AUTORIZADOS.includes(runtime.getCurrentUser().role));
    }

    function pintarDetalle(context, tipo) {
        // Lista propia de detalle: el sublist nativo del child record trae la
        // barra de View, el buscador y los botones New/Attach, que aqui sobran.
        const tabDetalle = context.form.addTab({
            id   : 'custpage_tab_detalle',
            label: 'Detalle',
        });

        // addTab agrega al final: se mueve delante de Notes para que el detalle
        // sea lo primero que ve el usuario.
        context.form.insertTab({ tab: tabDetalle, nexttab: 'notes' });

        const sublista = context.form.addSublist({
            id   : 'custpage_sl_detalle',
            type : serverWidget.SublistType.STATICLIST,
            label: CONSTANTES.ETIQUETAS_DETALLE.TITULO,
            tab  : 'custpage_tab_detalle',
        });

        const lineas = movimientoRepository.buscarLineasPorMovimiento(context.newRecord.id);

        const esPrestamo = (tipo === CONSTANTES.TIPOS.PRESTAMO);

        // El lote de una devolucion se sella al procesar: mientras esta pendiente
        // no existe todavia y la columna se veria vacia. Se muestra solo si hay
        // algo que mostrar.
        const muestraLote = lineas.some((linea) => linea.lote);

        sublista.addField({ id: 'custpage_col_articulo', type: serverWidget.FieldType.TEXT, label: CONSTANTES.ETIQUETAS_DETALLE.ARTICULO });
        sublista.addField({ id: 'custpage_col_unidad',   type: serverWidget.FieldType.TEXT, label: CONSTANTES.ETIQUETAS_DETALLE.UNIDAD });

        // El lote es el mismo dato en los dos tipos, pero llega por caminos
        // distintos: en un prestamo lo eligio el usuario al capturar; en una
        // devolucion lo sello el proceso, leyendolo del traslado del prestamo.
        // Queda en blanco en un articulo sin control de lote y en los
        // movimientos anteriores a la captura de lote.
        if (muestraLote) {
            sublista.addField({ id: 'custpage_col_lote', type: serverWidget.FieldType.TEXT, label: CONSTANTES.ETIQUETAS_DETALLE.LOTE });
        }

        if (esPrestamo) {
            sublista.addField({ id: 'custpage_col_prestada',  type: serverWidget.FieldType.TEXT, label: CONSTANTES.ETIQUETAS_DETALLE.PRESTADA });
            sublista.addField({ id: 'custpage_col_devuelta',  type: serverWidget.FieldType.TEXT, label: CONSTANTES.ETIQUETAS_DETALLE.DEVUELTA });
            sublista.addField({ id: 'custpage_col_pendiente', type: serverWidget.FieldType.TEXT, label: CONSTANTES.ETIQUETAS_DETALLE.PENDIENTE });
        } else {
            const etiquetaCantidad = (tipo === CONSTANTES.TIPOS.DEVOLUCION) ? CONSTANTES.ETIQUETAS_DETALLE.DEVUELTA : CONSTANTES.ETIQUETAS_DETALLE.CANTIDAD;

            sublista.addField({ id: 'custpage_col_cantidad', type: serverWidget.FieldType.TEXT, label: etiquetaCantidad });
        }

        // setSublistValue espera texto: las cantidades vienen como numero del
        // repository y se convierten aqui, en el punto que las muestra.
        // La unidad es informativa y puede no estar: setSublistValue no acepta un
        // valor vacio, asi que la columna se deja en blanco sin llamarlo.
        lineas.forEach((linea, indice) => {
            sublista.setSublistValue({ id: 'custpage_col_articulo', line: indice, value: linea.articuloTexto });

            if (muestraLote && linea.lote) {
                sublista.setSublistValue({ id: 'custpage_col_lote', line: indice, value: linea.lote });
            }

            if (esPrestamo) {
                sublista.setSublistValue({ id: 'custpage_col_prestada',  line: indice, value: String(linea.cantidad) });
                sublista.setSublistValue({ id: 'custpage_col_devuelta',  line: indice, value: String(linea.devuelta) });
                sublista.setSublistValue({ id: 'custpage_col_pendiente', line: indice, value: String(linea.pendiente) });
            } else {
                sublista.setSublistValue({ id: 'custpage_col_cantidad', line: indice, value: String(linea.cantidad) });
            }

            if (linea.unidadTexto) {
                sublista.setSublistValue({ id: 'custpage_col_unidad', line: indice, value: linea.unidadTexto });
            }
        });
    }

    function agregarBotones(context, tipo, estado, rolAutorizado) {
        // Se pueden registrar dos devoluciones del mismo prestamo antes de procesar
        // ninguna: la primera que se procesa deja el prestamo sin pendiente y la
        // otra se queda sin nada que descontar. Ese movimiento ya no va a ocurrir,
        // asi que lo unico que se le ofrece es anularlo. El lookupFields solo se
        // ejecuta si los dos primeros terminos son verdaderos.
        const devolucionSinPendiente = tipo === CONSTANTES.TIPOS.DEVOLUCION
                                    && estado === CONSTANTES.ESTADOS.PENDIENTE_PROCESAR
                                    && movimientoRepository.obtenerEstadoMovimiento(
                                           context.newRecord.getValue({ fieldId: 'custrecord_as_mov_prestamo_ref' })
                                       ) === CONSTANTES.ESTADOS.DEVUELTO_TOTAL;

        if (devolucionSinPendiente) {
            context.form.addPageInitMessage({
                type   : message.Type.WARNING,
                title  : 'Esta devolucion ya no se puede procesar',
                message: 'Otra devolucion del prestamo ' + context.newRecord.getText({ fieldId: 'custrecord_as_mov_prestamo_ref' })
                       + ' se proceso antes que esta y ya cubrio todo lo que estaba pendiente, '
                       + 'asi que el prestamo quedo Devuelto Total. '
                       + 'Este movimiento no alcanzo a mover inventario: se puede anular sin consecuencias.',
            });
        }

        // Desde la primera devolucion el movimiento queda como esta: lo devuelto
        // se calcula contra sus lineas y el traslado es el respaldo de lo que se
        // movio. Se quita el boton en vez de dejar al usuario entrar a un
        // formulario que va a fallar al guardar. Una devolucion sin pendiente
        // tampoco se corrige: cualquier cantidad que se ponga sigue sin caber. Y
        // un rol de solo lectura no edita ninguno.
        if (!rolAutorizado
            || devolucionSinPendiente
            || !CONSTANTES.ESTADOS_EDITABLES.includes(estado)) {
            context.form.removeButton({ id: 'edit' });
        }

        // Las funciones de los botones viven en el client script: el JavaScript
        // inline en functionName no sobrevive al onclick que arma NetSuite.
        context.form.clientScriptModulePath = CONSTANTES.CLIENT_SCRIPT;

        // Registrar el siguiente movimiento sin pasar por la lista. Se agrega
        // tambien en un movimiento anulado: el caso tipico es anular y volver a
        // capturarlo.
        if (rolAutorizado) {
            context.form.addButton({
                id          : 'custpage_btn_nuevo',
                label       : 'Nuevo Movimiento',
                functionName: 'crearMovimientoInventario',
            });
        }

        // El comprobante solo existe para prestamo y devolucion: son los dos que
        // se firman contra el material que cambia de manos. Se puede imprimir en
        // cualquier estado menos Anulado, porque el papel se lleva a firmar antes
        // de procesar tanto como despues. En una devolucion sin pendiente no: no
        // hay movimiento que respaldar.
        if ((tipo === CONSTANTES.TIPOS.PRESTAMO || tipo === CONSTANTES.TIPOS.DEVOLUCION) && !devolucionSinPendiente) {
            context.form.addButton({
                id          : 'custpage_btn_imprimir',
                label       : 'Imprimir Comprobante',
                functionName: 'imprimirMovimiento',
            });
        }

        // Aqui termina lo que ve un rol de solo lectura: los botones que siguen
        // escriben, y el Suitelet se los rechazaria igual.
        if (!rolAutorizado || estado === CONSTANTES.ESTADOS.ANULADO) {
            return;
        }

        // Anular aplica a cualquier tipo mientras no haya movido inventario.
        if (estado === CONSTANTES.ESTADOS.PENDIENTE_PROCESAR) {
            context.form.addButton({
                id          : 'custpage_btn_anular',
                label       : 'Anular Movimiento',
                functionName: 'anularMovimientoInventario',
            });
        }

        if (tipo === CONSTANTES.TIPOS.PRESTAMO && estado === CONSTANTES.ESTADOS.PENDIENTE_PROCESAR) {
            context.form.addButton({
                id          : 'custpage_btn_procesar',
                label       : 'Procesar Prestamo',
                functionName: 'generarTransferPrestamo',
            });
        }

        if (tipo === CONSTANTES.TIPOS.DEVOLUCION && estado === CONSTANTES.ESTADOS.PENDIENTE_PROCESAR && !devolucionSinPendiente) {
            context.form.addButton({
                id          : 'custpage_btn_devolver',
                label       : 'Procesar Devolucion',
                functionName: 'generarTransferDevolucion',
            });
        }
    }

    // ------------------------------------------------------------------
    // beforeSubmit  hasta donde se deja corregir
    // ------------------------------------------------------------------

    function validarEdicion(context) {
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

    return {
        construirVista: construirVista,
        validarEdicion: validarEdicion,
    };
});
