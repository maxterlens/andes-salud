/**
 * @NApiVersion 2.1
 * @NModuleScope SameAccount
 *
 * @description AS_NSP_031 - Acceso a datos de Órdenes de Venta (solo lectura vía SuiteQL).
 */
define(["N/query", "../constants/AutopickingConstants"], (query, CONST) => {
    const { REGLAS, CAMPOS, COLA_AUTOPICKING } = CONST;

    const listaTexto = (valores) => valores.map((v) => `'${String(v).replace(/'/g, "''")}'`).join(",");

    /**
     * Condición SQL reutilizable: línea de inventario abierta con cantidad pendiente de ejecutar.
     * @param {string} alias - alias de TransactionLine en la consulta
     */
    const condicionLineaPendiente = (alias) => `
            ${alias}.mainline = 'F'
            AND ${alias}.itemtype IN (${listaTexto(REGLAS.TIPOS_ITEM)})
            AND NVL(${alias}.isclosed, 'F') = 'F'
            AND NVL(${alias}.${CAMPOS.LINEA_PROVISIONAL}, 'F') = 'F'
            AND ABS(NVL(${alias}.quantity, 0)) > ABS(NVL(${alias}.quantityshiprecv, 0))
    `;

    /**
     * Devuelve los IDs de OV candidatas a reproceso.
     *  - Con idsOrdenVenta: solo esas OV (no aplica filtro de fecha).
     *  - Sin idsOrdenVenta: OV de los últimos `diasAtras` días.
     * En ambos casos exige líneas pendientes con cantidad comprometida y excluye
     * las OV que tienen un registro Pendiente en la cola de autopicking.
     *
     * @param {{ idsOrdenVenta: number[], diasAtras: number, limite: number }} filtros
     * @returns {Array<{ id: number, tranid: string }>}
     */
    function buscarCandidatas({ idsOrdenVenta, diasAtras, limite }) {
        const params = [];
        let filtroOrigen;

        if (idsOrdenVenta && idsOrdenVenta.length > 0) {
            filtroOrigen = `t.id IN (${idsOrdenVenta.map(Number).join(",")})`;
        } else {
            filtroOrigen = "t.trandate >= TRUNC(SYSDATE) - ?";
            params.push(Number(diasAtras));
        }

        const sql = `
            SELECT t.id AS id, t.tranid AS tranid
            FROM transaction t
            WHERE t.type = 'SalesOrd'
              AND t.status IN (${listaTexto(REGLAS.ESTADOS_OV)})
              AND ${filtroOrigen}
              AND EXISTS (
                    SELECT 1
                    FROM transactionline tl
                    INNER JOIN location loc ON loc.id = tl.inventorylocation
                    WHERE tl.transaction = t.id
                      AND ${condicionLineaPendiente("tl")}
                      AND ABS(NVL(tl.quantitycommitted, 0)) > 0
                      AND NVL(loc.isinactive, 'F') = 'F'
              )
              AND NOT EXISTS (
                    SELECT 1
                    FROM ${COLA_AUTOPICKING.TIPO} q
                    WHERE q.${COLA_AUTOPICKING.CAMPO_ORDEN_VENTA} = t.id
                      AND q.${COLA_AUTOPICKING.CAMPO_ESTADO} = ${Number(COLA_AUTOPICKING.ESTADO_PENDIENTE)}
                      AND NVL(q.isinactive, 'F') = 'F'
              )
            ORDER BY t.id ASC
        `;

        const resultados = [];
        const paginado = query.runSuiteQLPaged({ query: sql, params, pageSize: 1000 });
        for (const rango of paginado.pageRanges) {
            const pagina = paginado.fetch({ index: rango.index });
            for (const fila of pagina.data.asMappedResults()) {
                resultados.push({ id: Number(fila.id), tranid: fila.tranid });
                if (resultados.length >= limite) return resultados;
            }
        }
        return resultados;
    }

    /**
     * Líneas de inventario de una OV que aún tienen cantidad pendiente de ejecutar.
     * `lineId` corresponde al campo `line` de la OV y a `orderline` en la Ejecución.
     *
     * @param {number} idOrdenVenta
     * @returns {Array<object>}
     */
    function obtenerLineasPendientes(idOrdenVenta) {
        const sql = `
            SELECT
                tl.id AS lineid,
                tl.item AS item,
                BUILTIN.DF(tl.item) AS itemnombre,
                tl.itemtype AS itemtype,
                tl.inventorylocation AS ubicacion,
                BUILTIN.DF(tl.inventorylocation) AS ubicacionnombre,
                ABS(NVL(tl.quantity, 0)) AS cantidad,
                ABS(NVL(tl.quantityshiprecv, 0)) AS ejecutada,
                ABS(NVL(tl.quantitycommitted, 0)) AS comprometida,
                TO_CHAR(tl.linecreateddate, 'YYYY-MM-DD') AS fechalinea,
                i.islotitem AS eslote,
                i.isserialitem AS esserie,
                loc.${CAMPOS.UBICACION_ES_AUTOPICKING} AS esautopicking,
                loc.isinactive AS ubicacioninactiva
            FROM transactionline tl
            INNER JOIN item i ON i.id = tl.item
            LEFT JOIN location loc ON loc.id = tl.inventorylocation
            WHERE tl.transaction = ?
              AND ${condicionLineaPendiente("tl")}
            ORDER BY tl.id ASC
        `;

        return query
            .runSuiteQL({ query: sql, params: [Number(idOrdenVenta)] })
            .asMappedResults()
            .map((f) => {
                const cantidad = parseFloat(f.cantidad || 0);
                const ejecutada = parseFloat(f.ejecutada || 0);
                return {
                    lineId: String(f.lineid),
                    item: Number(f.item),
                    itemNombre: f.itemnombre,
                    itemType: f.itemtype,
                    ubicacion: f.ubicacion ? Number(f.ubicacion) : null,
                    ubicacionNombre: f.ubicacionnombre,
                    ubicacionInactiva: f.ubicacioninactiva === "T",
                    esAutopicking: f.esautopicking === "T",
                    cantidad,
                    ejecutada,
                    pendiente: Math.max(0, cantidad - ejecutada),
                    comprometida: parseFloat(f.comprometida || 0),
                    fechaLinea: f.fechalinea || null,
                    esLote: f.eslote === "T",
                    esSerie: f.esserie === "T"
                };
            });
    }

    return { buscarCandidatas, obtenerLineasPendientes };
});
