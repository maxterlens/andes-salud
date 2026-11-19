/**
 * @NApiVersion 2.1
 * @NModuleScope SameAccount
 *
 * @description AS_NSP_037 - Consultas de artículos y existencias.
 *              cargarExistencias replica el criterio de AS_NSP_031 (InventarioRepository):
 *               - FEFO (primero en vencer, primero en salir), sin lotes vencidos.
 *               - Sin estados de inventario no consumibles.
 *               - Descuenta los lotes comprometidos a otras Órdenes de Venta.
 *              Las cantidades de existencias están en unidad base.
 */
define(["../constants/FixArticuloOrdenVentaConstants", "../utils/SuiteQLUtils"], (CONST, sql) => {
    const { REGLAS, CAMPOS } = CONST;
    const EPS = REGLAS.EPSILON;

    const { consultarTodo, consultar, enLotes, listaTexto, listaNumeros, numero } = sql;

    /**
     * Datos de los artículos indicados.
     * @returns {Map<number, {id: number, codigo: string, nombre: string, tipo: string, inactivo: boolean, esLote: boolean, esSerie: boolean}>}
     */
    function obtenerArticulos(ids) {
        const mapa = new Map();
        for (const lote of enLotes(listaNumeros(ids))) {
            const consulta = `
                SELECT i.id AS id, i.itemid AS codigo, NVL(i.displayname, i.itemid) AS nombre, i.itemtype AS tipo,
                       NVL(i.isinactive, 'F') AS inactivo, i.islotitem AS eslote, i.isserialitem AS esserie
                FROM item i
                WHERE i.id IN (${lote.join(",")})
            `;
            for (const f of consultarTodo(consulta)) {
                mapa.set(Number(f.id), {
                    id: Number(f.id),
                    codigo: f.codigo,
                    nombre: f.nombre,
                    tipo: f.tipo,
                    inactivo: f.inactivo === "T",
                    esLote: f.eslote === "T",
                    esSerie: f.esserie === "T"
                });
            }
        }
        return mapa;
    }

    /**
     * Disponible nativo de NetSuite por artículo/ubicación (el mismo dato que usa la validación
     * de la cuenta que impide guardar OV por sobre el stock disponible). Unidad base.
     * @returns {Map<string, number>} clave "item|ubicacion"
     */
    function obtenerDisponibleUbicacion(itemIds, ubicacionIds) {
        const mapa = new Map();
        const items = listaNumeros(itemIds);
        const ubicaciones = listaNumeros(ubicacionIds);
        if (!items.length || !ubicaciones.length) return mapa;
        for (const lote of enLotes(items)) {
            const consulta = `
                SELECT ail.item AS item, ail.location AS ubicacion, NVL(ail.quantityavailable, 0) AS disponible
                FROM AggregateItemLocation ail
                WHERE ail.item IN (${lote.join(",")})
                  AND ail.location IN (${ubicaciones.join(",")})
            `;
            for (const f of consultarTodo(consulta)) {
                mapa.set(`${f.item}|${f.ubicacion}`, Math.max(0, numero(f.disponible)));
            }
        }
        return mapa;
    }

    /** Condición SQL de líneas de OV que mantienen lotes comprometidos (criterio AS_NSP_031). */
    const condicionLineaComprometida = (items, ubicaciones) => `
              t.type = 'SalesOrd'
              AND (t.status IN (${listaTexto(REGLAS.ESTADOS_OV_COMPROMISO)}) OR t.id = ?)
              AND tl.mainline = 'F'
              AND NVL(tl.isclosed, 'F') = 'F'
              AND tl.item IN (${items.join(",")})
              AND tl.inventorylocation IN (${ubicaciones.join(",")})
              AND ABS(NVL(tl.quantity, 0)) > ABS(NVL(tl.quantityshiprecv, 0))
    `;

    /** Lotes comprometidos a otras OV (réplica de AS_NSP_031). */
    function cargarCompromisosLote(items, ubicaciones, idOrdenVenta) {
        const idOv = Number(idOrdenVenta) || 0;
        const sqlAsignado = `
            SELECT
                t.id AS ov, t.tranid AS tranid, tl.id AS lineid, tl.item AS item, tl.inventorylocation AS ubicacion,
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
        const sqlEjecutado = `
            SELECT t.id AS ov, tl.id AS lineid, ia.inventorynumber AS inventorynumber, SUM(ABS(NVL(ia.quantity, 0))) AS ejecutado
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
            ejecutado.set(`${f.ov}|${f.lineid}|${f.inventorynumber}`, numero(f.ejecutado));
        }

        const ajenos = new Map();
        const saldoLinea = new Map();
        for (const f of consultarTodo(sqlAsignado, [idOv])) {
            const claveLinea = `${f.ov}|${f.lineid}`;
            if (!saldoLinea.has(claveLinea)) saldoLinea.set(claveLinea, Math.max(0, numero(f.pendientelinea)));
            const yaEjecutado = ejecutado.get(`${claveLinea}|${f.inventorynumber}`) || 0;
            const tope = saldoLinea.get(claveLinea);
            const comprometido = Math.min(Math.max(0, numero(f.asignado) - yaEjecutado), tope);
            if (comprometido <= EPS) continue;
            saldoLinea.set(claveLinea, tope - comprometido);
            if (Number(f.ov) === idOv) continue;

            const claveLote = `${f.item}|${f.ubicacion}|${f.inventorynumber}`;
            if (!ajenos.has(claveLote)) ajenos.set(claveLote, { cantidad: 0, ovs: new Set() });
            ajenos.get(claveLote).cantidad += comprometido;
            ajenos.get(claveLote).ovs.add(f.tranid || String(f.ov));
        }
        return ajenos;
    }

    /**
     * Existencias por ítem/ubicación/lote/estado en orden FEFO (réplica de AS_NSP_031).
     * @param {number[]} itemIds
     * @param {number[]} ubicacionIds
     * @param {number} [idOrdenVenta] - OV en proceso (sus propios compromisos no se descuentan)
     * @returns {Map<string, Array<{inventoryNumber: number|null, lote: string|null, estado: number|null, bin: number|null, cantidad: number, comprometidoOtras: number}>>}
     *          clave "item|ubicacion"
     */
    function cargarExistencias(itemIds, ubicacionIds, idOrdenVenta = 0) {
        const mapa = new Map();
        const items = listaNumeros(itemIds);
        const ubicaciones = listaNumeros(ubicacionIds);
        if (!items.length || !ubicaciones.length) return mapa;

        const ajenos = cargarCompromisosLote(items, ubicaciones, idOrdenVenta);
        const porDescontar = new Map([...ajenos].map(([k, v]) => [k, v.cantidad]));

        const consulta = `
            SELECT
                ib.item AS item, ib.location AS ubicacion, ib.inventorynumber AS inventorynumber,
                inum.inventorynumber AS lote, ib.inventorystatus AS estado, ib.binnumber AS bin,
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

        for (const f of consultarTodo(consulta)) {
            const clave = `${f.item}|${f.ubicacion}`;
            const claveLote = `${clave}|${f.inventorynumber}`;
            const enExistencia = numero(f.cantidad);
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
                comprometidoOtras
            });
        }
        return mapa;
    }

    /**
     * Saldo de cada lote de un artículo en una ubicación a una fecha (incluida), sumando los
     * movimientos de inventario hasta ese día. Para artículos sin lote, la clave es "SIN_LOTE".
     * @param {number} item
     * @param {number} ubicacion
     * @param {string} fechaIso - YYYY-MM-DD
     * @returns {Map<string, number>} clave = id de inventorynumber (texto) o "SIN_LOTE"; unidad base
     */
    function obtenerSaldosALaFecha(item, ubicacion, fechaIso, esLote) {
        const mapa = new Map();
        const consulta = esLote
            ? `
                SELECT ia.inventorynumber AS clave,
                       SUM(CASE WHEN NVL(tl.quantity, 0) < 0 THEN -ABS(NVL(ia.quantity, 0)) ELSE ABS(NVL(ia.quantity, 0)) END) AS saldo
                FROM inventoryassignment ia
                INNER JOIN transactionline tl ON tl.transaction = ia.transaction AND tl.id = ia.transactionline
                INNER JOIN transaction t ON t.id = tl.transaction
                WHERE tl.item = ?
                  AND tl.location = ?
                  AND tl.isinventoryaffecting = 'T'
                  AND ia.inventorynumber IS NOT NULL
                  AND t.trandate <= TO_DATE(?, 'YYYY-MM-DD')
                GROUP BY ia.inventorynumber
            `
            : `
                SELECT 'SIN_LOTE' AS clave, SUM(NVL(tl.quantity, 0)) AS saldo
                FROM transactionline tl
                INNER JOIN transaction t ON t.id = tl.transaction
                WHERE tl.item = ?
                  AND tl.location = ?
                  AND tl.isinventoryaffecting = 'T'
                  AND t.trandate <= TO_DATE(?, 'YYYY-MM-DD')
            `;
        for (const f of consultarTodo(consulta, [Number(item), Number(ubicacion), fechaIso])) {
            mapa.set(String(f.clave), numero(f.saldo));
        }
        return mapa;
    }

    /** true si el período contable de la fecha está abierto. */
    function periodoAbiertoEn(fechaIso) {
        const consulta = `
            SELECT COUNT(*) AS total
            FROM accountingperiod ap
            WHERE ap.isposting = 'T'
              AND NVL(ap.isadjust, 'F') = 'F'
              AND ap.startdate <= TO_DATE(?, 'YYYY-MM-DD')
              AND ap.enddate >= TO_DATE(?, 'YYYY-MM-DD')
              AND NVL(ap.closed, 'F') = 'F'
              AND NVL(ap.alllocked, 'F') = 'F'
        `;
        const filas = consultar(consulta, [fechaIso, fechaIso]);
        return numero(filas[0] && filas[0].total) > 0;
    }

    /** IDs de ubicaciones marcadas como autopicking. */
    function obtenerUbicacionesAutopicking(ubicacionIds) {
        const ids = listaNumeros(ubicacionIds);
        if (!ids.length) return new Set();
        const consulta = `SELECT loc.id AS id FROM location loc WHERE loc.id IN (${ids.join(",")}) AND loc.${CAMPOS.UBICACION_ES_AUTOPICKING} = 'T'`;
        return new Set(consultarTodo(consulta).map((f) => Number(f.id)));
    }

    return { obtenerArticulos, obtenerDisponibleUbicacion, cargarExistencias, obtenerSaldosALaFecha, periodoAbiertoEn, obtenerUbicacionesAutopicking };
});
