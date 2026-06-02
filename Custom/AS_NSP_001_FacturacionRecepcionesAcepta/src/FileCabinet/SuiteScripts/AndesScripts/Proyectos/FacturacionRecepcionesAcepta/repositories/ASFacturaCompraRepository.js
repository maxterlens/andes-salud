/**
 * @module ASFacturaCompraRepository
 * @description Acceso a datos de facturas de compra (Vendor Bill) en NetSuite.
 *              Provee búsqueda por tranId, lectura de campos de cabecera y líneas.
 */
define([
    'N/search',
    'N/record',
    '../commons/constants'
], function (search, record, C) {

    /**
     * Busca una factura de compra por su tranId y retorna su internal ID.
     *
     * @param   {string} tranId - Número de documento (ej: 'FC-0001')
     * @returns {string|null}   Internal ID de la factura, o null si no se encuentra
     */
    function obtenerIdPorTranId(tranId) {
        var resultados = search.create({
            type:    C.TIPOS_TRANSACCION.FACTURA_COMPRA,
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
     * Carga la factura de compra y extrae los valores de los campos de cabecera
     * definidos en C.CAMPOS_CABECERA_A_COPIAR.
     *
     * @param   {string|number} id - Internal ID de la factura
     * @returns {Object}           Mapa fieldId → valor (ej: { memo: 'Texto', terms: 3 })
     */
    function obtenerCamposCabecera(id) {
        var factura = record.load({
            type:                   C.TIPOS_TRANSACCION.FACTURA_COMPRA,
            id:                     id,
            isDynamic:              false,
        });

        var campos = {};
        C.CAMPOS_CABECERA_A_COPIAR.forEach(function (fieldId) {
            campos[fieldId] = factura.getValue({ fieldId: fieldId });
        });
        return campos;
    }

    /**
     * Carga la factura de compra y extrae las líneas del sublist 'item'.
     * Retorna un mapa indexado por item internal ID para facilitar la comparación.
     *
     * @param   {string|number} id - Internal ID de la factura
     * @returns {Object}           Mapa itemId → { line, rate, amount }
     *                             donde line es el índice 0-based de la línea
     */
    function obtenerLineasPorItem(id) {
        var factura = record.load({
            type:      C.TIPOS_TRANSACCION.FACTURA_COMPRA,
            id:        id,
            isDynamic: false,
        });

        var lineas = {};
        var totalLineas = factura.getLineCount({ sublistId: 'item' });

        for (var i = 0; i < totalLineas; i++) {
            var itemId = factura.getSublistValue({
                sublistId: 'item',
                fieldId:   'item',
                line:      i,
            });
            if (!itemId) continue;

            lineas[itemId] = {
                line:   i,
                rate:   parseFloat(factura.getSublistValue({ sublistId: 'item', fieldId: 'rate',   line: i })) || 0,
                amount: parseFloat(factura.getSublistValue({ sublistId: 'item', fieldId: 'amount', line: i })) || 0,
            };
        }
        return lineas;
    }

    return {
        obtenerIdPorTranId,
        obtenerCamposCabecera,
        obtenerLineasPorItem,
    };
});
