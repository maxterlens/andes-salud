/**
 * @NApiVersion 2.1
 * @NModuleScope Public
 */
define(["N/search", "./2win_dao"], function (search, dao) {

    /* =========================
    * BUSQUEDAS
    * ========================= */

    /**
     * @function busquedaNotasDeSistema - Función para realizar una busqueda en una tabla de netsuite.
     * @param {object} parametro - Parametros a usar en los filtros de la busqueda.
     * @param {string} parametro.campo - Campo a buscar en notas del sistema
     * @param {number} parametro.fecha - fecha en formato 'DD/MM/YYYY HH:MM AM'
     * @param {string} parametro.valor - Valor a buscar en campo
     * @returns {Array<Object>} - Resultados de busqueda
     */
    function busquedaNotasDeSistema(parametro) {
        try {
            log.audit("busquedaNotasDeSistema - parametro", {
                parametro: parametro,
            });

            // Tipo, filtros y columnas para la busqueda
            const objSearch = {
                type: "systemnote",
                filters:
                [
                    ["field", "anyof", parametro.campo],
                    "AND",
                    ["date", "before", parametro.fecha],
                    "AND",
                    ["newvalue", "is", parametro.valor]
                ],
                columns:
                [
                    search.createColumn({name: "record", label: "record"}),
                    search.createColumn({name: "name", label: "name"}),
                    search.createColumn({name: "date", label: "date"}),
                    search.createColumn({name: "context", label: "context"}),
                    search.createColumn({name: "type", label: "type"}),
                    search.createColumn({name: "field", label: "field"}),
                    search.createColumn({name: "oldvalue", label: "oldvalue"}),
                    search.createColumn({name: "newvalue", label: "newvalue"}),
                    search.createColumn({name: "role", label: "role"}),
                    search.createColumn({name: "recordid", label: "recordid"}),
                    search.createColumn({name: "recordtype", label: "recordtype"})
                ]
            };

            // Ejecuta busqueda paginada
            /** @type {Array<Object>} */
            // let resultado = [];
            // // Maximo de resultados por pagina 1000
            // const RESULTADOS_POR_PAGINA = 3000;
            // let busquedaPaginada = definirBusquedaPaginada(objSearch, RESULTADOS_POR_PAGINA);

            // // Determinar conteo de paginas
            // let conteoPaginas = busquedaPaginada.pageRanges.length;
            // log.debug("busquedaNotasDeSistema - conteoPaginas", { conteoPaginas: conteoPaginas });

            // // Iterar para recuperar resultados de cada pagina
            // for (let pagina = 0; pagina < conteoPaginas; pagina++) {
            //     let resultadosPagina = recuperarResultadosPaginados(busquedaPaginada, pagina);
            //     log.debug("busquedaNotasDeSistema - resultadosPagina", {
            //         pagina: pagina,
            //         extension: resultadosPagina.length,
            //         resultadosPagina: resultadosPagina
            //     });

            //     // Validar extension de resultados
            //     if (resultadosPagina.length > 0) {
            //         // Agregar resultados agrupados por pagina a resultados totales
            //         // resultado.push(resultadosPagina);

            //         // Agregar individualmente cada registro a resultados totales
            //         resultadosPagina.forEach(function (item) {
            //             item.pagina = pagina
            //             resultado.push(item);
            //         });
            //     }
            // }

            let resultado = dao.getDataSearch(objSearch);

            // Ejecutar busqueda
            log.audit("busquedaNotasDeSistema - resultados", {
                extension: resultado.length,
                resultado: resultado
            });

            return resultado;
        } catch (error) {
            log.error("busquedaNotasDeSistema - error", error);
            throw error;
        }
    }

    /**
     * @function busquedaNotasDeSistemaParaTransacciones - Función para realizar una busqueda en una tabla de netsuite.
     * @param {Array} internalidsTransacciones - Parametros a usar en los filtros de la busqueda.
     * @returns {Array<Object>} - Resultados de busqueda
     */
    function busquedaNotasDeSistemaParaTransacciones(internalidsTransacciones) {
        try {
            log.audit("busquedaNotasDeSistemaParaTransacciones - parametro", {
                internalidsTransacciones: internalidsTransacciones,
            });

            // Tipo, filtros y columnas para la busqueda
            const objSearch = {
                type: "systemnote",
                filters:
                [
                    ["field", "anyof", "CUSTBODY_2WIN_CREATED_FROM_INCOME_FLOW"],
                    "AND",
                    ["context", "anyof", "MPR"],
                    "AND",
                    // ["name", "anyof", "405846"],
                    // "AND",
                    ["date", "before", "03/09/2026 12:00 am"],
                    "AND",
                    ["newvalue", "is", "T"],
                    "AND",
                    ["recordid", "equalto", internalidsTransacciones]
                ],
                columns:
                [
                    search.createColumn({name: "recordid", sort: search.Sort.ASC, label: "recordid"}),
                    search.createColumn({name: "recordtype", label: "recordtype"}),
                    search.createColumn({name: "newvalue", label: "newvalue"}),
                    search.createColumn({name: "date", label: "date"})
                ]
            };

            // Ejecutar busqueda
            let resultado = dao.getDataSearch(objSearch);
            log.audit("busquedaNotasDeSistemaParaTransacciones - resultados", {
                extension: resultado.length,
                resultado: resultado
            });
            if (resultado.length > 0) {
                return resultado;
            } else {
                throw new Error("No se encontraron notas del sistema para registro: " + internalidsTransacciones);
            }
        } catch (error) {
            log.error("busquedaNotasDeSistemaParaTransacciones - error", error);
            throw error;
        }
    }

    /**
     * @typedef {Object} PageRange
     * @property {number} index - El índice identificador del rango.
     * @property {string} compoundLabel - Rango de fechas formateado (ej. "07/05/2026 — 19/05/2026").
     */

    /**
     * @typedef {Object} PaginationResult
     * @property {number} count - Cantidad total de elementos.
     * @property {PageRange[]} pageRanges - Array con los rangos de páginas disponibles.
     * @property {number} pageSize - Cantidad de elementos por página.
     */

    /**
     * @function definirBusquedaPaginada - Definir objeto de busqueda
     * @param {{"type": String,"filters": Array<Object>,"columns": Array<Object>}} criteriosBusqueda - Objeto de parametros para la busqueda
     * @param {number} resultadosPorPagina - Numero de resultados a obtener
     * @returns {PaginationResult} - Objeto de busqueda configurado
     */
    function definirBusquedaPaginada(criteriosBusqueda, resultadosPorPagina) {
        try {
            log.debug("definirBusquedaPaginada - parametros", {
                criteriosBusqueda: criteriosBusqueda,
                resultadosPorPagina: resultadosPorPagina
            });

            // Crear objeto de busqueda
            let searchObj = search.create(criteriosBusqueda);
            log.debug('definirBusquedaPaginada - searchObj', { searchObj: searchObj });

            // Definir paginado de busqueda
            let paginado = searchObj.runPaged({ pageSize: resultadosPorPagina });
            log.debug('definirBusquedaPaginada - paginado', { paginado: paginado });

            return paginado;
        } catch (error) {
            log.error("definirBusquedaPaginada - error", error);
            throw error;
        }
    }

    /**
     * @function recuperarResultadosPaginados - Ejecutar busqueda segun parametros indicados
     * @param {object} datosPagina - Objeto con datos para ejecucion busqueda
     * @param {number} numeroPagina - Pagina que se buscara
     * @returns {Array<Object>}
     */
    function recuperarResultadosPaginados(datosPagina, numeroPagina) {
        try {
            log.debug("recuperarResultadosPaginados - parametros", {
                datosPagina: datosPagina,
                numeroPagina: numeroPagina
            })

            // Ejecutar busqueda en pagina indicada
            let searchPage = datosPagina.fetch({ index: numeroPagina });

            let searchResults = new Array();

            searchPage.data.forEach(function (item) {
                /** @type {Record<string, any>} */
                let objectCompiled = {};
                for (let i = 0; i < item.columns.length; i++) {
                    objectCompiled[item.columns[i].label] = item.getValue(item.columns[i]);
                }
                searchResults.push(objectCompiled);
                return true;
            });
            log.debug("recuperarResultadosPaginados Ejecutada", "Obtuvo resultados")
            return searchResults;
        } catch (error) {
            log.error("recuperarResultadosPaginados - error", error)
            throw error;
        }
    }

    return {
        busquedaNotasDeSistemaParaTransacciones: busquedaNotasDeSistemaParaTransacciones,
        busquedaNotasDeSistema: busquedaNotasDeSistema
    };
});
