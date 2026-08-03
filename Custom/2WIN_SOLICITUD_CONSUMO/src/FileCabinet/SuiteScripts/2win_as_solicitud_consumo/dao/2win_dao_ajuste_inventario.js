/**
 * @NApiVersion 2.1
 * @module ./2win_dao_ajuste_inventario.js
 * @NModuleScope Public
 */
define(["N/log", "N/record", "N/runtime","N/search", "./2win_dao_balance_inventario", "./2win_dao_detalle_inventario", "./2win_dao_ubicacion"], function (nLog, record, runtime, search, daoBalanceInventario, daoDetalleInventario, daoUbicacion) {

    /**
     * Crear un ajuste de inventario para un grupo de líneas
     * @param {array} internalidsAriculos - internalid de cada articulo a procesar
     * @param {object} grupo - Grupo de detalle solicitud consumo para el mismo departamento
     * @param {object} solicitudRec - Registro solicitud consumo
     * @returns 
     */
    function crearAjusteInventario(internalidsAriculos, grupo, solicitudRec) {
        try {
            nLog.debug("crearAjusteInventario - parametros", {
                internalidsAriculos: internalidsAriculos,
                grupo: grupo,
                solicitudRec: solicitudRec
            });
            
            let ajusteRec = record.create({ type: record.Type.INVENTORY_ADJUSTMENT, isDynamic: true });
    
            // Encabezado
            ajusteRec.setValue({ fieldId: "subsidiary", value: solicitudRec.getValue("custrecord_2win_consumo_subsidiaria") });
            ajusteRec.setValue({ fieldId: "account", value: solicitudRec.getValue("custrecord_2win_consumo_cuenta_consumo") });
            if (grupo.departamentoId) {
                ajusteRec.setValue({ fieldId: "department", value: grupo.departamentoId });
            }
            const claseId = solicitudRec.getValue("custrecord_2win_consumo_clase");
            if (claseId) {
                ajusteRec.setValue({ fieldId: "class", value: claseId });
            }
            ajusteRec.setValue({ fieldId: "memo", value: `Consumo desde Solicitud #${solicitudRec.id} - ${solicitudRec.getValue("custrecord_2win_consumo_nota") || ""}` });
            ajusteRec.setValue({ fieldId: "trandate", value: solicitudRec.getValue("custrecord_2win_consumo_fecha") });

            // Validar stock de todos los articulos a procesar
            let balanceInventarioArticulos = daoBalanceInventario.busquedaBalanceInventarioLineasDetalle(internalidsAriculos, grupo.lineas[0].ubicacionId);
    
            // Líneas de inventario
            grupo.lineas.forEach((linea) => {
                // Validar si se encontro stock para este articulo
                if (balanceInventarioArticulos[linea.articuloId]) {
                    let detalleBalanceInventario = balanceInventarioArticulos[linea.articuloId]

                    // Validar stock requerido vs stock disponible
                    if (Math.abs(linea.cantidad) > balanceInventarioArticulos[linea.articuloId].disponible) {
                        throw new Error("No hay stock suficiente para articulo: " + linea.articuloNombre + ", solicitado: " + linea.cantidad + ", disponible: " + balanceInventarioArticulos[linea.articuloId].disponible);
                    }

                    // Iniciar nueva linea de ajuste inventario para articulo
                    ajusteRec.selectNewLine({ sublistId: "inventory" });
                    ajusteRec.setCurrentSublistValue({ sublistId: "inventory", fieldId: "item", value: linea.articuloId });
                    ajusteRec.setCurrentSublistValue({ sublistId: "inventory", fieldId: "location", value: linea.ubicacionId });
                    ajusteRec.setCurrentSublistValue({
                        sublistId: "inventory",
                        fieldId: "adjustqtyby",
                        value: -Math.abs(linea.cantidad) // Negativo para consumo
                    });
                    if (grupo.departamentoId) {
                        ajusteRec.setCurrentSublistValue({ sublistId: "inventory", fieldId: "department", value: grupo.departamentoId });
                    };
    
                    // Recuperar subregistro detalle de inventario
                    let subregistroDetalleInventario = ajusteRec.getCurrentSublistSubrecord({ sublistId: "inventory", fieldId: "inventorydetail" });
                    nLog.debug("crearAjusteInventario - subregistroDetalleInventario", { subregistroDetalleInventario: subregistroDetalleInventario });
    
                    // Recuperar conteo de lineas
                    const currentDetailLineCount = subregistroDetalleInventario.getLineCount({ sublistId: "inventoryassignment" });
                    nLog.debug("crearAjusteInventario - currentDetailLineCount", { currentDetailLineCount: currentDetailLineCount });
                    
                    // Validar si ya existe linea de detalle inventario
                    if (currentDetailLineCount > 0) {
                        nLog.debug("crearAjusteInventario - detalle existente", "Ya existe detalle de inventario configurado");
                    } else {
                        // Crear detalle inventario
                        subregistroDetalleInventario = daoDetalleInventario.crearDetalleInventario(detalleBalanceInventario, subregistroDetalleInventario);
                    };
    
                    // Guardar linea ajuste inventario
                    ajusteRec.commitLine({ sublistId: "inventory" });
                } else {
                    throw new Error ("No se encontro inventario para articulo: " + linea.articuloNombre + " en la ubicacion seleccionada");
                };
            });
    
            // Guardar registro
            const ajusteId = ajusteRec.save();
            nLog.debug("crearAjusteInventario - ajusteId", { ajusteId: ajusteId });
            return ajusteId;
        } catch (error) {
            nLog.error("crearAjusteInventario - error", error);
            throw error;
        }
    }

    return {
        crearAjusteInventario: crearAjusteInventario
    };
});
