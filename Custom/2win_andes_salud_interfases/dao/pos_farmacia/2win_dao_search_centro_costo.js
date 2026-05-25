/**
 * @NApiVersion 2.x
 * @module 2win_dao_search_centro_costo
 * @NModuleScope Public
 */

define(['N/search', 'N/log', 'N/cache'], function(search, log, cache) {

    function getIdCentroCostoUbicacion(locationId) {
            try {
                // OPTIMIZACIÓN: Usar N/cache real de NetSuite
                var centroCostoCache = cache.getCache({
                    name: 'POS_CENTRO_COSTO',
                    scope: cache.Scope.PUBLIC
                });

                var cacheKey = 'cc_location_' + locationId;
                var cachedData = centroCostoCache.get({ key: cacheKey });

                if (cachedData) {
                    return { success: true, result: cachedData };
                }

                var locationSearch = search.lookupFields({
                    type: search.Type.LOCATION,
                    id: locationId,
                    columns: ['custrecord_2win_ubi_as_codigo_centro_cos']
                });

                var resultCentroCosto = locationSearch.custrecord_2win_ubi_as_codigo_centro_cos;
                var centroCostoId = resultCentroCosto[0].value;

                // OPTIMIZACIÓN: Guardar en cache por 24 horas
                centroCostoCache.put({
                    key: cacheKey,
                    value: centroCostoId,
                    ttl: 900 //15 Min. //86400 // 24 horas
                });

                return { success: true, result: centroCostoId };

            } catch (error) {
                log.error({
                    title: 'Error al obtener Centro de Costo desde Ubicación',
                    details: error
                });

                return { success: false, error: error.message || error };
            }
        }
    return {
        getIdCentroCostoUbicacion: getIdCentroCostoUbicacion
    };
});