/**
 * AS_NSP_032 — Carga de Recuento de Inventario
 * @description Client script de la pantalla de carga: al cambiar la subsidiaria,
 *              el select Cuenta muestra solo las cuentas configuradas para ella en
 *              AS Recuento Inventario Cuenta. Las cuentas llegan del servidor en
 *              un campo oculto (JSON), como en AS_NSP_018.
 *
 *              generarRecuento: el boton Generar marca la operacion y envia el
 *              formulario por el mismo boton Cargar, asi el Suitelet recibe la
 *              cabecera y los articulos listados. Al primer clic deshabilita
 *              Generar y avisa que se esta generando: un segundo clic crearia
 *              otro recuento.
 * @NApiVersion 2.1
 * @NScriptType ClientScript
 * @NModuleScope Public
 * @author Andes Salud
 * @version 1.2.0
 *
 * CHANGELOG v1.2.0 (2026-10-14):
 *   - [FEAT] generarRecuento: deshabilita el boton Generar y muestra el aviso
 *            "Generando recuento" mientras el servidor crea el recuento.
 *
 * CHANGELOG v1.1.0 (2026-10-14):
 *   - [FEAT] generarRecuento: boton Generar.
 *
 * CHANGELOG v1.0.0 (2026-10-13):
 *   - [FEAT] fieldChanged: filtra el select Cuenta por la subsidiaria elegida.
 */
define(['N/currentRecord', 'N/ui/message', './constants/AS_RecuentoInventarioConstants'],
    (currentRecord, message, CONSTANTES) => {

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
        deshabilitarBotonGenerar();
        avisarGenerando();
        document.getElementById('submitter').click();
    }

    /**
     * NetSuite dibuja cada boton dos veces, arriba y abajo del formulario: el de
     * abajo lleva el prefijo 'secondary' en el id.
     */
    function deshabilitarBotonGenerar() {
        document.getElementById(CONSTANTES.BOTONES.GENERAR).disabled = true;
        document.getElementById('secondary' + CONSTANTES.BOTONES.GENERAR).disabled = true;
    }

    function avisarGenerando() {
        message.create({
            type   : message.Type.INFORMATION,
            title  : CONSTANTES.FORMULARIO.GENERANDO_TITULO,
            message: CONSTANTES.FORMULARIO.GENERANDO_TEXTO,
        }).show();
    }

    return {
        fieldChanged   : fieldChanged,
        generarRecuento: generarRecuento,
    };
});
