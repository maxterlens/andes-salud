/**
 * @NApiVersion 2.1
 * @module ./2win_dao_numero_inventario.js
 * @NModuleScope Public
 */
define(["./2win_dao", "N/search", "N/log"], function (dao, search, nLog) {

    /**
     * Recuperar los lotes disponibles para un articulo y ubicacion, priorizando por fecha de expiracion y cantidad disponible.
     * @param {object} parametro - Parametros para usar en filtros de busqueda
     * @returns {array} - Lotes seleccionados para asignar en detalle de inventario
     */
    function busquedaRegistroPorArticulo(parametro) {
        try {
            let cantidadRequerida = Math.abs(parametro.quantity);
            
            nLog.debug("busquedaRegistroPorArticulo - inicio", {
                item: parametro.item,
                cantidadRequerida: cantidadRequerida
            });

            // Definir la búsqueda
            let objSearch = {
                type: "inventorynumber",
                filters: [
                    ["item", "anyof", parametro.item],
                    "AND",
                    ["location", "anyof", parametro.location],
                    "AND",
                    ["quantityavailable", "greaterthan", 0] // Traer todos los que tengan stock
                ],
                columns: [
                    // 1. PRIMER CRITERIO: Fecha de caducidad más próxima
                    search.createColumn({ name: "expirationdate", sort: search.Sort.ASC, label: "fechaExpiracion" }),
                    // 2. SEGUNDO CRITERIO: Menor cantidad disponible primero
                    search.createColumn({ name: "quantityavailable", sort: search.Sort.ASC, label: "cantidadDisponible" }),
                    search.createColumn({ name: "internalid", label: "internalid" }),
                    search.createColumn({ name: "inventorynumber", label: "nombreLote" }),
                ]
            };

            // Ejecutar búsqueda
            let results = dao.obtenerResultados(objSearch);
            nLog.debug("busquedaRegistroPorArticulo - resultados", {
                extension: results.length,
                resultado: results
            });
            
            if (!results || results.length === 0) {
                throw new Error(`No hay stock disponible para el artículo: ${parametro.item}`);
            }

            let lotesSeleccionados = [];
            let faltante = cantidadRequerida;
            let acumulado = 0;

            // Selección de lotes
            for (let i = 0; i < results.length; i++) {
                let disponible = parseFloat(results[i].cantidadDisponible || 0);
                let internalidLote = results[i].internalid;
                let nombreLote = results[i].nombreLote;

                // Cantidad a tomar de este lote específico
                let cantidadATomar = disponible >= faltante ? faltante : disponible;

                lotesSeleccionados.push({
                    internalid: internalidLote, // ID interno para el inventory detail
                    lotName: nombreLote,
                    quantity: cantidadATomar
                });

                // Actualizar la cantidad faltante por cubrir
                faltante -= cantidadATomar;
                acumulado += cantidadATomar;


                // Si ya cubrimos la cantidad requerida, salimos
                if (faltante <= 0) break;
            }

            // Validar si al final se completó la cantidad
            if (faltante > 0) {
                throw new Error(`No hay stock suficiente para el artículo: ${parametro.item} en lotes disponibles, se requiere: ${cantidadRequerida} disponible: ${acumulado}`);
            }

            nLog.debug("busquedaRegistroPorArticulo - lotesSeleccionados", {
                extension: lotesSeleccionados.length,
                lotesSeleccionados: lotesSeleccionados
            });

            return lotesSeleccionados;
        } catch (error) {
            nLog.error("busquedaRegistroPorArticulo - error", error);
            throw error;
        }
    }

    return {
        busquedaRegistroPorArticulo: busquedaRegistroPorArticulo
    };
});
