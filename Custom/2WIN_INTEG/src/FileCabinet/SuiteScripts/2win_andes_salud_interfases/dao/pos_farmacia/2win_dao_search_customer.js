/**
 * @NApiVersion 2.x
 * @module 2win_dao_search_customer
 * @NModuleScope Public
 */

define(['N/search', 'N/log', '../2win_dao'], function(search, log, libGetDataSearch) {

    function buscarClientePorExtId(externalId) {
        try {
            log.debug('buscarClientePorExtId - externalId', externalId);
            if(!externalId) throw new Error('External ID es requerido para buscar cliente.');
            var customerSearch = {
                type: "customer",
                filters:
                [
                    ["externalid","anyof", externalId]
                ],
                columns:
                [
                    search.createColumn({name: "internalid", label: "internal_id"})
                ]
            }
            var resultados = libGetDataSearch.obtenerResultados(customerSearch)[0]
            if(!resultados) throw new Error('No se encontró cliente con externalId: ' + externalId);

            return { success: true, result: resultados.internal_id };
            
        } catch (e) {
            log.error({
                title: 'Error en buscarClientePorExtId',
                details: e
            });

           return { success: false, error: e.message };
        }
    }

    return {
        buscarClientePorExtId: buscarClientePorExtId
    };
});