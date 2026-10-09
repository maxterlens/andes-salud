/**
 * @NApiVersion 2.1
 * @NModuleScope SameAccount
 * @file ClienteRepository.js
 * @description Repository — acceso a datos del registro Cliente (customer).
 */
define([
    'N/record',
    'N/query'
], (record, query) => {

    /**
     * Busca un cliente distinto al actual que tenga asignado el externalid indicado.
     * @param {string} idExterno - Valor de externalid a buscar.
     * @param {number|string} [excluirId] - ID interno del cliente actual (en edición).
     * @returns {{ id: number, entityid: string } | null}
     */
    const buscarClientePorIdExterno = (idExterno, excluirId) => {
        let sql = 'SELECT id, entityid FROM customer WHERE externalid = ?';
        const params = [idExterno];

        if (excluirId) {
            sql += ' AND id <> ?';
            params.push(Number(excluirId));
        }

        const resultados = query.runSuiteQL({ query: sql, params }).asMappedResults();
        return resultados.length ? resultados[0] : null;
    };

    /**
     * Actualiza el externalid del cliente sin disparar otros scripts ni validar campos obligatorios.
     * @param {number|string} clienteId - ID interno del cliente.
     * @param {string} idExterno - Nuevo valor de externalid ('' para limpiar).
     */
    const actualizarIdExterno = (clienteId, idExterno) => {
        record.submitFields({
            type: record.Type.CUSTOMER,
            id: clienteId,
            values: {
                externalid: idExterno
            },
            options: {
                disableTriggers: true,
                ignoreMandatoryFields: true
            }
        });
    };

    return { buscarClientePorIdExterno, actualizarIdExterno };
});
