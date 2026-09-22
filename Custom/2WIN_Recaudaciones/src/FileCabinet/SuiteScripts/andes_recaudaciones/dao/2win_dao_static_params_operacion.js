/**
 *@fileoverview Herramientas para la manipulacion de la tabla de parametros estaticos
 * @NApiVersion 2.1
 * @NModuleScope Public
 **/
define(["N/search"], function (search) {
    /**
     * @desc Consulta en la BD los Parametros de Configuracion.
     * @function getDataConfig
     * @return {Object} Objeto Json con los parametros de configuracion.
     */
    const getDataConfig = function () {
        try {
            let searchResults = [];

            let tabItem = {
                type: "customrecord_2w_parametros_operacion",
                columns: [
                    search.createColumn({ name: "internalid", sort: search.Sort.ASC, label: "internalid" }),
                    search.createColumn({ name: "name", label: "name" }),
                    search.createColumn({ name: "custrecord_2w_parametro_numerico", label: "number" }),
                    search.createColumn({ name: "custrecord_2w_parametro_texto", label: "text" }),
                    search.createColumn({ name: "custrecord_2w_parametro_fecha", label: "date" })
                ],
                filters: []
            };

            let saveSearch = search.create(tabItem);

            saveSearch.run().each(function (item) {
                let objectCompiled = {};
                for (let i = 0; i < item.columns.length; i++) {
                    objectCompiled[item.columns[i].label] = item.getValue(item.columns[i]);
                }
                searchResults.push(objectCompiled);
                return true;
            });

            return searchResults;
        } catch (e) {
            throw new Error(e);
        }
    };

    function getParametro(param) {
        let dataConfig = getDataConfig();
        let result = dataConfig.filter(function (search) {
            if (search.name === param) return search;
        });
        if (result.length > 0) {
            let resultado = JSON.parse(JSON.stringify(result[0]));
            return resultado;
        } else {
            throw new Error(`No se ha encontrado parametro: ${param}`);
        }
    }

    return {
        getParam: getParametro
    };
});
