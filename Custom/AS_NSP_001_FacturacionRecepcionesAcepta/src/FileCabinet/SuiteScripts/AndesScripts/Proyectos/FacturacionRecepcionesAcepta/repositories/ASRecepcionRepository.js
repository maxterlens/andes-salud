/**
 * @module ASRecepcionRepository
 * @description Acceso a datos de recepciones (Item Receipt) en NetSuite.
 *              Provee búsqueda del internal ID a partir del tranId.
 */
define([
    'N/search',
    '../commons/constants'
], function (search, C) {

    /**
     * Busca una recepción por su tranId y retorna su internal ID.
     *
     * @param   {string} tranId - Número de documento de la recepción (ej: 'REC-0001')
     * @returns {string|null}   Internal ID de la recepción, o null si no se encuentra
     */
    function obtenerIdPorTranId(tranId) {
        var resultados = search.create({
            type:    C.TIPOS_TRANSACCION.RECEPCION,
            filters: [
                ['tranid', search.Operator.IS, tranId],
                'AND',
                ['mainline', search.Operator.IS, 'T'],
            ],
            columns: [search.createColumn({ name: 'internalid' })],
        }).run().getRange({ start: 0, end: 1 });

        if (!resultados.length) return null;
        return resultados[0].id;
    }

    return {
        obtenerIdPorTranId,
    };
});
