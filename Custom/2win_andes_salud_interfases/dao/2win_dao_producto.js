/**
 * @NApiVersion 2.1
 * @module ./2win_dao_producto.js
 * @NModuleScope Public
 */
define(["N/query", "N/record", "N/search", "N/log", "N/config", "../lib/2win_lib_peticion", "./2win_dao"], function (query, record, search, nLog, config, libPeticion, dao) {
    /**
     * @function busquedaRegistroPorUpcCode - Función para realizar una busqueda en una tabla de netsuite.
     * @param {string} parametro - Parametros a usar en los filtros de la busqueda.
     * @return {Array} - Resultados de la busqueda.
     */
    function busquedaRegistroPorUpcCode(parametro) {
        try {
            nLog.debug("busquedaRegistroPorUpcCode - parametro", {
                parametro: parametro,
                tipoDato: typeof parametro
            });

            // Tipo, filtros y columnas para la busqueda
            let objSearch = {
                type: search.Type.ITEM,
                filters: [
                    ["upccode", "is", parametro],
                    "AND",
                    ["custitem_2win_seccion", "is", "Grupo Prefactura"] // Solo recuperar items con seccion indicada
                ],
                columns: [
                    // Campos cuerpo registro
                    search.createColumn({ name: "internalid", label: "internalid" })
                ]
            };
            let filtros = `tipo: ${objSearch.type}, filtros: ${objSearch.filters}`;

            // Ejecutar busqueda
            let result = dao.obtenerResultados(objSearch);
            nLog.audit("busquedaRegistroPorUpcCode - resultados", {
                extension: result.length,
                resultado: result
            });

            // Valida que la busqueda retorne resultados
            if (result.length > 0) {
                return result;
            } else {
                throw new Error(`No se encontro producto para upcode: ${parametro}`);
            }
        } catch (error) {
            nLog.error("busquedaRegistroPorUpcCode - error", error);
            throw error;
        }
    }

    /**
     * @function busquedaMasivaPorUpcCode - Función optimizada para buscar múltiples productos en una sola consulta.
     * @param {Array<string>} codigos - Array de códigos UPC a buscar.
     * @return {Object} - Objeto con los productos encontrados (key: upcCode, value: internalid).
     */
    function busquedaMasivaPorUpcCode(codigos) {
        try {
            nLog.audit("busquedaMasivaPorUpcCode - inicio", {
                cantidad: codigos.length,
                codigos: codigos
            });

            // Eliminar duplicados y valores vacíos
            const codigosUnicos = [...new Set(codigos)].filter((c) => c && c.trim() !== "");

            if (codigosUnicos.length === 0) {
                nLog.warn("busquedaMasivaPorUpcCode - no hay códigos válidos");
                return {};
            }

            // Construir la consulta SQL con IN clause
            const placeholders = codigosUnicos.map(() => "?").join(",");
            const sql = `
                SELECT 
                    i.id AS internalid,
                    i.upccode AS upccode
                FROM 
                    item i
                WHERE 
                    i.upccode IN (${placeholders})
                    AND i.custitem_2win_seccion = 'Grupo Prefactura'
            `;

            nLog.debug("busquedaMasivaPorUpcCode - SQL", sql);

            // Ejecutar consulta SuiteQL
            const resultados = query
                .runSuiteQL({
                    query: sql,
                    params: codigosUnicos
                })
                .asMappedResults();

            // Convertir resultados a objeto para acceso rápido por upccode
            const mapaProductos = {};
            resultados.forEach((resultado) => {
                mapaProductos[resultado.upccode] = resultado.internalid;
            });

            nLog.audit("busquedaMasivaPorUpcCode - resultados", {
                solicitados: codigosUnicos.length,
                encontrados: Object.keys(mapaProductos).length,
                mapaProductos: mapaProductos
            });

            return mapaProductos;
        } catch (error) {
            nLog.error("busquedaMasivaPorUpcCode - error", error);
            throw error;
        }
    }

    /**
     * @function busquedaRegistroPorIdExterno - Función para realizar una busqueda en una tabla de netsuite.
     * @param {string} parametro - Parametros a usar en los filtros de la busqueda.
     * @return {Array} - Resultados de la busqueda.
     */
    function busquedaRegistroPorIdExterno(parametro) {
        try {
            nLog.debug("busquedaRegistroPorIdExterno - parametro", {
                parametro: parametro,
                tipoDato: typeof parametro
            });

            // Tipo, filtros y columnas para la busqueda
            let objSearch = {
                type: search.Type.ITEM,
                filters: [["externalid", "is", parametro]],
                columns: [
                    // Campos cuerpo registro
                    search.createColumn({ name: "internalid", label: "internalid" })
                ]
            };
            let filtros = `tipo: ${objSearch.type}, filtros: ${objSearch.filters}`;

            // Ejecutar busqueda
            let result = dao.obtenerResultados(objSearch);
            nLog.audit("busquedaRegistroPorIdExterno - resultados", {
                extension: result.length,
                resultado: result
            });

            // Valida que la busqueda retorne resultados
            if (result.length > 0) {
                return result;
            } else {
                throw new Error(`No se encontro producto para externalid: ${parametro}`);
            }
        } catch (error) {
            nLog.error("busquedaRegistroPorIdExterno - error", error);
            throw error;
        }
    }

    const listProductsByLocation = (locationId) => {
        const resultadosBodega = query
            .runSuiteQL({
                query: `
                SELECT
                    i.id AS item_id,
                    --i.itemid AS item_name,
                    --i.externalid AS item_externalid,
                    SUM(b.quantityOnHand) AS cantidad_fisica,
                    MAX(b.committedQtyPerLocation) AS cantidad_comprometida,
                    SUM(b.quantityOnHand) - MAX(b.committedQtyPerLocation) AS quantity_available,
                    SUM(b.quantityPicked) AS cantidad_enviada,
                    SUM(b.quantityavailable) AS cantidad_por_enviar,
                    l.id AS location_externalid,
                    sub.rutsubsidiaria,
                    uom.abbreviation AS unidad_abreviada
                FROM
                    item i
                    INNER JOIN iteminventorybalance b ON i.id = b.item
                    INNER JOIN location l ON l.id = b.location
                    LEFT JOIN unitstype u ON i.unitstype = u.id
                    LEFT JOIN unitstypeuom uom ON u.id = uom.unitstype AND uom.baseunit = 'T'
                    JOIN (
                        SELECT DISTINCT
                        lsm2.location,
                        s2.custrecord_2winrutsubsiudiaria AS rutsubsidiaria
                        FROM LocationSubsidiaryMap lsm2
                        JOIN subsidiary s2 ON lsm2.subsidiary = s2.id
                    ) sub ON l.id = sub.location
                WHERE
                    l.custrecord_2w_codigo_ubicacion = ?
                GROUP BY
                    i.id,
                    i.itemid,
                    i.externalid,
                    l.id,
                    uom.abbreviation,
                    sub.rutsubsidiaria
                ORDER BY
                    i.itemid;`,
                params: [locationId]
            })
            .asMappedResults();
        /**
             * "codigoProducto": "PRD-001",
            "nombreProducto": "Guantes de Látex Talla M",
            "cantidadDisponible": 150,
            "unidadMedida": "Caja"
             */
        return resultadosBodega.map((producto) => {
            return {
                nombreProducto: producto.item_name,
                codigoProducto: producto.item_id,
                unidadMedida: producto.unidad_abreviada,
                rutsubsidiaria: producto.rutsubsidiaria,
                cantidadDisponible: producto.quantity_available,
                cantidadDespachada: producto.cantidad_enviada,
                cantidadPorDespachar: producto.cantidad_por_enviar,
                cantidadComprometida: producto.cantidad_comprometida,
                cantidadTotal: producto.cantidad_fisica
            };
        });
    };
    const getStockProductoById = (itemId, locationId) => {
        try {
            const productInfo = query
                .runSuiteQL({
                    query: `
                SELECT
                    item.id AS itemid,
                    item.itemid AS itemname,
                    unitsTypeUom.abbreviation AS abbreviation,
                    /* Usamos BUILTIN.DF para obtener el nombre del tipo sin hacer JOIN extra */
                    BUILTIN.DF(item.itemtype) AS itemtype,
                    
                    /* CÁLCULO: (Stock Físico Bueno - Comprometido) / Tasa de Conversión */
                    /* El alias final se mantiene como 'quantityavailable' para tu integración */
                    (CASE 
                        WHEN (COALESCE(GoodStock.total_on_hand, 0) - AggregateItemLocation.quantitycommitted) > 0 
                        THEN (COALESCE(GoodStock.total_on_hand, 0) - AggregateItemLocation.quantitycommitted) 
                        ELSE 0 
                    END / unitsTypeUom.conversionRate) AS quantityavailable,

                    location.subsidiary AS locationsubsidiary,
                    location.id AS locationid,
                    BUILTIN.DF(location.id) AS locationname
                FROM
                    AggregateItemLocation
                    INNER JOIN item ON AggregateItemLocation.item = item.id
                    INNER JOIN location ON AggregateItemLocation.location = location.id
                    LEFT JOIN unitsTypeUom ON item.saleunit = unitsTypeUom.internalid
                    
                    /* Subconsulta para sumar solo inventario con Status 'Bueno' */
                    LEFT JOIN (
                        SELECT 
                            ItemInventoryBalance.item, 
                            ItemInventoryBalance.location, 
                            SUM(ItemInventoryBalance.quantityonhand) AS total_on_hand
                        FROM 
                            ItemInventoryBalance
                            /* Usamos el campo correcto: inventoryStatus */
                            INNER JOIN InventoryStatus ON ItemInventoryBalance.inventoryStatus = InventoryStatus.id
                        WHERE 
                            /* Ajusta estos nombres según tu lista exacta de estados */
                            InventoryStatus.name NOT IN ('Bloqueado', 'En Inspección', 'Damaged')
                            AND ItemInventoryBalance.item = ? 
                        GROUP BY 
                            ItemInventoryBalance.item, 
                            ItemInventoryBalance.location
                    ) AS GoodStock ON AggregateItemLocation.item = GoodStock.item 
                                AND AggregateItemLocation.location = GoodStock.location
                WHERE
                    item.id = ?
                    AND location.custrecord_2w_codigo_ubicacion = ?
                `,
                    params: [itemId, itemId, locationId]
                })
                .asMappedResults()[0];
            return productInfo;
        } catch (error) {
            throw new Error(`Error al obtener stock del producto con ID ${itemId} en la ubicación ${locationId}: ${error.message}`);
        }
    };

    /**
     * @function getStockMasivo - Consulta el stock de múltiples productos en múltiples bodegas en una sola query.
     * @param {Array<{itemId: string, locationCode: string}>} itemsLocations - Array de objetos con itemId y locationCode.
     * @return {Map<string, Object>} - Map con clave "itemId_locationCode" y valor datos del producto.
     */
    const getStockMasivo = (itemsLocations) => {
        try {
            nLog.audit("getStockMasivo - inicio", {
                cantidad: itemsLocations.length
            });

            if (!itemsLocations || itemsLocations.length === 0) {
                return new Map();
            }

            // Extraer itemIds únicos y locationCodes únicos
            const itemIdsUnicos = [...new Set(itemsLocations.map(il => il.itemId))];
            const locationCodesUnicos = [...new Set(itemsLocations.map(il => il.locationCode))];

            nLog.debug("getStockMasivo - valores únicos", {
                itemIds: itemIdsUnicos,
                locationCodes: locationCodesUnicos
            });

            // Construir placeholders para IN clause
            const itemPlaceholders = itemIdsUnicos.map(() => "?").join(",");
            const locationPlaceholders = locationCodesUnicos.map(() => "?").join(",");

            const sql = `
                SELECT
                    item.id AS itemid,
                    item.itemid AS itemname,
                    unitsTypeUom.abbreviation AS abbreviation,
                    BUILTIN.DF(item.itemtype) AS itemtype,
                    (CASE 
                        WHEN (COALESCE(GoodStock.total_on_hand, 0) - AggregateItemLocation.quantitycommitted) > 0 
                        THEN (COALESCE(GoodStock.total_on_hand, 0) - AggregateItemLocation.quantitycommitted) 
                        ELSE 0 
                    END / unitsTypeUom.conversionRate) AS quantityavailable,
                    location.subsidiary AS locationsubsidiary,
                    location.id AS locationid,
                    location.custrecord_2w_codigo_ubicacion AS locationcode,
                    BUILTIN.DF(location.id) AS locationname
                FROM
                    AggregateItemLocation
                    INNER JOIN item ON AggregateItemLocation.item = item.id
                    INNER JOIN location ON AggregateItemLocation.location = location.id
                    LEFT JOIN unitsTypeUom ON item.saleunit = unitsTypeUom.internalid
                    LEFT JOIN (
                        SELECT 
                            ItemInventoryBalance.item, 
                            ItemInventoryBalance.location, 
                            SUM(ItemInventoryBalance.quantityonhand) AS total_on_hand
                        FROM 
                            ItemInventoryBalance
                            INNER JOIN InventoryStatus ON ItemInventoryBalance.inventoryStatus = InventoryStatus.id
                        WHERE 
                            InventoryStatus.name NOT IN ('Bloqueado', 'En Inspección', 'Damaged')
                            AND ItemInventoryBalance.item IN (${itemPlaceholders})
                        GROUP BY 
                            ItemInventoryBalance.item, 
                            ItemInventoryBalance.location
                    ) AS GoodStock ON AggregateItemLocation.item = GoodStock.item 
                                AND AggregateItemLocation.location = GoodStock.location
                WHERE
                    item.id IN (${itemPlaceholders})
                    AND location.custrecord_2w_codigo_ubicacion IN (${locationPlaceholders})
            `;

            // Combinar parámetros: itemIds aparece dos veces en la query
            const params = [...itemIdsUnicos, ...itemIdsUnicos, ...locationCodesUnicos];

            nLog.debug("getStockMasivo - SQL params", params);

            const resultados = query.runSuiteQL({
                query: sql,
                params: params
            }).asMappedResults();

            // Crear Map con clave "itemid_locationcode" para acceso O(1)
            const mapaStock = new Map();
            resultados.forEach(resultado => {
                const clave = `${resultado.itemid}_${resultado.locationcode}`;
                mapaStock.set(clave, resultado);
            });

            nLog.audit("getStockMasivo - resultados", {
                combinacionesSolicitadas: itemsLocations.length,
                combinacionesEncontradas: mapaStock.size
            });

            return mapaStock;
        } catch (error) {
            nLog.error("getStockMasivo - error", error);
            throw error;
        }
    };

    const getIdByExternalId = (externalId) => {
        const result = query
            .runSuiteQL({
                query: `
                SELECT id FROM item WHERE externalid = ?
                `,
                params: [externalId]
            })
            .asMappedResults();
        return result.length > 0 ? result[0].id : null;
    };

    const searchRecipe = (identificadorUnicoFila) => {
        const recipeRecord = query
            .runSuiteQL({
                query: `
                select distinct 
                    transactionline.transaction  
                from transactionline
                where 
                    transactionline.custcol_2win_as_identificador_fila = ?
                `,
                params: [identificadorUnicoFila]
            })
            .asMappedResults()[0];
        return recipeRecord?.transaction;
    };
    const searchConcepto = (itemid) => {
        nLog.debug("searchConcepto - itemid", itemid);
        const resultConcepto = query
            .runSuiteQL({
                query: `
            select top 1 
                id, 
                upccode, 
                itemid 
            from item 
            where
                item.itemType = 'Service'
            and
                item.itemid = ?`,
                params: [itemid]
            })
            .asMappedResults();
        const idConcepto = resultConcepto[0]?.id;
        return idConcepto;
    };
    const mapearCamposConcepto = (parametro) => {
        const conceptos = [];
        if (!parametro.concepto) throw Error("Informacion necesaria invalida o inexistente");
        const { grupoPrefactura, conceptoEgresos, conceptoIngresos, conceptoFacturacion } = parametro.concepto;
        if (grupoPrefactura) {
            grupoPrefactura.forEach((prefactura) => {
                conceptos.push({
                    custitem_2win_seccion: prefactura.seccion,
                    upccode: prefactura.codGrupoPrefactura,
                    itemid: `${prefactura.nombreGrupoPrefactura?.trim()}-${prefactura.codGrupoPrefactura}`,
                    custitem_2win_vigente: prefactura.Vigente
                });
            });
        }
        if (conceptoEgresos) {
            conceptoEgresos.forEach((egresos) => {
                conceptos.push({
                    custitem_2win_seccion: egresos.seccion,
                    upccode: egresos.codEgreso,
                    itemid: `${egresos.nombreEgreso?.trim()}-${egresos.codEgreso}`,
                    custitem_2win_vigente: egresos.Vigente
                });
            });
        }
        if (conceptoIngresos) {
            conceptoIngresos.forEach((ingresos) => {
                conceptos.push({
                    custitem_2win_seccion: ingresos.seccion,
                    upccode: ingresos.codIngreso,
                    itemid: `${ingresos.nombreIngreso?.trim()}-${ingresos.codIngreso}`,
                    custitem_2win_vigente: ingresos.Vigente
                });
            });
        }
        if (conceptoFacturacion) {
            conceptoFacturacion.forEach((facturacion) => {
                conceptos.push({
                    custitem_2win_seccion: facturacion.seccion,
                    upccode: facturacion.codConceptoFacturacion,
                    itemid: `${facturacion.nombreConceptoFacturacion?.trim()}-${facturacion.codConceptoFacturacion}`,
                    custitem_2win_vigente: facturacion.Vigente
                });
            });
        }
        nLog.debug("mapearCamposConcepto", conceptos);
        return conceptos;
    };
    const create = (parametro) => {
        // --- 1. Obtener las cuentas por defecto desde la configuración de la compañía ---
        const accountingPreferences = config.load({
            type: config.Type.ACCOUNTING_PREFERENCES
        });

        // --- Obtener la cuenta de INGRESOS ---
        const defaultIncomeAccountId = accountingPreferences.getValue({
            fieldId: "INCOMEACCOUNT"
        });

        // --- Obtener la cuenta de GASTOS ---
        const defaultExpenseAccountId = accountingPreferences.getValue({
            fieldId: "EXPENSEACCOUNT"
        });

        // --- 2. Validar que ambas cuentas por defecto existan ---
        if (!defaultIncomeAccountId) {
            const errorMsg = `No se ha configurado una "Default Income Account" en las Accounting Preferences.`;
            nLog.error("Configuración Incompleta", errorMsg);
            throw errorMsg; // Detener la ejecución
        }

        if (!defaultExpenseAccountId) {
            const errorMsg = `No se ha configurado una "Default Expense Account" en las Accounting Preferences.`;
            nLog.error("Configuración Incompleta", errorMsg);
            throw errorMsg; // Detener la ejecución
        }
        // --- 3. Crear el registro del artículo ---
        const serviceItem = record.create({
            type: record.Type.SERVICE_ITEM,
            isDynamic: false
        });

        // Establecer valores fijos y del parámetro
        serviceItem.setValue({ fieldId: "subsidiary", value: 1 });
        serviceItem.setValue({ fieldId: "subtype", value: "sale" });
        serviceItem.setValue({ fieldId: "includechildren", value: true });
        serviceItem.setValue({ fieldId: "issaleitem", value: true });

        for (const [key, value] of Object.entries(parametro)) {
            if (!value) continue;
            serviceItem.setValue({ fieldId: key, value: value });
        }

        serviceItem.setValue({ fieldId: "taxschedule", value: 1 });

        // --- 4. Asignar las cuentas obtenidas dinámicamente ---
        serviceItem.setValue({ fieldId: "incomeaccount", value: defaultIncomeAccountId });
        // serviceItem.setValue({ fieldId: "expenseaccount", value: defaultExpenseAccountId });

        nLog.debug("incomeaccount a establecer", serviceItem.getValue("incomeaccount"));
        // nLog.debug("expenseaccount a establecer", serviceItem.getValue("expenseaccount"));

        return serviceItem.save();
    };

    const update = (itemId, parametro) => {
        const auxiliarObject = {};
        for (const [key, value] of Object.entries(parametro)) {
            if (key === "itemid") continue;
            if (!value) continue;
            auxiliarObject[key] = value;
        }
        if (!Object.keys(auxiliarObject) === 0) throw Error("No hay datos a actualizar");
        nLog.debug("update - auxiliarObject", auxiliarObject);
        nLog.debug("update - itemId", itemId);
        if (!itemId) throw Error(`No se encontro el item a actualizar`);
        return record.submitFields({
            type: record.Type.SERVICE_ITEM,
            id: itemId,
            values: auxiliarObject
        });
    };

    //--------------- EVENTOS ---------------
    /**
     * @function recuperarCamposRegistro - Recupera los campos de registro en NetSuite.
     * @param {record.Record} parametro - Registro de NetSuite del cual se recuperan los campos.
     * @returns {Object} - Objeto con los campos del registro.
     */
    function recuperarCamposRegistro(parametro) {
        try {
            nLog.audit("recuperarCamposRegistro - parametro", parametro);
            const familia = parametro.getValue({ fieldId: "custitem_wmsse_itemfamily" });

            const codFamilia = search.lookupFields({
                type: "customrecord_wmsse_item_family",
                id: familia,
                columns: ["custrecord_2win_familycode"]
            })?.custrecord_2win_familycode;
            const unidad = parametro.getValue({ fieldId: "baseunit" });
            const codUnidadProducto = query
                .runSuiteQL({
                    query: `select 
                            abbreviation
                        from
                            unitsTypeUom
                        where internalid = ?`,
                    params: [unidad]
                })
                .asMappedResults()[0]?.abbreviation;

            const taxschedule = search.lookupFields({ type: parametro.getValue("type"), columns: ["taxschedule"], id: parametro.getValue("id") })?.taxschedule[0]?.value;
            let camposRecuperados = {
                CodProducto: parametro.getValue({ fieldId: "id" }),
                NomProducto: parametro.getValue({ fieldId: "itemid" }),
                CodBarra: parametro.getValue({ fieldId: "upccode" }),
                CodFamilia: codFamilia,
                CodUnidProducto: codUnidadProducto,
                Vigente: parametro.getValue({ fieldId: "isinactive" }) ? "N" : "S",
                ProAfectoIva: Number(taxschedule) === 1 ? "S" : "N"
            };
            nLog.debug("recuperarCamposRegistro - camposRecuperados", camposRecuperados);
            return camposRecuperados;
        } catch (error) {
            nLog.error("recuperarCamposRegistro - error", error);
            throw error;
        }
    }
    function getRecord(id) {
        return record.load({
            type: record.Type.INVENTORY_ITEM,
            id: id
        });
    }

    /**
     * @function enviarProducto - Envía los datos de la producto a un servicio externo.
     * @param {string} url - URL del endpoint del servicio externo.
     * @param {object} cuerpoPeticion - El cuerpo de la petición a enviar.
     * @returns {object} - La respuesta del servicio externo.
     */
    function enviarUnidadProducto(url, cuerpoPeticion) {
        try {
            nLog.audit("enviarProducto - parametros", { url: url, cuerpoPeticion: cuerpoPeticion });

            const respuesta = libPeticion.ejecutarPeticionAutenticada("PUT", url, cuerpoPeticion);

            nLog.debug("enviarProducto - respuesta", respuesta);
            return respuesta;
        } catch (error) {
            nLog.error("enviarProducto - error", error);
            throw error;
        }
    }
    return {
        busquedaRegistroPorIdExterno: busquedaRegistroPorIdExterno,
        busquedaRegistroPorUpcCode: busquedaRegistroPorUpcCode,
        busquedaMasivaPorUpcCode: busquedaMasivaPorUpcCode,
        listProductsByLocation,
        getStockProductoById,
        getStockMasivo,
        getIdByExternalId,
        searchRecipe,
        create,
        update,
        mapearCamposConcepto,
        searchConcepto,
        //--------------- EVENTOS ---------------
        recuperarCamposRegistro: recuperarCamposRegistro,
        getRecord: getRecord,
        enviarUnidadProducto: enviarUnidadProducto
    };
});
