/**
 * @NApiVersion 2.x
 * @NModule 2win_dao_search_ubicacion
 * @NModuleScope public
 */

define(['N/search', 'N/log', '../2win_dao'], function(search, log, getData) {
    /**
     * @description Busca una ubicación por el nombre.
     * @param {*} nameLocation 
     * @returns 
     */
    function searchUbicacion(codeLocation) {
        try {
            log.debug({
                title: 'parámetro Ubicación',
                details: codeLocation
            });

            var searchResult = {
                type: 'location',
                filters: [
                    ['custrecord_2w_codigo_ubicacion', 'contains', codeLocation]
                ],
                columns: [
                    search.createColumn({ name: 'internalid', label: 'internal_id' }),
                    search.createColumn({name: "custrecord_2win_ubi_as_codigo_centro_cos", label: "centro_costo"})
                ]
            };

            var result = getData.obtenerResultados(searchResult)[0].internal_id;

            return { success: true, result: result };

        } catch (error) {
            log.error({
                title: 'Error en búsqueda de Ubicación',
                details: error
            });

            return { success: false, error: error.message };
        }

    }
    return {
        searchUbicacion: searchUbicacion
    };
});
