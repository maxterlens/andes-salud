/**
 * @NApiVersion 2.1
 * @NScriptType ClientScript
 */
define([
    "./dao/2win_dao_solicitud_consumo_cliente",
    "./dao/2win_dao_balance_inventario",
    "./domain/2win_dom_solicitud_consumo_actualizacion_stock", 
    "./domain/2win_dom_solicitud_consumo_validaciones", 
    "N/runtime"
], function (
    daoSolicitudConsumoCliente,
    daoBalanceInventario,
    domSolicitudConsumoActualizacionStock, 
    domSolicitudConsumoValidaciones, 
    runtime
) {

    const SUBLIST_ID = "recmachcustrecord_2win_consumo_det_ref";
    
    // Variables para evitar llamadas repetitivas
    let internalidUbicacion = null;
    let internalidDepartamento = null;
    let internalidResponsableUbicacion = null;
    let internalidUsuarioActual = null;

    function pageInit(context) {
        try {         
            // Recuperar el internalid del usuario actual
            internalidUsuarioActual = String(runtime.getCurrentUser().id);
    
            // Recuperar el internalid de la ubicación al iniciar
            internalidUbicacion = context.currentRecord.getValue("custrecord_2win_consumo_ubicacion");
            internalidDepartamento = context.currentRecord.getValue("custrecord_2win_consumo_departamento");
            if (internalidUbicacion) {
                // Se recupera el responsable de la bodega para validar permisos en las acciones de la sublista
                internalidResponsableUbicacion = domSolicitudConsumoValidaciones.obtenerResponsableUbicacion(internalidUbicacion);
            }
        } catch (error) {
            console.error("pageInit - error", { 
                error: error
            });
        }
    }

    function lineInit(context) {
        try { 

            daoSolicitudConsumoCliente.definirValoresSublistaDetalleHeredados(context);

        } catch (error) {
            console.error("pageInit - error", { 
                error: error
            });
        }
    }

    function fieldChanged(context) {
        // Captura inicial
        let scriptObj = runtime.getCurrentScript();
        let startUnits = scriptObj.getRemainingUsage();
        let startTime = new Date().getTime();
        try {
            let registroSolicitudConsumo = context.currentRecord;

            // Detectar si cambió Ubicación o Departamento en la cabecera
            if (context.fieldId === "custrecord_2win_consumo_ubicacion" || context.fieldId === "custrecord_2win_consumo_departamento") {
                daoSolicitudConsumoCliente.actualizarCamposSublista(context);
            };

            // Deterctar si cambio Ubicacion o articulo de linea
            if (context.fieldId === "custrecord_2win_consumo_ubicacion" || context.fieldId === "custrecord_2win_consumo_det_articulo") {
                // Recuperar el internalid de la ubicacion y el articulo de la linea
                internalidUbicacion = context.currentRecord.getValue("custrecord_2win_consumo_ubicacion");

                if (context.fieldId === "custrecord_2win_consumo_det_articulo") {
                    if (internalidUbicacion) {
                        domSolicitudConsumoActualizacionStock.actualizarStockLineaDetalleSolicitudConsumo(internalidUbicacion, registroSolicitudConsumo);
                    }
                } else {
                    if (internalidUbicacion) {
                        domSolicitudConsumoActualizacionStock.actualizarStockLineasDetalleSolicitudConsumo(internalidUbicacion, registroSolicitudConsumo);
                    }
                }

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

    function validarAccion(context) {
        try {
            console.log("validarAccion - context", { 
                context: context
            });
            if (context.sublistId !== SUBLIST_ID) return true;

            // Validar si se debe bloquear la accion
            const bloquear = domSolicitudConsumoValidaciones.validarBloqueo(
                internalidResponsableUbicacion, internalidUsuarioActual, context.currentRecord
            );

            if (bloquear) {
                alert("Acción no permitida");
                return false;
            }
            return true;
        } catch (error) {
            console.error("validarAccion - error", { 
                error: error
            });
            return false;
        }
    }

    return {
        pageInit: pageInit,
        fieldChanged: fieldChanged,
        lineInit: lineInit,
        validateLine: validarAccion,
        validateInsert: validarAccion,
        validateDelete: validarAccion,
    };
});