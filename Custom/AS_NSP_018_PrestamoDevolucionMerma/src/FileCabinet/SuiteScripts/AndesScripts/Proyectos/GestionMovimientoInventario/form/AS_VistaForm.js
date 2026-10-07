/**
 * AS_NSP_018 — Prestamo, Devolucion y Merma
 * @description Dibuja la cabecera del movimiento en modo ver, con las lineas y
 *              el estado del prestamo que le pasa el UE handler: oculta los
 *              campos que no aplican al tipo, pinta el tab de detalle con las
 *              columnas que ese tipo usa y agrega el boton de proceso que
 *              corresponde.
 *
 *              El Prestamo se ve distinto al resto: es el unico que lleva el
 *              seguimiento de lo devuelto y lo pendiente por linea. Una Devolucion
 *              o una Merma solo muestran lo que movieron.
 *
 *              Los botones que escriben solo se pintan para los roles
 *              autorizados; un rol de solo lectura ve el movimiento y su
 *              comprobante, y nada mas.
 * @NApiVersion 2.1
 * @NModuleScope Public
 */
define(['N/ui/serverWidget', 'N/ui/message', '../constants/AS_MovimientoInventarioConstants'],
    (serverWidget, message, CONSTANTES) => {

    // ─────────────────────────────────────────────────────────────────────────
    // Principales
    // ─────────────────────────────────────────────────────────────────────────

    function ajustarVista(form, registro, datos) {
        const tipo = datos.tipo;

        form.getField({ id: 'custrecord_as_mov_fecha' }).label          = CONSTANTES.ETIQUETAS_FECHA[tipo] || 'Fecha';
        form.getField({ id: 'custrecord_as_mov_usuario_resp' }).label   = CONSTANTES.ETIQUETAS_RESPONSABLE[tipo] || 'Usuario Responsable';
        form.getField({ id: 'custrecord_as_mov_ubicacion' }).label      = CONSTANTES.ETIQUETAS_UBICACION[tipo] || 'Ubicacion Origen';

        const esPrestamoALaClinica = tipo === CONSTANTES.TIPOS.PRESTAMO
                                  && !!registro.getValue({ fieldId: 'custrecord_as_mov_a_la_clinica' });
        const esDevolucionALaClinica = tipo === CONSTANTES.TIPOS.DEVOLUCION
                                    && !!registro.getValue({ fieldId: 'custrecord_as_mov_a_la_clinica' });
        form.getField({ id: 'custrecord_as_mov_transfer' }).label =
            (tipo === CONSTANTES.TIPOS.MERMA || esPrestamoALaClinica || esDevolucionALaClinica)
            ? 'Ajuste Generado' : 'Traslado Generado';
        if (esPrestamoALaClinica) {
            form.getField({ id: 'custrecord_as_mov_ubicacion' })
                .updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN });
            form.getField({ id: 'custrecord_as_mov_entidad_receptora' }).label = 'Entidad Emisora del Prestamo';
        }
        if (esDevolucionALaClinica) {
            form.getField({ id: 'custrecord_as_mov_ubicacion_dest' })
                .updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN });
            form.getField({ id: 'custrecord_as_mov_entidad_receptora' }).label = 'Entidad Emisora del Prestamo';
        }

        if (tipo !== CONSTANTES.TIPOS.MERMA) {
            form.getField({ id: 'custrecord_as_mov_motivo' })
                .updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN });
            if (!esPrestamoALaClinica && !esDevolucionALaClinica) {
                form.getField({ id: 'custrecord_as_mov_cuenta_ajuste' })
                    .updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN });
            }
        }

        if (tipo === CONSTANTES.TIPOS.MERMA) {
            form.getField({ id: 'custrecord_as_mov_de_la_clinica' })
                .updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN });
            form.getField({ id: 'custrecord_as_mov_a_la_clinica' })
                .updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN });
            form.getField({ id: 'custrecord_as_mov_entidad_receptora' })
                .updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN });
            form.getField({ id: 'custrecord_as_mov_ubicacion_dest' })
                .updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN });
        }

        if (tipo !== CONSTANTES.TIPOS.DEVOLUCION) {
            form.getField({ id: 'custrecord_as_mov_prestamo_ref' })
                .updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN });
        }

        if (!registro.getValue({ fieldId: 'custrecord_as_mov_transfer' })) {
            form.getField({ id: 'custrecord_as_mov_transfer' })
                .updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN });
            form.getField({ id: 'custrecord_as_mov_procesado_por' })
                .updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN });
            form.getField({ id: 'custrecord_as_mov_fecha_proceso' })
                .updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN });
        }

        if (datos.noEditable) {
            avisarNoEditable(form, datos.estado);
        }

        pintarDetalle(form, registro, datos);

        agregarBotones(form, registro, datos);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Secundarias
    // ─────────────────────────────────────────────────────────────────────────

    function avisarNoEditable(form, estado) {
        form.addPageInitMessage({
            type   : message.Type.WARNING,
            title  : 'Este movimiento ya no se puede editar',
            message: 'El movimiento esta en estado ' + estado + '. '
                   + 'Solo se puede editar mientras esta en ' + CONSTANTES.ESTADOS.PENDIENTE_PROCESAR + '.',
        });
    }

    function pintarDetalle(form, registro, datos) {
        const tipo = datos.tipo;

        const tabDetalle = form.addTab({
            id   : 'custpage_tab_detalle',
            label: 'Detalle',
        });

        form.insertTab({ tab: tabDetalle, nexttab: 'notes' });

        const sublista = form.addSublist({
            id   : 'custpage_sl_detalle',
            type : serverWidget.SublistType.STATICLIST,
            label: CONSTANTES.ETIQUETAS_DETALLE.TITULO,
            tab  : 'custpage_tab_detalle',
        });

        const lineas = datos.lineas;

        const esPrestamo = (tipo === CONSTANTES.TIPOS.PRESTAMO);
        const esDevolucionALaClinica = tipo === CONSTANTES.TIPOS.DEVOLUCION
                                    && !!registro.getValue({ fieldId: 'custrecord_as_mov_a_la_clinica' });
        const prestadaPorLinea = {};
        const lotePorLinea = {};
        datos.lineasPrestamo.forEach((linea) => {
            prestadaPorLinea[linea.id] = linea.cantidad;
            if (esDevolucionALaClinica) lotePorLinea[linea.id] = linea.lote;
        });
        const muestraLote = lineas.some((linea) => linea.lote || lotePorLinea[linea.lineaPrestamo]);

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

        lineas.forEach((linea, indice) => {
            sublista.setSublistValue({ id: 'custpage_col_articulo', line: indice, value: linea.articuloTexto });

            const lote = linea.lote || lotePorLinea[linea.lineaPrestamo];
            if (muestraLote && lote) {
                sublista.setSublistValue({ id: 'custpage_col_lote', line: indice, value: lote });
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

    function agregarBotones(form, registro, datos) {
        const tipo                   = datos.tipo;
        const estado                 = datos.estado;
        const rolAutorizado          = datos.rolAutorizado;
        const devolucionSinPendiente = datos.devolucionSinPendiente;

        if (devolucionSinPendiente) {
            form.addPageInitMessage({
                type   : message.Type.WARNING,
                title  : 'Esta devolucion ya no se puede procesar',
                message: 'Otra devolucion del prestamo ' + registro.getText({ fieldId: 'custrecord_as_mov_prestamo_ref' })
                       + ' se proceso antes que esta y ya cubrio todo lo que estaba pendiente, '
                       + 'asi que el prestamo quedo Devuelto Total. '
                       + 'Este movimiento no alcanzo a mover inventario: se puede anular sin consecuencias.',
            });
        }

        if (!rolAutorizado
            || devolucionSinPendiente
            || !CONSTANTES.ESTADOS_EDITABLES.includes(estado)) {
            form.removeButton({ id: 'edit' });
        }

        if (!rolAutorizado) {
            form.removeButton({ id: 'delete' });
            form.removeButton({ id: 'makecopy' });
        }

        form.clientScriptModulePath = CONSTANTES.CLIENT_SCRIPT;

        if (rolAutorizado) {
            form.addButton({
                id          : 'custpage_btn_nuevo',
                label       : 'Nuevo Movimiento',
                functionName: 'crearMovimientoInventario',
            });
        }

        if ((tipo === CONSTANTES.TIPOS.PRESTAMO
            || tipo === CONSTANTES.TIPOS.DEVOLUCION
            || tipo === CONSTANTES.TIPOS.MERMA) && !devolucionSinPendiente) {
            form.addButton({
                id          : 'custpage_btn_imprimir',
                label       : 'Imprimir Comprobante',
                functionName: 'imprimirMovimiento',
            });
        }

        if (!rolAutorizado || estado === CONSTANTES.ESTADOS.ANULADO) {
            return;
        }

        if (estado === CONSTANTES.ESTADOS.PENDIENTE_PROCESAR) {
            form.addButton({
                id          : 'custpage_btn_anular',
                label       : 'Anular Movimiento',
                functionName: 'anularMovimientoInventario',
            });
        }

        if (tipo === CONSTANTES.TIPOS.PRESTAMO && estado === CONSTANTES.ESTADOS.PENDIENTE_PROCESAR) {
            form.addButton({
                id          : 'custpage_btn_procesar',
                label       : 'Procesar Prestamo',
                functionName: 'procesarPrestamo',
            });
        }

        if (tipo === CONSTANTES.TIPOS.DEVOLUCION
            && estado === CONSTANTES.ESTADOS.PENDIENTE_PROCESAR && !devolucionSinPendiente) {
            form.addButton({
                id          : 'custpage_btn_devolver',
                label       : 'Procesar Devolucion',
                functionName: 'procesarDevolucion',
            });
        }

        if (tipo === CONSTANTES.TIPOS.MERMA && estado === CONSTANTES.ESTADOS.PENDIENTE_PROCESAR) {
            form.addButton({
                id          : 'custpage_btn_mermar',
                label       : 'Procesar Merma',
                functionName: 'procesarMerma',
            });
        }
    }

    return {
        ajustarVista: ajustarVista,
    };
});
