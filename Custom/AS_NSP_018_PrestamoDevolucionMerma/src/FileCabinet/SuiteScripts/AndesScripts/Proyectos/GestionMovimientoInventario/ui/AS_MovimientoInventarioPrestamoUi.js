/**
 * AS_NSP_018 — Formulario de Prestamo
 * @description Lo que el Prestamo agrega al formulario maestro. De la Clinica
 *              usa los campos comunes tal cual; A la Clinica oculta el origen,
 *              porque el material llega de afuera, y pide la cuenta del ajuste
 *              positivo.
 *
 * @NApiVersion 2.1
 * @NModuleScope Public
 */
define(['N/ui/serverWidget'],
    (serverWidget) => {

    function armarCampos(form, datos) {
        datos.campos.campoEntidad.isMandatory = true;
    }

    function ajustarALaClinica(form, datos) {
        const campos = datos.campos;

        campos.campoFrom.isMandatory = false;
        campos.campoFrom.updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN });
        campos.campoEntidad.label = 'Entidad Emisora del Prestamo';

        const campoCuentaAjuste = form.addField({
            id       : 'custpage_cuenta_ajuste',
            type     : serverWidget.FieldType.SELECT,
            label    : 'Cuenta de Ajuste',
            container: datos.grupoMovimiento,
        });
        campoCuentaAjuste.isMandatory = true;
        campoCuentaAjuste.addSelectOption({ value: '', text: '' });

        if (datos.movimiento) cargarCuentasGuardadas(campoCuentaAjuste, datos);

        form.insertField({ field: campoCuentaAjuste, nextfield: 'custpage_usuario_resp' });
        form.getSublist({ id: 'custpage_sl_detalle' }).getField({ id: 'custpage_col_disponible' })
            .updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN });
    }

    function cargarCuentasGuardadas(campoCuentaAjuste, datos) {
        const subsidiariaGuardada = String(datos.movimiento.getValue({ fieldId: 'custrecord_as_mov_subsidiaria' }));

        datos.cuentasAjuste.forEach((cuenta) => {
            if (cuenta.subsidiaria !== subsidiariaGuardada) return;
            campoCuentaAjuste.addSelectOption({ value: cuenta.id, text: cuenta.nombre });
        });

        campoCuentaAjuste.defaultValue = datos.movimiento.getValue({ fieldId: 'custrecord_as_mov_cuenta_ajuste' });
    }

    return {
        armarCampos      : armarCampos,
        ajustarALaClinica: ajustarALaClinica,
    };
});
