/**
 * AS_NSP_032 — Carga de Recuento de Inventario
 * @description Client script de la pantalla de carga: al cambiar la subsidiaria,
 *              el select Cuenta muestra solo las cuentas configuradas para ella en
 *              AS Recuento Inventario Cuenta. Las cuentas llegan del servidor en
 *              un campo oculto (JSON), como en AS_NSP_018.
 *
 *              generarRecuento: el boton Generar marca la operacion y envia el
 *              formulario por el mismo boton Cargar, asi el Suitelet recibe la
 *              cabecera y los articulos listados.
 * @NApiVersion 2.1
 * @NScriptType ClientScript
 * @NModuleScope Public
 * @author Andes Salud
 * @version 1.1.0
 *
 * CHANGELOG v1.1.0 (2026-10-14):
 *   - [FEAT] generarRecuento: boton Generar.
 *
 * CHANGELOG v1.0.0 (2026-10-13):
 *   - [FEAT] fieldChanged: filtra el select Cuenta por la subsidiaria elegida.
 */
define(['N/currentRecord', './constants/AS_RecuentoInventarioConstants'], (currentRecord, CONSTANTES) => {

    function fieldChanged(context) {
        if (context.fieldId !== CONSTANTES.CAMPOS.SUBSIDIARIA) return;
        cargarCuentasDeSubsidiaria(context.currentRecord);
    }

    function cargarCuentasDeSubsidiaria(registroActual) {
        const campoCuenta = registroActual.getField({ fieldId: CONSTANTES.CAMPOS.CUENTA });
        const subsidiaria = registroActual.getValue({ fieldId: CONSTANTES.CAMPOS.SUBSIDIARIA });
        const cuentas     = JSON.parse(registroActual.getValue({ fieldId: CONSTANTES.CAMPOS.CUENTAS_DATA }));

        campoCuenta.removeSelectOption({ value: null });
        campoCuenta.insertSelectOption({ value: '', text: '' });

        cuentas.forEach((cuenta) => {
            if (cuenta.subsidiaria !== subsidiaria) return;
            campoCuenta.insertSelectOption({ value: cuenta.id, text: cuenta.nombre });
        });
    }

    function generarRecuento() {
        const registroActual = currentRecord.get();

        registroActual.setValue({ fieldId: CONSTANTES.CAMPOS.OPERACION, value: CONSTANTES.OPERACIONES.GENERAR });
        document.getElementById('submitter').click();
    }

    return {
        fieldChanged   : fieldChanged,
        generarRecuento: generarRecuento,
    };
});
