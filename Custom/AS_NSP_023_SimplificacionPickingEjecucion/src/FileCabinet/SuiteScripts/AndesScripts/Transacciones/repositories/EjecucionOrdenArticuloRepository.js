/**
 * @NApiVersion 2.1
 * @NModuleScope SameAccount
 * @file EjecucionOrdenArticuloRepository.js
 * @description Repository — acceso a datos de la Ejecución de Orden de Artículo (Item Fulfillment).
 */
define([
    'N/record',
    'N/search'
], (record, search) => {

    /**
     * Obtiene el tipo de la transacción origen (createdfrom) de la ejecución.
     * @param {number|string} createdFromId - ID interno de la transacción origen.
     * @returns {string|null} Tipo de transacción (ej. 'TrnfrOrd', 'SalesOrd') o null.
     */
    const obtenerTipoTransaccionOrigen = (createdFromId) => {
        const { type } = search.lookupFields({
            type: search.Type.TRANSACTION,
            id: createdFromId,
            columns: ['type']
        });
        return type?.[0]?.value || null;
    };

    /**
     * Actualiza el estado de envío (shipstatus) de la ejecución.
     * @param {number|string} id - ID interno de la ejecución.
     * @param {string} estado - Estado de envío ('A' Picked, 'B' Packed, 'C' Shipped).
     * @returns {number} ID del registro actualizado.
     */
    const actualizarEstadoEnvio = (id, estado) => {
        return record.submitFields({
            type: record.Type.ITEM_FULFILLMENT,
            id,
            values: { shipstatus: estado },
            options: { enableSourcing: false, ignoreMandatoryFields: true }
        });
    };

    return {
        obtenerTipoTransaccionOrigen,
        actualizarEstadoEnvio
    };
});
