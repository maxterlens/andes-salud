/**
 * @NApiVersion 2.x
 * @NModule 2win_dao_search_tax_code
 * @NModuleScope public
 */

define(['N/search', 'N/log', '../2win_dao', 'N/cache'], function(search, log, getData, cache) {

    /**
     * @description Obtiene TODOS los tax codes de una sola vez y devuelve un mapa código -> internal_id
     * @returns {Object} Mapa de código IVA a internal ID, ej: {'19': 123, '0': 456}
     */
    function getAllTaxCodes() {
        try {
            // Intentar obtener del cache primero
            var taxCodeCache = cache.getCache({
                name: 'POS_TAX_CODES',
                scope: cache.Scope.PUBLIC
            });

            var cachedData = taxCodeCache.get({ key: 'all_tax_codes' });

            if (cachedData) {
                log.debug('getAllTaxCodes', 'Obtenido desde cache');
                return { success: true, result: JSON.parse(cachedData) };
            }

            log.debug('getAllTaxCodes', 'No encontrado en cache, ejecutando búsqueda');

            // Si no está en cache, hacer búsqueda completa
            var searchResult = {
                type: "salestaxitem",
                filters: [
                    [
                        ["name", "is", "IVA Afecto"],
                        "OR",
                        ["name", "is", "IVA Exento"]
                    ]
                ],
                columns: [
                    search.createColumn({name: "internalid", label: "internal_id"}),
                    search.createColumn({name: "name", label: "name"})
                ]
            };

            var resultTaxCodes = getData.obtenerResultados(searchResult);

            log.debug('getAllTaxCodes - resultados búsqueda', {
                cantidad: resultTaxCodes ? resultTaxCodes.length : 0,
                datos: resultTaxCodes
            });

            if (!resultTaxCodes || resultTaxCodes.length === 0) {
                return { success: false, error: 'No se encontraron tax codes en la búsqueda' };
            }

            // Crear mapa código -> internal_id
            var taxCodeMap = {};
            for (var i = 0; i < resultTaxCodes.length; i++) {
                var taxCode = resultTaxCodes[i];
                var name = taxCode.name;

                log.debug('getAllTaxCodes - procesando', {
                    index: i,
                    name: name,
                    internalId: taxCode.internal_id
                });

                // Mapear nombre a código
                if (name === 'IVA Afecto') {
                    taxCodeMap['19'] = taxCode.internal_id;
                } else if (name === 'IVA Exento') {
                    taxCodeMap['0'] = taxCode.internal_id;
                }
            }

            log.debug('getAllTaxCodes - mapa final', taxCodeMap);

            if (Object.keys(taxCodeMap).length === 0) {
                return { success: false, error: 'No se pudo mapear ningún tax code' };
            }

            // Guardar en cache por 24 horas (los tax codes raramente cambian)
            taxCodeCache.put({
                key: 'all_tax_codes',
                value: JSON.stringify(taxCodeMap),
                ttl: 900 //15 Min. //86400 // 24 horas
            });

            return { success: true, result: taxCodeMap };

        } catch (error) {
            log.error({
                title: 'Error en getAllTaxCodes',
                details: error
            });

            return { success: false, error: error.message || String(error) };
        }
    }

    return {
        getAllTaxCodes: getAllTaxCodes
    };
});