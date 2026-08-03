/**
 * @NApiVersion 2.1
 * @module ./2win_dao_2win_solicitud_consumo.js
 * @NModuleScope Public
 */
define([
    "N/log", 
    "N/record", 
    "N/runtime", 
    "N/search", 
    "./2win_dao_ubicacion"
], function (
    nLog, 
    record, 
    runtime, 
    search, 
    daoUbicacion
) {

    const SUBLIST_ID = "recmachcustrecord_2win_consumo_det_ref";

    /**
     * 
     * @param {object} context 
     */
    function definirValoresSublistaDetalleHeredados(context) {
        try {
            nLog.debug("definirValoresSublistaDetalleHeredados - parametros", {
                context: context

            });

            // Aislar registro
            const registroSolicitudConsumo = context.currentRecord;

            // Recuperar valores de cabecera para heredar en linea
            let internalidUbicacion = registroSolicitudConsumo.getValue("custrecord_2win_consumo_ubicacion");
            let internalidDepartamento = registroSolicitudConsumo.getValue("custrecord_2win_consumo_departamento");

            // console.log("definirValoresSublistaDetalleHeredados - internalid", {
            //     internalidUbicacion: internalidUbicacion,
            //     internalidDepartamento: internalidDepartamento
            // });

            // Heredar valores para campos de linea
            registroSolicitudConsumo.setCurrentSublistValue({
                sublistId: context.sublistId,
                fieldId: "custrecord_2win_consumo_det_ubicacion",
                value: internalidUbicacion,
                ignoreFieldChange: true
            });

            registroSolicitudConsumo.setCurrentSublistValue({
                sublistId: context.sublistId,
                fieldId: "custrecord_2win_consumo_det_departamento",
                value: internalidDepartamento,
                ignoreFieldChange: true
            });
            
        } catch (error) {
            nLog.error("definirValoresSublistaDetalleHeredados - error", error);
            throw error;
        } 
    }

    /**
     * 
     * @param {object} context 
     */
    function actualizarCamposSublista(context) {
        try {
            nLog.debug("actualizarCamposSublista - parametro", {
                context: context
            });

            // Aislar registro
            let registroSolicitudConsumo = context.currentRecord;

            // Recuperar valor actualizado y cantidad de lineas en sublista para actualizar valor en cada linea
            let nuevoValor = registroSolicitudConsumo.getValue({ fieldId: context.fieldId });
            let lineCount = registroSolicitudConsumo.getLineCount({ sublistId: SUBLIST_ID });

            // Determinar que campo actualizar en la sublista dependiendo de que campo se modifico en la cabecera
            let internalidCampoSublista = context.fieldId === "custrecord_2win_consumo_ubicacion" ? "custrecord_2win_consumo_det_ubicacion" : "custrecord_2win_consumo_det_departamento";

            // console.log("actualizarCamposSublista - datos", {
            //     nuevoValor: nuevoValor,
            //     lineCount: lineCount
            // });

            if (lineCount > 0) {
                // Iterar cada linea exitente
                for (let i = 0; i < lineCount; i++) {
                    registroSolicitudConsumo.selectLine({ sublistId: SUBLIST_ID, line: i });
                    
                    // Definir valor actualizado en la linea
                    registroSolicitudConsumo.setCurrentSublistValue({
                        sublistId: SUBLIST_ID,
                        fieldId: internalidCampoSublista,
                        value: nuevoValor,
                        ignoreFieldChange: true // Evita bucles
                    });
                    
                    registroSolicitudConsumo.commitLine({ sublistId: SUBLIST_ID });
                }
            } else {
                // Definir valor actualizado en la primera linea en la creacion del registro
                registroSolicitudConsumo.setCurrentSublistValue({
                    sublistId: SUBLIST_ID,
                    fieldId: internalidCampoSublista,
                    value: nuevoValor,
                    ignoreFieldChange: true // Evita bucles
                });
            }

        } catch (error) {
            nLog.error("actualizarCamposSublista - error", error);
            throw error;
        }
    }

    return {
        definirValoresSublistaDetalleHeredados: definirValoresSublistaDetalleHeredados,
        actualizarCamposSublista: actualizarCamposSublista
    };
});
