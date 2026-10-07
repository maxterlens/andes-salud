/**
 * AS_NSP_018 — Prestamo, Devolucion y Merma
 * @description Crea el Inventory Transfer del modulo: Prestamo De la Clinica
 *              (origen → bodega de prestamos) y Devolucion De la Clinica
 *              (bodega de prestamos → origen). Los lotes de cada linea los
 *              decide AS_MovimientoInventarioQuery.obtenerAsignacionesLotes; aca
 *              solo se escriben.
 *
 *              obtenerLotesDelTraslado lee y no escribe, pero queda aca porque el
 *              inventory detail de un traslado solo se recorre cargando el record.
 *
 * @NApiVersion 2.1
 * @NModuleScope Public
 */
define(['N/record', '../../constants/AS_MovimientoInventarioConstants', '../query/AS_MovimientoInventarioQuery', '../search/AS_MovimientoInventarioSearch'],
    (record, CONSTANTES, movimientoQuery, movimientoSearch) => {

    function crearTraslado(datos, lineas) {
        const traslado = record.create({ type: CONSTANTES.RECORDS.TRASLADO, isDynamic: true });

        movimientoQuery.obtenerAsignacionesLotes(lineas, datos.ubicacionOrigen);

        traslado.setValue({ fieldId: 'subsidiary',       value: datos.subsidiaria });
        traslado.setValue({ fieldId: 'department',       value: datos.servicio });
        traslado.setValue({ fieldId: 'location',         value: datos.ubicacionOrigen });
        traslado.setValue({ fieldId: 'transferlocation', value: datos.ubicacionDestino });
        traslado.setValue({ fieldId: 'memo',             value: datos.memo });

        lineas.forEach((linea) => {
            traslado.selectNewLine({ sublistId: 'inventory' });
            traslado.setCurrentSublistValue({ sublistId: 'inventory', fieldId: 'item',        value: linea.articulo });
            traslado.setCurrentSublistValue({ sublistId: 'inventory', fieldId: 'adjustqtyby', value: linea.cantidad });

            if (linea.asignaciones) {
                const detalle = traslado.getCurrentSublistSubrecord({ sublistId: 'inventory', fieldId: 'inventorydetail' });

                linea.asignaciones.forEach((asignacion) => {
                    detalle.selectNewLine({ sublistId: 'inventoryassignment' });
                    detalle.setCurrentSublistValue({ sublistId: 'inventoryassignment', fieldId: 'issueinventorynumber', value: asignacion.numeroInventario });
                    if (asignacion.bin) detalle.setCurrentSublistValue({ sublistId: 'inventoryassignment', fieldId: 'binnumber', value: asignacion.bin });
                    detalle.setCurrentSublistValue({ sublistId: 'inventoryassignment', fieldId: 'quantity', value: asignacion.cantidad });
                    detalle.commitLine({ sublistId: 'inventoryassignment' });
                });
            }

            traslado.commitLine({ sublistId: 'inventory' });
        });

        const id = traslado.save();

        return { id: id, numero: movimientoSearch.obtenerNumeroTransaccion(CONSTANTES.RECORDS.TRASLADO, id) };
    }

    /**
     * Los lotes y cantidades que salieron con el traslado de un prestamo, por
     * articulo, en el orden en que salieron.
     */
    function obtenerLotesDelTraslado(idTraslado) {
        const traslado    = record.load({ type: CONSTANTES.RECORDS.TRASLADO, id: idTraslado });
        const porArticulo = {};
        const totalLineas = traslado.getLineCount({ sublistId: 'inventory' });

        for (let i = 0; i < totalLineas; i++) {
            const articulo = String(traslado.getSublistValue({ sublistId: 'inventory', fieldId: 'item', line: i }));
            const detalle  = traslado.getSublistSubrecord({ sublistId: 'inventory', fieldId: 'inventorydetail', line: i });

            if (!detalle) continue;

            porArticulo[articulo] = porArticulo[articulo] || [];

            for (let j = 0; j < detalle.getLineCount({ sublistId: 'inventoryassignment' }); j++) {
                porArticulo[articulo].push({
                    numeroInventario: String(detalle.getSublistValue({ sublistId: 'inventoryassignment', fieldId: 'issueinventorynumber', line: j })),
                    cantidad        : Number(detalle.getSublistValue({ sublistId: 'inventoryassignment', fieldId: 'quantity', line: j })),
                });
            }
        }

        return porArticulo;
    }

    return {
        crearTraslado          : crearTraslado,
        obtenerLotesDelTraslado: obtenerLotesDelTraslado,
    };
});
