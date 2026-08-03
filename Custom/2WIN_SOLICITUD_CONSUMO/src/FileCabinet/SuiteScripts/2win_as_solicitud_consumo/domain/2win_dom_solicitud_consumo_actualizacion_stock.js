/**
 * @NApiVersion 2.1
 * @module ./2win_dom_solicitud_consumo_actualizacion_stock.js
 * @NModuleScope Public
 */
define([
    "N/log",
    "N/record",
    "N/runtime",
    "../dao/2win_dao_balance_inventario",
    "../lib/2win_lib_auditoria",
], function (
    nLog, 
    record,
    runtime,
    daoBalanceInventario,
    libAuditoria,
) {
    // Variable para almacenar datos del proceso
    let proceso = {
        nombreProceso: "andessalud solicitud de consumo",
        scriptId: "",
        etapa: "",
        estado: "000",
        tokenProceso: "",
        descripcionResultado: ""
    };

    const ESTADOS = {
        ENVIO_PENDIENTE: "7",
        ENVIADA: "8",
        CERRADA: "9",
    };

    const SUBLIST_ID = "recmachcustrecord_2win_consumo_det_ref";

    /**
     * 
     * @param {string} internalidUbicacion 
     * @param {object} registroSolicitudConsumo 
     * @returns 
     */
    function actualizarStockLineaDetalleSolicitudConsumo(internalidUbicacion, registroSolicitudConsumo) {
        try {
            nLog.audit("actualizarStockLineaDetalleSolicitudConsumo - parametros", {
                internalidUbicacion: internalidUbicacion,
                registroSolicitudConsumo: registroSolicitudConsumo
            });

            let internalidArticulo = registroSolicitudConsumo.getCurrentSublistValue({
                sublistId: SUBLIST_ID,
                fieldId: "custrecord_2win_consumo_det_articulo"
            });
            let balanceArticuloLinea = daoBalanceInventario.busquedaBalanceInventarioLineasDetalle(internalidArticulo, internalidUbicacion);

            let disponible = 0;
            // Validar si se recupero stock para articulo
            if (balanceArticuloLinea !== null && balanceArticuloLinea[internalidArticulo]) {
                disponible = balanceArticuloLinea[internalidArticulo].disponible
            };

            // Actualizar campo disponible de linea detalle
            registroSolicitudConsumo.setCurrentSublistValue({
                sublistId: SUBLIST_ID,
                fieldId: "custrecord_2win_consumo_det_disponible",
                value: disponible,
                ignoreFieldChange: true
            });

        } catch (error) {
            nLog.error("actualizarStockLineaDetalleSolicitudConsumo - error", error);
            // console.error('actualizarStockLineaDetalleSolicitudConsumo - error', { 
            //     error: error
            // });
            throw error;
        }
    }

    /**
     * 
     * @param {string} internalidUbicacion 
     * @param {object} registroSolicitudConsumo 
     * @returns 
     */
    function actualizarStockLineasDetalleSolicitudConsumo(internalidUbicacion, registroSolicitudConsumo) {
        try {
            nLog.audit("actualizarStockLineasDetalleSolicitudConsumo - parametros", {
                internalidUbicacion: internalidUbicacion,
                registroSolicitudConsumo: registroSolicitudConsumo
            });

            // console.log("actualizarStockLineasDetalleSolicitudConsumo - parametros", {
            //     internalidUbicacion: internalidUbicacion,
            //     registroSolicitudConsumo: registroSolicitudConsumo
            // });

            // Recuperar cantidad de lineas en sublista para actualizar valor en cada linea
            let lineCount = registroSolicitudConsumo.getLineCount({ sublistId: SUBLIST_ID });
            // console.log("actualizarStockLineasDetalleSolicitudConsumo - lineCount", {
            //     lineCount: lineCount
            // });

            if (lineCount > 0) {
                // Variable para almacenar todos los internalid de articulos de las lineas del detalle de la solicitud de consumo
                let internalidsAriculosLinea = [];

                // Iterar cada linea exitente
                for (let i = 0; i < lineCount; i++) {
                    registroSolicitudConsumo.selectLine({ sublistId: SUBLIST_ID, line: i });

                    // Recuperar internalid articulo de linea
                    let internalidArticulo = registroSolicitudConsumo.getCurrentSublistValue({
                        sublistId: SUBLIST_ID,
                        fieldId: "custrecord_2win_consumo_det_articulo"
                    });
                    internalidsAriculosLinea.push(internalidArticulo);
                };
                
                // Ejecutar busqueda para recuperar balance de inventario para todos los articulos recuperados de las lineas del detalle
                let balanceArticuloLinea = daoBalanceInventario.busquedaBalanceInventarioLineasDetalle(internalidsAriculosLinea, internalidUbicacion);

                // Iterar sobre cada linea existente para definir cantidad disponible
                for (let index = 0; index < lineCount; index++) {
                    registroSolicitudConsumo.selectLine({ sublistId: SUBLIST_ID, line: index });

                    // Recuperar articulo de linea
                    let internalidArticulo = registroSolicitudConsumo.getCurrentSublistValue({
                        sublistId: SUBLIST_ID,
                        fieldId: "custrecord_2win_consumo_det_articulo"
                    });

                    let disponible = 0;
                    // Validar si se recupero balance de inventario para la linea
                    if (balanceArticuloLinea !== null && balanceArticuloLinea[internalidArticulo]) {
                        disponible = balanceArticuloLinea[internalidArticulo].disponible;
                    };

                    // Actualizar campo disponible en linea detalle
                    registroSolicitudConsumo.setCurrentSublistValue({
                        sublistId: SUBLIST_ID,
                        fieldId: "custrecord_2win_consumo_det_disponible",
                        value: disponible,
                        ignoreFieldChange: true
                    });

                    // Guardar linea
                    registroSolicitudConsumo.commitLine({ sublistId: SUBLIST_ID });
                }
            } else {
                // Recuperar internalid articulo de linea
                let internalidArticulo = registroSolicitudConsumo.getCurrentSublistValue({
                    sublistId: SUBLIST_ID,
                    fieldId: "custrecord_2win_consumo_det_articulo"
                });

                if (internalidArticulo) {
                    // Ejecutar busqueda para recuperar balance de inventario para linea
                    let balanceArticuloLinea = daoBalanceInventario.busquedaBalanceInventarioLineasDetalle(internalidArticulo, internalidUbicacion);

                    let disponible = 0;
                    // Validar si se recupero stock para articulo
                    if (balanceArticuloLinea !== null && balanceArticuloLinea[internalidArticulo]) {
                        disponible = balanceArticuloLinea[internalidArticulo].disponible;
                    };

                    // Definir valor actualizado en la primera linea en la creacion del registro
                    registroSolicitudConsumo.setCurrentSublistValue({
                        sublistId: SUBLIST_ID,
                        fieldId: "custrecord_2win_consumo_det_disponible",
                        value: disponible,
                        ignoreFieldChange: true
                    });
                };
            };

        } catch (error) {
            nLog.error("actualizarStockLineasDetalleSolicitudConsumo - error", error);
            // console.error('actualizarStockLineasDetalleSolicitudConsumo - error', { 
            //     error: error
            // });
            throw error;
        }
    }

    /**
     * 
     * @param {string} internalidUbicacion 
     * @param {string} internalidArticulo
     * @param {object} registroDetalleSolicitudConsumo 
     * @returns 
     */
    function actualizarStockRegistroDetalleSolicitudConsumo(internalidUbicacion, internalidArticulo, registroDetalleSolicitudConsumo) {
        try {
            nLog.audit("actualizarStockRegistroDetalleSolicitudConsumo - parametros", {
                internalidUbicacion: internalidUbicacion,
                internalidArticulo: internalidArticulo,
                registroDetalleSolicitudConsumo: registroDetalleSolicitudConsumo
            });

            let balanceArticuloLinea = daoBalanceInventario.busquedaBalanceInventarioLineasDetalle(internalidArticulo, internalidUbicacion);

            let disponible = 0;
            // Validar si se recupero stock para articulo
            if (balanceArticuloLinea !== null && balanceArticuloLinea[internalidArticulo]) {
                disponible = balanceArticuloLinea[internalidArticulo].disponible;
            };

            // Actualizar campo disponible en registro detalle solicitud consumo
            registroDetalleSolicitudConsumo.setValue({
                fieldId: "custrecord_2win_consumo_det_disponible",
                value: disponible,
                ignoreFieldChange: true
            }); 

        } catch (error) {
            nLog.error("actualizarStockRegistroDetalleSolicitudConsumo - error", error);
            throw error;
        }
    }

    return {
        actualizarStockLineaDetalleSolicitudConsumo: actualizarStockLineaDetalleSolicitudConsumo,
        actualizarStockLineasDetalleSolicitudConsumo: actualizarStockLineasDetalleSolicitudConsumo,
        actualizarStockRegistroDetalleSolicitudConsumo: actualizarStockRegistroDetalleSolicitudConsumo
    };
});