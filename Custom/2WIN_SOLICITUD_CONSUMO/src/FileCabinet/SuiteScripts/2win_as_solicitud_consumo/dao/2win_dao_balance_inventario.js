/**
 * @NApiVersion 2.1
 * @module ./2win_dao_balance_inventario.js
 * @NModuleScope Public
 */
define(["./2win_dao", "N/search", "N/log"], function (dao, search, nLog) {

    /**
     * Obtener stock disponible de un artículo en una ubicación
     */
    function obtenerStockDisponible(articuloId, ubicacionId) {
        try {
            nLog.debug("obtenerStockDisponible - parametros", {
                articuloId: articuloId,
                ubicacionId: ubicacionId
            });
            const inventorySearch = search.create({
                type: search.Type.INVENTORY_BALANCE,
                filters: [
                    ["item.internalid", "anyof", articuloId],
                    "AND",
                    ["location.internalid", "anyof", ubicacionId]
                ],
                columns: [
                    search.createColumn({ name: "available", summary: "SUM" })
                ]
            });

            const results = inventorySearch.run().getRange({ start: 0, end: 1 });
            nLog.debug("obtenerStockDisponible - results", {
                extension: results.length,
                results: results
            });

            if (results && results.length > 0) {
                const available = results[0].getValue({ name: "available", summary: "SUM" });
                return parseFloat(available) || 0;
            }
            return 0;
        } catch (error) {
            nLog.error("obtenerStockDisponible - error", error);
            return 0;
        }
    }

    /**
     * @function busquedaBalanceInventarioLineasDetalle
     * Recupera combinaciones exactas de Lote y Depósito para cubrir una cantidad,
     * priorizando la fecha de caducidad más próxima y luego los saldos más pequeños.
     * @param {array} items - internalid de cada articulo a abuscar
     * @param {string} location - internalid de ubicacion
     * @returns {object} resumen de inventario recuperado para cada ariculo
     */
    function busquedaBalanceInventarioLineasDetalle(items, location) {
        try {
            nLog.debug("busquedaBalanceInventarioLineasDetalle - parametro", { 
                items: items, 
                location: location 
            });

            let objSearch = {
                type: search.Type.INVENTORY_BALANCE,
                filters: [
                    ["item", "anyof", items],
                    "AND",
                    ["location", "anyof", location],
                    "AND",
                    ["available", "greaterthan", 0], // Solo saldos positivos
                ],
                columns: [
                    search.createColumn({ name: "item", summary: "GROUP", sort: search.Sort.ASC, label: "item" }),
                    // 1. PRIMER CRITERIO: Fecha de caducidad más próxima (haciendo join al registro del lote)
                    search.createColumn({ name: "expirationdate", summary: "GROUP", join: "inventoryNumber", sort: search.Sort.ASC, label: "fechaExpiracion" }),
                    // 2. SEGUNDO CRITERIO: Menor cantidad disponible
                    search.createColumn({ name: "available", summary: "SUM", sort: search.Sort.ASC, label: "disponible" }),
                    search.createColumn({ name: "itemid", join: "item", summary: "GROUP", label: "nombre" }),
                    search.createColumn({ name: "islotitem", join: "item", summary: "GROUP", label: "esArticuloNumeradoPorLote" }),
                    search.createColumn({ name: "location", summary: "GROUP", label: "ubicacion" }),
                    search.createColumn({ name: "usebins", join: "item", summary: "GROUP", label: "articuloUsaDeposito" }),
                    search.createColumn({ name: "usesbins", join: "location", summary: "GROUP", label: "ubicacionUsaDeposito" }),
                    search.createColumn({ name: "inventorynumber", join: "inventoryNumber", summary: "GROUP", label: "numeroLote" }),
                    search.createColumn({ name: "binnumber", join: "binNumber", summary: "GROUP", label: "numeroDeposito" }),
                    search.createColumn({ name: "internalid", join: "binNumber", summary: "GROUP", label: "internalidDeposito" }),
                    search.createColumn({ name: "internalid", join: "inventoryNumber", summary: "GROUP", label: "internalidLote" })
                ]
            };

            // Ejecuta busqueda paginada
            let resultado = [];
            const RESULTADOS_POR_PAGINA = 1000; // Maximo de resultados por pagina 1000
            let busquedaPaginada = definirBusquedaPaginada(objSearch, RESULTADOS_POR_PAGINA);

            // Determinar conteo de paginas
            let conteoPaginas = Math.ceil(busquedaPaginada.count / RESULTADOS_POR_PAGINA);
            nLog.debug("busquedaBalanceInventarioLineasDetalle - conteoPaginas", { conteoPaginas: conteoPaginas });

            // Iterar para recuperar resultados de cada pagina
            for (let pagina = 0; pagina < conteoPaginas; pagina++) {
                let resultadosPagina = recuperarResultadosPaginados(busquedaPaginada, pagina);
                nLog.debug("busquedaBalanceInventarioLineasDetalle - resultadosPagina", {
                    pagina: pagina,
                    extension: resultadosPagina.length,
                    resultadosPagina: resultadosPagina
                });

                // Validar extension de resultados
                if (resultadosPagina.length > 0) {
                    // Agregar resultados agrupados por pagina a resultados totales
                    // resultado.push(resultadosPagina);
                    
                    // Agregar individualmente cada registro a resultados totales
                    resultadosPagina.forEach(item => {
                        item.pagina = pagina
                        resultado.push(item);
                    });
                };
            };

            // Ejecutar busqueda
            nLog.audit("busquedaBalanceInventarioLineasDetalle - resultados", {
                extension: resultado.length,
                resultado: resultado
            });

            let lineasBalanceInventarioDisponible = {};
            if (!resultado || resultado.length === 0) {
                return null;
            }

            for (let i = 0; i < resultado.length; i++) {

                let articulo = resultado[i];

                // nLog.debug("busquedaBalanceInventarioLineasDetalle - articulo", {
                //     articulo: articulo
                // });

                if (!lineasBalanceInventarioDisponible[articulo.item]) {
                    lineasBalanceInventarioDisponible[articulo.item] = {
                        nombre: articulo.nombre,
                        esArticuloNumeradoPorLote: articulo.esArticuloNumeradoPorLote,
                        articuloUsaDeposito: articulo.articuloUsaDeposito,
                        ubicacionUsaDeposito: articulo.ubicacionUsaDeposito,
                        disponible: 0,
                        lotes: [],
                        depositos: []
                    };
                };

                // Validar si el articulo es por lote
                if (
                    articulo.esArticuloNumeradoPorLote === true &&
                    (articulo.ubicacionUsaDeposito === false || articulo.articuloUsaDeposito === false) 
                ) {
                    if (articulo.numeroLote !== "- None -") {
                        lineasBalanceInventarioDisponible[articulo.item].disponible += parseFloat(articulo.disponible || 0)
                        lineasBalanceInventarioDisponible[articulo.item].lotes.push({
                            numeroLote: articulo.numeroLote,
                            fechaExpiracion: articulo.fechaExpiracion,
                            disponible: parseFloat(articulo.disponible || 0),
                            internalidLote: articulo.internalidLote,
                        });
                    }
                } else if (
                    articulo.esArticuloNumeradoPorLote === false &&
                    (articulo.ubicacionUsaDeposito === true && articulo.articuloUsaDeposito === true)
                ) {
                    if (articulo.numeroDeposito !== "- None -") {
                        lineasBalanceInventarioDisponible[articulo.item].disponible += parseFloat(articulo.disponible || 0)
                        lineasBalanceInventarioDisponible[articulo.item].depositos.push({
                            internalidDeposito: articulo.internalidDeposito,
                            disponible: parseFloat(articulo.disponible || 0)
                        });
                    }
                } else if (
                    articulo.esArticuloNumeradoPorLote === true &&
                    (articulo.ubicacionUsaDeposito === true && articulo.articuloUsaDeposito === true)
                ) {
                    if (articulo.numeroDeposito !== "- None -" && articulo.numeroLote !== "- None -") {
                        lineasBalanceInventarioDisponible[articulo.item].disponible += parseFloat(articulo.disponible || 0)
                        lineasBalanceInventarioDisponible[articulo.item].lotes.push({
                            numeroLote: articulo.numeroLote,
                            fechaExpiracion: articulo.fechaExpiracion,
                            disponible: parseFloat(articulo.disponible || 0),
                            internalidLote: articulo.internalidLote,
                            internalidDeposito: articulo.internalidDeposito,
                        });
                    }
                } else {
                    lineasBalanceInventarioDisponible[articulo.item].disponible += parseFloat(articulo.disponible || 0)
                }
            }

            nLog.audit("busquedaBalanceInventarioLineasDetalle - lineasBalanceInventarioDisponible", {
                lineasBalanceInventarioDisponible: lineasBalanceInventarioDisponible
            });
            return lineasBalanceInventarioDisponible;
        } catch (error) {
            nLog.error("busquedaBalanceInventarioLineasDetalle - error", error);
            throw error;
        }
    }

    /**
     * @function definirBusquedaPaginada - Definir objeto de busqueda
     * @param {{"type": String,"filters": array,"columns": array}} criteriosBusqueda - Objeto de parametros para la busqueda
     * @param {number} resultadosPorPagina - Numero de resultados a obtener
     * @returns {object} - Objeto de busqueda configurado
     */
    function definirBusquedaPaginada(criteriosBusqueda, resultadosPorPagina) {
        try {
            nLog.debug("definirBusquedaPaginada - parametros", {
                criteriosBusqueda: criteriosBusqueda,
                resultadosPorPagina: resultadosPorPagina
            });

            // Crear objeto de busqueda
            let searchObj = search.create(criteriosBusqueda);
            nLog.debug("definirBusquedaPaginada - searchObj", { searchObj: searchObj });

            // Definir paginado de busqueda
            let paginado = searchObj.runPaged({ pageSize: resultadosPorPagina });
            nLog.debug("definirBusquedaPaginada - paginado", { paginado: paginado });

            return paginado;
        } catch (error) {
            nLog.error("definirBusquedaPaginada - error", error);
            throw error;
        }
    }

    /**
     * @function recuperarResultadosPaginados - Ejecutar busqueda segun parametros indicados
     * @param {object} datosPagina - Objeto con datos para ejecucion busqueda
     * @param {number} numeroPagina - Pagina que se buscara
     * @returns {array}
     */
    function recuperarResultadosPaginados(datosPagina, numeroPagina) {
        try {
            nLog.debug("recuperarResultadosPaginados - parametros", {
                datosPagina: datosPagina,
                numeroPagina: numeroPagina
            })

            // Ejecutar busqueda en pagina indicada
            let searchPage = datosPagina.fetch({ index: numeroPagina });

            let searchResults = new Array();

            searchPage.data.forEach(function (item) {
                let objectCompiled = {};
                for (let i = 0; i < item.columns.length; i++) {
                    objectCompiled[item.columns[i].label] = item.getValue(item.columns[i]);
                }
                searchResults.push(objectCompiled);
                return true;
            });
            nLog.debug("recuperarResultadosPaginados Ejecutada", "Obtuvo resultados")
            return searchResults;
        } catch (error) {
            nLog.error("recuperarResultadosPaginados - error", error)
            throw error;
        }
    }

    return {
        obtenerStockDisponible: obtenerStockDisponible,
        busquedaBalanceInventarioLineasDetalle: busquedaBalanceInventarioLineasDetalle,
    };
});
