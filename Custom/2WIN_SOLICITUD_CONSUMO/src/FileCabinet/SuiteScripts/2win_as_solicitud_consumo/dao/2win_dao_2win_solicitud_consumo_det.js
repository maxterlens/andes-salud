/**
 * @NApiVersion 2.1
 * @module ./2win_dao_2win_solicitud_consumo_det.js
 * @NModuleScope Public
 */
define([
    "N/log",  
    "N/search",
    "N/ui/serverWidget",
    "N/record",
    "N/runtime",
    "./2win_dao_ubicacion",
    "./2win_dao"
], function (
    nLog,  
    search,
    serverWidget,
    record,
    runtime,
    daoUbicacion,
    dao
) {

    /* =========================
    * BUSQUEDAS
    * ========================= */

    /**
     * @function busquedaDetallesSolicitudConsumoPorReferencia - Función para realizar una busqueda en una tabla de netsuite.
     * @param {object} parametro - Parametros a usar en los filtros de la busqueda.
     * @return {array} - Resultados de la busqueda.
     */
    function busquedaDetallesSolicitudConsumoPorReferencia(parametro) {
        try {
            nLog.audit("busquedaDetallesSolicitudConsumoPorReferencia - parametro", {
                parametro: parametro,
            });

            // Tipo, filtros y columnas para la busqueda
            let objSearch = {
                type: "customrecord_2win_solicitud_consumo_det",
                filters: [
                    ["custrecord_2win_consumo_det_ref", "anyof", parametro]
                ],
                columns: [
                    search.createColumn({ name: "internalid", label: "internalid" }),
                    search.createColumn({ name: "custrecord_2win_consumo_det_articulo", label: "custrecord_2win_consumo_det_articulo" }),
                    search.createColumn({ name: "custrecord_2win_consumo_det_unidad", label: "custrecord_2win_consumo_det_unidad" }),
                    search.createColumn({ name: "custrecord_2win_consumo_det_cantidad", label: "custrecord_2win_consumo_det_cantidad" }),
                    search.createColumn({ name: "custrecord_2win_consumo_det_ubicacion", label: "custrecord_2win_consumo_det_ubicacion" }),
                    search.createColumn({ name: "custrecord_2win_consumo_det_departamento", label: "custrecord_2win_consumo_det_departamento" }),
                ]
            };
            let filtros = `tipo: ${objSearch.type}, filtros: ${objSearch.filters}`;

            // Ejecuta busqueda paginada
            let resultado = [];
            const RESULTADOS_POR_PAGINA = 1000; // Maximo de resultados por pagina 1000
            let busquedaPaginada = definirBusquedaPaginada(objSearch, RESULTADOS_POR_PAGINA);

            // Determinar conteo de paginas
            let conteoPaginas = Math.ceil(busquedaPaginada.count / RESULTADOS_POR_PAGINA);
            nLog.debug("busquedaDetallesSolicitudConsumoPorReferencia - conteoPaginas", { conteoPaginas: conteoPaginas });

            // Iterar para recuperar resultados de cada pagina
            for (let pagina = 0; pagina < conteoPaginas; pagina++) {
                let resultadosPagina = recuperarResultadosPaginados(busquedaPaginada, pagina);
                nLog.debug("busquedaDetallesSolicitudConsumoPorReferencia - resultadosPagina", {
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
            nLog.audit("busquedaDetallesSolicitudConsumoPorReferencia - resultados", {
                extension: resultado.length,
                resultado: resultado
            });

            return resultado;
        } catch (error) {
            nLog.error("busquedaDetallesSolicitudConsumoPorReferencia - error", error);
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

    /**
     * 
     * @param {string} parametro 
     * @returns {array} - Datos recuperados
     */
    function obtenerRegistroPorIdReferencia(parametro) {
        try {
            nLog.debug("obtenerRegistroPorIdReferencia - parametros", {
                parametro: parametro
            });

            // Objeto con detalles de busqueda
            const searchObject = search.create({
                type: "customrecord_2win_solicitud_consumo_det",
                filters: [
                    ["custrecord_2win_consumo_det_ref", "anyof", parametro]
                ],
                columns: [
                    search.createColumn({ name: "custrecord_2win_consumo_det_articulo", label: "custrecord_2win_consumo_det_articulo" }),
                    search.createColumn({ name: "custrecord_2win_consumo_det_unidad", label: "custrecord_2win_consumo_det_unidad" }),
                    search.createColumn({ name: "custrecord_2win_consumo_det_cantidad", label: "custrecord_2win_consumo_det_cantidad" }),
                    search.createColumn({ name: "custrecord_2win_consumo_det_ubicacion", label: "custrecord_2win_consumo_det_ubicacion" }),
                    search.createColumn({ name: "custrecord_2win_consumo_det_departamento", label: "custrecord_2win_consumo_det_departamento" }),
                ]
            });

            // Ejecutar busqueda
            const resultados = searchObject.run().getRange({ start: 0, end: 1000 });
            nLog.debug("obtenerRegistroPorIdReferencia - resultados", {
                extension: resultados.length,
                resultados: resultados
            });

            // Variable para almacenar datos recuperados de lineas
            let lineasData = [];

            // Iterar sobre cada resultado para recuperar valor o texto de campo segun corresponda
            resultados.forEach((resultado, i) => {
                nLog.debug("obtenerRegistroPorIdReferencia - resultado", {resultado: resultado});

                // Definir objecto con datos de linea
                let lineaData = {
                    articulo : resultado.getText("custrecord_2win_consumo_det_articulo"),
                    unidad : resultado.getText("custrecord_2win_consumo_det_unidad"),
                    cantidad : resultado.getValue("custrecord_2win_consumo_det_cantidad"),
                    ubicacion : resultado.getText("custrecord_2win_consumo_det_ubicacion"),
                    departamento : resultado.getText("custrecord_2win_consumo_det_departamento")
                };

                // Agregar linea a array de lineas
                lineasData.push(lineaData);
            });

            nLog.debug("obtenerRegistroPorIdReferencia - lineasData", {
                extension: lineasData.length,
                lineasData: lineasData
            });

            if (lineasData && lineasData.length > 0) {
                return lineasData
            } else {
                throw new Error("No se encontraron registros de detalle consumo para id: " + parametro);
            };
        } catch (error) {
            nLog.debug("obtenerRegistroPorIdReferencia - error", error);
            throw error;
        }
    }

    /**
     * 
     * @param {string} parametro 
     * @returns {array} - Datos recuperados
     */
    function recuperarLineasParaConfirmarConsumo(parametro) {
        try {
            nLog.debug("recuperarLineasParaConfirmarConsumo - parametros", {
                parametro: parametro
            });

            // Objeto con detalles de busqueda
            const searchObject = search.create({
                type: "customrecord_2win_solicitud_consumo_det",
                filters: [
                    ["custrecord_2win_consumo_det_ref", "anyof", parametro]
                ],
                columns: [
                    search.createColumn({ name: "custrecord_2win_consumo_det_articulo", label: "custrecord_2win_consumo_det_articulo" }),
                    search.createColumn({ name: "custrecord_2win_consumo_det_unidad", label: "custrecord_2win_consumo_det_unidad" }),
                    search.createColumn({ name: "custrecord_2win_consumo_det_cantidad", label: "custrecord_2win_consumo_det_cantidad" }),
                    search.createColumn({ name: "custrecord_2win_consumo_det_ubicacion", label: "custrecord_2win_consumo_det_ubicacion" }),
                    search.createColumn({ name: "custrecord_2win_consumo_det_departamento", label: "custrecord_2win_consumo_det_departamento" }),
                ]
            });

            // Ejecutar busqueda
            const resultados = searchObject.run().getRange({ start: 0, end: 1000 });
            nLog.debug("recuperarLineasParaConfirmarConsumo - resultados", {
                extension: resultados.length,
                resultados: resultados
            });

            if (resultados && resultados.length > 0) {
                return resultados
            } else {
                throw new Error("No se encontraron registros de detalle consumo para id referencia: " + parametro);
            };
        } catch (error) {
            nLog.debug("recuperarLineasParaConfirmarConsumo - error", error);
            throw error;
        }
    }

    /**
     * @function bloquearCamposAntesDeCargarRegistro - Bloquea campos especificos previa carga de registro
     * @param {object} form - Formulario de registro
     * @param {string} estado - Id de estado actual de registro
     * @param {object} ESTADOS - Ids de estados posibles
     * @param {object} registro - Datos del registro
     */
    function bloquearCamposAntesDeCargarRegistro(form, estado, ESTADOS, registro) {
        try {
            nLog.audit("bloquearCamposAntesDeCargarRegistro - parametro", {
                form: form,
                estado: estado,
                ESTADOS: ESTADOS,
                registro: registro
            }); 

            // Recuperar ubicacion seleccionada en registro
            const ubicacionId = registro.getValue("custrecord_2win_consumo_ubicacion");
            
            // Recuperar responsable de ubicacion
            const idResponsableUbicacion = daoUbicacion.determinarResponsableUbicacion(ubicacionId);
            
            // Recuperar id de solicitante
            const solicitanteId = registro.getValue("custrecord_2win_consumo_solicitante");

            // Recuperar id de usuario actual
            const idUsuarioActual = String(runtime.getCurrentUser().id);

            // Si estado es  bloquear todo el encabezado y impedir edicion de lineas detalle consumo
            if (
                (estado === ESTADOS.ENVIO_PENDIENTE && idUsuarioActual !== solicitanteId) || // ENVIO_PENDIENTE, y el usuario actual no es el solicitante
                (estado === ESTADOS.ENVIADA && idUsuarioActual !== idResponsableUbicacion) || // ENVIADO, y el usuario actual no es el responsable de bodega
                (estado === ESTADOS.CERRADA) // CERRADA
            ) {
                const camposBloquear = [
                    "custrecord_2win_consumo_det_articulo",
                    "custrecord_2win_consumo_det_cantidad",
                    "custrecord_2win_consumo_det_ubicacion",
                    "custrecord_2win_consumo_det_departamento",
                    "custrecord_2win_consumo_det_ref",
                    "isinactive"
                ];

                camposBloquear.forEach((fieldId) => {
                    const field = form.getField(fieldId);
                    if (field) {
                        field.updateDisplayType({ displayType: serverWidget.FieldDisplayType.INLINE });
                    }
                });

                nLog.debug("bloquearCamposAntesDeCargarRegistro - estado", {
                    estado: estado,
                    form: form
                });
            };
        } catch (error) {
            nLog.error("bloquearCamposAntesDeCargarRegistro - error", error);
            throw error;
        }
    }

    /* =========================
    * ELIMINACION
    * ========================= */

    /**
     * Elimina un registro de detalle de solicitud de consumo.
     * @param {number|string} internalIdRegistro - El internalid del registro a eliminar.
     * @returns {number} - El internalid del registro eliminado.
     */
    function eliminarRegistroDetalleSolicitudConsumo(internalIdRegistro) {
        try {
            // nLog.debug("eliminarRegistroDetalleSolicitudConsumo - internalIdRegistro", {
            //     internalIdRegistro: internalIdRegistro
            // });

            if (!internalIdRegistro) {
                throw new Error("No se indicó internalid de registro detalle solicitud consumo a eliminar");
            }

            // Eliminar registro indicado en internalIdRegistro
            let registroEliminado = record.delete({
                type: "customrecord_2win_solicitud_consumo_det",
                id: internalIdRegistro
            });
            // nLog.debug("eliminarRegistroDetalleDeConsumo - registroEliminado", {
            //     registroEliminado: registroEliminado
            // });

            return registroEliminado;
        } catch (error) {
            nLog.error("eliminarRegistroDetalleSolicitudConsumo - error", error);
            throw error;
        }
    }

    return {
        busquedaDetallesSolicitudConsumoPorReferencia: busquedaDetallesSolicitudConsumoPorReferencia,
        obtenerRegistroPorIdReferencia: obtenerRegistroPorIdReferencia,
        recuperarLineasParaConfirmarConsumo: recuperarLineasParaConfirmarConsumo,
        bloquearCamposAntesDeCargarRegistro: bloquearCamposAntesDeCargarRegistro,
        eliminarRegistroDetalleSolicitudConsumo: eliminarRegistroDetalleSolicitudConsumo
    };
});
