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
 * @version 1.3.0
 *
 */
define(['N/currentRecord', 'N/ui/message', './constants/AS_RecuentoInventarioConstants'],
    (currentRecord, message, CONSTANTES) => {

    function fieldChanged(context) {
        if (context.fieldId !== CONSTANTES.CAMPOS.SUBSIDIARIA) return;
        filtrarPorSubsidiaria(context.currentRecord, CONSTANTES.CAMPOS.CUENTA, CONSTANTES.CAMPOS.CUENTAS_DATA);
        filtrarPorSubsidiaria(context.currentRecord, CONSTANTES.CAMPOS.UBICACION, CONSTANTES.CAMPOS.UBICACIONES_DATA);
    }

    /**
     * Rehace las opciones del select con las de la subsidiaria elegida, sacadas
     * del JSON oculto que dejo el servidor ({ subsidiaria, id, nombre }).
     */
    function filtrarPorSubsidiaria(registroActual, campoId, datosId) {
        const campo       = registroActual.getField({ fieldId: campoId });
        const subsidiaria = registroActual.getValue({ fieldId: CONSTANTES.CAMPOS.SUBSIDIARIA });
        const opciones    = JSON.parse(registroActual.getValue({ fieldId: datosId }));

        campo.removeSelectOption({ value: null });
        campo.insertSelectOption({ value: '', text: '' });
        opciones.forEach((opcion) => {
            if (opcion.subsidiaria !== subsidiaria) return;
            campo.insertSelectOption({ value: opcion.id, text: opcion.nombre });
        });
    }

    /**
     * NetSuite dibuja cada boton dos veces, arriba y abajo del formulario: el de
     * abajo lleva el prefijo 'secondary' en el id.
     */
    function generarRecuento() {
        currentRecord.get().setValue({ fieldId: CONSTANTES.CAMPOS.OPERACION, value: CONSTANTES.OPERACIONES.GENERAR });
        document.getElementById(CONSTANTES.BOTONES.GENERAR).disabled = true;
        document.getElementById('secondary' + CONSTANTES.BOTONES.GENERAR).disabled = true;
        message.create({
            type   : message.Type.INFORMATION,
            title  : CONSTANTES.FORMULARIO.GENERANDO_TITULO,
            message: CONSTANTES.FORMULARIO.GENERANDO_TEXTO,
        }).show();
        document.getElementById('submitter').click();
    }

    return {
        fieldChanged   : fieldChanged,
        generarRecuento: generarRecuento,
    };
});
