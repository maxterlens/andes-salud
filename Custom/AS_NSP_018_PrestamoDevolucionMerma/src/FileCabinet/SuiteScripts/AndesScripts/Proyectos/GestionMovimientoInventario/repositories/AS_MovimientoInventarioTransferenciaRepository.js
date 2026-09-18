/**
 * AS_NSP_018 — Prestamo, Devolucion y Merma
 * @description Unico punto del proyecto que crea el Inventory Transfer, con la
 *              asignacion de lotes de cada linea. Si el traslado falla al
 *              guardar, el problema esta aqui: ubicaciones, subsidiaria, lineas
 *              de la sublista inventory o inventory detail.
 *
 * CHANGELOG 2026-09-17:
 * - [FEAT] Las cantidades aceptan decimales. El reparto automatico entre lotes
 *          redondea el saldo por asignar a 5 decimales: sin eso queda un resto
 *          de 1e-17 que abre una asignacion mas en el lote siguiente y el
 *          inventory detail no cuadra con la cantidad de la linea.
 *
 * @NApiVersion 2.1
 * @NModuleScope Public
 */
define(['N/record', 'N/search', '../lib/AS_MovimientoInventarioConstants', './AS_ConsultaStockRepository'],
    (record, search, CONSTANTES, consultaStockRepository) => {

    function crearTransferenciaInventario(datos, lineas) {
        const traslado = record.create({
            type     : CONSTANTES.RECORDS.TRASLADO,
            isDynamic: true,
        });

        traslado.setValue({ fieldId: 'subsidiary',       value: datos.subsidiaria });
        traslado.setValue({ fieldId: 'department',       value: datos.servicio });
        traslado.setValue({ fieldId: 'location',         value: datos.ubicacionOrigen });
        traslado.setValue({ fieldId: 'transferlocation', value: datos.ubicacionDestino });
        traslado.setValue({ fieldId: 'memo',             value: datos.memo });

        const lotesPorArticulo = {};

        lineas.forEach((linea) => {
            traslado.selectNewLine({ sublistId: 'inventory' });
            traslado.setCurrentSublistValue({ sublistId: 'inventory', fieldId: 'item',        value: linea.articulo });
            traslado.setCurrentSublistValue({ sublistId: 'inventory', fieldId: 'adjustqtyby', value: linea.cantidad });

            asignarLotes(traslado, datos.ubicacionOrigen, linea, lotesPorArticulo);

            traslado.commitLine({ sublistId: 'inventory' });
        });

        const idTraslado = traslado.save();

        const numeroTraslado = search.lookupFields({
            type   : CONSTANTES.RECORDS.TRASLADO,
            id     : idTraslado,
            columns: ['tranid'],
        }).tranid;

        return { id: idTraslado, numero: numeroTraslado };
    }

    function asignarLotes(traslado, ubicacionOrigen, linea, lotesPorArticulo) {
        if (!lotesPorArticulo[linea.articulo]) {
            lotesPorArticulo[linea.articulo] = consultaStockRepository.buscarLotesDisponibles(linea.articulo, ubicacionOrigen);
        }

        const enLaUbicacion = lotesPorArticulo[linea.articulo];

        if (enLaUbicacion.length === 0) {
            return;
        }

        const asignaciones = [];

        if (linea.lotes) {
            linea.lotes.forEach((lote) => {
                const enLaBodega = enLaUbicacion.filter((fila) => fila.numeroInventario === lote.numeroInventario)[0];

                asignaciones.push({
                    numeroInventario: lote.numeroInventario,
                    bin             : enLaBodega ? enLaBodega.bin : '',
                    cantidad        : lote.cantidad,
                });
            });
        } else if (linea.lote) {
            const elegido = enLaUbicacion.filter((fila) => fila.nombreLote === linea.lote)[0];

            if (elegido) {
                asignaciones.push({
                    numeroInventario: elegido.numeroInventario,
                    bin             : elegido.bin,
                    cantidad        : linea.cantidad,
                });
            }
        } else {
            let porAsignar = linea.cantidad;

            enLaUbicacion.forEach((lote) => {
                if (porAsignar <= 0) {
                    return;
                }

                const cantidad = Math.min(porAsignar, lote.enMano);

                porAsignar = Math.round((porAsignar - cantidad) * 100000) / 100000;

                asignaciones.push({
                    numeroInventario: lote.numeroInventario,
                    bin             : lote.bin,
                    cantidad        : cantidad,
                });
            });
        }

        const detalle = traslado.getCurrentSublistSubrecord({
            sublistId: 'inventory',
            fieldId  : 'inventorydetail',
        });

        asignaciones.forEach((asignacion) => {
            detalle.selectNewLine({ sublistId: 'inventoryassignment' });
            detalle.setCurrentSublistValue({ sublistId: 'inventoryassignment', fieldId: 'issueinventorynumber', value: asignacion.numeroInventario });

            if (asignacion.bin) {
                detalle.setCurrentSublistValue({ sublistId: 'inventoryassignment', fieldId: 'binnumber', value: asignacion.bin });
            }

            detalle.setCurrentSublistValue({ sublistId: 'inventoryassignment', fieldId: 'quantity', value: asignacion.cantidad });
            detalle.commitLine({ sublistId: 'inventoryassignment' });
        });
    }

    function buscarLotesDelTraslado(idTraslado) {
        const traslado = record.load({
            type: CONSTANTES.RECORDS.TRASLADO,
            id  : idTraslado,
        });

        const porArticulo = {};

        const totalLineas = traslado.getLineCount({ sublistId: 'inventory' });

        for (let i = 0; i < totalLineas; i++) {
            const articulo = String(traslado.getSublistValue({ sublistId: 'inventory', fieldId: 'item', line: i }));

            const detalle = traslado.getSublistSubrecord({
                sublistId: 'inventory',
                fieldId  : 'inventorydetail',
                line     : i,
            });

            if (!detalle) {
                continue;
            }

            if (!porArticulo[articulo]) {
                porArticulo[articulo] = [];
            }

            const asignaciones = detalle.getLineCount({ sublistId: 'inventoryassignment' });

            for (let j = 0; j < asignaciones; j++) {
                porArticulo[articulo].push({
                    numeroInventario: String(detalle.getSublistValue({ sublistId: 'inventoryassignment', fieldId: 'issueinventorynumber', line: j })),
                    cantidad        : Number(detalle.getSublistValue({ sublistId: 'inventoryassignment', fieldId: 'quantity', line: j })),
                });
            }
        }

        return porArticulo;
    }

    return { crearTransferenciaInventario, buscarLotesDelTraslado };
});
