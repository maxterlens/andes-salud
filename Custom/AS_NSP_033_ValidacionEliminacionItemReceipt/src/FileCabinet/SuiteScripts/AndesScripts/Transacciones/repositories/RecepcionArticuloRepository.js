/**
 * @NApiVersion 2.1
 * @NModuleScope SameAccount
 * @file RecepcionArticuloRepository.js
 * @description Repository — acceso a datos de lotes de la Recepción de Artículo vía N/search.
 */
define([
    'N/log',
    'N/search'
], (log, search) => {

    /**
     * Lotes ingresados por la recepción, agrupados por artículo, ubicación y lote.
     * @param {number|string} recepcionId - Internal ID de la recepción.
     * @returns {Array<Object>}
     */
    function obtenerLotesIngresados(recepcionId) {
        const resultados = [];

        search.create({
            type: search.Type.ITEM_RECEIPT,
            filters: [
                ['internalid', 'anyof', recepcionId],
                'AND', ['mainline', 'is', 'F'],
                'AND', ['taxline', 'is', 'F'],
                'AND', ['inventorydetail.inventorynumber', 'noneof', '@NONE@']
            ],
            columns: [
                search.createColumn({ name: 'item', summary: search.Summary.GROUP }),
                search.createColumn({ name: 'location', summary: search.Summary.GROUP }),
                search.createColumn({ name: 'inventorynumber', join: 'inventorydetail', summary: search.Summary.GROUP }),
                search.createColumn({ name: 'quantity', join: 'inventorydetail', summary: search.Summary.SUM })
            ]
        }).run().each((r) => {
            resultados.push({
                itemId: r.getValue({ name: 'item', summary: search.Summary.GROUP }),
                articulo: r.getText({ name: 'item', summary: search.Summary.GROUP }),
                ubicacionId: r.getValue({ name: 'location', summary: search.Summary.GROUP }),
                ubicacion: r.getText({ name: 'location', summary: search.Summary.GROUP }),
                loteId: r.getValue({ name: 'inventorynumber', join: 'inventorydetail', summary: search.Summary.GROUP }),
                lote: r.getText({ name: 'inventorynumber', join: 'inventorydetail', summary: search.Summary.GROUP }),
                cantidadRecepcion: Math.abs(Number(
                    r.getValue({ name: 'quantity', join: 'inventorydetail', summary: search.Summary.SUM })
                ) || 0)
            });
            return true;
        });

        return resultados;
    }

    /**
     * Saldo físico actual por lote y ubicación.
     * @param {Array<string>} loteIds - Internal IDs de los lotes.
     * @param {Array<string>} ubicacionIds - Internal IDs de las ubicaciones.
     * @returns {Object} Mapa { 'loteId|ubicacionId': cantidad }.
     */
    function obtenerFisicoLotes(loteIds, ubicacionIds) {
        const mapa = {};
        if (!loteIds.length || !ubicacionIds.length) return mapa;

        search.create({
            type: 'inventorynumber',
            filters: [
                ['internalid', 'anyof', loteIds],
                'AND', ['location', 'anyof', ubicacionIds]
            ],
            columns: ['location', 'quantityonhand']
        }).run().each((r) => {
            const key = `${r.id}|${r.getValue('location')}`;
            mapa[key] = (mapa[key] || 0) + (Number(r.getValue('quantityonhand')) || 0);
            return true;
        });

        return mapa;
    }

    /**
     * Obtiene, por lote y ubicación, la cantidad ingresada por la recepción
     * y el saldo físico actual del lote.
     * @param {number|string} recepcionId - Internal ID de la recepción.
     * @returns {Array<Object>} Lotes de la recepción.
     */
    function obtenerLotesRecepcion(recepcionId) {
        const lotes = obtenerLotesIngresados(recepcionId);
        if (!lotes.length) return [];

        const unicos = (arr) => Array.from(new Set(arr.filter(Boolean)));
        const fisico = obtenerFisicoLotes(
            unicos(lotes.map((l) => l.loteId)),
            unicos(lotes.map((l) => l.ubicacionId))
        );

        return lotes.map((l) => Object.assign({}, l, {
            fisicoActual: fisico[`${l.loteId}|${l.ubicacionId}`] || 0
        }));
    }

    // Tipos que siempre representan salida del lote en la ubicación de la línea.
    // (En la búsqueda, la cantidad de una ejecución viene en positivo.)
    const TIPOS_SALIDA = ['ItemShip', 'WOIssue'];

    // Tipos que pueden ser entrada o salida: se filtran por cantidad negativa.
    const TIPOS_SALIDA_SI_NEGATIVO = ['InvAdjst', 'InvTrnfr', 'Build', 'InvCount', 'InvWksht'];

    /**
     * Salidas de los lotes en sus ubicaciones (ejecuciones, ajustes, traslados,
     * consumos de producción, etc.) desde la fecha de la recepción.
     * Ejecuciones y consumos de OT se consideran siempre salida; para ajustes, transferencias,
     * ensamblajes y conteos se toman solo las líneas con cantidad negativa en la ubicación.
     * @param {Object} params
     * @param {number|string} params.recepcionId - Recepción a excluir.
     * @param {string} [params.fechaDesde] - Fecha (formato del usuario) desde la cual buscar.
     * @param {Array<string>} params.loteIds - Internal IDs de los lotes.
     * @param {Array<string>} params.ubicacionIds - Internal IDs de las ubicaciones.
     * @returns {Object} Mapa { 'loteId|ubicacionId': Array<Object> }, del más reciente al más antiguo.
     */
    function obtenerConsumosLotes({ recepcionId, fechaDesde, loteIds, ubicacionIds }) {
        const mapa = {};

        // Solo IDs numéricos: se insertan dentro de una fórmula.
        const ids = loteIds.map((id) => parseInt(id, 10)).filter((id) => !isNaN(id));
        if (!ids.length || !ubicacionIds.length) return mapa;

        // El filtro 'inventorydetail.inventorynumber' no devuelve resultados en esta cuenta;
        // se filtra por fórmula sobre {inventorydetail.inventorynumber.id}.
        const FORMULA_LOTE = '{inventorydetail.inventorynumber.id}';

        const filtros = [
            [`formulanumeric: CASE WHEN ${FORMULA_LOTE} IN (${ids.join(',')}) THEN 1 ELSE 0 END`, 'equalto', 1],
            'AND', ['location', 'anyof', ubicacionIds],
            'AND', ['internalid', 'noneof', recepcionId],
            // Sin filtros mainline/taxline/cogs: la fórmula del lote ya limita a las filas
            // con detalle de inventario (en esta cuenta 'cogs = F' excluía la fila de la ejecución).
            'AND', [
                ['type', 'anyof', TIPOS_SALIDA],
                'OR', [
                    ['type', 'anyof', TIPOS_SALIDA_SI_NEGATIVO],
                    'AND', ['quantity', 'lessthan', 0]
                ]
            ]
        ];
        if (fechaDesde) filtros.push('AND', ['trandate', 'onorafter', fechaDesde]);

        const col = {
            tipo: search.createColumn({ name: 'type' }),
            numero: search.createColumn({ name: 'tranid' }),
            fecha: search.createColumn({ name: 'trandate', sort: search.Sort.DESC }),
            ubicacion: search.createColumn({ name: 'location' }),
            lote: search.createColumn({ name: 'formulanumeric', formula: FORMULA_LOTE }),
            cantidad: search.createColumn({ name: 'quantity', join: 'inventoryDetail' })
        };

        // Agrupa por transacción + lote + ubicación (una línea puede traer varias asignaciones).
        const porTransaccion = {};

        search.create({
            type: search.Type.TRANSACTION,
            settings: [
                { name: 'consolidationtype', value: 'NONE' },
                { name: 'includeperiodendtransactions', value: 'F' }
            ],
            filters: filtros,
            columns: Object.keys(col).map((k) => col[k])
        }).run().each((r) => {
            const loteId = String(parseInt(r.getValue(col.lote), 10));
            const key = `${loteId}|${r.getValue(col.ubicacion)}`;
            const keyTx = `${key}|${r.id}`;

            if (!porTransaccion[keyTx]) {
                porTransaccion[keyTx] = {
                    id: r.id,
                    tipoId: r.getValue(col.tipo),
                    tipo: r.getText(col.tipo),
                    numero: r.getValue(col.numero),
                    fecha: r.getValue(col.fecha),
                    cantidad: 0
                };
                (mapa[key] = mapa[key] || []).push(porTransaccion[keyTx]);
            }
            porTransaccion[keyTx].cantidad += Math.abs(Number(r.getValue(col.cantidad)) || 0);
            return true;
        });

        if (!Object.keys(mapa).length) {
            log.audit({
                title: `Consumos sin resultados - Recepción ${recepcionId}`,
                details: JSON.stringify({ fechaDesde, loteIds: ids, ubicacionIds, filtros })
            });
        }

        return mapa;
    }

    return {
        obtenerLotesRecepcion,
        obtenerConsumosLotes
    };
});
