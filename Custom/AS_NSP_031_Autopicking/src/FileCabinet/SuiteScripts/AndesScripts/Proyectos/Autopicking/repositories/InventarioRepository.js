/**
 * @NApiVersion 2.1
 * @NModuleScope SameAccount
 *
 * @description AS_NSP_031 - Consulta de existencias para asignar inventario a la Ejecución.
 *              Ordenada FEFO (primero en vencer, primero en salir), descontando los lotes
 *              comprometidos a otras Órdenes de Venta y priorizando los lotes que la propia
 *              OV ya tiene asignados en su detalle de inventario.
 */
define(["N/query", "../constants/AutopickingConstants"], (query, CONST) => {
    const { REGLAS } = CONST;
    const EPS = REGLAS.EPSILON;

    const listaTexto = (valores) => valores.map((v) => `'${String(v).replace(/'/g, "''")}'`).join(",");

    /** Ejecuta una consulta SuiteQL paginada (evita el tope de 5000 filas de runSuiteQL). */
    const consultarTodo = (sql, params = []) => {
        const filas = [];
        const paginado = query.runSuiteQLPaged({ query: sql, params, pageSize: 1000 });
        for (const rango of paginado.pageRanges) {
            filas.push(...paginado.fetch({ index: rango.index }).data.asMappedResults());
        }
        return filas;
    };

    /**
     * Condición SQL de las líneas de OV que mantienen lotes comprometidos:
     * OV en estado con compromiso (o la OV en proceso), línea abierta y con cantidad pendiente.
     */
    const condicionLineaComprometida = (items, ubicaciones) => `
              t.type = 'SalesOrd'
              AND (t.status IN (${listaTexto(REGLAS.ESTADOS_OV_COMPROMISO)}) OR t.id = ?)
              AND tl.mainline = 'F'
              AND NVL(tl.isclosed, 'F') = 'F'
              AND tl.item IN (${items.join(",")})
              AND tl.inventorylocation IN (${ubicaciones.join(",")})
              AND ABS(NVL(tl.quantity, 0)) > ABS(NVL(tl.quantityshiprecv, 0))
    `;

    /**
     * Lotes asignados en el detalle de inventario de líneas de OV abiertas, con la cantidad
     * que sigue comprometida: lo asignado al lote menos lo ya ejecutado de ese lote desde
     * esa línea, sin superar lo pendiente de la línea.
     *
     * @param {number[]} items
     * @param {number[]} ubicaciones
     * @param {number} idOrdenVenta - OV en proceso (sus lotes se devuelven como propios)
     * @returns {{ ajenos: Map<string, {cantidad: number, ovs: Set<string>}>, propios: Set<string> }}
     *          Clave "item|ubicacion|inventorynumber"
     */
    function cargarCompromisosLote(items, ubicaciones, idOrdenVenta) {
        const idOv = Number(idOrdenVenta) || 0;

        const sqlAsignado = `
            SELECT
                t.id AS ov,
                t.tranid AS tranid,
                tl.id AS lineid,
                tl.item AS item,
                tl.inventorylocation AS ubicacion,
                ABS(NVL(tl.quantity, 0)) - ABS(NVL(tl.quantityshiprecv, 0)) AS pendientelinea,
                ia.inventorynumber AS inventorynumber,
                SUM(ABS(NVL(ia.quantity, 0))) AS asignado
            FROM transaction t
            INNER JOIN transactionline tl ON tl.transaction = t.id
            INNER JOIN inventoryassignment ia ON ia.transaction = tl.transaction AND ia.transactionline = tl.id
            WHERE ${condicionLineaComprometida(items, ubicaciones)}
              AND ia.inventorynumber IS NOT NULL
            GROUP BY t.id, t.tranid, tl.id, tl.item, tl.inventorylocation, tl.quantity, tl.quantityshiprecv, ia.inventorynumber
            ORDER BY t.id, tl.id, ia.inventorynumber
        `;

        // Lo ya ejecutado por lote desde cada línea de OV (vínculo OV -> Ejecución)
        const sqlEjecutado = `
            SELECT
                t.id AS ov,
                tl.id AS lineid,
                ia.inventorynumber AS inventorynumber,
                SUM(ABS(NVL(ia.quantity, 0))) AS ejecutado
            FROM NextTransactionLineLink ntl
            INNER JOIN transaction t ON t.id = ntl.previousdoc
            INNER JOIN transactionline tl ON tl.transaction = ntl.previousdoc AND tl.id = ntl.previousline
            INNER JOIN inventoryassignment ia ON ia.transaction = ntl.nextdoc AND ia.transactionline = ntl.nextline
            WHERE ntl.linktype = '${REGLAS.TIPO_VINCULO_EJECUCION}'
              AND ${condicionLineaComprometida(items, ubicaciones)}
              AND ia.inventorynumber IS NOT NULL
            GROUP BY t.id, tl.id, ia.inventorynumber
        `;

        const ejecutado = new Map();
        for (const f of consultarTodo(sqlEjecutado, [idOv])) {
            ejecutado.set(`${f.ov}|${f.lineid}|${f.inventorynumber}`, parseFloat(f.ejecutado || 0));
        }

        const ajenos = new Map();
        const propios = new Set();
        const saldoLinea = new Map(); // tope por línea: lo pendiente de ejecutar

        for (const f of consultarTodo(sqlAsignado, [idOv])) {
            const claveLinea = `${f.ov}|${f.lineid}`;
            if (!saldoLinea.has(claveLinea)) saldoLinea.set(claveLinea, Math.max(0, parseFloat(f.pendientelinea || 0)));

            const yaEjecutado = ejecutado.get(`${claveLinea}|${f.inventorynumber}`) || 0;
            const tope = saldoLinea.get(claveLinea);
            const comprometido = Math.min(Math.max(0, parseFloat(f.asignado || 0) - yaEjecutado), tope);
            if (comprometido <= EPS) continue;
            saldoLinea.set(claveLinea, tope - comprometido);

            const claveLote = `${f.item}|${f.ubicacion}|${f.inventorynumber}`;
            if (Number(f.ov) === idOv) {
                propios.add(claveLote);
                continue;
            }
            if (!ajenos.has(claveLote)) ajenos.set(claveLote, { cantidad: 0, ovs: new Set() });
            const ajeno = ajenos.get(claveLote);
            ajeno.cantidad += comprometido;
            ajeno.ovs.add(f.tranid || String(f.ov));
        }

        return { ajenos, propios };
    }

    /**
     * Carga las existencias físicas por ítem/ubicación/lote/estado.
     *  - Excluye lotes vencidos a la fecha actual.
     *  - Excluye estados de inventario no consumibles (REGLAS.ESTADOS_INVENTARIO_EXCLUIDOS).
     *  - Usa la cantidad en existencia (on hand): la cantidad comprometida a la propia OV
     *    no está "disponible" y por eso no puede usarse quantityavailable.
     *  - Descuenta los lotes comprometidos a otras OV (el balance no los resta por lote,
     *    pero NetSuite rechaza la Ejecución si se intenta tomarlos).
     *  - Ordena primero los lotes ya asignados a la propia OV; dentro de cada grupo, FEFO.
     *
     * @param {number[]} itemIds
     * @param {number[]} ubicacionIds
     * @param {number} idOrdenVenta - OV en proceso
     * @returns {Map<string, Array<{inventoryNumber: number|null, lote: string|null, estado: number|null, bin: number|null, cantidad: number, comprometidoOtras: number, ovsCompromiso: string[], propio: boolean}>>}
     *          Clave "item|ubicacion"
     */
    function cargarExistencias(itemIds, ubicacionIds, idOrdenVenta) {
        const mapa = new Map();
        const items = [...new Set(itemIds.map(Number).filter(Boolean))];
        const ubicaciones = [...new Set(ubicacionIds.map(Number).filter(Boolean))];
        if (!items.length || !ubicaciones.length) return mapa;

        const sql = `
            SELECT
                ib.item AS item,
                ib.location AS ubicacion,
                ib.inventorynumber AS inventorynumber,
                inum.inventorynumber AS lote,
                ib.inventorystatus AS estado,
                ib.binnumber AS bin,
                ib.quantityonhand AS cantidad
            FROM InventoryBalance ib
            LEFT JOIN InventoryNumber inum ON inum.id = ib.inventorynumber
            WHERE ib.item IN (${items.join(",")})
              AND ib.location IN (${ubicaciones.join(",")})
              AND ib.quantityonhand > 0
              AND (inum.id IS NULL OR inum.expirationdate IS NULL OR inum.expirationdate > CURRENT_DATE)
              AND (ib.inventorystatus IS NULL OR BUILTIN.DF(ib.inventorystatus) NOT IN (${listaTexto(REGLAS.ESTADOS_INVENTARIO_EXCLUIDOS)}))
            ORDER BY ib.item, ib.location, inum.expirationdate ASC NULLS LAST, ib.inventorynumber ASC
        `;

        const { ajenos, propios } = cargarCompromisosLote(items, ubicaciones, idOrdenVenta);
        // Saldo comprometido a otras OV aún por descontar, por lote (se reparte entre sus filas estado/bin)
        const porDescontar = new Map([...ajenos].map(([k, v]) => [k, v.cantidad]));

        for (const f of query.runSuiteQL({ query: sql }).asMappedResults()) {
            const clave = `${f.item}|${f.ubicacion}`;
            const claveLote = `${clave}|${f.inventorynumber}`;
            const enExistencia = parseFloat(f.cantidad || 0);

            let comprometidoOtras = 0;
            if (f.inventorynumber && porDescontar.has(claveLote)) {
                comprometidoOtras = Math.min(enExistencia, porDescontar.get(claveLote));
                porDescontar.set(claveLote, porDescontar.get(claveLote) - comprometidoOtras);
            }

            if (!mapa.has(clave)) mapa.set(clave, []);
            mapa.get(clave).push({
                inventoryNumber: f.inventorynumber ? Number(f.inventorynumber) : null,
                lote: f.lote || null,
                estado: f.estado ? Number(f.estado) : null,
                bin: f.bin ? Number(f.bin) : null,
                cantidad: Math.max(0, enExistencia - comprometidoOtras),
                comprometidoOtras,
                ovsCompromiso: comprometidoOtras > EPS ? [...ajenos.get(claveLote).ovs] : [],
                propio: !!f.inventorynumber && propios.has(claveLote)
            });
        }

        // Lotes de la propia OV primero; el sort es estable, así que se conserva el FEFO de cada grupo
        for (const filas of mapa.values()) {
            filas.sort((a, b) => Number(b.propio) - Number(a.propio));
        }
        return mapa;
    }

    return { cargarExistencias };
});
