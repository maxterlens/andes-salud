/**
 * AS_NSP_035 — Reporte de Stock Valorizado
 * @description Todas las consultas SuiteQL del modulo.
 *
 *              armarConsultaStock → la consulta del reporte, una fila por articulo
 *                                   + ubicacion. No se corre aqui: la corre NetSuite
 *                                   como SuiteQLTask (AS_StockValorizadoHandler), que
 *                                   no tiene el limite de filas de runSuiteQL. Se
 *                                   arma con dos subconsultas:
 *                armarSubconsultaStock  → cantidad, valorizacion y ultimo consumo.
 *                armarSubconsultaCompra → la ultima factura de compra.
 *              obtenerUbicaciones → las ubicaciones activas con su subsidiaria,
 *                                   para el filtro del formulario.
 *
 *              Las dos dejan fuera las ubicaciones con UBICACION_EXCLUIDA (OLD) en
 *              el nombre, igual que el filtro "Nombre no contiene OLD" del informe
 *              nativo de auditoria.
 * @NApiVersion 2.1
 * @NModuleScope Public
 * @author Andes Salud
 * @version 1.3.0
 *
 */
define(['N/query', '../../constants/AS_StockValorizadoConstants'],
    (query, CONSTANTES) => {

    // ─────────────────────────────────────────────────────────────────────────
    // Principales
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Los ? van en el orden en que aparecen: primero los del stock (subsidiaria,
     * fecha, ubicaciones) y despues los de la compra (subsidiaria, fecha). El
     * handler arma los parametros en ese mismo orden.
     *
     * La cantidad sale como texto, con todos sus decimales: como numero, el CSV
     * del SuiteQLTask la dejaba en 2 y los kits de laboratorio que se consumen
     * por fraccion (0,975) salian 0,98. El Excel la vuelve a numero.
     */
    function armarConsultaStock(ubicaciones) {
        return 'SELECT i.upccode AS codigo_upc,'
             + ' i.itemid AS articulo,'
             + ' BUILTIN.DF(stock.ubicacion) AS ubicacion,'
             + ' BUILTIN.DF(i.custitem_wmsse_itemfamily) AS familia_wms,'
             + ' TO_CHAR(stock.cantidad) AS cantidad,'
             + ' CASE WHEN stock.cantidad <> 0 THEN ROUND(stock.importe / stock.cantidad, 2) END AS valorizacion_individual,'
             + ' stock.importe AS valorizacion_total,'
             + " TO_CHAR(stock.consumo, 'DD/MM/YYYY') AS fecha_ultimo_consumo,"
             + " TO_CHAR(compra.fecha, 'DD/MM/YYYY') AS fecha_compra"
             + ' FROM (' + armarSubconsultaStock(ubicaciones) + ' ) stock'
             + ' JOIN item i ON i.id = stock.articulo'
             + ' LEFT JOIN (' + armarSubconsultaCompra() + ' ) compra'
             + '   ON compra.articulo = stock.articulo AND compra.ubicacion = stock.ubicacion'
             + ' LEFT JOIN location l ON l.id = stock.ubicacion'
             + " WHERE l.id IS NULL OR UPPER(l.fullname) NOT LIKE '%" + CONSTANTES.UBICACION_EXCLUIDA + "%'"
             + ' ORDER BY i.itemid, BUILTIN.DF(stock.ubicacion)';
    }

    /**
     * Una fila por articulo + ubicacion con su cantidad, su valor y su ultimo
     * consumo. Solo las lineas que tocan la cuenta de inventario del articulo:
     * es lo que cuadra con el informe nativo de valuacion.
     */
    function armarSubconsultaStock(ubicaciones) {
        const filtroUbicacion = ubicaciones.length ? ' AND tl.location IN (' + ubicaciones.map(() => '?').join(', ') + ')' : '';

        return '   SELECT tl.item AS articulo,'
             + '   tl.location AS ubicacion,'
             + "   SUM(CASE WHEN tl.isinventoryaffecting = 'T' THEN tl.quantity ELSE 0 END) AS cantidad,"
             + '   SUM(tal.amount) AS importe,'
             + "   MAX(CASE WHEN t.type IN ('ItemShip', 'InvAdjst') AND tl.quantity < 0 THEN t.trandate END) AS consumo"
             + '   FROM transaction t'
             + '   JOIN transactionline tl ON tl.transaction = t.id'
             + '   JOIN transactionaccountingline tal ON tal.transaction = tl.transaction AND tal.transactionline = tl.id'
             + '   JOIN item i ON i.id = tl.item'
             + '   WHERE tl.subsidiary = ?'
             + "   AND t.trandate <= TO_DATE(?, 'DD/MM/YYYY')"
             + filtroUbicacion
             + '   AND tal.accountingbook = ' + CONSTANTES.LIBRO_CONTABLE
             + '   AND tal.account = i.assetaccount'
             + "   AND tal.posting = 'T'"
             + '   GROUP BY tl.item, tl.location'
             + "   HAVING SUM(CASE WHEN tl.isinventoryaffecting = 'T' THEN tl.quantity ELSE 0 END) <> 0 OR SUM(tal.amount) <> 0";
    }

    /**
     * La fecha de la ultima factura de compra por articulo + ubicacion, sin el
     * filtro contable del stock: una factura que cuadra con su recepcion no toca
     * la cuenta de inventario, y con ese filtro quedaba fuera aunque fuera la
     * ultima compra. No filtra ubicacion: el join con el stock ya la limita.
     */
    function armarSubconsultaCompra() {
        return '   SELECT tl.item AS articulo,'
             + '   tl.location AS ubicacion,'
             + '   MAX(t.trandate) AS fecha'
             + '   FROM transaction t'
             + '   JOIN transactionline tl ON tl.transaction = t.id'
             + "   WHERE t.type = 'VendBill'"
             + '   AND tl.quantity > 0'
             + '   AND tl.subsidiary = ?'
             + "   AND t.trandate <= TO_DATE(?, 'DD/MM/YYYY')"
             + '   GROUP BY tl.item, tl.location';
    }

    function obtenerUbicaciones() {
        const filas = query.runSuiteQL({
            query : 'SELECT l.id, l.fullname AS nombre, l.subsidiary AS subsidiaria'
                  + ' FROM location l'
                  + ' WHERE l.isinactive = ?'
                  + ' AND UPPER(l.fullname) NOT LIKE ?'
                  + ' ORDER BY l.fullname',
            params: ['F', '%' + CONSTANTES.UBICACION_EXCLUIDA + '%'],
        }).asMappedResults();

        return filas.map((fila) => ({ subsidiaria: String(fila.subsidiaria), id: String(fila.id), nombre: fila.nombre }));
    }

    return {
        armarConsultaStock: armarConsultaStock,
        obtenerUbicaciones: obtenerUbicaciones,
    };
});
