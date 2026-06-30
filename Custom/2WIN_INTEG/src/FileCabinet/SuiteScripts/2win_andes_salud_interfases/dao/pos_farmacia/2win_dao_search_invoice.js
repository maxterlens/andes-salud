/**
 * @NApiVersion 2.x
 * @NModule 2win_dao_search_invoice
 * @NModuleScope public
 */

define(['N/search', 'N/log', '../2win_dao'],
    function(search, log, getData) {
        function searchInvoice(objFilterInvoice) {
            try{

                var filter = [
                    ["type","anyof","CustInvc"],
                    "AND",
                    ["mainline","is","T"]
                ];

                if(objFilterInvoice.hasOwnProperty('folioFactura')){
                    filter.push(
                        "AND",
                        ["custbody_2winfolioacepta","equalto", objFilterInvoice.folioFactura]
                    );
                } else if(objFilterInvoice.hasOwnProperty('numFactura')){
                    filter.push(
                        "AND",
                        ["numbertext","is", objFilterInvoice.numFactura]
                    );
                }

                var searchResult = {
                    type: "invoice",
                    filters: filter,
                    columns:
                    [
                        search.createColumn({name: "internalid", label: "internal_id"}),
                    ]
                };

                log.audit('searchInvoice - searchResult', searchResult);

                var results = getData.obtenerResultados(searchResult);

                if(!results || results.length === 0){
                    var valorBuscado = objFilterInvoice.folioFactura || objFilterInvoice.numFactura || 'sin especificar';
                    return { success: false, error: 'No se encontró la factura con folio/número: ' + valorBuscado };
                }

                var resultInvoice = results[0].internal_id;

                return { success: true, result: resultInvoice};
                
            } catch (error) {
                log.error({
                    title: 'Error en búsqueda de factura',
                    details: error
                });
                return { success: false, error: error.message };
            }
        }
        return {
            searchInvoice: searchInvoice
        };
    }
);
