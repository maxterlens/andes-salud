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
        // El Servicio del movimiento es el Department de NetSuite: el campo del
        // custom record esta sourceado ahi. El traslado genera asientos, asi que
        // sin esto el movimiento queda sin clasificar para los reportes.
        traslado.setValue({ fieldId: 'department',       value: datos.servicio });
        traslado.setValue({ fieldId: 'location',         value: datos.ubicacionOrigen });
        traslado.setValue({ fieldId: 'transferlocation', value: datos.ubicacionDestino });
        traslado.setValue({ fieldId: 'memo',             value: datos.memo });

        // Los lotes de la ubicacion se consultan una vez por articulo y no una
        // por linea: prestar dos lotes del mismo articulo son dos lineas, y sin
        // esto cada una repetiria la misma consulta.
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

    // Que lotes mueve la linea. Son tres casos y estan los tres a la vista:
    //
    //   PRESTAMO    el usuario eligio el lote en la pantalla de captura y quedo
    //               guardado por nombre en la linea. Aqui se resuelve contra la
    //               ubicacion de origen para sacar su id interno y su bin.
    //   DEVOLUCION  no se elige nada. linea.lotes ya trae los lotes y las
    //               cantidades que salieron en el prestamo, y el material tiene
    //               que volver con esos mismos. Aqui solo se les busca el bin
    //               donde estan hoy en la bodega, que es de donde salen ahora.
    //   MERMA       sin lote elegido: se reparte la cantidad entre lo que haya
    //               en la ubicacion. Es tambien lo que pasa con un prestamo
    //               viejo, anterior a la captura de lote.
    //
    // Un articulo sin control de lote no devuelve filas y la linea se guarda sin
    // inventory detail.
    function asignarLotes(traslado, ubicacionOrigen, linea, lotesPorArticulo) {
        if (!lotesPorArticulo[linea.articulo]) {
            lotesPorArticulo[linea.articulo] = buscarLotesDisponibles(linea.articulo, ubicacionOrigen);
        }

        const enLaUbicacion = lotesPorArticulo[linea.articulo];

        if (enLaUbicacion.length === 0) {
            return;
        }

        const asignaciones = [];

        // linea.lotes va primero: una devolucion ya procesada guarda tambien el
        // nombre del lote en linea.lote, para que se vea en el registro, y no
        // tiene que confundirse con la eleccion del usuario en un prestamo.
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

            // Solo las bodegas con bin habilitado esperan este campo.
            if (asignacion.bin) {
                detalle.setCurrentSublistValue({ sublistId: 'inventoryassignment', fieldId: 'binnumber', value: asignacion.bin });
            }

            detalle.setCurrentSublistValue({ sublistId: 'inventoryassignment', fieldId: 'quantity', value: asignacion.cantidad });
            detalle.commitLine({ sublistId: 'inventoryassignment' });
        });
    }

    // Los lotes que salieron en un traslado ya guardado, agrupados por articulo y
    // en el orden en que se asignaron. Es lo que la devolucion lee del traslado
    // del prestamo para volver con el mismo material que se llevo.
    function buscarLotesDelTraslado(idTraslado) {
        const traslado = record.load({
            type: CONSTANTES.RECORDS.TRASLADO,
            id  : idTraslado,
        });

        const porArticulo = {};

        const totalLineas = traslado.getLineCount({ sublistId: 'inventory' });

        for (let i = 0; i < totalLineas; i++) {
            const articulo = String(traslado.getSublistValue({ sublistId: 'inventory', fieldId: 'item', line: i }));

            // Un articulo sin control de lote no tiene subregistro de detalle.
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

    // Mismo criterio que 2win_dao_assign_inv_details: se descartan los lotes en
    // estado bloqueado o en inspeccion y se toman primero los mas antiguos.
    // Se reparte sobre lo que hay fisicamente y no sobre lo disponible: la bodega
    // de prestamos no publica disponibilidad, asi que por disponible no devolveria
    // ningun lote y el traslado se guardaria sin inventory detail. Cuanto se puede
    // sacar ya lo decidio la validacion de stock del handler, antes de llegar aqui.
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

    // Unidad de stock y existencias de cada articulo en la ubicacion. Se traen
    // los dos numeros porque no miden lo mismo: para prestar hace falta que el
    // material este disponible, para devolver basta con que este ahi. La bodega
    // de prestamos tiene apagado Make Inventory Available -el material esta fuera
    // de la clinica- asi que su disponible siempre es cero.
    // El LEFT JOIN parte de item para que un articulo sin existencias tambien
    // devuelva fila, con cero y su unidad.
    function buscarStockPorArticulo(articulos, ubicacion) {
        // Un movimiento sin lineas arma un IN () que no es SQL valido. Pasa con
        // los que quedaron sin detalle por un guardado a medias, y sin este
        // corte no se pueden ni abrir para anularlos.
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
