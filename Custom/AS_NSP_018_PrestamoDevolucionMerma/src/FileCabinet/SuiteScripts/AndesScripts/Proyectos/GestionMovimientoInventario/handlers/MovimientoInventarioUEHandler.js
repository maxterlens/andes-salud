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

        if (!esVista) {
            CAMPOS_BLOQUEADOS_EN_EDICION.forEach((idCampo) => {
                context.form.getField({ id: idCampo })
                    .updateDisplayType({ displayType: serverWidget.FieldDisplayType.DISABLED });
            });
        }

        if (tipo !== CONSTANTES.TIPOS.MERMA) {
            context.form.getField({ id: 'custrecord_as_mov_motivo' })
                .updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN });
        }

        if (tipo === CONSTANTES.TIPOS.MERMA) {
            context.form.getField({ id: 'custrecord_as_mov_entidad_receptora' })
                .updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN });
        }

        if (tipo !== CONSTANTES.TIPOS.DEVOLUCION) {
            context.form.getField({ id: 'custrecord_as_mov_prestamo_ref' })
                .updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN });
        }

        context.form.getField({ id: 'custrecord_as_mov_fecha_devolucion' })
            .updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN });

        if (!context.newRecord.getValue({ fieldId: 'custrecord_as_mov_transfer' })) {
            context.form.getField({ id: 'custrecord_as_mov_transfer' })
                .updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN });
            context.form.getField({ id: 'custrecord_as_mov_procesado_por' })
                .updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN });
            context.form.getField({ id: 'custrecord_as_mov_fecha_proceso' })
                .updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN });
        }

        if (!esVista) {
            return;
        }

        const rolAutorizado = CONSTANTES.ROLES_AUTORIZADOS.includes(runtime.getCurrentUser().role);

        pintarDetalle(context, tipo);

        agregarBotones(context, tipo, estado, rolAutorizado);
    }

    function pintarDetalle(context, tipo) {
        const tabDetalle = context.form.addTab({
            id   : 'custpage_tab_detalle',
            label: 'Detalle',
        });

        context.form.insertTab({ tab: tabDetalle, nexttab: 'notes' });

        const sublista = context.form.addSublist({
            id   : 'custpage_sl_detalle',
            type : serverWidget.SublistType.STATICLIST,
            label: CONSTANTES.ETIQUETAS_DETALLE.TITULO,
            tab  : 'custpage_tab_detalle',
        });

        const lineas = movimientoRepository.buscarLineasPorMovimiento(context.newRecord.id);

        const esPrestamo = (tipo === CONSTANTES.TIPOS.PRESTAMO);

        const muestraLote = lineas.some((linea) => linea.lote);

        sublista.addField({ id: 'custpage_col_articulo', type: serverWidget.FieldType.TEXT, label: CONSTANTES.ETIQUETAS_DETALLE.ARTICULO });
        sublista.addField({ id: 'custpage_col_unidad',   type: serverWidget.FieldType.TEXT, label: CONSTANTES.ETIQUETAS_DETALLE.UNIDAD });

        if (muestraLote) {
            sublista.addField({ id: 'custpage_col_lote', type: serverWidget.FieldType.TEXT, label: CONSTANTES.ETIQUETAS_DETALLE.LOTE });
        }

        if (esPrestamo) {
            sublista.addField({ id: 'custpage_col_prestada',  type: serverWidget.FieldType.TEXT, label: CONSTANTES.ETIQUETAS_DETALLE.PRESTADA });
            sublista.addField({ id: 'custpage_col_devuelta',  type: serverWidget.FieldType.TEXT, label: CONSTANTES.ETIQUETAS_DETALLE.DEVUELTA });
            sublista.addField({ id: 'custpage_col_pendiente', type: serverWidget.FieldType.TEXT, label: CONSTANTES.ETIQUETAS_DETALLE.PENDIENTE });
        } else if (tipo === CONSTANTES.TIPOS.DEVOLUCION) {
            sublista.addField({ id: 'custpage_col_prestada', type: serverWidget.FieldType.TEXT, label: CONSTANTES.ETIQUETAS_DETALLE.PRESTADA });
            sublista.addField({ id: 'custpage_col_cantidad', type: serverWidget.FieldType.TEXT, label: CONSTANTES.ETIQUETAS_DETALLE.DEVUELTA });
        } else {
            sublista.addField({ id: 'custpage_col_cantidad', type: serverWidget.FieldType.TEXT, label: CONSTANTES.ETIQUETAS_DETALLE.CANTIDAD });
        }

        const prestadaPorLinea = {};

        if (tipo === CONSTANTES.TIPOS.DEVOLUCION) {
            movimientoRepository.buscarLineasPorMovimiento(
                context.newRecord.getValue({ fieldId: 'custrecord_as_mov_prestamo_ref' })
            ).forEach((linea) => {
                prestadaPorLinea[linea.id] = linea.cantidad;
            });
        }

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

                if (prestadaPorLinea[linea.lineaPrestamo] !== undefined) {
                    sublista.setSublistValue({ id: 'custpage_col_prestada', line: indice, value: String(prestadaPorLinea[linea.lineaPrestamo]) });
                }
            }

            if (linea.unidadTexto) {
                sublista.setSublistValue({ id: 'custpage_col_unidad', line: indice, value: linea.unidadTexto });
            }
        });
    }

    function agregarBotones(context, tipo, estado, rolAutorizado) {
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

        if (!rolAutorizado
            || devolucionSinPendiente
            || !CONSTANTES.ESTADOS_EDITABLES.includes(estado)) {
            context.form.removeButton({ id: 'edit' });
        }

        context.form.clientScriptModulePath = CONSTANTES.CLIENT_SCRIPT;

        if (rolAutorizado) {
            context.form.addButton({
                id          : 'custpage_btn_nuevo',
                label       : 'Nuevo Movimiento',
                functionName: 'crearMovimientoInventario',
            });
        }

        if ((tipo === CONSTANTES.TIPOS.PRESTAMO || tipo === CONSTANTES.TIPOS.DEVOLUCION) && !devolucionSinPendiente) {
            context.form.addButton({
                id          : 'custpage_btn_imprimir',
                label       : 'Imprimir Comprobante',
                functionName: 'imprimirMovimiento',
            });
        }

        if (!rolAutorizado || estado === CONSTANTES.ESTADOS.ANULADO) {
            return;
        }

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
