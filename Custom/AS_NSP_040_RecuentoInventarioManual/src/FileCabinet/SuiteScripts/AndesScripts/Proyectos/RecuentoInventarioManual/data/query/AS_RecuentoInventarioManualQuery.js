/**
 * AS_NSP_040 — Recuento de Inventario Manual
 * @description Todas las consultas SuiteQL del modulo.
 *
 *              Cuentas
 *                - obtenerCuentasRecuento: las cuentas activas de AS Recuento
 *                  Inventario Cuenta, con su subsidiaria.
 *              Ubicaciones
 *                - obtenerUbicaciones: las ubicaciones activas, con su
 *                  subsidiaria.
 *              Articulos
 *                - obtenerArticulosUbicacion: los articulos activos que tienen
 *                  o tuvieron stock en la ubicacion, con su unidad y su stock
 *                  (0 si hoy no tienen).
 *                - obtenerRecuentoPorCodigo: el recuento que creo el Scheduled,
 *                  por el codigo que le paso la pantalla.
 *              Recuento
 *                - obtenerCantidadesRecuento: por articulo, su id, su nombre,
 *                  su codigo de barras, la cantidad del recuento, la de
 *                  instantanea, la ajustada y la tarifa.
 *                - obtenerUbicacionRecuento: el nombre de la ubicacion del
 *                  recuento.
 *
 * CHANGELOG v1.4.0 (2026-11-16):
 * - [FEAT] obtenerCantidadesRecuento devuelve el codigo de barras (upccode), para
 *          el TXT.
 *
 * CHANGELOG v1.3.1 (2026-11-16):
 * - [FIX] obtenerArticulosUbicacion repetia y se saltaba articulos: runSuiteQLPaged
 *         ordenado por i.itemid (columna del join) devolvia paginas que se pisaban.
 *         RI-MONTT46 salio con 3.000 lineas y solo 1.476 articulos distintos. Ahora
 *         pagina por el id del articulo (a.item > el ultimo) y ordena por nombre al
 *         final.
 * - [FIX] obtenerCantidadesRecuento pagina por linesequencenumber: runSuiteQL
 *         cortaba en 5.000 filas y con mas de 1.666 articulos fallaban los importes
 *         y la validacion del CSV.
 * - [FEAT] obtenerRecuentoPorCodigo, para el seguimiento de la generacion.
 *
 * CHANGELOG v1.3.0 (2026-11-16):
 * - [FEAT] obtenerArticulosUbicacion reemplaza a obtenerArticulosConStock: entran
 *          tambien los articulos en 0 de la ubicacion (aggregateitemlocation).
 *
 * CHANGELOG v1.2.0 (2026-11-16):
 * - [FEAT] obtenerUbicacionRecuento, para el TXT y la carga.
 *
 * CHANGELOG v1.1.0 (2026-11-15):
 * - [FEAT] obtenerCantidadesRecuento devuelve el id del articulo, para el TXT.
 *
 * CHANGELOG v1.0.0 (2026-11-15):
 * - [FEAT] Cuentas, ubicaciones y articulos con stock de la ubicacion.
 * - [FEAT] obtenerCantidadesRecuento, que viene del AS_NSP_032 para la ficha de importes.
 *
 * @NApiVersion 2.1
 * @NModuleScope Public
 * @author Andes Salud
 * @version 1.4.0
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

    /**
     * Sale de aggregateitemlocation (una fila por articulo y ubicacion) y no de
     * inventorybalance, que solo tiene las filas con saldo: asi entran los que
     * hoy estan en 0. quantityonhand en null es un articulo que nunca tuvo
     * stock en la ubicacion y queda fuera.
     *
     * Se pagina a mano por el id del articulo, de mil en mil: runSuiteQLPaged
     * ordenado por el nombre repetia y se saltaba filas entre paginas. El id es
     * unico por ubicacion, asi que cada pagina sigue donde termino la anterior.
     * El orden por nombre se hace al final, en memoria.
     */
    function obtenerArticulosUbicacion(ubicacionId) {
        const articulos = [];
        let ultimoId    = 0;
        let pagina      = [];

        do {
            pagina = query.runSuiteQL({
                query : 'SELECT a.item AS id, i.itemid AS nombre, BUILTIN.DF(i.stockunit) AS unidad,'
                      + ' a.quantityonhand AS stock'
                      + ' FROM aggregateitemlocation a'
                      + ' JOIN item i ON i.id = a.item'
                      + " WHERE a.location = ? AND i.isinactive = 'F' AND i.itemtype = 'InvtPart'"
                      + ' AND a.quantityonhand IS NOT NULL AND a.item > ?'
                      + ' ORDER BY a.item'
                      + ' FETCH FIRST 1000 ROWS ONLY',
                params: [ubicacionId, ultimoId],
            }).asMappedResults();
            pagina.forEach((fila) => {
                articulos.push({ id: String(fila.id), nombre: fila.nombre, unidad: fila.unidad || '', stock: fila.stock || 0 });
            });
            if (pagina.length) ultimoId = pagina[pagina.length - 1].id;
        } while (pagina.length === 1000);

        return articulos.sort((primero, segundo) => primero.nombre.localeCompare(segundo.nombre));
    }

    /**
     * El Scheduled guarda el codigo en el ID externo del recuento: es la unica
     * forma de saber cual creo, porque la tarea no devuelve nada.
     */
    function obtenerRecuentoPorCodigo(codigo) {
        const fila = query.runSuiteQL({
            query : "SELECT t.id FROM transaction t WHERE t.type = 'InvCount' AND t.externalid = ?",
            params: [codigo],
        }).asMappedResults()[0];

        return fila ? fila.id : null;
    }

    /**
     * El recuento guarda tres filas por articulo en transactionline, en este
     * orden: recuento, instantanea y ajustada.
     *
     * Se pagina a mano por linesequencenumber, de 3.000 en 3.000: runSuiteQL
     * corta en 5.000 filas sin avisar, y un recuento de 2.703 articulos tiene
     * 8.109. Cortado, el ultimo articulo quedaba sin sus otras filas ("Cannot
     * read property 'quantity' of undefined", RI-MONTT52). Las tres filas se
     * agrupan despues de traerlas todas.
     */
    function obtenerCantidadesRecuento(recuentoId) {
        const filas = [];
        let ultimaLinea = -1;
        let pagina      = [];

        do {
            pagina = query.runSuiteQL({
                query : 'SELECT tl.linesequencenumber AS linea, tl.item AS id, BUILTIN.DF(tl.item) AS nombre, i.upccode AS codigobarra,'
                      + ' tl.quantity, tl.rate'
                      + ' FROM transactionline tl'
                      + ' JOIN item i ON i.id = tl.item'
                      + " WHERE tl.transaction = ? AND tl.mainline = 'F' AND tl.item IS NOT NULL AND tl.linesequencenumber > ?"
                      + ' ORDER BY tl.linesequencenumber'
                      + ' FETCH FIRST 3000 ROWS ONLY',
                params: [recuentoId, ultimaLinea],
            }).asMappedResults();
            pagina.forEach((fila) => filas.push(fila));
            if (pagina.length) ultimaLinea = pagina[pagina.length - 1].linea;
        } while (pagina.length === 3000);
        const cantidades = [];

        for (let fila = 0; fila < filas.length; fila += 3) {
            cantidades.push({
                id         : String(filas[fila].id),
                nombre     : filas[fila].nombre,
                codigoBarra: filas[fila].codigobarra || '',
                recuento: filas[fila].quantity,
                instantanea: filas[fila + 1].quantity,
                ajustada   : filas[fila + 2].quantity,
                tarifa     : filas[fila].rate,
            });
        }

        return cantidades;
    }

    /**
     * El recuento guarda la ubicacion en cada linea, no en la cabecera.
     */
    function obtenerUbicacionRecuento(recuentoId) {
        const fila = query.runSuiteQL({
            query : 'SELECT BUILTIN.DF(tl.location) AS nombre'
                  + ' FROM transactionline tl'
                  + " WHERE tl.transaction = ? AND tl.mainline = 'F' AND tl.location IS NOT NULL"
                  + ' FETCH FIRST 1 ROWS ONLY',
            params: [recuentoId],
        }).asMappedResults()[0];

        return fila ? fila.nombre : '';
    }

    return {
        obtenerCuentasRecuento   : obtenerCuentasRecuento,
        obtenerUbicaciones       : obtenerUbicaciones,
        obtenerArticulosUbicacion: obtenerArticulosUbicacion,
        obtenerRecuentoPorCodigo : obtenerRecuentoPorCodigo,
        obtenerCantidadesRecuento: obtenerCantidadesRecuento,
        obtenerUbicacionRecuento : obtenerUbicacionRecuento,
    };
});
