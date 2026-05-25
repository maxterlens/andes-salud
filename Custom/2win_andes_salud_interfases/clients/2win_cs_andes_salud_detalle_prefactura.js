/**
 *@NApiVersion 2.1
 *@NScriptType ClientScript
 *@NModuleScope Public
 */
define([],

    function () {

        function pageInit(context) {
            console.log("pageInit - context", context);
        }

        return {
            pageInit: pageInit
        }
    }
);

function verDatelleOV(id_ov, id_detalle_pref) {

    require(['N/search', 'N/ui/dialog', 'N/record'],

        function (search, dialog, record) {

            try {

                console.log("verDatelleOV - id_ov", id_ov);
                console.log("verDatelleOV - id_detalle_pref", id_detalle_pref);

                // Cargar detalle de prefactura para obtener campo crg_correl
                var detalle_pref = record.load({
                    type: 'customrecord_2w_as_prefactura_detalles',
                    id: id_detalle_pref,
                    isDynamic: true,
                });

                var crg_correl = detalle_pref.getValue({ fieldId: 'custrecord_2w_as_dpf_crgcorrel' });
                console.log("verDatelleOV - crg_correl obtenido", crg_correl);

                const lineas_ov = obtenerLineasPorIdentificador(search, id_ov, crg_correl);
                console.log("verDatelleOV - lineas ov obtenidas", lineas_ov);

                var encabezado = `
                     <tr>
                        <th style="border: 1px solid #ddd; padding: 8px; background: #E5E5E5 none !important">ARTÍCULO</th>
                        <th style="border: 1px solid #ddd; padding: 8px; background: #E5E5E5 none !important">IDENTIFICADOR</th>
                        <th style="border: 1px solid #ddd; padding: 8px; background: #E5E5E5 none !important">MONTO</th>
                    </tr>
                `;

                var filas = lineas_ov.map(function (linea) {

                    return `
                        <tr>
                            <td style="border: 1px solid #ddd; padding: 8px;">${linea.articulo}</td>
                            <td style="border: 1px solid #ddd; padding: 8px;text-align: right;">${linea.identificador}</td>
                            <td style="border: 1px solid #ddd; padding: 8px;text-align: right;">${formatAmount(linea.monto)}</td>
                        </tr>
                    `;
                }).join('');

                var tableHtml = `
                    <table style="width:100%; border-collapse: collapse;">
                        <thead>
                            ${encabezado}
                        </thead>
                        <tbody>
                            ${filas}
                        </tbody>
                    </table>
                `;

                var options = {
                    title: 'Detalle',
                    message: tableHtml
                };

                dialog.alert(options);

            } catch (e) {
                console.error('Error en verDatelleOV', e.message);
            }

            function formatAmount(amount) {
                return amount.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
            }

            function obtenerLineasPorIdentificador(search, id_orden, identificadores_fila) {

                try {

                    let filtros_identificador = [];
                    let contador = 1;
                    let identificadores = identificadores_fila.split(",");
                    identificadores.forEach((identificador) => {
                        filtros_identificador.push(["custcol_2win_as_identificador_fila", "equalto", identificador.trim()]);
                        // Agregar operador OR si no es el ultimo
                        if (contador < identificadores.length) {
                            filtros_identificador.push("OR");
                            contador++;
                        }
                    });
                    log.debug("obtenerLineasPorIdentificador - filtros_identificador", filtros_identificador);

                    let objSearch = {
                        type: "transaction",
                        settings: [{ "name": "consolidationtype", "value": "ACCTTYPE" }, { "name": "includeperiodendtransactions", "value": "F" }],
                        filters:
                            [
                                ["type", "anyof", "SalesOrd"],
                                "AND",
                                ["internalid", "anyof", id_orden],
                                "AND",
                                ["mainline", "is", "F"],
                                "AND",
                                [filtros_identificador]
                            ],
                        columns:
                            [
                                search.createColumn({ name: "item", summary: "GROUP", label: "id_articulo" }),
                                search.createColumn({ name: "itemid", join: "item", summary: "GROUP", label: "articulo" }),
                                search.createColumn({ name: "custcol_2win_as_identificador_fila", summary: "GROUP", sort: search.Sort.ASC, label: "identificador" }),
                                search.createColumn({ name: "formulanumeric", summary: "SUM", formula: "ROUND((ABS({netamount}+{taxamount})),0)", label: "monto" })
                            ]
                    };

                    return obtenerResultados(search, objSearch);

                } catch (error) {
                    throw error;
                }
            }

            function obtenerResultados(search, createSearch) {

                try {

                    log.audit("obtenerResultados - parametro", {
                        type: createSearch.type,
                        filters: createSearch.filters,
                        tipoDato: typeof createSearch
                    });

                    // Array que almacenara resultados
                    let searchResults = [];

                    let saveSearch = search.create(createSearch);
                    let searchResultCount;

                    // Ejecutar busqueda estandar
                    searchResultCount = saveSearch.runPaged().count;
                    if (searchResultCount === 0) {
                        log.debug("obtenerResultados - searchResultCount", "la busqueda no retorno resultados");
                        return searchResultCount;
                    }
                    saveSearch.run().each(function (item) {
                        let objectCompiled = {};
                        for (let i = 0; i < item.columns.length; i++) {
                            objectCompiled[item.columns[i].label] = item.getValue(item.columns[i]);
                        }
                        searchResults.push(objectCompiled);
                        return true;
                    });

                    log.debug("obtenerResultados - ejecutada", "Obtuvo resultados");
                    return searchResults;

                } catch (error) {
                    log.error("obtenerResultados - error", error);
                    throw error;
                }
            }
        }
    );
}
