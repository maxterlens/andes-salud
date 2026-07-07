/**
 * @module ASOrdenCompraRepository
 * @description Acceso a datos de Órdenes de Compra (Purchase Order) en NetSuite.
 *              Provee búsqueda por tranId y validación de estado de facturación.
 */
define([
    'N/search',
    '../commons/constants'
], function (search, C) {

    /**
     * Busca una Orden de Compra por su tranId y retorna su internal ID.
     *
     * @param   {string} tranId - Número de documento de la OC (ej: 'OC-0001')
     * @returns {string|null}   Internal ID de la OC, o null si no se encuentra
     */
    function obtenerIdPorTranId(tranId) {
        var resultados = search.create({
            type:    C.TIPOS_TRANSACCION.ORDEN_COMPRA,
            filters: [
                ['tranid',   search.Operator.IS, tranId],
                'AND',
                ['mainline', search.Operator.IS, 'T'],
            ],
            columns: [search.createColumn({ name: 'internalid' })],
        }).run().getRange({ start: 0, end: 1 });

        if (!resultados.length) return null;
        return resultados[0].id;
    }

    /**
     * Determina si una Orden de Compra está totalmente facturada.
     * Una OC totalmente facturada tiene status 'Fully Billed' (PurchOrd:F),
     * lo que impide generar una nueva factura de compra desde ella.
     *
     * @param   {string|number} ocId - Internal ID de la OC
     * @returns {boolean}            true si está totalmente facturada
     */
    function estaFacturadaTotalmente(ocId) {
        var resultados = search.create({
            type:    C.TIPOS_TRANSACCION.ORDEN_COMPRA,
            filters: [
                ['internalid', search.Operator.ANYOF, ocId],
                'AND',
                ['mainline',   search.Operator.IS,    'T'],
                'AND',
                ['status',     search.Operator.ANYOF, 'PurchOrd:G'],
            ],
            columns: [search.createColumn({ name: 'internalid' })],
        }).run().getRange({ start: 0, end: 1 });

        return resultados.length > 0;
    }

    return {
        obtenerIdPorTranId,
        estaFacturadaTotalmente,
    };
});
