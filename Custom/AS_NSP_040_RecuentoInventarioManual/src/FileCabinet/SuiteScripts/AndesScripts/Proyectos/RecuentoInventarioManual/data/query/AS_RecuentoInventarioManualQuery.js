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
 *                - obtenerArticulosSubsidiaria: para el total y el TXT
 *                  maestro, una fila por articulo activo y ubicacion de la
 *                  subsidiaria donde tiene o tuvo stock, ordenadas por
 *                  ubicacion y articulo.
 *              Recuento
 *                - obtenerCantidadesRecuento: por articulo, su id, su nombre,
 *                  su codigo de barras, su unidad, la cantidad del recuento,
 *                  la de instantanea, la ajustada, la tarifa y la nota.
 *                - obtenerEstadoRecuento: la letra del estado del recuento
 *                  (B Iniciado), para el CSV de importes.
 *                - obtenerNumerosRecuento: el numero (RI-...) de cada
 *                  recuento, por id, para los enlaces de la vista de la cola.
 *                - obtenerRecuentosIniciados: los recuentos del modulo que
 *                  aceptan cantidades, con su subsidiaria, para el select
 *                  de la carga.
 *                - obtenerUbicacionRecuento: el id y el nombre de la ubicacion
 *                  del recuento, y su subsidiaria.
 *                - obtenerLoteRecuento: el lote elegido en la carga, si esta
 *                  configurado para la subsidiaria del recuento.
 *                - obtenerMovimientosPosteriores: las salidas de los articulos
 *                  del recuento en su ubicacion creadas despues del recuento,
 *                  para avisar antes de aprobar.
 *              Lotes
 *                - obtenerLotesRecuento: los lotes activos de Lote
 *                  Predeterminado de Recuento, con su subsidiaria.
 *              Cola
 *                - obtenerSolicitudes: las solicitudes de unos tipos en un
 *                  estado, la mas antigua primero.
 *                - contarSolicitudesAntes: cuantas Pendientes de los mismos
 *                  tipos van antes.
 *                - obtenerGeneracionEnCurso: la generacion sin terminar de
 *                  una ubicacion.
 *                - obtenerAprobacionEnCurso: la aprobacion sin terminar de
 *                  un recuento.
 *
 * @NApiVersion 2.1
 * @NModuleScope Public
 * @author Andes Salud
 * @version 1.20.0
 *
 */

