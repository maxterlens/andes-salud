/**
 * AS_NSP_018 — Prestamo, Devolucion y Merma
 * @description Unico punto del proyecto que crea el Inventory Transfer, con la
 *              asignacion de lotes de cada linea. Si el traslado falla al
 *              guardar, el problema esta aqui: ubicaciones, subsidiaria, lineas
 *              de la sublista inventory o inventory detail.
 *              buscarStockPorArticulo alimenta la validacion de stock de los
 *              handlers y la columna Disponible del formulario de captura.
 *
 * @NApiVersion 2.1
 * @NModuleScope Public
 */
define(['N/record', 'N/search', 'N/query', '../lib/MovimientoInventarioConstants'],
    (record, search, query, CONSTANTES) => {

    function crearInventoryTransfer(datos, lineas) {
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
            lotesPorArticulo[linea.articulo] = buscarLotesDisponibles(linea.articulo, ubicacionOrigen);
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

                porAsignar -= cantidad;

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

    function buscarLotesDisponibles(articulo, ubicacion) {
        const filas = query.runSuiteQL({
            query: [
                'SELECT ib.inventorynumber AS numeroinventario,',
                '       BUILTIN.DF(ib.inventorynumber) AS nombrelote,',
                '       ib.binnumber AS bin,',
                '       inl.quantityonhand AS enmano',
                'FROM InventoryBalance ib',
                'INNER JOIN InventoryNumberLocation inl',
                '  ON ib.inventorynumber = inl.inventorynumber AND ib.location = inl.location',
                'WHERE ib.item = ?',
                '  AND ib.location = ?',
                '  AND ib.quantityonhand > 0',
                '  AND inl.quantityonhand > 0',
                '  AND NVL(ib.inventorystatus, -1) NOT IN (',
                '        SELECT id FROM InventoryStatus WHERE name IN (?, ?, ?)',
                '      )',
                'ORDER BY ib.lastmodifieddate ASC',
            ].join(' '),
            params: [Number(articulo), Number(ubicacion), 'Bloqueado', 'En Inspección', 'Damaged'],
        }).asMappedResults();

        return filas.map((fila) => ({
            numeroInventario: String(fila.numeroinventario),
            nombreLote      : String(fila.nombrelote),
            bin             : fila.bin,
            enMano          : Number(fila.enmano),
        }));
    }

    function buscarStockPorArticulo(articulos, ubicacion) {
        if (articulos.length === 0) {
            return {};
        }

        const filas = query.runSuiteQL({
            query: [
                'SELECT i.id AS articulo,',
                '       BUILTIN.DF(i.stockunit) AS unidad,',
                '       NVL(ail.quantityavailable, 0) AS disponible,',
                '       NVL(ail.quantityonhand, 0) AS enmano',
                'FROM item i',
                'LEFT JOIN AggregateItemLocation ail',
                '  ON ail.item = i.id AND ail.location = ?',
                'WHERE i.id IN (' + articulos.join(',') + ')',
            ].join(' '),
            params: [Number(ubicacion)],
        }).asMappedResults();

        const stock = {};

        filas.forEach((fila) => {
            stock[String(fila.articulo)] = {
                unidad    : fila.unidad,
                disponible: Number(fila.disponible),
                enMano    : Number(fila.enmano),
            };
        });

        return stock;
    }

    return { crearInventoryTransfer, buscarLotesDelTraslado, buscarLotesDisponibles, buscarStockPorArticulo };
});
