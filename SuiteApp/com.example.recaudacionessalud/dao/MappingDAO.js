/**
 * @NApiVersion 2.1
 */
define(["N/search", "N/record", "N/log"], function (search, record, nLog) {
    // Caché en memoria para evitar múltiples búsquedas
    let cachedMappings = null;

    // Índice hash para búsqueda O(1) - optimización clave para flujos con muchos movimientos
    let mappingsIndex = {};

    // Caché para resolución de script IDs a internal IDs
    let scriptIdCache = {};

    const COLUMNS = [
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
     * Resuelve un script ID de custom list a su internal ID correspondiente
     * @param {string} scriptId - Script ID del custom list value (ej: "val_boletas_emitidas")
     * @returns {number|null} - Internal ID correspondiente o null si no se encuentra
     */
    function resolveScriptIdToInternalId(scriptId) {
        try {
            if (Object.keys(scriptIdCache).length === 0) {
                // Buscar el internal ID usando el script ID
                const searchObj = search.create({
                    type: "customlist_2w_as_categoria_item_m",
                    // filters: [["scriptid", "is", scriptId]],
                    columns: ["internalid", "scriptid"]
                });

                const results = searchObj.run().getRange(0, 1000);
                results.forEach((result) => {
                    const internalId = result.getValue("internalid");
                    const scriptid = result.getValue("scriptid");
                    scriptIdCache[scriptid] = internalId;
                });
            }
            return scriptIdCache[scriptId];
        } catch (e) {
            nLog.error("resolveScriptIdToInternalId Error", e);
            return null;
        }
    }

    /**
     * Genera clave única para el índice hash
     * @param {object} criteria - Criterios de búsqueda
     * @returns {string} - Clave única para el índice
     */
    function generateIndexKey({ categoria, formaPagoTipo, codigo, subsidiaria }) {
        const parts = [categoria || "", formaPagoTipo?.toUpperCase() || "", codigo?.toString() || "", subsidiaria?.toString() || ""];
        return parts.join("|");
    }

    /**
     * Carga todos los registros del custom record una sola vez y construye índice hash
     * @returns {Array} - Array con todos los mappings
     */
    function loadAllMappings() {
        const allMappings = [];
        mappingsIndex = {}; // Resetear índice

        const searchObj = search.create({
            type: "customrecord_2w_as_item_mapping",
            filters: [],
            columns: COLUMNS
        });

        let range = searchObj.run().getRange({ start: 0, end: 1000 });
        while (range && range.length > 0) {
            allMappings.push(...range);
            range = searchObj.run().getRange({ start: allMappings.length, end: allMappings.length + 1000 });
        }

        nLog.debug("MappingDAO", `Cargados ${allMappings.length} mappings en caché`);

        // Construir índice hash para búsqueda O(1)
        allMappings.forEach((item) => {
            const categoria = item.getValue("custrecord_item_categoria");
            const formaPago = item.getText("custrecord_item_forma_pago");
            const codigo = item.getValue("custrecord_item_codigo");
            const subsidiaria = item.getValue("custrecord_2win_recaudaciones_subsidiary");

            // Crear múltiples claves para búsqueda flexible
            const keys = [
                // Clave completa con todos los parámetros
                generateIndexKey({ categoria, formaPagoTipo: formaPago, codigo, subsidiaria }),
                // Clave sin subsidiaria (para búsquedas que no la especifican)
                generateIndexKey({ categoria, formaPagoTipo: formaPago, codigo }),
                // Clave sin código ni subsidiaria (solo categoría + forma de pago)
                generateIndexKey({ categoria, formaPagoTipo: formaPago }),
                // Clave solo por categoría
                generateIndexKey({ categoria })
            ];

            // Almacenar en índice con todas las claves relevantes
            keys.forEach((key) => {
                if (!mappingsIndex[key]) {
                    mappingsIndex[key] = [];
                }
                mappingsIndex[key].push(item);
            });
        });

        nLog.debug("MappingDAO", `Índice construido con ${Object.keys(mappingsIndex).length} claves`);
        return allMappings;
    }

    /**
     * Busca en el índice hash O(1) según los criterios
     * @param {Array} cachedData - Datos cargados en caché (no usado, mantenido para compatibilidad)
     * @param {object} criterios - Criterios de búsqueda
     * @returns {object|null} - Resultado encontrado o null
     */
    function findInCachedData(cachedData, { categoria, formaPagoTipo, codigo, subsidiaria }) {
        // Construir clave de búsqueda intentando desde la más específica a la más general
        const searchKeys = [
            generateIndexKey({ categoria, formaPagoTipo, codigo, subsidiaria }),
            generateIndexKey({ categoria, formaPagoTipo, codigo }),
            generateIndexKey({ categoria, formaPagoTipo }),
            generateIndexKey({ categoria })
        ];

        // Buscar en orden de especificidad (más específico primero)
        for (const key of searchKeys) {
            const candidates = mappingsIndex[key];
            if (candidates && candidates.length > 0) {
                // Encontrar candidato exacto si hay múltiples
                const exactMatch = candidates.find((item) => {
                    let match = true;
                    if (formaPagoTipo && item.getText("custrecord_item_forma_pago")?.toUpperCase() !== formaPagoTipo?.toUpperCase()) {
                        match = false;
                    }
                    if (match && codigo && item.getValue("custrecord_item_codigo").toString() !== codigo.toString()) {
                        match = false;
                    }
                    if (match && subsidiaria && Number(item.getValue("custrecord_2win_recaudaciones_subsidiary")) !== Number(subsidiaria)) {
                        match = false;
                    }
                    return match;
                });

                const result = exactMatch || candidates[0]; // Usar match exacto o primer candidato

                if (result) {
                    return {
                        categoria: result.getValue("custrecord_item_categoria"),
                        codigo: result.getValue("custrecord_item_codigo"),
                        articuloBoleta: result.getValue("custrecord_item_articulo_boleta"),
                        cuentaCobrarBoleta: result.getValue("custrecord_item_cuenta_cobrar_boleta"),
                        cuentaContableCredito: result.getValue("custrecord_item_cuenta_contable"),
                        cuentaContableDebito: result.getValue("custrecord_item_id"),
                        tipoAsiento: result.getValue("custrecord_item_articulo_asiento"),
                        cliente: result.getValue("custrecord_2win_recaudaciones_cliente"),
                        subsidiaria: result.getValue("custrecord_2win_recaudaciones_subsidiary")
                    };
                }
            }
        }

        return {};
    }

    /**
     * Obtiene configuración completa del Item Mapping basado en categoría y código
     * @param {string} categoria - Categoría del JSON (boletasEmitidas, detalleEgresos, etc.) o script ID
     * @param {string} codigo - Código específico
     * @returns {object|null} - Objeto con configuración completa o null si no se encuentra
     */
    function getItemMapping({ categoria, formaPagoTipo, codigo, subsidiaria }) {
        try {
            formaPagoTipo = formaPagoTipo?.trim();
            if (!categoria) throw new Error("No se encuentra configuracion solicitada");
            // Si categoria es un script ID (comienza con "val_"), resolverlo a internal ID
            let internalIdCategoria = categoria;
            if (typeof categoria === "string" && categoria.startsWith("val_")) {
                internalIdCategoria = resolveScriptIdToInternalId(categoria);
                if (!internalIdCategoria) {
                    nLog.error("getItemMapping", `No se pudo resolver el script ID: ${categoria}`);
                    return {};
                }
            }

            // nLog.debug("MappingDAO getItemMapping", {
            //     categoria: categoria,
            //     internalIdCategoria: internalIdCategoria,
            //     formaPagoTipo: formaPagoTipo,
            //     codigo: codigo,
            //     subsidiaria: subsidiaria
            // });

            // Primera vez: cargar todos los mappings al caché
            if (!cachedMappings) {
                cachedMappings = loadAllMappings();
            }

            // Buscar en el caché usando el internal ID resuelto
            const result = findInCachedData(cachedMappings, { categoria: internalIdCategoria, formaPagoTipo, codigo, subsidiaria });

            if (result) {
                // nLog.debug("getItemMapping", {
                //     categoria: result.categoria,
                //     codigo: result.codigo,
                //     articuloBoleta: result.articuloBoleta,
                //     cuentaCobrarBoleta: result.cuentaCobrarBoleta,
                //     cuentaContableCredito: result.cuentaContableCredito,
                //     cuentaContableDebito: result.cuentaContableDebito,
                //     tipoAsiento: result.tipoAsiento
                // });
                return result;
            }

            // nLog.audit("MappingDAO", `No se encontró mapping para categoría: ${categoria}, código: ${codigo}, subsidiaria: ${subsidiaria}`);
            return {};
        } catch (e) {
            nLog.error("MappingDAO getItemMapping Error", e);
            return {};
        }
    }

    return {
        getItemMapping: getItemMapping,
        resolveScriptIdToInternalId: resolveScriptIdToInternalId
    };
});
