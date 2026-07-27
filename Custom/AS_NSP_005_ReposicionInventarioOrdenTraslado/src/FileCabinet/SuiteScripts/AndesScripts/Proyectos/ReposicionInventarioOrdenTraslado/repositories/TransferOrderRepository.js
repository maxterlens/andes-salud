/**
 * @NApiVersion 2.1
 * @NModuleScope SameAccount
 *
 * @name        TransferOrderRepository.js
 * @description Repositorio de escritura de Órdenes de Traslado.
 *              Responsabilidad exclusiva: crear el record Transfer Order en NetSuite.
 */
define(['N/record', 'N/log'], (record, log) => {

    /**
     * Crea una Orden de Traslado con los artículos y cantidades indicados.
     *
     * @param {Object}         params
     * @param {string|number}  params.subsidiaryId  Internal ID de la subsidiaria
     * @param {string|number}  params.locationFrom  Internal ID de la ubicación origen
     * @param {string|number}  params.locationTo    Internal ID de la ubicación destino
     * @param {Array<{
     *   itemInternalId: string|number,
     *   qtyToOrder: number
     * }>}                     params.items         Líneas a incluir en la OT
     * @returns {number} Internal ID de la Orden de Traslado creada
     */
    const create = ({ subsidiaryId, locationFrom, locationTo, items }) => {
        const toRec = record.create({
            type      : record.Type.TRANSFER_ORDER,
            isDynamic : true
        });

        toRec.setValue({ fieldId: 'subsidiary',       value: parseInt(subsidiaryId, 10) });
        toRec.setValue({ fieldId: 'location',         value: parseInt(locationFrom, 10) });
        toRec.setValue({ fieldId: 'transferlocation', value: parseInt(locationTo,   10) });

        items.forEach(item => {
            toRec.selectNewLine({ sublistId: 'item' });
            toRec.setCurrentSublistValue({
                sublistId : 'item',
                fieldId   : 'item',
                value     : parseInt(item.itemInternalId, 10)
            });
            toRec.setCurrentSublistValue({
                sublistId : 'item',
                fieldId   : 'quantity',
                value     : item.qtyToOrder
            });
            toRec.commitLine({ sublistId: 'item' });
        });

        const toId = toRec.save({ enableSourcing: true, ignoreMandatoryFields: false });
        log.error('TransferOrderRepository.create',
            `Orden de Traslado creada: ID ${toId} | Líneas: ${items.length}`
        );
        return toId;
    };

    return { create };
});
