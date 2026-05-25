define(["N/search"], function (search) {
    function searchCuentaRedondeo() {
        try {
            var searchCuentaRedondeo = search.create({
                type: 'customrecord_2w_parametros_operacion',
                filters: [
                    ["name", "is", "andessalud_pos_farmacia_cuenta_redondeo"]
                ],
                columns: [search.createColumn({ name: "custrecord_2w_parametro_texto" })]
            });
            var searchResultCuentaRedondeo = searchCuentaRedondeo.run().getRange({ start: 0, end: 1 });
            if (searchResultCuentaRedondeo.length === 0) {
                return { success: false, message: "No se encontraron resultados para la búsqueda de cuenta redondeo." };
            }
            return { success: true, result: searchResultCuentaRedondeo[0].getValue("custrecord_2w_parametro_texto") };
        } catch (error) {
            return { success: false, message: error.message };
        }
    }

    return {
        searchCuentaRedondeo: searchCuentaRedondeo
    };
});