define(["N/search", "N/log"], function (search, nLog) {
    // Caché para almacenar el mapeo de script IDs a internal IDs
    const scriptIdToInternalIdCache = {};

    /**
     * Resuelve un script ID de custom list a su internal ID correspondiente
     * @param {string} scriptId - Script ID del custom list value
     * @returns {number|null} - Internal ID correspondiente o null si no se encuentra
     */
    function resolveScriptIdToInternalId(scriptId) {
        try {
            // nLog.debug("resolveScriptIdToInternalId - Buscando", `Script ID: ${scriptId}`);

            if (Object.keys(scriptIdToInternalIdCache).length === 0) {
                // nLog.debug("resolveScriptIdToInternalId", "Cargando caché desde NetSuite");

                // Buscar el internal ID usando el script ID
                const searchObj = search.create({
                    type: "customlist_2w_as_categoria_item_m",
                    columns: ["internalid", "scriptid"]
                });

                const results = searchObj.run().getRange({ start: 0, end: 1000 });
                // nLog.debug("resolveScriptIdToInternalId", `Resultados encontrados: ${results ? results.length : 0}`);

                if (results && results.length > 0) {
                    const scriptIdsEncontrados = [];
                    results.forEach((result) => {
                        const internalId = parseInt(result.getValue("internalid"), 10);
                        const currentScriptId = result.getValue("scriptid");
                        scriptIdToInternalIdCache[currentScriptId] = internalId;
                        scriptIdsEncontrados.push(currentScriptId);
                    });

                    // nLog.audit("resolveScriptIdToInternalId - Caché cargado", 
                    //     `Total: ${results.length} valores. Script IDs: ${scriptIdsEncontrados.join(", ")}`);
                }
            }

            const resultado = scriptIdToInternalIdCache[scriptId.toUpperCase()] || null;


            if (!resultado) {
                nLog.error("resolveScriptIdToInternalId - No encontrado",
                    `Script ID '${scriptId}' no encontrado en caché. Script IDs disponibles: ${Object.keys(scriptIdToInternalIdCache).join(", ")}`);
            }

            return resultado;

        } catch (e) {
            nLog.error("resolveScriptIdToInternalId Error", e);
            return null;
        }
    }

    const getFlow = (operationCode) => {
        const operationList = {
            BoletasEmitidas: "val_boletas_emitidas",
            NCEmitidas: "val_nc_emitidas",
            BonosEmitidos: "val_bonos_emitidos",
            BonosAnulados: "val_bonos_anulados",
            CoberturasEmitidas: "val_coberturas_emitidas",
            DetalleEgresos: "val_detalle_egresos",
            DetalleIngresos: "val_detalle_ingresos",
            CargosCobradosBoletas: "val_cargos_cobrados_boleta",
            CargosCobradosBonos: "val_cargos_cobrados_bonos",
            CargosCobradosAnticipos: "val_cargos_cobrados_anticipo",
            FormaPago: "val_forma_pago",
            PagoRelacionado: "val_pagos_relacionadas",
            CierreCaja: "val_cierre_caja",
            BonificacionAdicional: "val_11487064_7115118_sb1_925",
            BonosEmitidosConCopago: "val_11633818_7115118_sb1_841",
            BonosBonifRelacionada: "val_11679284_7115118_sb1_828",
            InterCompany: "val_11680510_7115118_sb1_361",
            BoletasEmitidasAnticipo: "val_11684438_7115118_sb1_863",
            BonoIva: "val_11722443_7115118_sb1_841",
            BonificacionAdicionalCliente: "val_11722592_7115118_sb1_792",
            VentaDirecta: "val_11723126_7115118_sb1_455",
            Redondeo: "val_12009496_7115118_sb1_789",
            // CierreCaja2: "val_12044101_7115118_sb1_200",
            Devolucion: "val_12091785_7115118_sb1_472",
            DiferenciaFactura: "val_12471481_7115118_sb1_938",
            DescuentoFactura: "val_12625716_7115118_sb1_660",
            NotaDebitoEmitida: "val_12792233_7115118_sb1_465"
        };

        const scriptId = operationList[operationCode];
        if (!scriptId) return null;

        // Retornar el internal ID directamente
        return resolveScriptIdToInternalId(scriptId);
    };

    return { getFlow };
});
