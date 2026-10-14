/**
 * @NApiVersion 2.1
 * @NModuleScope SameAccount
 *
 * @description AS_NSP_031 - Consulta de existencias para asignar inventario a la Ejecución.
 *              Una sola consulta por OV, ordenada FEFO (primero en vencer, primero en salir).
 */
define(["N/query", "../constants/AutopickingConstants"], (query, CONST) => {
    const { REGLAS } = CONST;

    const listaTexto = (valores) => valores.map((v) => `'${String(v).replace(/'/g, "''")}'`).join(",");

    /**
     * Carga las existencias físicas por ítem/ubicación/lote/estado.
     *  - Excluye lotes vencidos a la fecha actual.
     *  - Excluye estados de inventario no consumibles (REGLAS.ESTADOS_INVENTARIO_EXCLUIDOS).
     *  - Usa la cantidad en existencia (on hand): la cantidad comprometida a la propia OV
     *    no está "disponible" y por eso no puede usarse quantityavailable.
     *
     * @param {number[]} itemIds
     * @param {number[]} ubicacionIds
     * @returns {Map<string, Array<{inventoryNumber: number|null, lote: string|null, estado: number|null, bin: number|null, cantidad: number}>>}
     *          Clave "item|ubicacion"
     */
    function cargarExistencias(itemIds, ubicacionIds) {
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

        const filas = query.runSuiteQL({ query: sql }).asMappedResults();
        for (const f of filas) {
            const clave = `${f.item}|${f.ubicacion}`;
            if (!mapa.has(clave)) mapa.set(clave, []);
            mapa.get(clave).push({
                inventoryNumber: f.inventorynumber ? Number(f.inventorynumber) : null,
                lote: f.lote || null,
                estado: f.estado ? Number(f.estado) : null,
                bin: f.bin ? Number(f.bin) : null,
                cantidad: parseFloat(f.cantidad || 0)
            });
        }
        return mapa;
    }

    return { cargarExistencias };
});
