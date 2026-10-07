/**
 * AS_NSP_018 — Prestamo, Devolucion y Merma
 * @description Todas las consultas SuiteQL del modulo.
 *
 *              STOCK        obtenerFaltantes, obtenerStockPorArticulo,
 *                           obtenerLotesPorArticulo, obtenerArticulosConStock
 *              LOTES        obtenerAsignacionesLotes: de que lotes sale cada linea
 *              SOLICITUD    obtenerPrestamosPendientes
 *              COMBOS       obtenerCuentasAjuste, obtenerEntidadesPorSubsidiaria,
 *                           obtenerUbicacionesPorSubsidiaria
 *              CORRELATIVO  obtenerFilaCorrelativo
 *
 *              AggregateItemLocation da el stock por articulo y ubicacion.
 *              InventoryBalance e InventoryNumberLocation dan los lotes
 *              utilizables, sin los estados bloqueados, del mas antiguo al mas
 *              nuevo: en ese orden se toman cuando la linea no elige lote.
 * @NApiVersion 2.1
 * @NModuleScope Public
 */
define(['N/query', '../../constants/AS_MovimientoInventarioConstants', '../../utils/AS_MovimientoInventarioUtils'],
    (query, CONSTANTES, UTILS) => {

    // ─────────────────────────────────────────────────────────────────────────
    // Principales
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Marca en cada linea cuanto hay (linea.hay) y devuelve las que piden mas.
     * Sin lote, la linea se mide contra el disponible del articulo; con lote,
     * contra lo que hay de ese lote en la ubicacion.
     */
    function obtenerFaltantes(lineas, ubicacion) {
        const articulos        = lineas.map((linea) => linea.articulo);
        const stock            = obtenerStockPorArticulo(articulos, ubicacion);
        const lotesPorArticulo = obtenerLotesPorArticulo(articulos, ubicacion);

        lineas.forEach((linea) => {
            if (!linea.lote) {
                linea.hay = stock[linea.articulo].disponible;
                return;
            }

            const elegido = lotesPorArticulo[linea.articulo].filter((lote) => lote.nombreLote === linea.lote)[0];

            linea.hay = elegido ? elegido.enMano : 0;
        });

        return lineas.filter((linea) => linea.hay < linea.cantidad);
    }

    function obtenerStockPorArticulo(articulos, ubicacion) {
        if (articulos.length === 0) return {};

        const filas = query.runSuiteQL({
            query: [
                'SELECT i.id AS articulo,',
                '       BUILTIN.DF(i.stockunit) AS unidad,',
                '       NVL(ail.quantityavailable, 0) AS disponible,',
                '       NVL(ail.quantityonhand, 0) AS enmano',
                'FROM item i',
                'LEFT JOIN AggregateItemLocation ail',
                '  ON ail.item = i.id AND ail.location = ?',
                'WHERE i.id IN (' + articulos.map(Number).join(',') + ')',
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

    /**
     * Todos los articulos llegan al mapa, aunque no tengan lotes: un articulo
     * sin control de lotes queda con la lista vacia.
     */
    function obtenerLotesPorArticulo(articulos, ubicacion) {
        const lotesPorArticulo = {};

        articulos.forEach((articulo) => { lotesPorArticulo[String(articulo)] = []; });

        if (articulos.length === 0) return lotesPorArticulo;

        const filas = query.runSuiteQL({
            query: [
                'SELECT ib.item AS articulo,',
                '       ib.inventorynumber AS numeroinventario,',
                '       BUILTIN.DF(ib.inventorynumber) AS nombrelote,',
                '       ib.binnumber AS bin,',
                '       inl.quantityonhand AS enmano',
                'FROM InventoryBalance ib',
                'INNER JOIN InventoryNumberLocation inl',
                '  ON ib.inventorynumber = inl.inventorynumber AND ib.location = inl.location',
                'WHERE ib.item IN (' + articulos.map(Number).join(',') + ')',
                '  AND ib.location = ?',
                '  AND ib.quantityonhand > 0',
                '  AND inl.quantityonhand > 0',
                '  AND NVL(ib.inventorystatus, -1) NOT IN (',
                '        SELECT id FROM InventoryStatus WHERE name IN (?, ?, ?)',
                '      )',
                'ORDER BY ib.lastmodifieddate ASC',
            ].join(' '),
            params: [Number(ubicacion), 'Bloqueado', 'En Inspección', 'Damaged'],
        }).asMappedResults();

        filas.forEach((fila) => {
            lotesPorArticulo[String(fila.articulo)].push({
                numeroInventario: String(fila.numeroinventario),
                nombreLote      : String(fila.nombrelote),
                bin             : fila.bin,
                enMano          : Number(fila.enmano),
            });
        });

        return lotesPorArticulo;
    }

    /**
     * Pone en cada linea de que lotes sale (linea.asignaciones): los que ya trae
     * heredados del prestamo (linea.lotes), el lote elegido (linea.lote), o si no
     * eligio, del mas antiguo al mas nuevo hasta cubrir la cantidad. Queda en
     * null cuando la ubicacion no tiene lotes del articulo: esa linea va sin
     * inventory detail. Una sola consulta para todos los articulos.
     */
    function obtenerAsignacionesLotes(lineas, ubicacion) {
        const lotesPorArticulo = obtenerLotesPorArticulo(lineas.map((linea) => linea.articulo), ubicacion);

        lineas.forEach((linea) => {
            const enLaUbicacion = lotesPorArticulo[linea.articulo];

            linea.asignaciones = enLaUbicacion.length > 0 ? elegirAsignaciones(linea, enLaUbicacion) : null;
        });
    }

    function obtenerArticulosConStock(ubicacion, tope) {
        const filas = query.runSuiteQL({
            query: [
                'SELECT i.id AS id,',
                '       i.itemid AS sku,',
                '       BUILTIN.DF(i.stockunit) AS unidad,',
                '       BUILTIN.DF(ail.location) AS ubicacion,',
                '       ail.quantityonhand AS enmano,',
                '       ail.quantityavailable AS disponible',
                'FROM AggregateItemLocation ail',
                'INNER JOIN item i ON i.id = ail.item',
                'WHERE ail.location = ?',
                '  AND ail.quantityavailable > 0',
                'ORDER BY i.itemid',
                'FETCH FIRST ' + Number(tope) + ' ROWS ONLY',
            ].join(' '),
            params: [Number(ubicacion)],
        }).asMappedResults();

        return filas.map((fila) => ({
            id        : String(fila.id),
            sku       : fila.sku,
            unidad    : fila.unidad || '',
            ubicacion : fila.ubicacion,
            enMano    : Number(fila.enmano),
            disponible: Number(fila.disponible),
        }));
    }

    /**
     * Los prestamos del sentido pedido con pendiente mayor que cero. La
     * ubicacion que se muestra es de donde sale la devolucion: la bodega de
     * prestamos (destino) en A la Clinica y el origen en De la Clinica.
     */
    function obtenerPrestamosPendientes(esALaClinica) {
        const filas = query.runSuiteQL({
            query: [
                'SELECT m.id AS id,',
                '       m.name AS nombre,',
                '       m.custrecord_as_mov_subsidiaria AS subsidiaria,',
                '       m.custrecord_as_mov_entidad_receptora AS identidad,',
                '       BUILTIN.DF(m.custrecord_as_mov_entidad_receptora) AS entidad,',
                '       l.name AS ubicacion,',
                '       SUM(d.custrecord_as_mov_det_cant_pendiente) AS pendiente',
                'FROM customrecord_as_movimiento_inventario m',
                'INNER JOIN customlist_as_tipo_movimiento t ON t.id = m.custrecord_as_mov_tipo',
                'INNER JOIN customlist_as_estado_movimiento e ON e.id = m.custrecord_as_mov_estado',
                'INNER JOIN customrecord_as_mov_inventario_det d ON d.custrecord_as_mov_det_ref = m.id',
                'LEFT JOIN location l ON l.id = CASE WHEN NVL(m.custrecord_as_mov_a_la_clinica, \'F\') = \'T\'',
                '                             THEN m.custrecord_as_mov_ubicacion_dest',
                '                             ELSE m.custrecord_as_mov_ubicacion END',
                'WHERE t.name = ?',
                '  AND e.name IN (?, ?)',
                '  AND NVL(m.custrecord_as_mov_a_la_clinica, \'F\') = ?',
                'GROUP BY m.id, m.name, m.custrecord_as_mov_subsidiaria,',
                '         m.custrecord_as_mov_entidad_receptora, BUILTIN.DF(m.custrecord_as_mov_entidad_receptora), l.name',
                'HAVING SUM(d.custrecord_as_mov_det_cant_pendiente) > 0',
                'ORDER BY m.name',
            ].join(' '),
            params: [CONSTANTES.TIPOS.PRESTAMO, CONSTANTES.ESTADOS.PENDIENTE_DEVOLUCION,
                     CONSTANTES.ESTADOS.DEVUELTO_PARCIAL, esALaClinica ? 'T' : 'F'],
        }).asMappedResults();

        return filas.map((fila) => ({
            id         : String(fila.id),
            nombre     : fila.nombre,
            subsidiaria: String(fila.subsidiaria),
            idEntidad  : fila.identidad ? String(fila.identidad) : '',
            entidad    : fila.entidad || 'SIN ENTIDAD',
            ubicacion  : fila.ubicacion,
            pendiente  : Number(fila.pendiente),
        }));
    }

    /**
     * La Merma (incluirTipoVacio) ve las cuentas de su tipo y las que no tienen
     * tipo; el Prestamo A la Clinica, solo las de su tipo.
     */
    function obtenerCuentasAjuste(idTipo, incluirTipoVacio) {
        const filtroTipo = incluirTipoVacio
                         ? 'AND (c.custrecord_as_cuenta_merma_tipo = ? OR c.custrecord_as_cuenta_merma_tipo IS NULL)'
                         : 'AND c.custrecord_as_cuenta_merma_tipo = ?';
        const filas = query.runSuiteQL({
            query: [
                'SELECT DISTINCT c.custrecord_as_cuenta_merma_subsidiaria AS subsidiaria,',
                '       c.custrecord_as_cuenta_merma_cuenta AS id,',
                '       BUILTIN.DF(c.custrecord_as_cuenta_merma_cuenta) AS nombre',
                'FROM customrecord_as_cuenta_merma_subsidiaria c',
                'WHERE c.isinactive = ?',
                filtroTipo,
                'ORDER BY BUILTIN.DF(c.custrecord_as_cuenta_merma_cuenta)',
            ].join(' '),
            params: ['F', idTipo],
        }).asMappedResults();

        return filas.map((fila) => ({
            subsidiaria: String(fila.subsidiaria),
            id         : String(fila.id),
            nombre     : fila.nombre,
        }));
    }

    function obtenerEntidadesPorSubsidiaria() {
        const filas = query.runSuiteQL({
            query: [
                'SELECT r.custrecord_as_recep_subsidiaria AS subsidiaria,',
                '       r.custrecord_as_recep_entidad AS id,',
                '       BUILTIN.DF(r.custrecord_as_recep_entidad) AS nombre',
                'FROM customrecord_as_receptor_subsidiaria r',
                'WHERE r.isinactive = ?',
                'ORDER BY BUILTIN.DF(r.custrecord_as_recep_entidad)',
            ].join(' '),
            params: ['F'],
        }).asMappedResults();

        return filas.map((fila) => ({
            subsidiaria: String(fila.subsidiaria),
            id         : String(fila.id),
            nombre     : fila.nombre,
        }));
    }

    function obtenerUbicacionesPorSubsidiaria() {
        const filas = query.runSuiteQL({
            query: [
                'SELECT lsm.subsidiary AS subsidiaria, l.id AS id, l.name AS nombre,',
                '       l.custrecord_as_es_bodega_prestamo AS esbodegaprestamo',
                'FROM location l',
                'INNER JOIN LocationSubsidiaryMap lsm ON lsm.location = l.id',
                'WHERE l.isinactive = ?',
                'ORDER BY l.name',
            ].join(' '),
            params: ['F'],
        }).asMappedResults();

        return filas.map((fila) => ({
            subsidiaria     : String(fila.subsidiaria),
            id              : String(fila.id),
            nombre          : fila.nombre,
            esBodegaPrestamo: (fila.esbodegaprestamo === 'T'),
        }));
    }

    function obtenerFilaCorrelativo(idTipo) {
        const filas = query.runSuiteQL({
            query : 'SELECT c.id AS id FROM ' + CONSTANTES.RECORDS.CORRELATIVO
                  + ' c WHERE c.' + CONSTANTES.CAMPOS_CORRELATIVO.TIPO + ' = ? AND c.isinactive = ?',
            params: [idTipo, 'F'],
        }).asMappedResults();

        return filas.length ? filas[0].id : null;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Secundarias
    // ─────────────────────────────────────────────────────────────────────────

    function elegirAsignaciones(linea, enLaUbicacion) {
        if (linea.lotes) {
            return linea.lotes.map((lote) => {
                const enLaBodega = enLaUbicacion.filter((fila) => fila.numeroInventario === lote.numeroInventario)[0];

                return { numeroInventario: lote.numeroInventario, bin: enLaBodega ? enLaBodega.bin : '', cantidad: lote.cantidad };
            });
        }

        if (linea.lote) {
            const elegido = enLaUbicacion.filter((fila) => fila.nombreLote === linea.lote)[0];

            return elegido ? [{ numeroInventario: elegido.numeroInventario, bin: elegido.bin, cantidad: linea.cantidad }] : [];
        }

        const asignaciones = [];

        let porAsignar = linea.cantidad;

        enLaUbicacion.forEach((lote) => {
            if (porAsignar <= 0) return;

            const cantidad = Math.min(porAsignar, lote.enMano);

            porAsignar = UTILS.redondearCantidad(porAsignar - cantidad);

            asignaciones.push({ numeroInventario: lote.numeroInventario, bin: lote.bin, cantidad: cantidad });
        });

        return asignaciones;
    }

    return {
        obtenerFaltantes                : obtenerFaltantes,
        obtenerStockPorArticulo         : obtenerStockPorArticulo,
        obtenerLotesPorArticulo         : obtenerLotesPorArticulo,
        obtenerAsignacionesLotes        : obtenerAsignacionesLotes,
        obtenerArticulosConStock        : obtenerArticulosConStock,
        obtenerPrestamosPendientes      : obtenerPrestamosPendientes,
        obtenerCuentasAjuste            : obtenerCuentasAjuste,
        obtenerEntidadesPorSubsidiaria  : obtenerEntidadesPorSubsidiaria,
        obtenerUbicacionesPorSubsidiaria: obtenerUbicacionesPorSubsidiaria,
        obtenerFilaCorrelativo          : obtenerFilaCorrelativo,
    };
});
