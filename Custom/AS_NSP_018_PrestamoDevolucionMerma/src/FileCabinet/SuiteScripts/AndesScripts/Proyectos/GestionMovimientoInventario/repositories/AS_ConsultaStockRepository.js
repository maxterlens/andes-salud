/**
 * AS_NSP_018 — Prestamo, Devolucion y Merma
 * @description Acceso a datos de la consulta de stock, la herramienta de apoyo a
 *              desarrollo y QA. Solo lee: dos SuiteQL y nada mas.
 *
 *              LocationSubsidiaryMap resuelve que ubicaciones pertenecen a cada
 *              subsidiaria, y AggregateItemLocation el stock por articulo y
 *              ubicacion. Es la misma AggregateItemLocation que usa
 *              InventoryTransferRepository para validar el stock de un prestamo,
 *              asi que lo que se ve aca es lo que el modulo va a ver al procesar.
 *
 *              Deliberadamente no reusa MovimientoInventarioRepository: esta
 *              herramienta tiene que seguir sirviendo para diagnosticar aunque el
 *              modulo este a medio cambiar.
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

    return {
        listarUbicacionesPorSubsidiaria: listarUbicacionesPorSubsidiaria,
        listarArticulosConStock        : listarArticulosConStock,
    };
});
