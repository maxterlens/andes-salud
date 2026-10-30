/**
 * AS_NSP_035 — Reporte de Stock Valorizado
 * @description Todas las consultas SuiteQL del modulo.
 *
 *              armarConsultaStock → la consulta del reporte, una fila por articulo
 *                                   + ubicacion. No se corre aqui: la corre NetSuite
 *                                   como SuiteQLTask (AS_StockValorizadoHandler), que
 *                                   no tiene el limite de filas de runSuiteQL.
 *              obtenerUbicaciones → las ubicaciones activas con su subsidiaria,
 *                                   para el filtro del formulario.
 * @NApiVersion 2.1
 * @NModuleScope Public
 * @author Andes Salud
 * @version 1.1.0
 *
 * CHANGELOG v1.1.0:
 * - [FEAT] Filtro opcional por ubicacion y obtenerUbicaciones.
 * - [FIX]  Sin filtro de cuentas fijas: tl.isinventoryaffecting ya deja
 *          solo el lado de inventario.
 *
 */
define(['N/query', '../../constants/AS_StockValorizadoConstants'],
    (query, CONSTANTES) => {

    // ─────────────────────────────────────────────────────────────────────────
    // Principales
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Los criterios del dataset "prueba auditoria stock" (custdataset179) sin su filtro de cuentas;
     * con ese filtro cuadro contra el informe nativo al 30/09/2026: 1.202.166.305 de valor.
     *
     * La suma va en la subconsulta por ids: BUILTIN.DF no se puede usar junto
     * a un GROUP BY ("Busqueda invalida o no compatible"), asi que los nombres se
     * resuelven afuera, ya agrupado.
     *
     * Quedan fuera las combinaciones con cantidad y valor en cero (ubicaciones que
     * se vaciaron): con ellas el archivo pasa de 10 mil a 24 mil filas sin saldo.
     *
     * Parametros: [subsidiaria, fecha de corte DD/MM/AAAA, ...ubicaciones]. Sin
     * ubicaciones elegidas no se filtra: trae todas las de la subsidiaria.
     */
    function armarConsultaStock(ubicaciones) {
        const filtroUbicacion = ubicaciones.length ? ' AND tl.location IN (' + ubicaciones.map(() => '?').join(', ') + ')' : '';

        return 'SELECT i.upccode AS codigo_upc,'
             + ' i.itemid AS articulo,'
             + ' BUILTIN.DF(stock.ubicacion) AS ubicacion,'
             + ' BUILTIN.DF(i.custitem_wmsse_itemfamily) AS familia_wms,'
             + ' stock.cantidad AS cantidad,'
             + ' CASE WHEN stock.cantidad <> 0 THEN ROUND(stock.importe / stock.cantidad, 2) END AS valorizacion_individual,'
             + ' stock.importe AS valorizacion_total,'
             + " TO_CHAR(stock.consumo, 'DD/MM/YYYY') AS fecha_ultimo_consumo,"
             + " TO_CHAR(stock.compra, 'DD/MM/YYYY') AS fecha_compra"
             + ' FROM ('
             + '   SELECT tl.item AS articulo,'
             + '   tl.location AS ubicacion,'
             + '   SUM(tl.quantity) AS cantidad,'
             + '   SUM(tal.amount) AS importe,'
             + "   MAX(CASE WHEN t.type IN ('ItemShip', 'CustInvc', 'InvAdjst') AND tl.quantity < 0 THEN t.trandate END) AS consumo,"
             + "   MAX(CASE WHEN t.type = 'ItemRcpt' AND t.entity IS NOT NULL THEN t.trandate"
             + "            WHEN t.type = 'VendBill' AND tl.quantity > 0 THEN t.trandate END) AS compra"
             + '   FROM transaction t'
             + '   JOIN transactionline tl ON tl.transaction = t.id'
             + '   JOIN transactionaccountingline tal ON tal.transaction = tl.transaction AND tal.transactionline = tl.id'
             + '   JOIN item i ON i.id = tl.item'
             + '   WHERE tl.subsidiary = ?'
             + "   AND t.trandate <= TO_DATE(?, 'DD/MM/YYYY')"
             + filtroUbicacion
             + '   AND tal.accountingbook = ' + CONSTANTES.LIBRO_CONTABLE
             + "   AND tal.posting = 'T'"
             + "   AND tl.isinventoryaffecting = 'T'"
             + "   AND i.isinactive = 'F'"
             + '   GROUP BY tl.item, tl.location'
             + '   HAVING SUM(tl.quantity) <> 0 OR SUM(tal.amount) <> 0'
             + ' ) stock'
             + ' JOIN item i ON i.id = stock.articulo'
             + ' ORDER BY i.itemid, BUILTIN.DF(stock.ubicacion)';
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

    return {
        armarConsultaStock: armarConsultaStock,
        obtenerUbicaciones: obtenerUbicaciones,
    };
});
