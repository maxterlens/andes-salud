/**
 * AS_NSP_018 — Prestamo, Devolucion y Merma
 * @description Client script del proyecto. Cubre dos pantallas:
 *              Suitelet de captura → recarga el formulario al cambiar el tipo o el
 *              prestamo relacionado, porque el servidor arma campos y columnas
 *              distintos para cada uno, y llena las columnas calculadas.
 *              Cabecera del registro → funciones de los botones Nuevo, Imprimir,
 *              Anular, Procesar y Devolver, referenciadas por nombre desde el
 *              User Event.
 *
 * @NApiVersion 2.1
 * @NScriptType ClientScript
 * @NModuleScope Public
 */
define(['N/url', 'N/https', 'N/currentRecord', 'N/ui/message', './lib/MovimientoInventarioConstants'],
    (url, https, currentRecord, message, CONSTANTES) => {

    const stockPorLote = {};

    function saveRecord(context) {
        const registroActual = context.currentRecord;

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

    function fieldChanged(context) {
        const registroActual = context.currentRecord;

        if (context.sublistId === 'custpage_sl_detalle' && context.fieldId === 'custpage_col_articulo') {
            mostrarDisponible(registroActual);
            return;
        }

        if (context.sublistId === 'custpage_sl_detalle' && context.fieldId === 'custpage_col_lote') {
            mostrarStockDelLote(registroActual);
            return;
        }

        if (context.sublistId === 'custpage_sl_detalle' && context.fieldId === 'custpage_col_cantidad') {
            topearCantidadPrestada(registroActual);
            return;
        }

        if (context.sublistId === 'custpage_sl_detalle' && context.fieldId === 'custpage_col_a_devolver') {
            topearCantidadADevolver(registroActual);
            return;
        }

        if (context.fieldId === 'custpage_tipo') {
            recargarFormulario(registroActual);
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
    }

    function recargarFormulario(registroActual) {
        const parametros = {
            tipo       : registroActual.getValue({ fieldId: 'custpage_tipo' }),
            fecha      : encodeURIComponent(registroActual.getText({ fieldId: 'custpage_fecha' })),
            responsable: registroActual.getValue({ fieldId: 'custpage_usuario_resp' }),
            comentarios: encodeURIComponent(registroActual.getValue({ fieldId: 'custpage_comentarios' })),
        };

        if (esDevolucion(registroActual)) {
            parametros.prestamo = registroActual.getValue({ fieldId: 'custpage_prestamo_ref' });
        }

        window.location.href = url.resolveScript({
            scriptId    : CONSTANTES.SUITELET.SCRIPT,
            deploymentId: CONSTANTES.SUITELET.DEPLOYMENT,
            params      : parametros,
        });
    }

    function esDevolucion(registroActual) {
        return !!registroActual.getField({ fieldId: 'custpage_prestamo_ref' });
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
        if (!lotes.length) {
            return;
        }

        const articulo = registroActual.getCurrentSublistText({
            sublistId: 'custpage_sl_detalle',
            fieldId  : 'custpage_col_articulo',
        });

        const campoLote = registroActual.getSublistField({
            sublistId: 'custpage_sl_detalle',
            fieldId  : 'custpage_col_lote',
            line     : registroActual.getCurrentSublistIndex({ sublistId: 'custpage_sl_detalle' }),
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
            alert('No hay tanto del lote ' + lote + ': quedan ' + disponible + '.');

            registroActual.setCurrentSublistValue({
                sublistId: 'custpage_sl_detalle',
                fieldId  : 'custpage_col_cantidad',
                value    : disponible,
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
            alert('No se puede devolver mas de lo pendiente de esta linea: quedan ' + pendiente + '.');

            registroActual.setCurrentSublistValue({
                sublistId: 'custpage_sl_detalle',
                fieldId  : 'custpage_col_a_devolver',
                value    : pendiente,
            });
        }
    }

    function actualizarPorSubsidiaria(registroActual) {
        if (esDevolucion(registroActual)) {
            cargarPrestamosDeSubsidiaria(registroActual);
            return;
        }

        cargarUbicacionesDeSubsidiaria(registroActual);
        cargarEntidadesDeSubsidiaria(registroActual);
    }

    function cargarEntidadesDeSubsidiaria(registroActual) {
        const campoEntidad = registroActual.getField({ fieldId: 'custpage_entidad_receptora' });

        if (!campoEntidad) {
            return;
        }

        const subsidiaria = registroActual.getValue({ fieldId: 'custpage_subsidiaria' });
        const datos       = JSON.parse(registroActual.getValue({ fieldId: 'custpage_ubicaciones_data' }));

        campoEntidad.removeSelectOption({ value: null });
        campoEntidad.insertSelectOption({ value: '', text: '' });

        datos.entidades.forEach((entidad) => {
            if (entidad.subsidiaria !== subsidiaria) {
                return;
            }

            campoEntidad.insertSelectOption({ value: entidad.id, text: entidad.nombre });
        });
    }

    function cargarPrestamosDeSubsidiaria(registroActual) {
        const subsidiaria = registroActual.getValue({ fieldId: 'custpage_subsidiaria' });
        const datos       = JSON.parse(registroActual.getValue({ fieldId: 'custpage_ubicaciones_data' }));

        const campoPrestamo = registroActual.getField({ fieldId: 'custpage_prestamo_ref' });

        campoPrestamo.removeSelectOption({ value: null });
        campoPrestamo.insertSelectOption({ value: '', text: '' });

        datos.prestamos.forEach((prestamo) => {
            if (prestamo.subsidiaria !== subsidiaria) {
                return;
            }

            campoPrestamo.insertSelectOption({
                value: prestamo.id,
                text : prestamo.nombre + ' - ' + prestamo.ubicacion
                     + ' - pendiente ' + prestamo.pendiente,
            });
        });
    }

    function cargarUbicacionesDeSubsidiaria(registroActual) {
        const subsidiaria = registroActual.getValue({ fieldId: 'custpage_subsidiaria' });
        const datos       = JSON.parse(registroActual.getValue({ fieldId: 'custpage_ubicaciones_data' }));

        const campoFrom = registroActual.getField({ fieldId: 'custpage_ubicacion' });
        const campoTo   = registroActual.getField({ fieldId: 'custpage_ubicacion_dest' });

        campoFrom.removeSelectOption({ value: null });
        campoFrom.insertSelectOption({ value: '', text: '' });

        campoTo.removeSelectOption({ value: null });
        campoTo.insertSelectOption({ value: '', text: '' });

        datos.ubicaciones.forEach((ubicacion) => {
            if (ubicacion.subsidiaria !== subsidiaria) {
                return;
            }

            if (!datos.esPrestamo || !ubicacion.esBodegaPrestamo) {
                campoFrom.insertSelectOption({ value: ubicacion.id, text: ubicacion.nombre });
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

    function avisarProcesando(detalle) {
        message.create({
            title  : 'Procesando el movimiento',
            message: detalle + ' No cierres ni recargues la pagina.',
            type   : message.Type.WARNING,
        }).show();
    }

    function generarTransferPrestamo() {
        avisarProcesando('Se esta generando el traslado del prestamo.');

        window.location.href = url.resolveScript({
            scriptId    : CONSTANTES.SUITELET.SCRIPT,
            deploymentId: CONSTANTES.SUITELET.DEPLOYMENT,
            params      : {
                op          : CONSTANTES.OPERACIONES.PROCESAR,
                idMovimiento: currentRecord.get().id,
            },
        });
    }

    function generarTransferDevolucion() {
        avisarProcesando('Se esta generando el traslado de la devolucion.');

        window.location.href = url.resolveScript({
            scriptId    : CONSTANTES.SUITELET.SCRIPT,
            deploymentId: CONSTANTES.SUITELET.DEPLOYMENT,
            params      : {
                op          : CONSTANTES.OPERACIONES.DEVOLVER,
                idMovimiento: currentRecord.get().id,
            },
        });
    }

    return {
        saveRecord                : saveRecord,
        fieldChanged              : fieldChanged,
        crearMovimientoInventario : crearMovimientoInventario,
        imprimirMovimiento        : imprimirMovimiento,
        anularMovimientoInventario: anularMovimientoInventario,
        generarTransferPrestamo   : generarTransferPrestamo,
        generarTransferDevolucion : generarTransferDevolucion,
    };
});
