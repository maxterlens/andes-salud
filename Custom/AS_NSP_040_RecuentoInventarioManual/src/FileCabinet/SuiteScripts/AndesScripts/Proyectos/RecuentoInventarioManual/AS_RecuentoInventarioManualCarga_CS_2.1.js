/**
 * AS_NSP_040 — Recuento de Inventario Manual
 * @description Client script de la pantalla Cargar cantidades del recuento.
 *
 *              fieldChanged → Subsidiaria: deja en Recuento y Lote solo los de
 *                             la subsidiaria elegida, con el JSON oculto, como
 *                             la Cuenta y la Ubicacion de la pantalla del
 *                             recuento. Sin subsidiaria quedan vacios.
 *
 *              Es aparte del client script del recuento: el saveRecord de ese
 *              exige un articulo marcado y bloquearia el Cargar.
 *
 * @NApiVersion 2.1
 * @NScriptType ClientScript
 * @NModuleScope Public
 * @author Andes Salud
 * @version 1.0.0
 */

define(['./constants/AS_RecuentoInventarioManualConstants'],
    (CONSTANTES) => {

    function fieldChanged(context) {
        if (context.fieldId !== CONSTANTES.CAMPOS.SUBSIDIARIA_CARGA) return;
        filtrarPorSubsidiaria(context.currentRecord, CONSTANTES.CAMPOS.RECUENTO_CARGA, CONSTANTES.CAMPOS.RECUENTOS_DATA);
        filtrarPorSubsidiaria(context.currentRecord, CONSTANTES.CAMPOS.LOTE_CARGA, CONSTANTES.CAMPOS.LOTES_DATA);
    }

    function filtrarPorSubsidiaria(registroActual, campoId, datosId) {
        const campo       = registroActual.getField({ fieldId: campoId });
        const subsidiaria = registroActual.getValue({ fieldId: CONSTANTES.CAMPOS.SUBSIDIARIA_CARGA });
        const opciones    = JSON.parse(registroActual.getValue({ fieldId: datosId }));

        campo.removeSelectOption({ value: null });
        campo.insertSelectOption({ value: '', text: '' });
        opciones.forEach((opcion) => {
            if (opcion.subsidiaria !== subsidiaria) return;
            campo.insertSelectOption({ value: opcion.id, text: opcion.nombre });
        });
    }

    return {
        fieldChanged: fieldChanged,
    };
});
