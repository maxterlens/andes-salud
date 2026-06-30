/**
 * @NApiVersion 2.x
 * @NModule 2win_dao_search_cash_sale
 * @NModuleScope public
 */

define(['N/search', 'N/log', '../2win_dao'],
    function(search, log, getData) {
        function searchCashSale(folio) {
            try{
                log.debug({
                    title: 'parámetro Folio de Boleta',
                    details: folio
                });

                var searchResult = {
                    type: "transaction",
                    filters:
                    [
                      ["custbody_2winfolioacepta","equalto", folio],
                        "AND",
                        ["mainline","is","T"]
                    ],
                    columns:
                    [
                        search.createColumn({name: "internalid", label: "internal_id"}),
                    ]
                };

                var resultCashSale = getData.obtenerResultados(searchResult)[0].internal_id;

                log.debug('resultCashSale', resultCashSale);

                return { success: true, result: resultCashSale };

            } catch (error) {
                log.error({
                    title: 'Error en búsqueda de boleta',
                    details: error
                });
                return { success: false, error: error.message };
            }
        }
        return {
            searchCashSale: searchCashSale
        };
    }
);
