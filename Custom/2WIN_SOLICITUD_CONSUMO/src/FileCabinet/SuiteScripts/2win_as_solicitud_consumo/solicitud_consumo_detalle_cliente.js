/**
 * @NApiVersion 2.1
 * @NScriptType ClientScript
 */
define([
    "./domain/2win_dom_solicitud_consumo_actualizacion_stock", 
    "N/runtime"
], function (
    domSolicitudConsumoActualizacionStock, 
    runtime
) {

    function fieldChanged(context) {
        // Captura inicial
        let scriptObj = runtime.getCurrentScript();
        let startUnits = scriptObj.getRemainingUsage();
        let startTime = new Date().getTime();
        try {
            let registroSolicitudConsumo = context.currentRecord;

            // Detectar si cambio articulo de detalle
            if (context.fieldId === "custrecord_2win_consumo_det_articulo" || context.fieldId === "custrecord_2win_consumo_det_ubicacion") {
                // Recuperar el internalid de la ubicacion y el articulo del detalle
                let internalidUbicacion = context.currentRecord.getValue("custrecord_2win_consumo_det_ubicacion");
                let internalidArticulo = context.currentRecord.getValue("custrecord_2win_consumo_det_articulo");

                if (internalidUbicacion && internalidArticulo) {
                    domSolicitudConsumoActualizacionStock.actualizarStockRegistroDetalleSolicitudConsumo(internalidUbicacion, internalidArticulo, registroSolicitudConsumo);
                };

                // Captura final
                let endTime = new Date().getTime();
                let endUnits = scriptObj.getRemainingUsage();
    
                // Calculo de unidades
                let unitsUsed = startUnits - endUnits;
                let executionTime = (endTime - startTime) / 1000; // En segundos
        
                console.log("fieldChanged - metricas", {
                    tiempoEjecucion: executionTime,
                    unidadesUsadas: unitsUsed,
                    unidadesRestantes: endUnits
                });
            }
        } catch (error) {
            console.error("fieldChanged - error", { 
                error: error
            }); 
        }
    }

    return {
        fieldChanged: fieldChanged,
    };
});