/**
 * AS_NSP_018 — Prestamo, Devolucion y Merma
 * @description Acceso centralizado a las consultas de stock y lotes utilizadas
 *              por el formulario, los procesos y la herramienta de apoyo a QA.
 *
 *              LocationSubsidiaryMap resuelve que ubicaciones pertenecen a cada
 *              subsidiaria, y AggregateItemLocation el stock por articulo y
 *              ubicacion. InventoryBalance e InventoryNumberLocation resuelven
 *              los lotes utilizables, excluyendo estados bloqueados.
 *
 * @NApiVersion 2.1
 * @NModuleScope Public
 */
define(['N/query'], (query) => {

    function listarUbicacionesPorSubsidiaria() {
        const filas = query.runSuiteQL({
            query: [
                'SELECT lsm.subsidiary AS subsidiaria,',
                '       l.id AS id,',
                '       l.name AS nombre',
                'FROM location l',
                'INNER JOIN LocationSubsidiaryMap lsm ON lsm.location = l.id',
                'WHERE l.isinactive = ?',
                'ORDER BY l.name',
            ].join(' '),
            params: ['F'],
        }).asMappedResults();

        return filas.map((fila) => ({
            subsidiaria: String(fila.subsidiaria),
            id         : String(fila.id),
            nombre     : fila.nombre,
        }));
    }

    function listarArticulosConStock(ubicacion, tope) {
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

    return {
        listarUbicacionesPorSubsidiaria: listarUbicacionesPorSubsidiaria,
        listarArticulosConStock        : listarArticulosConStock,
        buscarLotesDisponibles         : buscarLotesDisponibles,
        buscarStockPorArticulo         : buscarStockPorArticulo,
    };
});
