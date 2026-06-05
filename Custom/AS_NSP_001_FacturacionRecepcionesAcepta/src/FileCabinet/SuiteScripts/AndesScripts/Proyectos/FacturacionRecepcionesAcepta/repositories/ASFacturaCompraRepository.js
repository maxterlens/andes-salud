/**
 * @module ASFacturaCompraRepository
 * @description Acceso a datos de facturas de compra (Vendor Bill) en NetSuite.
 *              Provee búsqueda por tranId, lectura de campos de cabecera,
 *              líneas de ítem y líneas de gasto (expense).
 */
define([
    'N/search',
    'N/record',
    '../commons/constants'
], function (search, record, C) {

    /**
     * Busca una factura de compra por su tranId y retorna su internal ID.
     * Si se proporcionan entity y/o subsidiary, se agregan como filtros adicionales
     * para acotar la búsqueda al proveedor y subsidiaria de la recepción de origen.
     *
     * @param   {string}      tranId     - Número de documento (ej: 'FC-0001')
     * @param   {string|null} entity     - Internal ID del proveedor (opcional)
     * @param   {string|null} subsidiary - Internal ID de la subsidiaria (opcional)
     * @returns {string|null}            Internal ID de la factura, o null si no se encuentra
     */
    function obtenerIdPorTranId(tranId, entity, subsidiary) {
        var filters = [
            ['tranid', search.Operator.IS, tranId],
            'AND',
            ['mainline', search.Operator.IS, 'T'],
        ];

        if (entity) {
            filters.push('AND');
            filters.push(['entity', search.Operator.ANYOF, entity]);
        }

        if (subsidiary) {
            filters.push('AND');
            filters.push(['subsidiary', search.Operator.ANYOF, subsidiary]);
        }

        var resultados = search.create({
            type:    C.TIPOS_TRANSACCION.FACTURA_COMPRA,
            filters: filters,
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
     * @returns {Object}           Mapa fieldId → valor
     */
    function obtenerCamposCabecera(id) {
        var factura = record.load({
            type:      C.TIPOS_TRANSACCION.FACTURA_COMPRA,
            id:        id,
            isDynamic: false,
        });

        var campos = {};
        C.CAMPOS_CABECERA_A_COPIAR.forEach(function (fieldId) {
            campos[fieldId] = factura.getValue({ fieldId: fieldId });
        });
        return campos;
    }

    /**
     * Carga la factura de compra y extrae las líneas del sublist 'item'.
     * Retorna un mapa indexado por item internal ID.
     *
     * @param   {string|number} id - Internal ID de la factura
     * @returns {Object}           Mapa itemId → { line, rate, amount }
     */
    function obtenerLineasPorItem(id) {
        var factura = record.load({
            type:      C.TIPOS_TRANSACCION.FACTURA_COMPRA,
            id:        id,
            isDynamic: false,
        });

        var lineas      = {};
        var totalLineas = factura.getLineCount({ sublistId: 'item' });

        for (var i = 0; i < totalLineas; i++) {
            var itemId = factura.getSublistValue({ sublistId: 'item', fieldId: 'item', line: i });
            if (!itemId) continue;

            lineas[itemId] = {
                line:   i,
                rate:   parseFloat(factura.getSublistValue({ sublistId: 'item', fieldId: 'rate',   line: i })) || 0,
                amount: parseFloat(factura.getSublistValue({ sublistId: 'item', fieldId: 'amount', line: i })) || 0,
            };
        }
        return lineas;
    }

    /**
     * Carga la factura de compra y construye un conjunto de claves únicas
     * para cada línea del sublist 'expense', usando el formato 'accountId|amount'.
     *
     * Se utiliza para filtrar los gastos del vendorbill generado desde la OC:
     * solo se conservan las líneas expense cuya combinación account+importe
     * exista en la factura del CSV de referencia.
     *
     * @param   {string|number} id - Internal ID de la factura del CSV
     * @returns {Object}           Mapa de claves 'accountId|amount' → true
     */
    function obtenerGastosPorClave(id) {
        var factura = record.load({
            type:      C.TIPOS_TRANSACCION.FACTURA_COMPRA,
            id:        id,
            isDynamic: false,
        });

        var claves      = {};
        var totalLineas = factura.getLineCount({ sublistId: 'expense' });

        for (var i = 0; i < totalLineas; i++) {
            var accountId = factura.getSublistValue({ sublistId: 'expense', fieldId: 'account', line: i });
            if (!accountId) continue;

            var amount = parseFloat(factura.getSublistValue({ sublistId: 'expense', fieldId: 'amount', line: i })) || 0;
            claves[accountId + '|' + amount] = true;
        }
        return claves;
    }

    /**
     * Actualiza el campo tranid de una factura de compra ya guardada
     * con el tranid de la factura de origen del CSV.
     * Se ejecuta con submitFields y triggers desactivados para evitar
     * efectos secundarios sobre la numeración interna de NetSuite.
     *
     * @param {string|number} nuevaFacturaId     - Internal ID de la factura recién creada
     * @param {string}        facturaOrigenTranId - TranId de la factura del CSV de referencia
     */
    function actualizarTranId(nuevaFacturaId, facturaOrigenTranId) {
        record.submitFields({
            type:   C.TIPOS_TRANSACCION.FACTURA_COMPRA,
            id:     nuevaFacturaId,
            values: { tranid: facturaOrigenTranId },
            options: {
                enableSourcing:        false,
                disableTriggers:       true,
                ignoreMandatoryFields: true,
            },
        });
    }

    return {
        obtenerIdPorTranId,
        obtenerCamposCabecera,
        obtenerLineasPorItem,
        obtenerGastosPorClave,
        actualizarTranId,
    };
});
