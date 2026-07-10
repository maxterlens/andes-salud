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
     * Carga la recepción y retorna un mapa de los ítems recibidos con su cantidad total
     * y los lotes/series efectivamente recibidos (inventoryAssignments).
     *
     * Si un mismo ítem aparece en varias líneas (distintos lotes), las cantidades se suman
     * y los inventory assignments se acumulan en el arreglo del ítem.
     *
     * @param   {string|number} recepcionId - Internal ID de la recepción
     * @returns {Object}  Mapa itemId → { quantity: number, inventoryAssignments: Array }
     *                    inventoryAssignments: [{ receiptinventorynumber, quantity, expirationdate }]
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

            // Leer los lotes/series del inventorydetail de esta línea
            var assignments = [];
            try {
                var invDetail = recepcion.getSublistSubrecord({
                    sublistId: 'item',
                    fieldId:   'inventorydetail',
                    line:      i,
                });
                if (invDetail) {
                    var totalAssignments = invDetail.getLineCount({ sublistId: 'inventoryassignment' });
                    for (var k = 0; k < totalAssignments; k++) {
                        assignments.push({
                            receiptinventorynumber: invDetail.getSublistValue({
                                sublistId: 'inventoryassignment',
                                fieldId:   'receiptinventorynumber',
                                line:      k,
                            }),
                            quantity: parseFloat(invDetail.getSublistValue({
                                sublistId: 'inventoryassignment',
                                fieldId:   'quantity',
                                line:      k,
                            })) || 0,
                            expirationdate: invDetail.getSublistValue({
                                sublistId: 'inventoryassignment',
                                fieldId:   'expirationdate',
                                line:      k,
                            }),
                        });
                    }
                }
            } catch (e) {
                // Ítem sin detalle de inventario; assignments queda vacío.
            }

            if (lineas[itemId]) {
                // Mismo ítem en distintos lotes → sumar cantidad y acumular assignments
                lineas[itemId].quantity += cantidad;
                lineas[itemId].inventoryAssignments = lineas[itemId].inventoryAssignments.concat(assignments);
            } else {
                lineas[itemId] = { quantity: cantidad, inventoryAssignments: assignments };
            }
        }

        return lineas;
    }

    /**
     * Carga la recepción y construye un conjunto de claves únicas para cada línea
     * del sublist 'expense', usando el formato 'accountId|amount'.
     *
     * Se utiliza para filtrar los gastos del vendorbill generado desde la OC:
     * solo se conservan las líneas expense cuya combinación account+importe
     * exista en la recepción.
     *
     * @param   {string|number} recepcionId - Internal ID de la recepción
     * @returns {Object}  Mapa de claves 'accountId|amount' → true
     */
    function obtenerGastosPorClave(recepcionId) {
        var recepcion   = record.load({
            type:      C.TIPOS_TRANSACCION.RECEPCION,
            id:        recepcionId,
            isDynamic: false,
        });

        var claves      = {};
        var totalLineas = recepcion.getLineCount({ sublistId: 'expense' });

        for (var i = 0; i < totalLineas; i++) {
            var accountId = recepcion.getSublistValue({ sublistId: 'expense', fieldId: 'account', line: i });
            if (!accountId) continue;

            var amount = parseFloat(recepcion.getSublistValue({
                sublistId: 'expense',
                fieldId:   'amount',
                line:      i,
            })) || 0;

            claves[accountId + '|' + amount] = true;
        }

        return claves;
    }

    /**
     * Retorna el proveedor (entity) y la subsidiaria de la recepción.
     * Usa lookupFields para evitar cargar el record completo.
     * Ambos campos son SELECT en NetSuite, por lo que lookupFields
     * los retorna como arrays de { value, text }.
     *
     * @param   {string|number} recepcionId - Internal ID de la recepción
     * @returns {{ entity: string|null, subsidiary: string|null }}
     */
    function obtenerVendorYSubsidiaria(recepcionId) {
        var campos = search.lookupFields({
            type:    C.TIPOS_TRANSACCION.RECEPCION,
            id:      recepcionId,
            columns: ['entity', 'subsidiary'],
        });

        var entity     = campos.entity     && campos.entity.length     ? campos.entity[0].value     : null;
        var subsidiary = campos.subsidiary && campos.subsidiary.length ? campos.subsidiary[0].value : null;

        return { entity: entity, subsidiary: subsidiary };
    }

    return {
        obtenerIdPorTranId,
        obtenerOcId,
        obtenerLineasPorItem,
        obtenerGastosPorClave,
        obtenerVendorYSubsidiaria,
    };
});
