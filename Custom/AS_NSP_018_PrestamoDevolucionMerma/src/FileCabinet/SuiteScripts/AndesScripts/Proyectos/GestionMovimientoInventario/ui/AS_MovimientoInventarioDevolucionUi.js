/**
 * AS_NSP_018 — Formulario de Devolucion
 * @description Lo que la Devolucion agrega al formulario maestro: el prestamo
 *              relacionado y su detalle, heredado del prestamo. A la Clinica
 *              oculta el destino, porque el material sale de Andes, y muestra
 *              la cuenta del prestamo, que es la que revierte el ajuste.
 *
 * @NApiVersion 2.1
 * @NModuleScope Public
 */
define(['N/ui/serverWidget', '../lib/AS_MovimientoInventarioConstants'],
    (serverWidget, CONSTANTES) => {

    function armarCampos(form, datos) {
        const campos = datos.campos;
        const campoPrestamo = form.addField({
            id       : 'custpage_prestamo_ref',
            type     : serverWidget.FieldType.SELECT,
            label    : 'Prestamo Relacionado',
            container: datos.grupoMovimiento,
        });
        campoPrestamo.isMandatory = true;
        campoPrestamo.addSelectOption({ value: '', text: '' });
        const prestamoElegido = datos.prestamosPendientes.filter((prestamo) => prestamo.id === datos.idPrestamo)[0];
        if (prestamoElegido) {
            campoPrestamo.addSelectOption({
                value: prestamoElegido.id,
                text : prestamoElegido.nombre + ' - ' + prestamoElegido.entidad
                     + ' - ' + prestamoElegido.ubicacion
                     + ' - pendiente ' + prestamoElegido.pendiente,
            });
        }
        campoPrestamo.defaultValue = datos.idPrestamo;
        form.insertField({ field: campoPrestamo, nextfield: 'custpage_servicio' });

        if (!datos.idPrestamo) {
            campos.campoServicio.isMandatory = false;
            campos.campoFrom.isMandatory = false;
            campos.campoTo.isMandatory = false;
            campos.campoServicio.updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN });
            campos.campoFrom.updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN });
            campos.campoTo.updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN });
            form.insertField({ field: campos.campoEntidad, nextfield: 'custpage_prestamo_ref' });
        }

        armarDetalleDevolucion(form, datos);
    }

    function armarDetalleDevolucion(form, datos) {
        if (!datos.idPrestamo) return;
        const campos = datos.campos;
        const sublista = form.addSublist({
            id   : 'custpage_sl_detalle',
            type : serverWidget.SublistType.INLINEEDITOR,
            label: '4. Productos a Devolver',
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
            type : serverWidget.FieldType.FLOAT,
            label: 'Cantidad a Devolver',
        });

        const prestamo = datos.prestamo;
        campos.campoSubsidiaria.defaultValue = prestamo.getValue({ fieldId: 'custrecord_as_mov_subsidiaria' });
        campos.campoServicio.defaultValue = prestamo.getValue({ fieldId: 'custrecord_as_mov_servicio' });
        const entidadDelPrestamo = prestamo.getValue({ fieldId: 'custrecord_as_mov_entidad_receptora' });
        if (entidadDelPrestamo) {
            campos.campoEntidad.addSelectOption({
                value: entidadDelPrestamo,
                text : prestamo.getText({ fieldId: 'custrecord_as_mov_entidad_receptora' }),
            });
            campos.campoEntidad.defaultValue = entidadDelPrestamo;
        }
        const bodegaDelPrestamo = prestamo.getValue({ fieldId: 'custrecord_as_mov_ubicacion_dest' });
        const ubicacionRetorno = prestamo.getValue({ fieldId: 'custrecord_as_mov_ubicacion' });
        campos.campoFrom.addSelectOption({
            value: bodegaDelPrestamo,
            text : prestamo.getText({ fieldId: 'custrecord_as_mov_ubicacion_dest' }),
        });
        if (!datos.esALaClinica) campos.campoTo.addSelectOption({
            value: ubicacionRetorno,
            text : prestamo.getText({ fieldId: 'custrecord_as_mov_ubicacion' }),
        });
        campos.campoFrom.defaultValue = bodegaDelPrestamo;
        campos.campoTo.defaultValue = ubicacionRetorno;
        campos.campoSubsidiaria.updateDisplayType({ displayType: serverWidget.FieldDisplayType.INLINE });
        campos.campoServicio.updateDisplayType({ displayType: serverWidget.FieldDisplayType.INLINE });
        campos.campoEntidad.updateDisplayType({ displayType: serverWidget.FieldDisplayType.INLINE });
        campos.campoFrom.updateDisplayType({ displayType: serverWidget.FieldDisplayType.INLINE });
        campos.campoTo.updateDisplayType({ displayType: serverWidget.FieldDisplayType.INLINE });

        datos.lineasPrestamo.forEach((linea, indice) => {
            const cantidadPendiente = Math.floor(Math.round(linea.pendiente * 1000000) / 10000) / 100;
            sublista.setSublistValue({ id: 'custpage_col_linea', line: indice, value: String(linea.id) });
            sublista.setSublistValue({ id: 'custpage_col_articulo_id', line: indice, value: String(linea.articulo) });
            sublista.setSublistValue({ id: 'custpage_col_articulo', line: indice, value: linea.articuloTexto });
            sublista.setSublistValue({ id: 'custpage_col_prestada', line: indice, value: String(linea.cantidad) });
            sublista.setSublistValue({ id: 'custpage_col_devuelta', line: indice, value: String(linea.devuelta) });
            sublista.setSublistValue({ id: 'custpage_col_pendiente', line: indice, value: String(linea.pendiente) });
            sublista.setSublistValue({ id: 'custpage_col_a_devolver', line: indice, value: String(cantidadPendiente) });
            if (linea.unidadTexto) {
                sublista.setSublistValue({ id: 'custpage_col_unidad', line: indice, value: linea.unidadTexto });
            }
        });
    }

    function aplicarModoEdicion(form, datos) {
        form.getField({ id: 'custpage_prestamo_ref' })
            .updateDisplayType({ displayType: serverWidget.FieldDisplayType.DISABLED });

        precargarCantidadesDevolucion(form, datos);
    }

    function precargarCantidadesDevolucion(form, datos) {
        const sublista = form.getSublist({ id: 'custpage_sl_detalle' });
        datos.lineasPrestamo.forEach((lineaPrestamo, indice) => {
            const guardada = datos.lineasDevolucion.filter((linea) => linea.lineaPrestamo === lineaPrestamo.id)[0];
            const cantidad = guardada ? guardada.cantidad : 0;
            sublista.setSublistValue({ id: 'custpage_col_a_devolver', line: indice, value: String(cantidad) });
        });
    }

    function ajustarALaClinica(form, datos) {
        const campos = datos.campos;

        campos.campoTo.isMandatory = false;
        campos.campoTo.updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN });
        campos.campoEntidad.label = 'Entidad Emisora del Prestamo';

        if (datos.prestamo) mostrarCuentaDelPrestamo(form, datos);
    }

    function mostrarCuentaDelPrestamo(form, datos) {
        const cuentaDelPrestamo = datos.prestamo.getValue({ fieldId: 'custrecord_as_mov_cuenta_ajuste' });
        const campoCuentaAjuste = form.addField({
            id       : 'custpage_cuenta_ajuste',
            type     : serverWidget.FieldType.SELECT,
            label    : 'Cuenta de Ajuste',
            container: datos.grupoMovimiento,
        });

        campoCuentaAjuste.addSelectOption({
            value: cuentaDelPrestamo,
            text : datos.prestamo.getText({ fieldId: 'custrecord_as_mov_cuenta_ajuste' }),
        });
        campoCuentaAjuste.defaultValue = cuentaDelPrestamo;
        campoCuentaAjuste.updateDisplayType({ displayType: serverWidget.FieldDisplayType.INLINE });
    }

    return {
        armarCampos       : armarCampos,
        aplicarModoEdicion: aplicarModoEdicion,
        ajustarALaClinica : ajustarALaClinica,
    };
});
