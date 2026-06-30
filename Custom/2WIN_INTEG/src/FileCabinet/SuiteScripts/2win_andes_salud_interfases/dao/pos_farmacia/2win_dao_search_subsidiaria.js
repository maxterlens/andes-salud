/**
 * @NApiVersion 2.x
 * @NModule 2win_dao_search_subsidiaria
 * @NModuleScope public
 */

define(['N/search', 'N/log', '../2win_dao'], function(search, log, getData) {
    /**
     * @description Busca una subsidiaria por el RUT.
     * @param {*} rutSubsidiaria 
     * @returns 
     */
    function searchSubsidiaria(rutSubsidiaria) {
        try{
            log.debug({
                title: 'parámetro Subsidiaria',
                details: rutSubsidiaria
            });

            var searchResult = {
                type: 'subsidiary',
                filters: [
                    ['custrecord_2winrutsubsiudiaria', 'contains', rutSubsidiaria]
                ],
                columns: [
                    search.createColumn({ name: 'internalid', label: 'internal_id' })
                ]
            };

            var resultSubsidiaria = getData.obtenerResultados(searchResult);

            if(resultSubsidiaria.length === 0){
                return { success: false, error: 'No se encontró Subsidiaria con RUT: ' + rutSubsidiaria };
            }

            return { success: true, result: resultSubsidiaria[0].internal_id };

        } catch (error) {
            log.error({
                title: 'Error en búsqueda de Subsidiaria',
                details: error
            });

            return { success: false, error: error.message };
        }

    }
    return {
        searchSubsidiaria: searchSubsidiaria
    };
});
