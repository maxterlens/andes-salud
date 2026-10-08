/**
 * AS_NSP_018 — Prestamo, Devolucion y Merma
 * @description Client script del proyecto. Cubre dos pantallas:
 *              Suitelet de captura → recarga el formulario al cambiar el tipo o el
 *              prestamo relacionado, porque el servidor arma campos y columnas
 *              distintos para cada uno, y llena las columnas calculadas.
 *              Cabecera del registro → funciones de los botones Nuevo, Imprimir,
 *              Anular, Procesar y Devolver, referenciadas por nombre desde el
 *              User Event.
 * @NApiVersion 2.1
 * @NScriptType ClientScript
 * @NModuleScope Public
 */
define(['N/url', 'N/https', 'N/currentRecord', 'N/ui/message', './constants/AS_MovimientoInventarioConstants'],
    (url, https, currentRecord, message, CONSTANTES) => {

    let movimientoEnProceso = false;

    const stockPorLote = {};

    function pageInit(context) {
        const registroActual = context.currentRecord;
        if (!registroActual.getField({ fieldId: 'custpage_sentido' })) return;
        const sentido = registroActual.getValue({ fieldId: 'custpage_sentido' });
        registroActual.setValue({
            fieldId          : 'custpage_de_la_clinica',
            value            : sentido === CONSTANTES.SENTIDOS.DE_LA_CLINICA,
            ignoreFieldChange: true,
        });
        registroActual.setValue({
            fieldId          : 'custpage_a_la_clinica',
            value            : sentido === CONSTANTES.SENTIDOS.A_LA_CLINICA,
            ignoreFieldChange: true,
        });
    }

    function fieldChanged(context) {
        const registroActual = context.currentRecord;
        const esALaClinica = context.sublistId === 'custpage_sl_detalle'
                           && registroActual.getField({ fieldId: 'custpage_a_la_clinica' })
                           && registroActual.getValue({ fieldId: 'custpage_a_la_clinica' });

        if (context.sublistId === 'custpage_sl_detalle' && context.fieldId === 'custpage_col_articulo') {
            if (esALaClinica) {
                mostrarUnidadALaClinica(registroActual);
            } else {
                mostrarDisponible(registroActual);
            }
            return;
        }

        if (context.sublistId === 'custpage_sl_detalle' && context.fieldId === 'custpage_col_lote') {
            if (!esALaClinica) mostrarStockDelLote(registroActual);
            return;
        }

        if (context.sublistId === 'custpage_sl_detalle' && context.fieldId === 'custpage_col_cantidad') {
            redondearCantidad(registroActual, 'custpage_col_cantidad');
            if (!esALaClinica) topearCantidadPrestada(registroActual);
            return;
        }

        if (context.sublistId === 'custpage_sl_detalle' && context.fieldId === 'custpage_col_a_devolver') {
            redondearCantidad(registroActual, 'custpage_col_a_devolver');
            topearCantidadADevolver(registroActual);
            return;
        }

        if (context.fieldId === 'custpage_tipo') {
            recargarFormulario(registroActual);
            return;
        }

        if (context.fieldId === 'custpage_de_la_clinica' || context.fieldId === 'custpage_a_la_clinica') {
            const marcado          = registroActual.getValue({ fieldId: context.fieldId });
            const eligioALaClinica = (context.fieldId === 'custpage_a_la_clinica') === marcado;
            const sentido          = eligioALaClinica ? CONSTANTES.SENTIDOS.A_LA_CLINICA : CONSTANTES.SENTIDOS.DE_LA_CLINICA;
            registroActual.setValue({
                fieldId          : 'custpage_de_la_clinica',
                value            : !eligioALaClinica,
                ignoreFieldChange: true,
            });
            registroActual.setValue({
                fieldId          : 'custpage_a_la_clinica',
                value            : eligioALaClinica,
                ignoreFieldChange: true,
            });
            registroActual.getField({ fieldId: 'custpage_de_la_clinica' }).isDisabled = true;
            registroActual.getField({ fieldId: 'custpage_a_la_clinica' }).isDisabled = true;
            recargarFormulario(registroActual, sentido);
            return;
        }

        if (context.fieldId === 'custpage_prestamo_ref') {
            recargarFormulario(registroActual);
            return;
        }

        if (context.fieldId === 'custpage_subsidiaria') {
            actualizarPorSubsidiaria(registroActual);
            return;
        }

        if (context.fieldId === 'custpage_entidad_receptora' && esDevolucion(registroActual)) {
            cargarPrestamosDeSubsidiaria(registroActual);
            return;
        }
    }

    function saveRecord(context) {
        const registroActual = context.currentRecord;
        const campoALaClinica = registroActual.getField({ fieldId: 'custpage_a_la_clinica' });
        const esALaClinica = campoALaClinica && registroActual.getValue({ fieldId: 'custpage_a_la_clinica' });

        if (registroActual.getValue({ fieldId: 'custpage_detalle_bloqueado' }) === 'T') {
            return true;
        }

        const totalLineas = registroActual.getLineCount({ sublistId: 'custpage_sl_detalle' });

        if (totalLineas < 1) {
            alert('Agrega al menos un articulo al detalle antes de guardar. '
                + 'Recuerda confirmar la linea con el boton Add.');

            return false;
        }

        if (!esDevolucion(registroActual)) {
            for (let i = 0; i < totalLineas; i++) {
                const cantidad = Number(registroActual.getSublistValue({
                    sublistId: 'custpage_sl_detalle',
                    fieldId  : 'custpage_col_cantidad',
                    line     : i,
                }));

                if (cantidad <= 0) {
                    alert('La cantidad tiene que ser mayor que cero. Revisa la linea ' + (i + 1) + '.');

                    return false;
                }

                if (!esALaClinica) {
                    const disponible = Number(registroActual.getSublistValue({
                        sublistId: 'custpage_sl_detalle',
                        fieldId  : 'custpage_col_disponible',
                        line     : i,
                    }));

                    if (cantidad > disponible) {
                        alert('La linea ' + (i + 1) + ' pide ' + cantidad + ' y solo hay ' + disponible + '.');

                        return false;
                    }
                }
            }
        }

        if (esDevolucion(registroActual)) {
            let lineasConCantidad = 0;

            for (let i = 0; i < totalLineas; i++) {
                const aDevolver = Number(registroActual.getSublistValue({
                    sublistId: 'custpage_sl_detalle',
                    fieldId  : 'custpage_col_a_devolver',
                    line     : i,
                }));

                if (aDevolver > 0) {
                    lineasConCantidad++;
                }
            }

            if (lineasConCantidad < 1) {
                alert('Indica cuanto vas a devolver: al menos un articulo tiene que llevar una cantidad mayor que cero.');

                return false;
            }
        }

        return true;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Principales
    // ─────────────────────────────────────────────────────────────────────────

    function crearMovimientoInventario() {
        window.location.href = url.resolveScript({
            scriptId    : CONSTANTES.SUITELET.SCRIPT,
            deploymentId: CONSTANTES.SUITELET.DEPLOYMENT,
        });
    }

    function imprimirMovimiento() {
        window.open(url.resolveScript({
            scriptId    : CONSTANTES.SUITELET.SCRIPT,
            deploymentId: CONSTANTES.SUITELET.DEPLOYMENT,
            params      : {
                op          : CONSTANTES.OPERACIONES.IMPRIMIR,
                idMovimiento: currentRecord.get().id,
            },
        }), '_blank');
    }

    function anularMovimientoInventario() {
        if (!confirm('Se anulara el movimiento. Confirma?')) {
            return;
        }

        window.location.href = url.resolveScript({
            scriptId    : CONSTANTES.SUITELET.SCRIPT,
            deploymentId: CONSTANTES.SUITELET.DEPLOYMENT,
            params      : {
                op          : CONSTANTES.OPERACIONES.ANULAR,
                idMovimiento: currentRecord.get().id,
            },
        });
    }

    /**
     * Un boton Procesar por tipo. El Suitelet lee el check del registro y decide
     * si genera traslado o ajuste: el boton no lo elige.
     */
    function procesarPrestamo() {
        procesarMovimiento('custpage_btn_procesar', CONSTANTES.OPERACIONES.PROCESAR_PRESTAMO, 'Se esta procesando el prestamo.');
    }

    function procesarDevolucion() {
        procesarMovimiento('custpage_btn_devolver', CONSTANTES.OPERACIONES.PROCESAR_DEVOLUCION, 'Se esta procesando la devolucion.');
    }

    function procesarMerma() {
        procesarMovimiento('custpage_btn_mermar', CONSTANTES.OPERACIONES.PROCESAR_MERMA, 'Se esta procesando la merma.');
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Secundarias
    // ─────────────────────────────────────────────────────────────────────────

    function mostrarUnidadALaClinica(registroActual) {
        const articulo = registroActual.getCurrentSublistValue({
            sublistId: 'custpage_sl_detalle',
            fieldId  : 'custpage_col_articulo',
        });
        const ubicacionDestino = registroActual.getValue({ fieldId: 'custpage_ubicacion_dest' });
        if (!articulo || !ubicacionDestino) return;

        const stock = consultarStock(articulo, ubicacionDestino);
        registroActual.setCurrentSublistValue({
            sublistId: 'custpage_sl_detalle',
            fieldId  : 'custpage_col_unidad',
            value    : stock.unidad,
        });
    }

    function consultarStock(articulo, ubicacion) {
        const respuesta = https.get({
            url: url.resolveScript({
                scriptId    : CONSTANTES.SUITELET.SCRIPT,
                deploymentId: CONSTANTES.SUITELET.DEPLOYMENT,
                params      : {
                    op       : CONSTANTES.OPERACIONES.DISPONIBLE,
                    articulo : articulo,
                    ubicacion: ubicacion,
                },
            }),
        });

        return JSON.parse(respuesta.body);
    }

    function mostrarDisponible(registroActual) {
        const ubicacion = registroActual.getValue({ fieldId: 'custpage_ubicacion' });

        if (!ubicacion) {
            alert('Selecciona primero la Ubicacion Origen para ver el stock disponible.');
            return;
        }

        const articulo = registroActual.getCurrentSublistValue({
            sublistId: 'custpage_sl_detalle',
            fieldId  : 'custpage_col_articulo',
        });

        const stock = consultarStock(articulo, ubicacion);

        registroActual.setCurrentSublistValue({
            sublistId: 'custpage_sl_detalle',
            fieldId  : 'custpage_col_unidad',
            value    : stock.unidad,
        });

        registroActual.setCurrentSublistValue({
            sublistId: 'custpage_sl_detalle',
            fieldId  : 'custpage_col_disponible',
            value    : stock.disponible,
        });

        cargarLotesDelArticulo(registroActual, stock.lotes);
    }

    function cargarLotesDelArticulo(registroActual, lotes) {
        const campoLote = registroActual.getSublistField({
            sublistId: 'custpage_sl_detalle',
            fieldId  : 'custpage_col_lote',
            line     : registroActual.getCurrentSublistIndex({ sublistId: 'custpage_sl_detalle' }),
        });

        campoLote.removeSelectOption({ value: null });
        campoLote.insertSelectOption({ value: '', text: '' });

        if (!lotes.length) {
            return;
        }

        const articulo = registroActual.getCurrentSublistText({
            sublistId: 'custpage_sl_detalle',
            fieldId  : 'custpage_col_articulo',
        });

        const idArticulo = registroActual.getCurrentSublistValue({
            sublistId: 'custpage_sl_detalle',
            fieldId  : 'custpage_col_articulo',
        });

        lotes.forEach((lote) => {
            stockPorLote[idArticulo + '|' + lote.nombre] = lote.enMano;

            campoLote.insertSelectOption({
                value: lote.nombre,
                text : articulo + ' - ' + lote.nombre + ' (hay ' + lote.enMano + ')',
            });
        });
    }

    function mostrarStockDelLote(registroActual) {
        const idArticulo = registroActual.getCurrentSublistValue({
            sublistId: 'custpage_sl_detalle',
            fieldId  : 'custpage_col_articulo',
        });
        const lote = registroActual.getCurrentSublistValue({
            sublistId: 'custpage_sl_detalle',
            fieldId  : 'custpage_col_lote',
        });

        if (stockPorLote[idArticulo + '|' + lote] === undefined) {
            const ubicacion = registroActual.getValue({ fieldId: 'custpage_ubicacion' });

            consultarStock(idArticulo, ubicacion).lotes.forEach((fila) => {
                stockPorLote[idArticulo + '|' + fila.nombre] = fila.enMano;
            });
        }

        const enMano = stockPorLote[idArticulo + '|' + lote];

        if (enMano === undefined) {
            return;
        }

        registroActual.setCurrentSublistValue({
            sublistId: 'custpage_sl_detalle',
            fieldId  : 'custpage_col_disponible',
            value    : enMano,
        });
    }

    function redondearCantidad(registroActual, idCampo) {
        const cantidad = Number(registroActual.getCurrentSublistValue({
            sublistId: 'custpage_sl_detalle',
            fieldId  : idCampo,
        }));

        registroActual.setCurrentSublistValue({
            sublistId        : 'custpage_sl_detalle',
            fieldId          : idCampo,
            value            : Math.round(cantidad * 100) / 100,
            ignoreFieldChange: true,
        });
    }

    function topearCantidadPrestada(registroActual) {
        const cantidad = Number(registroActual.getCurrentSublistValue({
            sublistId: 'custpage_sl_detalle',
            fieldId  : 'custpage_col_cantidad',
        }));

        const lote = registroActual.getCurrentSublistValue({
            sublistId: 'custpage_sl_detalle',
            fieldId  : 'custpage_col_lote',
        });

        if (!lote) {
            return;
        }

        const disponible = Number(registroActual.getCurrentSublistValue({
            sublistId: 'custpage_sl_detalle',
            fieldId  : 'custpage_col_disponible',
        }));

        if (cantidad > disponible) {
            const cantidadDisponible = Math.floor(Math.round(disponible * 1000000) / 10000) / 100;

            alert('No hay tanto del lote ' + lote + ': quedan ' + disponible + '. Se ajusta a ' + cantidadDisponible + '.');

            registroActual.setCurrentSublistValue({
                sublistId: 'custpage_sl_detalle',
                fieldId  : 'custpage_col_cantidad',
                value    : cantidadDisponible,
            });
        }
    }

    function topearCantidadADevolver(registroActual) {
        const aDevolver = Number(registroActual.getCurrentSublistValue({
            sublistId: 'custpage_sl_detalle',
            fieldId  : 'custpage_col_a_devolver',
        }));
        const pendiente = Number(registroActual.getCurrentSublistValue({
            sublistId: 'custpage_sl_detalle',
            fieldId  : 'custpage_col_pendiente',
        }));

        if (aDevolver < 0) {
            alert('La cantidad a devolver no puede ser negativa.');

            registroActual.setCurrentSublistValue({
                sublistId: 'custpage_sl_detalle',
                fieldId  : 'custpage_col_a_devolver',
                value    : 0,
            });

            return;
        }

        if (aDevolver > pendiente) {
            const cantidadPendiente = Math.floor(Math.round(pendiente * 1000000) / 10000) / 100;

            alert('No se puede devolver mas de lo pendiente de esta linea: quedan ' + pendiente + '. Se ajusta a ' + cantidadPendiente + '.');

            registroActual.setCurrentSublistValue({
                sublistId: 'custpage_sl_detalle',
                fieldId  : 'custpage_col_a_devolver',
                value    : cantidadPendiente,
            });
        }
    }

    function recargarFormulario(registroActual, sentido) {
        let sentidoElegido = sentido;
        if (!sentidoElegido) {
            const campoALaClinica = registroActual.getField({ fieldId: 'custpage_a_la_clinica' });
            sentidoElegido = campoALaClinica && registroActual.getValue({ fieldId: 'custpage_a_la_clinica' })
                           ? CONSTANTES.SENTIDOS.A_LA_CLINICA : CONSTANTES.SENTIDOS.DE_LA_CLINICA;
        }
        const parametros = {
            tipo       : registroActual.getValue({ fieldId: 'custpage_tipo' }),
            sentido    : sentidoElegido,
            fecha      : encodeURIComponent(registroActual.getText({ fieldId: 'custpage_fecha' })),
            responsable: registroActual.getValue({ fieldId: 'custpage_usuario_resp' }),
            comentarios: encodeURIComponent(registroActual.getValue({ fieldId: 'custpage_comentarios' })),
        };

        if (esDevolucion(registroActual)) {
            parametros.prestamo = registroActual.getValue({ fieldId: 'custpage_prestamo_ref' });
        }

        setWindowChanged(window, false);
        window.location.href = url.resolveScript({
            scriptId    : CONSTANTES.SUITELET.SCRIPT,
            deploymentId: CONSTANTES.SUITELET.DEPLOYMENT,
            params      : parametros,
        });
    }

    function esDevolucion(registroActual) {
        return !!registroActual.getField({ fieldId: 'custpage_prestamo_ref' });
    }

    function actualizarPorSubsidiaria(registroActual) {
        if (esDevolucion(registroActual)) {
            cargarEntidadesConPendientes(registroActual);
            cargarPrestamosDeSubsidiaria(registroActual);
            return;
        }

        cargarUbicacionesDeSubsidiaria(registroActual);
        cargarEntidadesDeSubsidiaria(registroActual);
        cargarCuentasDeSubsidiaria(registroActual);
    }

    /**
     * Filtro de la Devolucion: solo las entidades que tienen un prestamo pendiente en
     * la subsidiaria, sacadas de los mismos prestamos del combo. Una entidad sin nada
     * pendiente dejaria el combo de prestamos vacio.
     */
    function cargarEntidadesConPendientes(registroActual) {
        const subsidiaria = registroActual.getValue({ fieldId: 'custpage_subsidiaria' });
        const datos       = JSON.parse(registroActual.getValue({ fieldId: 'custpage_ubicaciones_data' }));

        const campoEntidad = registroActual.getField({ fieldId: 'custpage_entidad_receptora' });

        campoEntidad.removeSelectOption({ value: null });
        campoEntidad.insertSelectOption({ value: '', text: '' });

        const entidadesAgregadas = [];

        datos.prestamos.forEach((prestamo) => {
            if (prestamo.subsidiaria !== subsidiaria || !prestamo.idEntidad) {
                return;
            }

            if (entidadesAgregadas.includes(prestamo.idEntidad)) {
                return;
            }

            entidadesAgregadas.push(prestamo.idEntidad);

            campoEntidad.insertSelectOption({ value: prestamo.idEntidad, text: prestamo.entidad });
        });
    }

    function cargarPrestamosDeSubsidiaria(registroActual) {
        const subsidiaria = registroActual.getValue({ fieldId: 'custpage_subsidiaria' });
        const entidad     = registroActual.getValue({ fieldId: 'custpage_entidad_receptora' });
        const datos       = JSON.parse(registroActual.getValue({ fieldId: 'custpage_ubicaciones_data' }));

        const campoPrestamo = registroActual.getField({ fieldId: 'custpage_prestamo_ref' });

        campoPrestamo.removeSelectOption({ value: null });
        campoPrestamo.insertSelectOption({ value: '', text: '' });

        datos.prestamos.forEach((prestamo) => {
            if (prestamo.subsidiaria !== subsidiaria) {
                return;
            }

            if (entidad && prestamo.idEntidad !== entidad) {
                return;
            }

            campoPrestamo.insertSelectOption({
                value: prestamo.id,
                text : prestamo.nombre + ' - ' + prestamo.entidad
                     + ' - ' + prestamo.ubicacion
                     + ' - pendiente ' + prestamo.pendiente,
            });
        });
    }

    function cargarUbicacionesDeSubsidiaria(registroActual) {
        const subsidiaria = registroActual.getValue({ fieldId: 'custpage_subsidiaria' });
        const datos       = JSON.parse(registroActual.getValue({ fieldId: 'custpage_ubicaciones_data' }));

        const campoFrom = registroActual.getField({ fieldId: 'custpage_ubicacion' });
        const campoTo   = registroActual.getField({ fieldId: 'custpage_ubicacion_dest' });

        if (!datos.esALaClinica) {
            campoFrom.removeSelectOption({ value: null });
            campoFrom.insertSelectOption({ value: '', text: '' });
        }

        if (!datos.esMerma) {
            campoTo.removeSelectOption({ value: null });
            campoTo.insertSelectOption({ value: '', text: '' });
        }

        datos.ubicaciones.forEach((ubicacion) => {
            if (ubicacion.subsidiaria !== subsidiaria) {
                return;
            }

            if (!datos.esALaClinica && (!datos.esPrestamo || !ubicacion.esBodegaPrestamo)) {
                campoFrom.insertSelectOption({ value: ubicacion.id, text: ubicacion.nombre });
            }

            if (datos.esMerma) {
                return;
            }

            if (!datos.esPrestamo || ubicacion.esBodegaPrestamo) {
                campoTo.insertSelectOption({ value: ubicacion.id, text: ubicacion.nombre });
            }
        });

        const bodega = datos.ubicaciones.filter((ubicacion) => ubicacion.subsidiaria === subsidiaria
                                                            && ubicacion.esBodegaPrestamo)[0];

        if (datos.esPrestamo && bodega) {
            registroActual.setValue({ fieldId: 'custpage_ubicacion_dest', value: bodega.id });
        }
    }

    function cargarEntidadesDeSubsidiaria(registroActual) {
        const campoEntidad = registroActual.getField({ fieldId: 'custpage_entidad_receptora' });

        if (!campoEntidad) {
            return;
        }

        const subsidiaria = registroActual.getValue({ fieldId: 'custpage_subsidiaria' });
        const datos       = JSON.parse(registroActual.getValue({ fieldId: 'custpage_ubicaciones_data' }));

        if (datos.esMerma) {
            return;
        }

        campoEntidad.removeSelectOption({ value: null });
        campoEntidad.insertSelectOption({ value: '', text: '' });

        datos.entidades.forEach((entidad) => {
            if (entidad.subsidiaria !== subsidiaria) {
                return;
            }

            campoEntidad.insertSelectOption({ value: entidad.id, text: entidad.nombre });
        });
    }

    function cargarCuentasDeSubsidiaria(registroActual) {
        const campoCuenta = registroActual.getField({ fieldId: 'custpage_cuenta_ajuste' });

        if (!campoCuenta) {
            return;
        }

        const subsidiaria = registroActual.getValue({ fieldId: 'custpage_subsidiaria' });
        const datos       = JSON.parse(registroActual.getValue({ fieldId: 'custpage_ubicaciones_data' }));

        campoCuenta.removeSelectOption({ value: null });
        campoCuenta.insertSelectOption({ value: '', text: '' });

        datos.cuentas.forEach((cuenta) => {
            if (cuenta.subsidiaria !== subsidiaria) {
                return;
            }

            campoCuenta.insertSelectOption({ value: cuenta.id, text: cuenta.nombre });
        });
    }

    function procesarMovimiento(idBoton, operacion, detalle) {
        if (movimientoEnProceso) return;

        movimientoEnProceso = true;

        const boton = document.getElementById(idBoton);

        if (boton) boton.disabled = true;

        message.create({
            title  : 'Procesando el movimiento',
            message: detalle + ' No cierres ni recargues la pagina.',
            type   : message.Type.WARNING,
        }).show();

        window.location.href = url.resolveScript({
            scriptId    : CONSTANTES.SUITELET.SCRIPT,
            deploymentId: CONSTANTES.SUITELET.DEPLOYMENT,
            params      : {
                op          : operacion,
                idMovimiento: currentRecord.get().id,
            },
        });
    }

    return {
        pageInit                  : pageInit,
        fieldChanged              : fieldChanged,
        saveRecord                : saveRecord,
        crearMovimientoInventario : crearMovimientoInventario,
        imprimirMovimiento        : imprimirMovimiento,
        anularMovimientoInventario: anularMovimientoInventario,
        procesarPrestamo          : procesarPrestamo,
        procesarDevolucion        : procesarDevolucion,
        procesarMerma             : procesarMerma,
    };
});
