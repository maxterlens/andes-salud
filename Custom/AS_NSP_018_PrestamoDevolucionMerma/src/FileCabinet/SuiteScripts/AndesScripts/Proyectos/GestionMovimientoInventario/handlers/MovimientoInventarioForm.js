/**
 * AS_NSP_018 — Prestamo, Devolucion y Merma
 * @NApiVersion 2.1
 * @NModuleScope Public
 */
define(['N/ui/serverWidget', '../lib/MovimientoInventarioConstants', '../repositories/MovimientoInventarioRepository', '../repositories/InventoryTransferRepository'],
    (serverWidget, CONSTANTES, movimientoRepository, inventoryTransferRepository) => {

    function obtenerParametrosFormulario(request) {
        return {
            movimiento : request.parameters.movimiento,
            tipo       : request.parameters.tipo,
            prestamo   : request.parameters.prestamo,
            fecha      : decodeURIComponent(request.parameters.fecha || ''),
            responsable: request.parameters.responsable || '',
            comentarios: decodeURIComponent(request.parameters.comentarios || ''),
        };
    }

    function renderizarFormulario(context) {
        const parametros = obtenerParametrosFormulario(context.request);

        const idMovimiento = parametros.movimiento;

        let movimiento = null;
        let idTipo     = parametros.tipo;
        let idPrestamo = parametros.prestamo;

        if (idMovimiento) {
            movimiento = movimientoRepository.cargarMovimiento(idMovimiento);
            idTipo     = movimiento.getValue({ fieldId: 'custrecord_as_mov_tipo' });
            idPrestamo = movimiento.getValue({ fieldId: 'custrecord_as_mov_prestamo_ref' });
        }

        const tipos = movimientoRepository.listarTiposMovimiento();

        const tipoElegido = tipos.filter((opcion) => opcion.id === idTipo)[0];
        const nombreTipo  = tipoElegido ? tipoElegido.nombre : '';

        const titulo          = movimiento ? 'Edicion de Movimiento de Inventario' : 'Registro de Movimiento de Inventario';
        const etiquetaGuardar = movimiento ? 'Actualizar Movimiento' : 'Guardar Movimiento';

        const form = serverWidget.createForm({ title: titulo });

        form.clientScriptModulePath = CONSTANTES.CLIENT_SCRIPT;
        const campoTipo = form.addField({
            id   : 'custpage_tipo',
            type : serverWidget.FieldType.SELECT,
            label: 'Tipo de Movimiento',
        });
        campoTipo.isMandatory  = true;
        campoTipo.defaultValue = idTipo;
        campoTipo.addSelectOption({ value: '', text: '' });

        CONSTANTES.ORDEN_TIPOS.forEach((nombre) => {
            const opcion = tipos.filter((tipo) => tipo.nombre === nombre)[0];
            campoTipo.addSelectOption({ value: opcion.id, text: opcion.nombre });
        });

        const campoFecha = form.addField({
            id   : 'custpage_fecha',
            type : serverWidget.FieldType.DATE,
            label: CONSTANTES.ETIQUETAS_FECHA[nombreTipo] || 'Fecha',
        });
        campoFecha.isMandatory = true;
        campoFecha.defaultValue = parametros.fecha;

        if (nombreTipo === CONSTANTES.TIPOS.MERMA) {
            const campoMotivo = form.addField({
                id   : 'custpage_motivo',
                type : serverWidget.FieldType.SELECT,
                label: 'Motivo de la Baja',
            });
            campoMotivo.isMandatory = true;
            campoMotivo.addSelectOption({ value: '', text: '' });

            movimientoRepository.listarMotivosBaja().forEach((opcion) => {
                campoMotivo.addSelectOption({ value: opcion.id, text: opcion.nombre });
            });
        }

        const campoSubsidiaria = form.addField({
            id    : 'custpage_subsidiaria',
            type  : serverWidget.FieldType.SELECT,
            label : 'Subsidiaria',
            source: 'subsidiary',
        });
        campoSubsidiaria.isMandatory = true;
        let prestamosPendientes = [];

        if (nombreTipo === CONSTANTES.TIPOS.DEVOLUCION) {
            prestamosPendientes = movimientoRepository.listarPrestamosPendientes();

            const campoPrestamo = form.addField({
                id   : 'custpage_prestamo_ref',
                type : serverWidget.FieldType.SELECT,
                label: 'Prestamo Relacionado',
            });
            campoPrestamo.isMandatory = true;
            campoPrestamo.addSelectOption({ value: '', text: '' });
            const prestamoElegido = prestamosPendientes.filter((prestamo) => prestamo.id === idPrestamo)[0];

            if (prestamoElegido) {
                campoPrestamo.addSelectOption({
                    value: prestamoElegido.id,
                    text : prestamoElegido.nombre + ' - ' + prestamoElegido.ubicacion
                         + ' - pendiente ' + prestamoElegido.pendiente,
                });
            }

            campoPrestamo.defaultValue = idPrestamo;
        }

        const campoServicio = form.addField({
            id    : 'custpage_servicio',
            type  : serverWidget.FieldType.SELECT,
            label : 'Servicio',
            source: 'department',
        });
        campoServicio.isMandatory = true;
        const campoEntidad = form.addField({
            id   : 'custpage_entidad_receptora',
            type : serverWidget.FieldType.SELECT,
            label: 'Entidad Receptora',
        });
        campoEntidad.addSelectOption({ value: '', text: '' });
        const campoFrom = form.addField({
            id   : 'custpage_ubicacion',
            type : serverWidget.FieldType.SELECT,
            label: 'Ubicacion Origen',
        });
        campoFrom.isMandatory = true;
        campoFrom.addSelectOption({ value: '', text: '' });
        campoFrom.updateBreakType({ breakType: serverWidget.FieldBreakType.STARTCOL });

        const campoTo = form.addField({
            id   : 'custpage_ubicacion_dest',
            type : serverWidget.FieldType.SELECT,
            label: 'Ubicacion Destino',
        });
        campoTo.isMandatory = true;
        campoTo.addSelectOption({ value: '', text: '' });

        const campoUsuario = form.addField({
            id    : 'custpage_usuario_resp',
            type  : serverWidget.FieldType.SELECT,
            label : CONSTANTES.ETIQUETAS_RESPONSABLE[nombreTipo] || 'Usuario Responsable',
            source: 'employee',
        });
        campoUsuario.isMandatory = true;
        campoUsuario.updateBreakType({ breakType: serverWidget.FieldBreakType.STARTCOL });
        campoUsuario.defaultValue = parametros.responsable;

        const campoComentarios = form.addField({
            id   : 'custpage_comentarios',
            type : serverWidget.FieldType.TEXTAREA,
            label: 'Comentarios',
        });
        campoComentarios.defaultValue = parametros.comentarios;
        const ubicaciones = movimientoRepository.listarUbicacionesPorSubsidiaria();

        const campoUbicaciones = form.addField({
            id   : 'custpage_ubicaciones_data',
            type : serverWidget.FieldType.LONGTEXT,
            label: 'Ubicaciones',
        });
        campoUbicaciones.updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN });
        campoUbicaciones.defaultValue = JSON.stringify({
            esPrestamo : (nombreTipo === CONSTANTES.TIPOS.PRESTAMO),
            ubicaciones: ubicaciones,
            prestamos  : prestamosPendientes,
            entidades  : movimientoRepository.listarEntidadesPorSubsidiaria(),
        });

        if (nombreTipo === CONSTANTES.TIPOS.MERMA) {
            campoEntidad.updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN });
        }

        if (nombreTipo === CONSTANTES.TIPOS.DEVOLUCION && !idPrestamo) {
            campoServicio.isMandatory = false;
            campoFrom.isMandatory     = false;
            campoTo.isMandatory       = false;

            campoServicio.updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN });
            campoFrom.updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN });
            campoTo.updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN });
            campoEntidad.updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN });
        }

        if (nombreTipo === CONSTANTES.TIPOS.DEVOLUCION) {
            armarDetalleDevolucion(form, {
                campoFrom       : campoFrom,
                campoTo         : campoTo,
                campoSubsidiaria: campoSubsidiaria,
                campoServicio   : campoServicio,
                campoEntidad    : campoEntidad,
                idPrestamo      : idPrestamo,
            });
        } else {
            armarDetalleSalida(form, nombreTipo);
        }

        if (movimiento) {
            aplicarModoEdicion(form, movimiento, nombreTipo, idPrestamo);
        }

        if (nombreTipo !== CONSTANTES.TIPOS.DEVOLUCION || idPrestamo) {
            form.addSubmitButton({ label: etiquetaGuardar });
        }

        context.response.writePage(form);
    }

    function armarDetalleSalida(form, nombreTipo) {
        const sublista = form.addSublist({
            id   : 'custpage_sl_detalle',
            type : serverWidget.SublistType.INLINEEDITOR,
            label: CONSTANTES.ETIQUETAS_DETALLE.TITULO,
        });

        sublista.addField({
            id    : 'custpage_col_articulo',
            type  : serverWidget.FieldType.SELECT,
            label : CONSTANTES.ETIQUETAS_DETALLE.ARTICULO,
            source: 'item',
        }).isMandatory = true;

        sublista.addField({
            id   : 'custpage_col_unidad',
            type : serverWidget.FieldType.TEXT,
            label: CONSTANTES.ETIQUETAS_DETALLE.UNIDAD,
        }).updateDisplayType({ displayType: serverWidget.FieldDisplayType.DISABLED });

        sublista.addField({
            id   : 'custpage_col_disponible',
            type : serverWidget.FieldType.INTEGER,
            label: 'Disponible',
        }).updateDisplayType({ displayType: serverWidget.FieldDisplayType.DISABLED });

        sublista.addField({
            id   : 'custpage_col_lote',
            type : serverWidget.FieldType.SELECT,
            label: CONSTANTES.ETIQUETAS_DETALLE.LOTE,
        }).addSelectOption({ value: '', text: '' });

        const etiquetaCantidad = (nombreTipo === CONSTANTES.TIPOS.MERMA) ? CONSTANTES.ETIQUETAS_DETALLE.CANTIDAD : 'Cantidad Prestada';

        sublista.addField({
            id   : 'custpage_col_cantidad',
            type : serverWidget.FieldType.INTEGER,
            label: etiquetaCantidad,
        }).isMandatory = true;
    }

    function armarDetalleDevolucion(form, datos) {
        if (!datos.idPrestamo) {
            return;
        }

        const sublista = form.addSublist({
            id   : 'custpage_sl_detalle',
            type : serverWidget.SublistType.INLINEEDITOR,
            label: CONSTANTES.ETIQUETAS_DETALLE.TITULO,
        });

        sublista.addField({
            id   : 'custpage_col_linea',
            type : serverWidget.FieldType.TEXT,
            label: 'Linea',
        }).updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN });

        sublista.addField({
            id   : 'custpage_col_articulo_id',
            type : serverWidget.FieldType.TEXT,
            label: 'Articulo Id',
        }).updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN });

        sublista.addField({
            id   : 'custpage_col_articulo',
            type : serverWidget.FieldType.TEXT,
            label: CONSTANTES.ETIQUETAS_DETALLE.ARTICULO,
        }).updateDisplayType({ displayType: serverWidget.FieldDisplayType.DISABLED });

        sublista.addField({
            id   : 'custpage_col_unidad',
            type : serverWidget.FieldType.TEXT,
            label: CONSTANTES.ETIQUETAS_DETALLE.UNIDAD,
        }).updateDisplayType({ displayType: serverWidget.FieldDisplayType.DISABLED });

        sublista.addField({
            id   : 'custpage_col_prestada',
            type : serverWidget.FieldType.TEXT,
            label: CONSTANTES.ETIQUETAS_DETALLE.PRESTADA,
        }).updateDisplayType({ displayType: serverWidget.FieldDisplayType.DISABLED });

        sublista.addField({
            id   : 'custpage_col_devuelta',
            type : serverWidget.FieldType.TEXT,
            label: CONSTANTES.ETIQUETAS_DETALLE.DEVUELTA,
        }).updateDisplayType({ displayType: serverWidget.FieldDisplayType.DISABLED });

        sublista.addField({
            id   : 'custpage_col_pendiente',
            type : serverWidget.FieldType.TEXT,
            label: CONSTANTES.ETIQUETAS_DETALLE.PENDIENTE,
        }).updateDisplayType({ displayType: serverWidget.FieldDisplayType.DISABLED });

        sublista.addField({
            id   : 'custpage_col_a_devolver',
            type : serverWidget.FieldType.INTEGER,
            label: 'Cantidad a Devolver',
        });

        const prestamo = movimientoRepository.cargarMovimiento(datos.idPrestamo);
        datos.campoSubsidiaria.defaultValue = prestamo.getValue({ fieldId: 'custrecord_as_mov_subsidiaria' });
        datos.campoServicio.defaultValue    = prestamo.getValue({ fieldId: 'custrecord_as_mov_servicio' });
        const entidadDelPrestamo = prestamo.getValue({ fieldId: 'custrecord_as_mov_entidad_receptora' });

        if (entidadDelPrestamo) {
            datos.campoEntidad.addSelectOption({
                value: entidadDelPrestamo,
                text : prestamo.getText({ fieldId: 'custrecord_as_mov_entidad_receptora' }),
            });

            datos.campoEntidad.defaultValue = entidadDelPrestamo;
        }

        const bodegaDelPrestamo = prestamo.getValue({ fieldId: 'custrecord_as_mov_ubicacion_dest' });
        const ubicacionRetorno  = prestamo.getValue({ fieldId: 'custrecord_as_mov_ubicacion' });

        datos.campoFrom.addSelectOption({
            value: bodegaDelPrestamo,
            text : prestamo.getText({ fieldId: 'custrecord_as_mov_ubicacion_dest' }),
        });
        datos.campoTo.addSelectOption({
            value: ubicacionRetorno,
            text : prestamo.getText({ fieldId: 'custrecord_as_mov_ubicacion' }),
        });

        datos.campoFrom.defaultValue = bodegaDelPrestamo;
        datos.campoTo.defaultValue   = ubicacionRetorno;
        datos.campoSubsidiaria.updateDisplayType({ displayType: serverWidget.FieldDisplayType.INLINE });
        datos.campoServicio.updateDisplayType({ displayType: serverWidget.FieldDisplayType.INLINE });
        datos.campoEntidad.updateDisplayType({ displayType: serverWidget.FieldDisplayType.INLINE });
        datos.campoFrom.updateDisplayType({ displayType: serverWidget.FieldDisplayType.INLINE });
        datos.campoTo.updateDisplayType({ displayType: serverWidget.FieldDisplayType.INLINE });

        movimientoRepository.buscarLineasPorMovimiento(datos.idPrestamo).forEach((linea, indice) => {
            sublista.setSublistValue({ id: 'custpage_col_linea',       line: indice, value: String(linea.id) });
            sublista.setSublistValue({ id: 'custpage_col_articulo_id', line: indice, value: String(linea.articulo) });
            sublista.setSublistValue({ id: 'custpage_col_articulo',    line: indice, value: linea.articuloTexto });
            sublista.setSublistValue({ id: 'custpage_col_prestada',    line: indice, value: String(linea.cantidad) });
            sublista.setSublistValue({ id: 'custpage_col_devuelta',    line: indice, value: String(linea.devuelta) });
            sublista.setSublistValue({ id: 'custpage_col_pendiente',   line: indice, value: String(linea.pendiente) });
            sublista.setSublistValue({ id: 'custpage_col_a_devolver',  line: indice, value: String(linea.pendiente) });

            if (linea.unidadTexto) {
                sublista.setSublistValue({ id: 'custpage_col_unidad', line: indice, value: linea.unidadTexto });
            }
        });
    }

    function aplicarModoEdicion(form, movimiento, nombreTipo, idPrestamo) {
        const campoMovimiento = form.addField({
            id   : 'custpage_movimiento',
            type : serverWidget.FieldType.TEXT,
            label: 'Movimiento',
        });
        campoMovimiento.updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN });
        campoMovimiento.defaultValue = movimiento.id;

        const tieneTraslado = movimiento.getValue({ fieldId: 'custrecord_as_mov_transfer' });
        const campoBloqueado = form.addField({
            id   : 'custpage_detalle_bloqueado',
            type : serverWidget.FieldType.TEXT,
            label: 'Detalle bloqueado',
        });
        campoBloqueado.updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN });
        campoBloqueado.defaultValue = tieneTraslado ? 'T' : 'F';

        form.getField({ id: 'custpage_fecha' }).defaultValue        = movimiento.getText({ fieldId: 'custrecord_as_mov_fecha' });
        form.getField({ id: 'custpage_usuario_resp' }).defaultValue = movimiento.getValue({ fieldId: 'custrecord_as_mov_usuario_resp' });
        form.getField({ id: 'custpage_comentarios' }).defaultValue  = movimiento.getValue({ fieldId: 'custrecord_as_mov_comentarios' });
        form.getField({ id: 'custpage_tipo' })
            .updateDisplayType({ displayType: serverWidget.FieldDisplayType.DISABLED });

        if (nombreTipo === CONSTANTES.TIPOS.DEVOLUCION) {
            form.getField({ id: 'custpage_prestamo_ref' })
                .updateDisplayType({ displayType: serverWidget.FieldDisplayType.DISABLED });

            precargarCantidadesDevolucion(form, movimiento.id, idPrestamo);

            return;
        }

        if (nombreTipo === CONSTANTES.TIPOS.MERMA) {
            const campoMotivo = form.getField({ id: 'custpage_motivo' });

            campoMotivo.defaultValue = movimiento.getValue({ fieldId: 'custrecord_as_mov_motivo' });
            campoMotivo.updateDisplayType({ displayType: serverWidget.FieldDisplayType.DISABLED });
        }

        const entidadGuardada = movimiento.getValue({ fieldId: 'custrecord_as_mov_entidad_receptora' });

        if (entidadGuardada) {
            const campoEntidad = form.getField({ id: 'custpage_entidad_receptora' });

            campoEntidad.addSelectOption({
                value: entidadGuardada,
                text : movimiento.getText({ fieldId: 'custrecord_as_mov_entidad_receptora' }),
            });

            campoEntidad.defaultValue = entidadGuardada;
        }

        const campoSubsidiaria = form.getField({ id: 'custpage_subsidiaria' });
        const campoServicio    = form.getField({ id: 'custpage_servicio' });
        const campoFrom        = form.getField({ id: 'custpage_ubicacion' });
        const campoTo          = form.getField({ id: 'custpage_ubicacion_dest' });

        const ubicacionOrigen  = movimiento.getValue({ fieldId: 'custrecord_as_mov_ubicacion' });
        const ubicacionDestino = movimiento.getValue({ fieldId: 'custrecord_as_mov_ubicacion_dest' });

        campoFrom.addSelectOption({ value: ubicacionOrigen,  text: movimiento.getText({ fieldId: 'custrecord_as_mov_ubicacion' }) });
        campoTo.addSelectOption({   value: ubicacionDestino, text: movimiento.getText({ fieldId: 'custrecord_as_mov_ubicacion_dest' }) });

        campoSubsidiaria.defaultValue = movimiento.getValue({ fieldId: 'custrecord_as_mov_subsidiaria' });
        campoServicio.defaultValue    = movimiento.getValue({ fieldId: 'custrecord_as_mov_servicio' });
        campoFrom.defaultValue        = ubicacionOrigen;
        campoTo.defaultValue          = ubicacionDestino;

        campoSubsidiaria.updateDisplayType({ displayType: serverWidget.FieldDisplayType.DISABLED });
        campoServicio.updateDisplayType({ displayType: serverWidget.FieldDisplayType.DISABLED });
        campoFrom.updateDisplayType({ displayType: serverWidget.FieldDisplayType.DISABLED });
        campoTo.updateDisplayType({ displayType: serverWidget.FieldDisplayType.DISABLED });

        precargarDetalleSalida(form, movimiento.id, ubicacionOrigen);

        if (tieneTraslado) {
            const sublista = form.getSublist({ id: 'custpage_sl_detalle' });

            sublista.getField({ id: 'custpage_col_articulo' })
                .updateDisplayType({ displayType: serverWidget.FieldDisplayType.DISABLED });
            sublista.getField({ id: 'custpage_col_cantidad' })
                .updateDisplayType({ displayType: serverWidget.FieldDisplayType.DISABLED });
            sublista.getField({ id: 'custpage_col_lote' })
                .updateDisplayType({ displayType: serverWidget.FieldDisplayType.DISABLED });
            sublista.getField({ id: 'custpage_col_disponible' })
                .updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN });
        }
    }

    function precargarDetalleSalida(form, idMovimiento, ubicacionOrigen) {
        const sublista = form.getSublist({ id: 'custpage_sl_detalle' });
        const lineas   = movimientoRepository.buscarLineasPorMovimiento(idMovimiento);

        const stock = inventoryTransferRepository.buscarStockPorArticulo(
            lineas.map((linea) => linea.articulo), ubicacionOrigen);
        const campoLote = sublista.getField({ id: 'custpage_col_lote' });

        const nombresCargados = {};
        const stockDeLotes    = {};

        lineas.forEach((linea) => {
            if (nombresCargados[linea.articulo]) {
                return;
            }

            nombresCargados[linea.articulo] = true;

            inventoryTransferRepository.buscarLotesDisponibles(linea.articulo, ubicacionOrigen).forEach((lote) => {
                nombresCargados[lote.nombreLote] = true;
                stockDeLotes[linea.articulo + '|' + lote.nombreLote] = lote.enMano;

                campoLote.addSelectOption({
                    value: lote.nombreLote,
                    text : linea.articuloTexto + ' - ' + lote.nombreLote + ' (hay ' + lote.enMano + ')',
                });
            });
        });

        lineas.forEach((linea, indice) => {
            sublista.setSublistValue({ id: 'custpage_col_articulo',   line: indice, value: String(linea.articulo) });
            sublista.setSublistValue({ id: 'custpage_col_cantidad',   line: indice, value: String(linea.cantidad) });
            const enMano = stockDeLotes[linea.articulo + '|' + linea.lote];

            sublista.setSublistValue({
                id   : 'custpage_col_disponible',
                line : indice,
                value: String(enMano === undefined ? stock[String(linea.articulo)].disponible : enMano),
            });

            if (linea.lote) {
                if (!nombresCargados[linea.lote]) {
                    campoLote.addSelectOption({ value: linea.lote, text: linea.lote });
                }

                sublista.setSublistValue({ id: 'custpage_col_lote', line: indice, value: linea.lote });
            }
            if (linea.unidadTexto) {
                sublista.setSublistValue({ id: 'custpage_col_unidad', line: indice, value: linea.unidadTexto });
            }
        });
    }

    function precargarCantidadesDevolucion(form, idMovimiento, idPrestamo) {
        const sublista = form.getSublist({ id: 'custpage_sl_detalle' });

        const lineasPrestamo   = movimientoRepository.buscarLineasPorMovimiento(idPrestamo);
        const lineasDevolucion = movimientoRepository.buscarLineasPorMovimiento(idMovimiento);

        lineasPrestamo.forEach((lineaPrestamo, indice) => {
            const guardada = lineasDevolucion.filter((linea) => linea.lineaPrestamo === lineaPrestamo.id)[0];
            const cantidad = guardada ? guardada.cantidad : 0;

            sublista.setSublistValue({ id: 'custpage_col_a_devolver', line: indice, value: String(cantidad) });
        });
    }

    return {
        renderizarFormulario: renderizarFormulario,
    };
});
