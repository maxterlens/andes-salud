/**
 * @NApiVersion 2.x
 * @NModule 2win_dao_search_payment_method
 * @NModuleScope public
 */

define(['N/search', 'N/log', '../2win_dao'], 
    function(search, log, getData) {
        /**
         * @description Busca una forma de pago por el nombre.
         * @param {*} formaDePago 
         * @returns 
         */
        function searchFormaDePago(formaDePago) {
            try{
                log.debug({
                    title: 'parámetro Forma de Pago',
                    details: formaDePago
                });

                var searchResult = {
                    type: "paymentmethod",
                    filters:
                    [
                        ["name","contains", formaDePago]
                    ],
                    columns:
                    [
                        search.createColumn({name: "internalid", label: "internal_id"}),
                    ]
                };

                var resultPaymentMethod = getData.obtenerResultados(searchResult);

                return { success: true, result: resultPaymentMethod[0].internal_id };

            } catch (error) {
                log.error({
                    title: 'Error en búsqueda de Forma de Pago',
                    details: error
                });

                return { success: false, result: error.message };
            }

        }
        return {
            searchFormaDePago: searchFormaDePago
        };
    }
);