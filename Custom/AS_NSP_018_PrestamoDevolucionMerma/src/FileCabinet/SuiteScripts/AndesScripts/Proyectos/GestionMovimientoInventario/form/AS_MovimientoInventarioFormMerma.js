/**
 * AS_NSP_018 — Prestamo, Devolucion y Merma
 * @description Lo que la Merma agrega al formulario de captura: motivo y cuenta
 *              de ajuste. No tiene destino ni entidad, porque el material sale
 *              del inventario y no va a nadie.
 *
 * @NApiVersion 2.1
 * @NModuleScope Public
 */
define(['N/ui/serverWidget'], (serverWidget) => {

    function armarCampos(form, datos) {
        const campos = datos.campos;
        const campoMotivo = form.addField({
            id       : 'custpage_motivo',
            type     : serverWidget.FieldType.SELECT,
            label    : 'Motivo de la Baja',
            container: datos.grupoEspecifico,
        });
        campoMotivo.isMandatory = true;
        campoMotivo.addSelectOption({ value: '', text: '' });
        datos.motivosBaja.forEach((opcion) => {
            campoMotivo.addSelectOption({ value: opcion.id, text: opcion.nombre });
        });

        const campoCuentaAjuste = form.addField({
            id       : 'custpage_cuenta_ajuste',
            type     : serverWidget.FieldType.SELECT,
            label    : 'Cuenta de Ajuste',
            container: datos.grupoEspecifico,
        });
        campoCuentaAjuste.isMandatory = true;
        campoCuentaAjuste.addSelectOption({ value: '', text: '' });
        if (datos.movimiento) {
            const subsidiariaGuardada = String(datos.movimiento.getValue({ fieldId: 'custrecord_as_mov_subsidiaria' }));
            datos.cuentasAjuste.forEach((cuenta) => {
                if (cuenta.subsidiaria !== subsidiariaGuardada) return;
                campoCuentaAjuste.addSelectOption({ value: cuenta.id, text: cuenta.nombre });
            });
        }
        form.insertField({ field: campoMotivo, nextfield: 'custpage_usuario_resp' });
        form.insertField({ field: campoCuentaAjuste, nextfield: 'custpage_usuario_resp' });

        campos.campoEntidad.updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN });
        campos.campoTo.isMandatory = false;
        campos.campoTo.updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN });
        form.insertField({ field: campos.campoSubsidiaria, nextfield: 'custpage_fecha' });
        form.insertField({ field: campos.campoServicio, nextfield: 'custpage_fecha' });
        form.insertField({ field: campos.campoFrom, nextfield: 'custpage_fecha' });
    }

    function aplicarModoEdicion(form, datos) {
        const campoMotivo = form.getField({ id: 'custpage_motivo' });

        campoMotivo.defaultValue = datos.movimiento.getValue({ fieldId: 'custrecord_as_mov_motivo' });
        campoMotivo.updateDisplayType({ displayType: serverWidget.FieldDisplayType.DISABLED });

        form.getField({ id: 'custpage_cuenta_ajuste' }).defaultValue =
            datos.movimiento.getValue({ fieldId: 'custrecord_as_mov_cuenta_ajuste' });
    }

    return {
        armarCampos       : armarCampos,
        aplicarModoEdicion: aplicarModoEdicion,
    };
});
