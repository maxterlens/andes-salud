/**
 * @NApiVersion 2.x
 * @module ./2win_dao_search_discounts
 * @NModuleScope Public
 */

define(['N/search', 'N/log', '../2win_dao', 'N/cache'], function(search, log, getData, cache) {

    /**
     * @description Busqueda de descuentos en netsuite
     * @returns
     */
    function searchDiscounts() {
        try {
            var discountCache = cache.getCache({
                name: 'POS_DISCOUNTS',
                scope: cache.Scope.PUBLIC
            });

            var cachedData = discountCache.get({ key: 'all_discounts' });

            if (cachedData) {
                log.debug('searchDiscounts', 'Obtenido desde cache');
                return { success: true, result: JSON.parse(cachedData) };
            }

            log.debug('searchDiscounts', 'No encontrado en cache, ejecutando búsqueda');

            var objDiscountSearch = {
                type: "discountitem",
                filters:
                [
                    ["type","anyof","Discount"]
                ],
                columns:
                [
                    search.createColumn({name: "internalid", label: "internal_id"}),
                    search.createColumn({name: "itemid", label: "name"}),
                    search.createColumn({name: "baseprice", label: "discount_rate"})
                ]
            };

            var results = getData.obtenerResultados(objDiscountSearch);

            discountCache.put({
                key: 'all_discounts',
                value: JSON.stringify(results),
                ttl: 900 //15 Min. //86400 // 24 horas
            });

            return { success: true, result: results };
         
        } catch (error) {
            log.error({
                title: 'Error en searchDiscounts',
                details: error
            });
            return { success: false, result: error.message };
        }
    }

    return {
        searchDiscounts: searchDiscounts
    };
});