/**
 * @NApiVersion 2.0
 */
define(["N/search", "N/record", "N/log"], function (search, record, nLog) {
   
    var COLUMNS = [
        "custrecord_item_categoria",
        "custrecord_item_articulo_asiento",
        "custrecord_item_codigo",
        "custrecord_item_articulo_boleta",
        "custrecord_item_cuenta_cobrar_boleta",
        "custrecord_item_id",
        "custrecord_item_cuenta_contable",
        "custrecord_item_forma_pago",
        "custrecord_item_articulo_asiento",
        "custrecord_2win_recaudaciones_subsidiary",
        "custrecord_2win_recaudaciones_cliente"
    ];

    /**
     * Obtiene configuración completa del Item Mapping basado en categoría y código
     * @param {string} categoria - Categoría del JSON (boletasEmitidas, detalleEgresos, etc.) o script ID
     * @param {string} codigo - Código específico
     * @returns {object|null} - Objeto con configuración completa o null si no se encuentra
     */
    function getItemMapping(id) {
        try {
           const datos = search.lookupFields({
            type: 'customrecord_2w_as_item_mapping',
            id: id,
            columns: COLUMNS
           })
           return {
            categoria: datos.custrecord_item_categoria[0].value,
            cliente: datos.custrecord_2win_recaudaciones_cliente[0].value
           }
        } catch (e) {
            nLog.error("MappingDAO getItemMapping Error", e);
            return {};
        }
    }

    return {
        getItemMapping: getItemMapping,
    };
});
