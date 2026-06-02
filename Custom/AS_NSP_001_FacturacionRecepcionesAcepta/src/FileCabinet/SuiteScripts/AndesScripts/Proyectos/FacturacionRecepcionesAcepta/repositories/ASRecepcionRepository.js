/**
 * @module ASRecepcionRepository
 * @description Acceso a datos de recepciones (Item Receipt) en NetSuite.
 *              Provee búsqueda por tranId, obtención de la OC asociada
 *              y lectura de líneas de ítem con sus cantidades recibidas.
 */
define([
    'N/search',
    'N/record',
    '../commons/constants'
], function (search, record, C) {

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

    /**
     * Retorna el internal ID de la Orden de Compra asociada a la recepción
     * a través del campo createdfrom del itemreceipt.
     * Usa lookupFields para evitar cargar el record completo.
     *
     * SUPUESTO: cada recepción está asociada a exactamente una OC.
     *
     * @param   {string|number} recepcionId - Internal ID de la recepción
     * @returns {string|null}               Internal ID de la OC, o null si no tiene
     */
    function obtenerOcId(recepcionId) {
        var campos = search.lookupFields({
            type:    C.TIPOS_TRANSACCION.RECEPCION,
            id:      recepcionId,
            columns: ['createdfrom'],
        });

        var createdfrom = campos.createdfrom;
        if (!createdfrom || !createdfrom.length) return null;
        return createdfrom[0].value;
    }

    /**
     * Carga la recepción y retorna un mapa de los ítems recibidos con su cantidad total.
     * Si un mismo ítem aparece en varias líneas (distintos lotes), las cantidades se suman,
     * de modo que el vendorbill resultante refleje la cantidad total recibida por ítem.
     *
     * SUPUESTO: los lotes identifican unidades recibidas, pero el vendorbill solo requiere
     *           la cantidad total por ítem (no tiene detalle de lote).
     *
     * @param   {string|number} recepcionId - Internal ID de la recepción
     * @returns {Object}  Mapa itemId → { quantity: number }
     */
    function obtenerLineasPorItem(recepcionId) {
        var recepcion   = record.load({
            type:      C.TIPOS_TRANSACCION.RECEPCION,
            id:        recepcionId,
            isDynamic: false,
        });

        var lineas      = {};
        var totalLineas = recepcion.getLineCount({ sublistId: 'item' });

        for (var i = 0; i < totalLineas; i++) {
            var itemId = recepcion.getSublistValue({ sublistId: 'item', fieldId: 'item', line: i });
            if (!itemId) continue;

            var cantidad = parseFloat(recepcion.getSublistValue({
                sublistId: 'item',
                fieldId:   'quantity',
                line:      i,
            })) || 0;

            if (lineas[itemId]) {
                // Mismo ítem en distintos lotes → sumar cantidades
                lineas[itemId].quantity += cantidad;
            } else {
                lineas[itemId] = { quantity: cantidad };
            }
        }

        return lineas;
    }

    return {
        obtenerIdPorTranId,
        obtenerOcId,
        obtenerLineasPorItem,
    };
});
