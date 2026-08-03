/**
 * @NApiVersion 2.1
 * @module ./2win_dom_solicitud_consumo_actualizacion_stock_evento_usuario.js
 * @NModuleScope Public
 */
define([
    "N/log",
    "N/record",
    "../dao/2win_dao_2win_solicitud_consumo_det",
    "../dao/2win_dao_balance_inventario",
], function (
    nLog, 
    record,
    daoSolicitudConsumoDetalle,
    daoBalanceInventario,
) {

    /**
     * 
     * @param {string} internalidUbicacion 
     * @param {object} registroSolicitudConsumo 
     * @returns 
     */
    function actualizarStockLineasDetalleSolicitudConsumoEventoUsuario(internalidUbicacion, registroSolicitudConsumo) {
        try {
            nLog.audit("actualizarStockLineasDetalleSolicitudConsumoEventoUsuario - parametros", {
                internalidUbicacion: internalidUbicacion,
                registroSolicitudConsumo: registroSolicitudConsumo
            });

            // Recuperar registros de detalle para solicitud de consumo
            let registroSolicitudConsumoDetalle = daoSolicitudConsumoDetalle.busquedaDetallesSolicitudConsumoPorReferencia(registroSolicitudConsumo.id);

            if (registroSolicitudConsumoDetalle.length > 0) {
                // Aislar internalid de articulos en registros de detalle
                let internalidsAriculosLinea = [];
                registroSolicitudConsumoDetalle.forEach(registroDetalle => {
                    internalidsAriculosLinea.push(registroDetalle.custrecord_2win_consumo_det_articulo);
                });

                // Ejecutar busqueda para recuperar balance de inventario para todos los articulos recuperados de las lineas del detalle
                let balanceArticuloLinea = daoBalanceInventario.busquedaBalanceInventarioLineasDetalle(internalidsAriculosLinea, internalidUbicacion);
                nLog.audit("actualizarStockLineasDetalleSolicitudConsumoEventoUsuario - balanceArticuloLinea", {
                    balanceArticuloLinea: balanceArticuloLinea,
                });

                // Actualizar campo disponible en cada registro detalle
                registroSolicitudConsumoDetalle.forEach(registroDetalle => {

                    // Recuperar articulo de detalle
                    let internalidArticulo = registroDetalle.custrecord_2win_consumo_det_articulo

                    let disponible = 0;
                    // Validar si se recupero balance de inventario para la linea
                    if (balanceArticuloLinea !== null && balanceArticuloLinea[internalidArticulo]) {
                        disponible =  balanceArticuloLinea[internalidArticulo].disponible;
                    };

                    // Actualizar disponibilidad de articulo
                    record.submitFields({
                        type: 'customrecord_2win_solicitud_consumo_det',
                        id: registroDetalle.internalid,
                        values: {
                            custrecord_2win_consumo_det_disponible: disponible
                        }
                    });
                });

            } else {
                nLog.audit("actualizarStockLineasDetalleSolicitudConsumoEventoUsuario - sin lineas", "no existen lineas en la solicitud de consumo");
            };

        } catch (error) {
            nLog.error("actualizarStockLineasDetalleSolicitudConsumoEventoUsuario - error", error);
            throw error;
        }
    }

    return {
        actualizarStockLineasDetalleSolicitudConsumoEventoUsuario: actualizarStockLineasDetalleSolicitudConsumoEventoUsuario
    };
});