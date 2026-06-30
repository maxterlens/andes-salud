/**
 * @NApiVersion 2.x
 * @NModuleScope Public
 * @module 2win_dao_search_all_cuentas_forma_pago
 */

define(['N/search', 'N/log'], function (search, log) {
    function obtenerCuentasFormaPago() {
            try {
                log.debug("obtenerCuentasFormaPago - inicio", "Iniciando búsqueda de todas las cuentas por forma de pago")

                var searchResult = {
                    type: 'customrecord_2w_as_item_mapping',
                    filters: [],
                    columns: [
                        search.createColumn({ name: 'internalid', label: 'internal_id' }),
                        search.createColumn({ name: 'custrecord_item_forma_pago', label: 'forma_pago_id' }),
                        search.createColumn({ name: 'custrecord_item_codigo', label: 'codigo' }),
                        search.createColumn({ name: 'custrecord_item_id', label: 'cta_contable_debito' }),
                        search.createColumn({ name: 'custrecord_item_cuenta_contable', label: 'cta_contable_credito' })
                    ]
                };

                var resultados = [];
                var saveSearch = search.create(searchResult);
                var searchResultCount = saveSearch.runPaged().count;

                if (searchResultCount == 0) {
                    log.debug("obtenerCuentasFormaPago - sin resultados", "La búsqueda no retornó resultados")
                    return {
                        success: true,
                        result: resultados
                    };
                }

                saveSearch.run().each(function (item) {
                    var objetoCompilado = {
                        internal_id: item.getValue({ name: 'internalid' }),
                        forma_pago_id: item.getValue({ name: 'custrecord_item_forma_pago' }),
                        forma_pago_nombre: (item.getText({ name: 'custrecord_item_forma_pago' })).toUpperCase(), // Usar getText para obtener el nombre
                        codigo: item.getValue({ name: 'custrecord_item_codigo' }),
                        cta_contable_debito: item.getValue({ name: 'custrecord_item_id' }),
                        cta_contable_credito: item.getValue({ name: 'custrecord_item_cuenta_contable' })
                    };
                    resultados.push(objetoCompilado);
                    return true;
                });

                log.debug("obtenerCuentasFormaPago - completada", "Búsqueda de cuentas por forma de pago completada con " + resultados.length + " resultados")

                return {
                    success: true,
                    result: resultados
                };
            } catch (error) {
                log.error("obtenerCuentasFormaPago - error", error)
                return {
                    success: false,
                    error: error.message
                }
            }
        };

    return {
        obtenerCuentasFormaPago: obtenerCuentasFormaPago
    };
});
