/**
 * @NApiVersion 2.1
 * @NModuleScope SameAccount
 *
 * @description AS_NSP_031 - Lectura de la cola de autopicking existente.
 *              Solo consulta: este proyecto nunca crea ni modifica registros de la cola.
 *              Se usa para no procesar OV que el autopicking en línea va a tomar.
 */
define(["N/query", "../constants/AutopickingConstants"], (query, CONST) => {
    const { COLA_AUTOPICKING } = CONST;

    /**
     * @param {number} idOrdenVenta
     * @returns {boolean} true si la OV tiene un registro Pendiente en la cola
     */
    function tienePendiente(idOrdenVenta) {
        const sql = `
            SELECT COUNT(*) AS total
            FROM ${COLA_AUTOPICKING.TIPO} q
            WHERE q.${COLA_AUTOPICKING.CAMPO_ORDEN_VENTA} = ?
              AND q.${COLA_AUTOPICKING.CAMPO_ESTADO} = ?
              AND NVL(q.isinactive, 'F') = 'F'
        `;
        const filas = query
            .runSuiteQL({ query: sql, params: [Number(idOrdenVenta), Number(COLA_AUTOPICKING.ESTADO_PENDIENTE)] })
            .asMappedResults();
        return filas.length > 0 && Number(filas[0].total) > 0;
    }

    return { tienePendiente };
});