define(['N/query', '../../constants/AS_RecuentoInventarioManualConstants'],
    (query, CONSTANTES) => {

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

    function obtenerArticulosSubsidiaria(subsidiariaId) {
        const articulos   = [];
        const ubicaciones = obtenerUbicaciones().filter((ubicacion) => ubicacion.subsidiaria === String(subsidiariaId));

        ubicaciones.forEach((ubicacion) => {
            const articulosUbicacion = [];
            let ultimoId = 0;
            let pagina   = [];
            do {
                pagina = query.runSuiteQL({
                    query : 'SELECT a.item AS id, BUILTIN.DF(a.item) AS nombre, i.upccode AS codigobarra'
                          + ' FROM aggregateitemlocation a'
                          + ' JOIN item i ON i.id = a.item'
                          + " WHERE a.location = ? AND i.isinactive = 'F' AND i.itemtype = 'InvtPart'"
                          + ' AND a.quantityonhand IS NOT NULL AND a.item > ?'
                          + ' ORDER BY a.item'
                          + ' FETCH FIRST 1000 ROWS ONLY',
                    params: [ubicacion.id, ultimoId],
                }).asMappedResults();
                pagina.forEach((fila) => {
                    articulosUbicacion.push({ id: String(fila.id), nombre: fila.nombre, codigoBarra: fila.codigobarra || '', ubicacionId: String(ubicacion.id) });
                });
                if (pagina.length) ultimoId = pagina[pagina.length - 1].id;
            } while (pagina.length === 1000);
            articulosUbicacion.sort((primero, segundo) => primero.nombre.localeCompare(segundo.nombre));
            articulosUbicacion.forEach((articulo) => articulos.push(articulo));
        });

        return articulos;
    }

    function obtenerCantidadesRecuento(recuentoId) {
        const filas = [];
        let ultimaLinea = -1;
        let pagina      = [];

        do {
            pagina = query.runSuiteQL({
                query : 'SELECT tl.linesequencenumber AS linea, tl.item AS id, BUILTIN.DF(tl.item) AS nombre, i.upccode AS codigobarra,'
                      + ' tl.quantity, tl.rate, BUILTIN.DF(tl.units) AS unidad, tl.memo AS nota'
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
                unidad     : filas[fila].unidad || '',
                recuento   : filas[fila].quantity,
                instantanea: filas[fila + 1].quantity,
                ajustada   : filas[fila + 2].quantity,
                tarifa     : filas[fila].rate,
                nota       : filas[fila].nota || '',
            });
        }

        return cantidades;
    }

    function obtenerEstadoRecuento(recuentoId) {
        const fila = query.runSuiteQL({
            query : 'SELECT t.status AS estado FROM transaction t WHERE t.id = ?',
            params: [recuentoId],
        }).asMappedResults()[0];

        return fila ? fila.estado : '';
    }

    function obtenerNumerosRecuento(recuentoIds) {
        if (!recuentoIds.length) return {};
        const filas = query.runSuiteQL({
            query : 'SELECT t.id, t.tranid AS numero FROM transaction t'
                  + ' WHERE t.id IN (' + recuentoIds.map(() => '?').join(', ') + ')',
            params: recuentoIds,
        }).asMappedResults();
        const numeros = {};
        filas.forEach((fila) => { numeros[String(fila.id)] = fila.numero; });

        return numeros;
    }

    function obtenerRecuentosIniciados() {
        const filas = query.runSuiteQL({
            query: 'SELECT t.id, t.tranid AS numero, t.status AS estado, t.custbody_as_rec_inv_carga AS carga'
                 + ' FROM transaction t'
                 + " WHERE t.type = 'InvCount'"
                 + ' ORDER BY t.id DESC'
                 + ' FETCH FIRST 1000 ROWS ONLY',
        }).asMappedResults();

        return filas
            .filter((fila) => fila.estado === 'B' && fila.carga === 'T')
            .map((fila) => {
                const ubicacion = obtenerUbicacionRecuento(fila.id);
                return { subsidiaria: ubicacion.subsidiaria, id: String(fila.id), nombre: fila.numero + ' - ' + ubicacion.nombre };
            });
    }


    function obtenerUbicacionRecuento(recuentoId) {
        const fila = query.runSuiteQL({
            query : 'SELECT tl.location AS id, BUILTIN.DF(tl.location) AS nombre, tl.subsidiary AS subsidiaria'
                  + ' FROM transactionline tl'
                  + " WHERE tl.transaction = ? AND tl.mainline = 'F' AND tl.location IS NOT NULL"
                  + ' FETCH FIRST 1 ROWS ONLY',
            params: [recuentoId],
        }).asMappedResults()[0];

        return fila ? { id: String(fila.id), nombre: fila.nombre, subsidiaria: String(fila.subsidiaria) } : { id: '', nombre: '', subsidiaria: '' };
    }

    /**
     * Vacio si el lote no es de la subsidiaria del recuento o esta inactivo.
     */
    function obtenerLoteRecuento(recuentoId, loteId) {
        const fila = query.runSuiteQL({
            query : 'SELECT l.custrecord_as_rec_inv_man_lote_lote AS lote'
                  + ' FROM transactionline tl'
                  + ' JOIN customrecord_as_rec_inv_man_lote l ON l.custrecord_as_rec_inv_man_lote_subsid = tl.subsidiary'
                  + " WHERE tl.transaction = ? AND tl.mainline = 'F' AND l.id = ? AND l.isinactive = 'F'"
                  + ' FETCH FIRST 1 ROWS ONLY',
            params: [recuentoId, loteId],
        }).asMappedResults()[0];

        return fila ? fila.lote : '';
    }

    /**
     * Una merma, un traslado o un despacho de los articulos del recuento
     * despues de crearlo puede dejar un lote con menos de lo que tenia en la
     * instantanea, y entonces NetSuite no aprueba (RI-MONTT27, prod,
     * 2026-11-26). No mira si al lote todavia le alcanza: cruzar todos los
     * lotes con el stock tardo 38 s con 1500 lineas (QA, 2026-11-26). Los
     * otros recuentos no cuentan: sus lineas no mueven stock, lo mueve el
     * ajuste que crean al aprobarse. La ubicacion va como valor y no como
     * subconsulta: con subconsulta la consulta no termina.
     */
    function obtenerMovimientosPosteriores(recuentoId, ubicacionId) {
        return query.runSuiteQL({
            query : 'SELECT DISTINCT BUILTIN.DF(tl.item) AS articulo, m.tranid AS transaccion'
                  + ' FROM transactionline tl'
                  + ' JOIN transaction m ON m.id = tl.transaction'
                  + ' WHERE tl.location = ?'
                  + ' AND tl.item IN (SELECT y.item FROM transactionline y WHERE y.transaction = ? AND y.item IS NOT NULL)'
                  + ' AND m.createddate > (SELECT r.createddate FROM transaction r WHERE r.id = ?)'
                  + " AND tl.quantity < 0 AND tl.mainline = 'F' AND m.type <> 'InvCount'"
                  + ' ORDER BY articulo',
            params: [ubicacionId, recuentoId, recuentoId],
        }).asMappedResults();
    }

    function obtenerLotesRecuento() {
        const filas = query.runSuiteQL({
            query : 'SELECT l.id, l.custrecord_as_rec_inv_man_lote_lote AS lote, l.custrecord_as_rec_inv_man_lote_subsid AS subsidiaria'
                  + ' FROM customrecord_as_rec_inv_man_lote l'
                  + ' WHERE l.isinactive = ?'
                  + ' ORDER BY l.custrecord_as_rec_inv_man_lote_lote',
            params: ['F'],
        }).asMappedResults();

        return filas.map((fila) => ({ subsidiaria: String(fila.subsidiaria), id: String(fila.id), nombre: fila.lote }));
    }

    function obtenerSolicitudes(estado, tipos) {
        const campos = CONSTANTES.COLA.CAMPOS;
        const filas  = query.runSuiteQL({
            query : 'SELECT c.id FROM ' + CONSTANTES.COLA.TIPO + ' c'
                  + ' WHERE c.' + campos.ESTADO + ' = ?'
                  + ' AND c.' + campos.TIPO + ' IN (' + tipos.map(() => '?').join(', ') + ')'
                  + ' ORDER BY c.id',
            params: [estado].concat(tipos),
        }).asMappedResults();

        return filas.map((fila) => fila.id);
    }

    function contarSolicitudesAntes(solicitudId, tipos) {
        const campos = CONSTANTES.COLA.CAMPOS;
        const fila   = query.runSuiteQL({
            query : 'SELECT COUNT(*) AS total FROM ' + CONSTANTES.COLA.TIPO + ' c'
                  + ' WHERE c.' + campos.ESTADO + ' = ? AND c.id < ?'
                  + ' AND c.' + campos.TIPO + ' IN (' + tipos.map(() => '?').join(', ') + ')',
            params: [CONSTANTES.COLA.ESTADOS.PENDIENTE, solicitudId].concat(tipos),
        }).asMappedResults()[0];

        return fila.total;
    }

    function obtenerGeneracionEnCurso(ubicacionId) {
        const campos  = CONSTANTES.COLA.CAMPOS;
        const estados = CONSTANTES.COLA.ESTADOS;
        const fila    = query.runSuiteQL({
            query : 'SELECT c.id FROM ' + CONSTANTES.COLA.TIPO + ' c'
                  + ' WHERE c.' + campos.TIPO + ' = ? AND c.' + campos.UBICACION + ' = ?'
                  + ' AND c.' + campos.ESTADO + ' IN (?, ?)',
            params: [CONSTANTES.COLA.TIPOS.GENERACION, ubicacionId, estados.PENDIENTE, estados.PROCESANDO],
        }).asMappedResults()[0];

        return fila ? fila.id : null;
    }

    function obtenerAprobacionEnCurso(recuentoId) {
        const campos  = CONSTANTES.COLA.CAMPOS;
        const estados = CONSTANTES.COLA.ESTADOS;
        const fila    = query.runSuiteQL({
            query : 'SELECT c.id FROM ' + CONSTANTES.COLA.TIPO + ' c'
                  + ' WHERE c.' + campos.TIPO + ' = ? AND c.' + campos.RECUENTO + ' = ?'
                  + ' AND c.' + campos.ESTADO + ' IN (?, ?)',
            params: [CONSTANTES.COLA.TIPOS.APROBACION, recuentoId, estados.PENDIENTE, estados.PROCESANDO],
        }).asMappedResults()[0];

        return fila ? fila.id : null;
    }

    return {
        obtenerCuentasRecuento     : obtenerCuentasRecuento,
        obtenerUbicaciones         : obtenerUbicaciones,
        obtenerArticulosUbicacion  : obtenerArticulosUbicacion,
        obtenerArticulosSubsidiaria: obtenerArticulosSubsidiaria,
        obtenerCantidadesRecuento  : obtenerCantidadesRecuento,
        obtenerEstadoRecuento      : obtenerEstadoRecuento,
        obtenerNumerosRecuento     : obtenerNumerosRecuento,
        obtenerRecuentosIniciados  : obtenerRecuentosIniciados,
        obtenerUbicacionRecuento   : obtenerUbicacionRecuento,
        obtenerLoteRecuento        : obtenerLoteRecuento,
        obtenerMovimientosPosteriores: obtenerMovimientosPosteriores,
        obtenerLotesRecuento       : obtenerLotesRecuento,
        obtenerSolicitudes         : obtenerSolicitudes,
        contarSolicitudesAntes     : contarSolicitudesAntes,
        obtenerAprobacionEnCurso   : obtenerAprobacionEnCurso,
        obtenerGeneracionEnCurso   : obtenerGeneracionEnCurso,
    };
});
