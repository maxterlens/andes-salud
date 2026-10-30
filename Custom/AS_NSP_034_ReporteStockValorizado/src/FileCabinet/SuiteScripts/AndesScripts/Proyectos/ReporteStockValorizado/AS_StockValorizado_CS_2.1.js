/**
 * AS_NSP_035 — Reporte de Stock Valorizado
 * @description Client script de la pantalla del reporte: el campo Ubicacion
 *              muestra solo las ubicaciones de la subsidiaria elegida. Llegan del
 *              servidor en un campo oculto (JSON), como en AS_NSP_032.
 * @NApiVersion 2.1
 * @NScriptType ClientScript
 * @NModuleScope Public
 * @author Andes Salud
 * @version 1.1.0
 *
 * CHANGELOG v1.1.0:
 * - [FIX]  Opcion en blanco en Ubicacion: en blanco trae todas las de la subsidiaria.
 *
 */
define(['./constants/AS_StockValorizadoConstants'],
    (CONSTANTES) => {

    function pageInit(context) {
        filtrarUbicaciones(context.currentRecord);
    }

    function fieldChanged(context) {
        if (context.fieldId !== CONSTANTES.CAMPOS.SUBSIDIARIA) return;
        filtrarUbicaciones(context.currentRecord);
    }

    /**
     * Rehace las opciones con las de la subsidiaria elegida, sacadas del JSON
     * oculto que dejo el servidor ({ subsidiaria, id, nombre }).
     */
    function filtrarUbicaciones(registroActual) {
        const campo       = registroActual.getField({ fieldId: CONSTANTES.CAMPOS.UBICACION });
        const subsidiaria = registroActual.getValue({ fieldId: CONSTANTES.CAMPOS.SUBSIDIARIA });
        const ubicaciones = JSON.parse(registroActual.getValue({ fieldId: CONSTANTES.CAMPOS.UBICACIONES_DATA }));

        campo.removeSelectOption({ value: null });
        campo.insertSelectOption({ value: '', text: '' });
        ubicaciones.forEach((ubicacion) => {
            if (ubicacion.subsidiaria !== subsidiaria) return;
            campo.insertSelectOption({ value: ubicacion.id, text: ubicacion.nombre });
        });
    }

    return {
        pageInit    : pageInit,
        fieldChanged: fieldChanged,
    };
});
