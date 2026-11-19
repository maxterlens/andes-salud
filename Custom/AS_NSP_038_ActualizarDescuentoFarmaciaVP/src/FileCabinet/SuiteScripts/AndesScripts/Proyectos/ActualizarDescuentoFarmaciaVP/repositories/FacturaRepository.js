/**
 * @NApiVersion 2.1
 * @NModuleScope SameAccount
 *
 * @description AS_NSP_038 - Lectura de Facturas de Venta (invoice) de Farmacia Venta Público.
 *               - buscarAbiertas: cabeceras de las facturas abiertas con importe restante (N/search, mismo
 *                 criterio de la búsqueda "Facturas de venta abiertas farmacia venta público").
 *               - obtenerLineas: líneas de artículo e impuesto de varias facturas (SuiteQL, en lotes).
 *               - obtenerEstado: estado e importe restante actuales de una factura.
 *              Las cantidades e importes de SuiteQL se devuelven en valor absoluto: en la tabla de líneas
 *              el signo depende del lado contable (ingreso / descuento), no de la pantalla.
 */
define(["N/search", "N/format", "../utils/SuiteQLUtils", "../utils/FormatoUtils"], (search, format, sql, formato) => {
    /** 'YYYY-MM-DD' → texto de fecha en el formato del usuario (para filtros de N/search). */
    const _fechaFiltro = (iso) => format.format({ value: formato.isoAFecha(iso), type: format.Type.DATE });

    /** '136, 140' → ['136', '140'] */
    const _listaIds = (texto) =>
        String(texto || "")
            .split(/[,;\s]+/)
            .map((s) => s.trim())
            .filter((s) => /^\d+$/.test(s));

    /**
     * Facturas abiertas de la subsidiaria con importe restante mayor al mínimo.
     * @param {object} o
     * @param {number} o.subsidiaria
     * @param {string} [o.desde] - 'YYYY-MM-DD' (fecha de la factura)
     * @param {string} [o.hasta] - 'YYYY-MM-DD'
     * @param {string} o.departamentos - IDs separados por coma (centro de costo)
     * @param {string} [o.ubicacionesExcluidas] - IDs separados por coma
     * @param {number} o.restanteMinimo
     * @returns {{id: number, numero: string, fecha: string, cliente: string, ubicacion: string, total: number, restante: number}[]}
     */
    const buscarAbiertas = ({ subsidiaria, desde, hasta, departamentos, ubicacionesExcluidas, restanteMinimo }) => {
        const filtros = [
            ["type", "anyof", "CustInvc"],
            "AND",
            ["mainline", "is", "T"],
            "AND",
            ["status", "anyof", "CustInvc:A"],
            "AND",
            ["subsidiary", "anyof", String(subsidiaria)],
            "AND",
            [`formulanumeric: CASE WHEN {amountremaining} > ${Number(restanteMinimo) || 0} THEN 1 ELSE 0 END`, "equalto", "1"]
        ];
        const deps = _listaIds(departamentos);
        if (deps.length) filtros.push("AND", ["department", "anyof", ...deps]);
        const excluidas = _listaIds(ubicacionesExcluidas);
        if (excluidas.length) filtros.push("AND", ["location", "noneof", ...excluidas]);
        if (desde) filtros.push("AND", ["trandate", "onorafter", _fechaFiltro(desde)]);
        if (hasta) filtros.push("AND", ["trandate", "onorbefore", _fechaFiltro(hasta)]);

        const busqueda = search.create({
            type: search.Type.INVOICE,
            settings: [
                { name: "consolidationtype", value: "NONE" },
                { name: "includeperiodendtransactions", value: "F" }
            ],
            filters: filtros,
            columns: [
                search.createColumn({ name: "trandate", sort: search.Sort.ASC }),
                search.createColumn({ name: "tranid" }),
                search.createColumn({ name: "entity" }),
                search.createColumn({ name: "location" }),
                search.createColumn({ name: "amount" }),
                search.createColumn({ name: "amountremaining" })
            ]
        });

        const facturas = [];
        const paginado = busqueda.runPaged({ pageSize: 1000 });
        paginado.pageRanges.forEach((rango) => {
            paginado.fetch({ index: rango.index }).data.forEach((r) => {
                facturas.push({
                    id: Number(r.id),
                    numero: r.getValue("tranid"),
                    fecha: r.getValue("trandate"),
                    cliente: r.getText("entity"),
                    ubicacion: r.getText("location"),
                    total: sql.numero(r.getValue("amount")),
                    restante: sql.numero(r.getValue("amountremaining"))
                });
            });
        });
        return facturas;
    };

    /**
     * Líneas de artículo (sin COGS) e impuesto de las facturas, en el orden de la factura.
     * @param {number[]} ids
     * @returns {Object<number, {linea: number, articuloId: number, nombre: string, tipo: string, cantidad: number, importe: number, esImpuesto: boolean}[]>}
     */
    const obtenerLineas = (ids) => {
        const porFactura = {};
        sql.enLotes(sql.listaNumeros(ids)).forEach((lote) => {
            sql.consultarTodo(
                `
                SELECT
                    tl.transaction AS factura,
                    tl.id AS linea,
                    tl.linesequencenumber AS secuencia,
                    tl.item AS articulo,
                    BUILTIN.DF(tl.item) AS nombre,
                    it.itemid AS codigo,
                    it.displayname AS nombrevisible,
                    it.itemtype AS tipo,
                    ABS(NVL(tl.quantity, 0)) AS cantidad,
                    ABS(NVL(tl.netamount, 0)) AS importe,
                    tl.taxline AS esimpuesto
                FROM transactionline tl
                LEFT JOIN item it ON it.id = tl.item
                WHERE tl.transaction IN (${lote.join(",")})
                  AND tl.mainline = 'F'
                  AND NVL(tl.iscogs, 'F') = 'F'
                  AND (tl.taxline = 'T' OR tl.item IS NOT NULL)
                ORDER BY tl.transaction, tl.linesequencenumber, tl.id
            `
            ).forEach((f) => {
                const id = Number(f.factura);
                (porFactura[id] = porFactura[id] || []).push({
                    linea: Number(f.linea),
                    articuloId: f.articulo ? Number(f.articulo) : null,
                    // Se juntan los nombres posibles: la regla busca el texto "descuento" en cualquiera de ellos
                    nombre: f.nombre || f.codigo || "",
                    nombreBusqueda: [f.nombre, f.codigo, f.nombrevisible].filter(Boolean).join(" "),
                    tipo: f.tipo || "",
                    cantidad: sql.numero(f.cantidad),
                    importe: sql.numero(f.importe),
                    esImpuesto: f.esimpuesto === "T"
                });
            });
        });
        return porFactura;
    };

    /** Estado (statusref) e importe restante actuales de la factura. */
    const obtenerEstado = (id) => {
        const v = search.lookupFields({ type: search.Type.INVOICE, id: Number(id), columns: ["statusref", "amountremaining", "tranid"] });
        const estado = Array.isArray(v.statusref) ? (v.statusref[0] || {}).value : v.statusref;
        return { estado: estado || "", restante: sql.numero(v.amountremaining), numero: v.tranid };
    };

    return { buscarAbiertas, obtenerLineas, obtenerEstado };
});
