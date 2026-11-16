/**
 * @NApiVersion 2.1
 * @NModuleScope Public
 */
define([
    "N/query",
    "N/search",
    "N/record",
    "./2win_dao"
], function (
    query,
    search,
    record,
    dao
) {

    /* =========================
    * BUSQUEDAS
    * ========================= */

    /**
     * @function busquedaCamposTransacciones - Función para realizar una busqueda en una tabla de netsuite.
     * @param {object} idsTransacciones - Parametros a usar en los filtros de la busqueda.
     * @returns {Array<Object>} - Resultados de busqueda
     */
    function busquedaCamposTransacciones(idsTransacciones) {
        try {
            log.audit("busquedaCamposTransacciones - idsTransacciones", {
                idsTransacciones: idsTransacciones,
            });

            // Tipo, filtros y columnas para la busqueda
            const objSearch = {
                type: "transaction",
                filters:
                [
                    ["mainline", "is", "T"],
                    // "AND",
                    // ["custbody_2win_created_from_income_flow", "is", "F"],
                    "AND",
                    ["internalid", "anyof", idsTransacciones],
                ],
                columns:
                [
                    search.createColumn({name: "internalid", sort: search.Sort.ASC, summary: "GROUP", label: "internalid"}),
                    // search.createColumn({name: "type", summary: "GROUP", label: "type"}),
                    search.createColumn({name: "recordtype", summary: "GROUP", label: "recordtype"}),
                    // search.createColumn({name: "date", label: "date"}),
                    // search.createColumn({name: "createddate", label: "createddate"}),
                    search.createColumn({name: "custbody_2win_created_from_income_flow", summary: "GROUP", label: "custbody_2win_created_from_income_flow"})
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
            // log.debug("busquedaCamposTransacciones - conteoPaginas", { conteoPaginas: conteoPaginas });

            // // Iterar para recuperar resultados de cada pagina
            // for (let pagina = 0; pagina < conteoPaginas; pagina++) {
            //     let resultadosPagina = recuperarResultadosPaginados(busquedaPaginada, pagina);
            //     log.debug("busquedaCamposTransacciones - resultadosPagina", {
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
            // log.debug("busquedaCamposTransacciones - resultados", {
            //     extension: resultado.length,
            //     resultado: resultado
            // });

            return resultado;
        } catch (error) {
            log.error("busquedaCamposTransacciones - error", error);
            throw error;
        }
    }

    /**
     * @function busquedaTransaccionesPorFolios - Función para realizar una busqueda en una tabla de netsuite.
     * @param {object} folios - Parametros a usar en los filtros de la busqueda.
     * @returns {Array<Object>} - Resultados de busqueda
     */
    function busquedaTransaccionesPorFolios(folios) {
        try {
            log.audit("busquedaTransaccionesPorFolios - folios", {
                folios: folios,
            });

            // Tipo, filtros y columnas para la busqueda
            const objSearch = {
                type: "transaction",
                filters:
                [
                    [
                        ["memo", "is", "Pago Consolidado"],
                        "OR",
                        ["memo", "startswith", "Forma Pago"],
                        "OR",
                        ["memo", "startswith", "Forma Pago NC"]
                    ],
                    // "AND",
                    // ["custbody_2win_created_from_income_flow", "is", "T"],
                    "AND",
                    ["isreversal", "is", "F"],
                    "AND",
                    ["reversaldate", "isempty", ""],
                    "AND",
                    // ["custcol_2w_folio", "anyof", folios]
                    ["custcol_2w_folio", "is", folios[0]]
                ],
                columns:
                [
                    search.createColumn({name: "internalid", sort: search.Sort.ASC, summary: "GROUP", label: "internalid"}),
                    search.createColumn({name: "recordtype", summary: "GROUP", label: "recordtype"}),
                    search.createColumn({name: "custbody_2win_created_from_income_flow", summary: "GROUP", label: "custbody_2win_created_from_income_flow"}),
                    search.createColumn({name: "custcol_2w_folio", summary: "GROUP", label: "custcol_2w_folio"}),
                    search.createColumn({name: "memo", summary: "GROUP", label: "memo"}),
                    search.createColumn({name: "tranid", summary: "GROUP", label: "tranid"}),
                ]
            };

            let resultado = dao.getDataSearch(objSearch);

            // Ejecutar busqueda
            log.debug("busquedaTransaccionesPorFolios - resultados", {
                extension: resultado.length,
                resultado: resultado
            });

            return resultado;
        } catch (error) {
            log.error("busquedaTransaccionesPorFolios - error", error);
            throw error;
        }
    }

    /**
     * @function busquedaCamposTransaccion - Función para realizar una busqueda en una tabla de netsuite.
     * @param {object} idTransaccion - Parametros a usar en los filtros de la busqueda.
     * @returns {Array<Object>} - Resultados de busqueda
     */
    function busquedaCamposTransaccion(idTransaccion) {
        try {
            log.audit("busquedaCamposTransaccion - idTransaccion", {
                idTransaccion: idTransaccion,
            });

            // Tipo, filtros y columnas para la busqueda
            let camposTransaccion = search.lookupFields({
                type: "transaction",
                id: idTransaccion,
                columns: ["internalid", "type", "recordtype", "createddate", "custbody_2win_created_from_income_flow"]
            });
            log.debug("busquedaCamposTransacciones - camposTransaccion", {
                extension: camposTransaccion.length,
                camposTransaccion: camposTransaccion
            });

            return camposTransaccion;
        } catch (error) {
            log.error("busquedaCamposTransaccion - error", error);
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
            log.debug("definirBusquedaPaginada - searchObj", { searchObj: searchObj });

            // Definir paginado de busqueda
            let paginado = searchObj.runPaged({ pageSize: resultadosPorPagina });
            log.debug("definirBusquedaPaginada - paginado", { paginado: paginado });

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

    /**
     * @function cargarRegistroParaActualizar - Función para actualizar campos de una transaccion en netsuite.
     * @param {object} parametro - Parametros a usar en la actualizacion.
     * @returns {string} - internalid de transaccion actualizada.
     */
    function cargarRegistroParaActualizar(parametro) {
        try {
            // log.audit("cargarRegistroParaActualizar - parametro", {
            //     parametro: parametro,
            // });

            // Cargar registro
            const registro = record.load({ type: parametro.recordtype, id: parametro.internalid, isDynamic: false });

            // Actualizar campo
            registro.setValue({ fieldId: "custbody_2win_created_from_income_flow", value: true });

            // Guardar cambios
            const internalidRegistroActualizado = registro.save({ enableSourcing: false, ignoreMandatoryFields: true });
            log.debug("cargarRegistroParaActualizar - internalidRegistroActualizado", {
                internalidRegistroActualizado: internalidRegistroActualizado
            });

            return internalidRegistroActualizado;
        } catch (error) {
            log.error("cargarRegistroParaActualizar - error", error);
            throw error;
        }
    }

    /**
     * @function actualizarCampoTransaccion - Función para actualizar campos de una transaccion en netsuite.
     * @param {object} parametro - Parametros a usar en la actualizacion.
     * @returns {string} - internalid de transaccion actualizada.
     */
    function actualizarCampoTransaccion(parametro) {
        try {
            // log.audit("actualizarCampoTransaccion - parametro", {
            //     parametro: parametro,
            // });

            // Actualizar registro con nuevos valores
            let internalidRegistroActualizado = record.submitFields({
                // type: "transaction",
                type: parametro.recordtype,
                id: parametro.internalid,
                values: {
                    custbody_2win_created_from_income_flow: true
                },
                options: {
                    enableSourcing: false,
                    ignoreMandatoryFields : true
                }
            });
            log.debug("actualizarCampoTransaccion - internalidRegistroActualizado", {
                internalidRegistroActualizado: internalidRegistroActualizado
            });

            return internalidRegistroActualizado;
        } catch (error) {
            log.error("actualizarCampoTransaccion - error", error);
            try {
                let internalidRegistroActualizado = cargarRegistroParaActualizar(parametro);
                return internalidRegistroActualizado;
            } catch (e) {
                throw e;
            }
        }
    }

    /**
     * Busca Journal Entries por folio a nivel de línea
     * @param {string} folios - Folio a buscar
     * @returns {Array} - Array con los resultados de la búsqueda
     */
    function consultarTransaccionesPorFolio(folios) {
        try {
            log.debug("consultarTransaccionesPorFolio - parametros", {
                folios: folios
            });

            // Validar que se proporcione parametro
            if (!folios) {
                throw new Error("El parametro folios es obligatorio")
            }

            // Filtrar duplicados
            const uniqueFolios = [...new Set(folios)];
            log.debug("consultarTransaccionesPorFolio - uniqueFolios", {
                uniqueFolios: uniqueFolios
            });

            // Valores unicos
            const placeholders = uniqueFolios
                .map(function () {
                    return "?";
                })
                .join(",");
            log.debug("consultarTransaccionesPorFolio - placeholders", {
                placeholders: placeholders
            });

            // Construcción de la Query
            let sql = `
                SELECT DISTINCT
                    t.id,
                    t.memo as memomain,
                    t.tranid,
                    t.recordtype,
                    tl.expenseaccount,
                    tl.memo,
                    tl.entity,
                    tl.custcol_2w_folio
                FROM
                    transaction t
                    INNER JOIN transactionline tl ON tl.transaction = t.id
                WHERE
                    (
                        t.memo = 'Pago Consolidado' 
                        OR t.memo LIKE 'Forma Pago -%'
                        OR t.memo LIKE 'Forma Pago NC -%'
                    )
                    AND t.isreversal = 'F'
                    AND t.reversaldate IS NULL
                    AND tl.custcol_2w_folio IN (${placeholders})
                ORDER BY
                    t.id DESC
            `;

            // Ejecutar consulta
            const results = query
                .runSuiteQL({
                    query: sql,
                    params: uniqueFolios
                })
                .asMappedResults();

            log.debug("consultarTransaccionesPorFolio - results", {
                extension: results.length,
                results: results
            });

            if (results.length > 0) {
                return results;
            } else {
                throw new Error(" No se encontro transaccion para folio: " + uniqueFolios);
            }

        } catch (error) {
            log.error("consultarTransaccionesPorFolio - error", error);
            throw error;
        }
    }

    return {
        busquedaCamposTransacciones: busquedaCamposTransacciones,
        busquedaTransaccionesPorFolios: busquedaTransaccionesPorFolios,
        busquedaCamposTransaccion: busquedaCamposTransaccion,
        actualizarCampoTransaccion: actualizarCampoTransaccion,
        consultarTransaccionesPorFolio: consultarTransaccionesPorFolio
    };
});
