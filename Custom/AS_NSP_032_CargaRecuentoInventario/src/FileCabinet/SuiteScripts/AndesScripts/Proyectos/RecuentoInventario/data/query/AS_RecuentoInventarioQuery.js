/**
 * AS_NSP_032 — Carga de Recuento de Inventario
 * @description Todas las consultas SuiteQL del modulo.
 *
 *              Cuentas
 *                - obtenerCuentasRecuento: las cuentas activas de AS Recuento
 *                  Inventario Cuenta, con su subsidiaria.
 *              Ubicaciones
 *                - obtenerUbicaciones: las ubicaciones activas, con su
 *                  subsidiaria.
 *                - obtenerUbicacion: nombre y subsidiaria de una ubicacion.
 *              Articulos
 *                - obtenerArticulosPorId: los articulos activos cuyo id
 *                  interno esta en la lista.
 *              Recuento
 *                - obtenerCantidadesRecuento: por articulo, su nombre, la
 *                  cantidad del recuento, la de instantanea, la ajustada y la
 *                  tarifa.
 * @NApiVersion 2.1
 * @NModuleScope Public
 * @author Andes Salud
 * @version 1.5.0
 *
 */
define(['N/query'], (query) => {

    // ─────────────────────────────────────────────────────────────────────────
    // Principales
    // ─────────────────────────────────────────────────────────────────────────

    function obtenerCuentasRecuento() {
        const filas = query.runSuiteQL({
            query : 'SELECT c.custrecord_as_rec_inv_cta_subsidiaria AS subsidiaria,'
                  + ' c.custrecord_as_rec_inv_cta_cuenta AS id,'
                  + ' BUILTIN.DF(c.custrecord_as_rec_inv_cta_cuenta) AS nombre'
                  + ' FROM customrecord_as_rec_inv_cuenta c'
                  + ' WHERE c.isinactive = ?'
                  + ' ORDER BY BUILTIN.DF(c.custrecord_as_rec_inv_cta_cuenta)',
            params: ['F'],
        }).asMappedResults();

        return filas.map((fila) => ({ subsidiaria: String(fila.subsidiaria), id: String(fila.id), nombre: fila.nombre }));
    }

    function obtenerUbicaciones() {
        const filas = query.runSuiteQL({
            query : 'SELECT l.id, l.fullname AS nombre, l.subsidiary AS subsidiaria'
                  + ' FROM location l'
                  + ' WHERE l.isinactive = ?'
                  + ' ORDER BY l.fullname',
            params: ['F'],
        }).asMappedResults();

        return filas.map((fila) => ({ subsidiaria: String(fila.subsidiaria), id: String(fila.id), nombre: fila.nombre }));
    }

    function obtenerUbicacion(id) {
        const fila = query.runSuiteQL({
            query : 'SELECT l.id, l.name, l.subsidiary FROM location l WHERE l.id = ?',
            params: [id],
        }).asMappedResults()[0];

        return { id: fila.id, nombre: fila.name, subsidiaria: String(fila.subsidiary) };
    }

    function obtenerArticulosPorId(ids) {
        const articulos = {};

        for (let inicio = 0; inicio < ids.length; inicio += 1000) {
            const bloque = ids.slice(inicio, inicio + 1000);
            const filas  = query.runSuiteQL({
                query : 'SELECT i.id, i.itemid, BUILTIN.DF(i.stockunit) AS unidad'
                      + ' FROM item i'
                      + " WHERE i.isinactive = 'F'"
                      + ' AND i.id IN (' + bloque.map(() => '?').join(',') + ')',
                params: bloque,
            }).asMappedResults();

            filas.forEach((fila) => {
                articulos[String(fila.id)] = { id: fila.id, nombre: fila.itemid, unidad: fila.unidad };
            });
        }

        return articulos;
    }

    function obtenerCantidadesRecuento(recuentoId) {
        const filas = query.runSuiteQL({
            query : 'SELECT BUILTIN.DF(tl.item) AS nombre, tl.quantity, tl.rate'
                  + ' FROM transactionline tl'
                  + " WHERE tl.transaction = ? AND tl.mainline = 'F' AND tl.item IS NOT NULL"
                  + ' ORDER BY tl.linesequencenumber',
            params: [recuentoId],
        }).asMappedResults();
        const cantidades = [];

        for (let fila = 0; fila < filas.length; fila += 3) {
            cantidades.push({
                nombre     : filas[fila].nombre,
                recuento   : filas[fila].quantity,
                instantanea: filas[fila + 1].quantity,
                ajustada   : filas[fila + 2].quantity,
                tarifa     : filas[fila].rate,
            });
        }

        return cantidades;
    }

    return {
        obtenerCuentasRecuento   : obtenerCuentasRecuento,
        obtenerUbicaciones       : obtenerUbicaciones,
        obtenerUbicacion         : obtenerUbicacion,
        obtenerArticulosPorId    : obtenerArticulosPorId,
        obtenerCantidadesRecuento: obtenerCantidadesRecuento,
    };
});
