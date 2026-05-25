/**
 * @NApiVersion 2.x
 * @NModule 2win_dao_search_cuentas
 * @NModuleScope public
 */

/**
 * @description Módulo DAO para la búsqueda de cuentas contables en NetSuite
 * utilizando la forma de pago como filtro
 */

define(['N/search', 'N/log', '../2win_dao'],
    function(search, log, getData) {
        /**
         * @description Busca la cuenta contable asociada a una forma de pago.
         * @param {string} formaDePago - La forma de pago a buscar.
         * @returns {Object} - Objeto con éxito y resultado o error.
         */
        function searchCuentaPorFormaPago(formaDePago, tipo) {
            try{
                log.debug({
                    title: 'Parámetro Forma de Pago',
                    details: formaDePago
                });

                log.debug({
                    title: 'Parámetro Tipo',
                    details: tipo
                });

                var filtro = [];

                if(tipo === "VENTA"){
                    // Si es un campo de lookup, buscar por el nombre del registro relacionado
                    filtro.push(["custrecord_item_forma_pago.name","is", formaDePago]);
                } else if (tipo === "DEVO"){
                    // Si es un campo de texto, usar is para coincidencia exacta
                    filtro.push(["custrecord_item_codigo","is", formaDePago]);
                }

                log.audit("Filtro de búsqueda de cuenta contable", filtro);


                var searchResult = {
                    type: "customrecord_2w_as_item_mapping",
                    filters: filtro,
                    columns:
                    [
                        search.createColumn({name: "internalid", label: "internal_id"}),
                        search.createColumn({name: "custrecord_item_id", label: "cta_contable_debito"}),
                        search.createColumn({name: "custrecord_item_cuenta_contable", label: "cta_contable_credito"})
                    ]
                };

                var results = getData.obtenerResultados(searchResult);

                log.audit("Resultados de la búsqueda de cuenta contable", results);

                if(!results || results.length === 0){
                    return { success: false, error: 'No se encontró la forma de pago: ' + formaDePago };
                }

                var cuentaContable = results.map(function(result) {
                   return result.cta_contable_debito ? 
                            result.cta_contable_debito : 
                            result.cta_contable_credito ? 
                            result.cta_contable_credito : null;
                })[0];

                log.audit("Cuenta contable encontrada", cuentaContable);


                return { success: true, result: cuentaContable };

            } catch (error) {
                log.error({
                    title: 'Error en búsqueda de cuenta contable por forma de pago',
                    details: error
                });
                return { success: false, error: "Cuenta No Encontrada" };
            }
        }
        return {
            searchCuentaPorFormaPago: searchCuentaPorFormaPago
        };
    }
);