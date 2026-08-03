/**
 * @NApiVersion 2.1
 * @module ./2win_dao_detalle_inventario.js
 * @NModuleScope Public
 */
define([
    "N/log", 
    "N/record", 
    "N/runtime", 
    "N/search", 
    "./2win_dao_balance_inventario",
    "./2win_dao_numero_inventario",
    "./2win_dao_ubicacion"
], function (
    nLog, 
    record, 
    runtime, 
    search, 
    daoBalanceInventario,
    daoNumeroInventario,
    daoUbicacion
) {

    /**
     * 
     * @param {boolean} ubicacionUsaDeposito 
     * @param {object} subregistroDetalleInventario 
     * @returns {object} - Subregistro con lineas creadas para el detalle de inventario
     */
    function crearDetalleInventario(detalleBalanceInventario, subregistroDetalleInventario) {
        try {
            nLog.debug("crearDetalleInventario - parametros", { 
                detalleBalanceInventario: detalleBalanceInventario,
                subregistroDetalleInventario: subregistroDetalleInventario 
            });

            let datosLineaDetalleInventario = {
                quantity: Math.abs(subregistroDetalleInventario.getValue("quantity")),
                location: subregistroDetalleInventario.getValue("location"),
                item: subregistroDetalleInventario.getValue("item")
            };
            nLog.debug("crearDetalleInventario - datosLineaDetalleInventario", { datosLineaDetalleInventario: datosLineaDetalleInventario });
            
            // Aislar criterios para crear linea de detalle
            const esArticuloPorLote = detalleBalanceInventario.esArticuloNumeradoPorLote;
            const articuloUsaDeposito = detalleBalanceInventario.articuloUsaDeposito;
            const ubicacionUsaDeposito = detalleBalanceInventario.ubicacionUsaDeposito

            let lineasDetalleInventarioCreadas = [];
            let cantidadRequerida = datosLineaDetalleInventario.quantity;
            let cantidadTomada = 0
            
            // Validar tipo de articulo para asignar lote
            if (
                esArticuloPorLote === true &&
                (ubicacionUsaDeposito === false || articuloUsaDeposito === false) 
            ) {
                let lotes = detalleBalanceInventario.lotes
                for (let index = 0; index < lotes.length; index++) {
                    const lote = lotes[index];

                    // Calcular cantidad a extraer de esta combinación específica
                    let cantidadATomar = lote.disponible >= cantidadRequerida ? cantidadRequerida : lote.disponible;

                    // Agregar lineas al subregistro detalle de inventario
                    subregistroDetalleInventario.selectNewLine({ sublistId: "inventoryassignment" });
                    subregistroDetalleInventario.setCurrentSublistValue({ sublistId: "inventoryassignment", fieldId: "issueinventorynumber", value: lote.internalidLote });
                    subregistroDetalleInventario.setCurrentSublistValue({ sublistId: "inventoryassignment", fieldId: "quantity", value: -Math.abs(cantidadATomar) });
                    let lineaDetalle = subregistroDetalleInventario.commitLine({ sublistId: "inventoryassignment" });
                    lineasDetalleInventarioCreadas.push(lineaDetalle);

                    cantidadRequerida -= cantidadATomar;
                    cantidadTomada += cantidadATomar;

                    // Salir del bucle si ya se completó el requerimiento
                    if (cantidadRequerida <= 0) break;
                    
                }
            } else if ( 
                (ubicacionUsaDeposito === true || articuloUsaDeposito === true) && // Si ubicacion o item usan depositos
                esArticuloPorLote === false // Articulo no es de tipo loteado, para evitar conflicto de asignacion de lote y deposito en el mismo detalle
            ) { 
                let depositos = detalleBalanceInventario.depositos;

                for (let index = 0; index < depositos.length; index++) {
                    const deposito = depositos[index];

                    // Calcular cantidad a extraer de esta combinación específica
                    let cantidadATomar = deposito.disponible >= cantidadRequerida ? cantidadRequerida : deposito.disponible;

                    // Agregar lineas al subregistro detalle de inventario
                    subregistroDetalleInventario.selectNewLine({ sublistId: "inventoryassignment" });
                    subregistroDetalleInventario.setCurrentSublistValue({ sublistId: "inventoryassignment", fieldId: "binnumber", value: deposito.internalidDeposito });
                    subregistroDetalleInventario.setCurrentSublistValue({ sublistId: "inventoryassignment", fieldId: "quantity", value: -Math.abs(cantidadATomar) });
                    let lineaDetalle = subregistroDetalleInventario.commitLine({ sublistId: "inventoryassignment" });
                    nLog.debug("crearDetalleInventario - lineaDetalle", { lineaDetalle: lineaDetalle });
                    lineasDetalleInventarioCreadas.push(lineaDetalle);

                    cantidadRequerida -= cantidadATomar;
                    cantidadTomada += cantidadATomar;
                    
                    // Salir del bucle si ya se completó el requerimiento
                    if (cantidadRequerida <= 0) break;
                    
                }
            } else if (
                (ubicacionUsaDeposito === true && articuloUsaDeposito === true) && // Si ubicacion e item usan depositos
                esArticuloPorLote === true // Articulo es de tipo loteado, asiganar lote y deposito en el mismo detalle
            ) {
                let lotes = detalleBalanceInventario.lotes;

                for (let index = 0; index < lotes.length; index++) {
                    const lote = lotes[index];

                    // Calcular cantidad a extraer de esta combinación específica
                    let cantidadATomar = lote.disponible >= cantidadRequerida ? cantidadRequerida : lote.disponible;

                    // Agregar lineas al subregistro detalle de inventario
                    subregistroDetalleInventario.selectNewLine({ sublistId: "inventoryassignment" });
                    subregistroDetalleInventario.setCurrentSublistValue({ sublistId: "inventoryassignment", fieldId: "issueinventorynumber", value: lote.internalidLote });
                    subregistroDetalleInventario.setCurrentSublistValue({ sublistId: "inventoryassignment", fieldId: "binnumber", value: lote.internalidDeposito });
                    subregistroDetalleInventario.setCurrentSublistValue({ sublistId: "inventoryassignment", fieldId: "quantity", value: -Math.abs(cantidadATomar) });
                    let lineaDetalle = subregistroDetalleInventario.commitLine({ sublistId: "inventoryassignment" });
                    lineasDetalleInventarioCreadas.push(lineaDetalle);

                    cantidadRequerida -= cantidadATomar;
                    cantidadTomada += cantidadATomar;

                    // Salir del bucle si ya se completó el requerimiento
                    if (cantidadRequerida <= 0) break;
                    
                }
            } else {
                // Agregar linea al subregistro detalle de inventario sin lote ni deposito
                subregistroDetalleInventario.selectNewLine({ sublistId: "inventoryassignment" });
                subregistroDetalleInventario.setCurrentSublistValue({ sublistId: "inventoryassignment", fieldId: "quantity", value: subregistroDetalleInventario.getValue("quantity") });
                let lineaDetalle = subregistroDetalleInventario.commitLine({ sublistId: "inventoryassignment" });
                lineasDetalleInventarioCreadas.push(lineaDetalle);
                cantidadRequerida = 0
            };

            // Validar si la cantidad requerida no fue fue suplida
            if (cantidadRequerida > 0) {
                throw new Error("No hay stock suficiente para articulo: " + subregistroDetalleInventario.getText("item") + ", solicitado: " + datosLineaDetalleInventario.quantity + ", disponible: " + cantidadTomada);
            }

            nLog.debug("crearDetalleInventario - lineasDetalleInventarioCreadas", {
                extension: lineasDetalleInventarioCreadas.length,
                lineasDetalleInventarioCreadas: lineasDetalleInventarioCreadas
            })
            return subregistroDetalleInventario;
        } catch (error) {
            nLog.error("crearDetalleInventario - error", error);
            throw error;
        }
    }

    return {
        crearDetalleInventario: crearDetalleInventario
    };
});
