/**
 * @NApiVersion 2.1
 * @NModuleScope SameAccount
 * @file PagoAnticipadoProveedorRepository.js
 * @description Acceso a datos para la validación del importe del Pago Anticipado
 * de Proveedor (Vendor Prepayment) contra el total de la Orden de Compra asociada.
 */
define(['N/search'], (search) => {

    /**
     * Obtiene el total de la Orden de Compra.
     *
     * @param {string|number} ocId - ID interno de la Orden de Compra.
     * @returns {number} Total de la OC.
     */
    const obtenerTotalOC = (ocId) => {
        const campos = search.lookupFields({
            type: search.Type.PURCHASE_ORDER,
            id: ocId,
            columns: ['total']
        });

        return Number(campos.total) || 0;
    };

    /**
     * Suma el importe aplicado (columna 'amount') de los Pagos Anticipados de
     * Proveedor ya contabilizados y no anulados, aplicados a la misma Orden de Compra.
     *
     * @param {string|number} ocId - ID interno de la Orden de Compra.
     * @param {string|number} [idExcluir] - ID interno del Pago Anticipado que se
     * está editando (se excluye de la suma para no contarlo dos veces).
     * @returns {number} Suma de los importes de los Pagos Anticipados existentes.
     */
    const obtenerSumaPagosAnticipadosExistentes = (ocId, idExcluir) => {
        const filtros = [
            ['type', 'anyof', 'VPrep'],
            'AND', ['appliedtotransaction', 'anyof', ocId],
        ];

        if (idExcluir && idExcluir !== '0') {
            filtros.push('AND', ['internalidnumber', 'notequalto', idExcluir]);
        }

        let suma = 0;

        search.create({
            type: 'vendorprepayment',
            settings: [
                { name: 'consolidationtype', value: 'NONE' },
                { name: 'includeperiodendtransactions', value: 'F' }
            ],
            filters: filtros,
            columns: [
                search.createColumn({ name: 'tranid', label: 'Número de documento' }),
                search.createColumn({ name: 'appliedtotransaction', label: 'Aplicado a la transacción' }),
                search.createColumn({ name: 'amount', label: 'Importe' })
            ]
        }).run().each((resultado) => {
            let i = resultado.id;
            suma += Math.abs(Number(resultado.getValue({ name: 'amount' }))) || 0;
            return true;
        });

        return suma;
    };

    return {
        obtenerTotalOC,
        obtenerSumaPagosAnticipadosExistentes
    };
});
