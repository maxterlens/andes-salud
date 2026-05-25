/**
 * @NApiVersion 2.x
 * @module ./2win_dao_search_number_deposit
 * @NModuleScope Public
 */

define(['N/search', 'N/log', '../2win_dao'], function(search, log, getData) {
    /**
     * @description Busca el número de depósito (bin) asociado a una ubicación (location)
     * @param {*} locationId 
     * @returns 
     */
    function searchNumberDeposit(locationId) {
        try {
            var objDepositSearch = {
                type: "bin",
                filters:
                [
                    ["location","anyof", locationId]
                ],
                columns:
                [
                    search.createColumn({name: "internalid", label: "internal_id"})
                ]
            };

            var results = getData.obtenerResultados(objDepositSearch);

            log.debug({
                title: 'Resultado búsqueda Depósito',
                details: JSON.stringify(results)
            });

            return { success: true, result: results };
         
        } catch (error) {
            log.error({
                title: 'Error en searchNumberDeposit',
                details: error
            });
            return { success: false, result: error.message };
        }
    }

    return {
        searchNumberDeposit: searchNumberDeposit
    };
});