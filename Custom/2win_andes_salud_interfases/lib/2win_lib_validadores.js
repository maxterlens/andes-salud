define(["N/search", "N/log"], function (search, nLog) {
    // ---------------------------------------------------------------------------------------------------------------------
    // Busca Subsidiarias por RUT	(customsearch_2w_busca_subsidiaria_x_rut)
    // https://7115118-sb1.app.netsuite.com/app/common/search/searchresults.nl?searchid=2027
    // ---------------------------------------------------------------------------------------------------------------------
    const buscarSubsidiariaPorRUT = (rut) => {
        let subsidiarySearchObj = search.create({
            type: "subsidiary",
            filters: [["custrecord_2winrutsubsiudiaria", "is", rut] /* RUT de subsidiaria */, "AND", ["iselimination", "is", "F"]],
            columns: [
                search.createColumn({ name: "name", label: "Nombre" }),
                search.createColumn({ name: "custrecord_2winrutsubsiudiaria", label: "Rut Subsidiaria" }),
                search.createColumn({ name: "taxidnum", label: "ID fiscal" }),
                search.createColumn({ name: "custrecord_2w_esclinica", label: "Es Cl�nica?" }),
                search.createColumn({ name: "representingvendor", label: "Proveedor representante" }),
                search.createColumn({ name: "representingcustomer", label: "Cliente representante" }),
                search.createColumn({ name: "iselimination", label: "Eliminaci�n" })
            ]
        });
        let results = [];
        let searchResultCount = subsidiarySearchObj.runPaged().count;
        nLog.debug("subsidiarySearchObj result count", searchResultCount);
        subsidiarySearchObj.run().each(function (result) {
            results.push(result);
            return true;
        });
        return results;
    };
    // ---------------------------------------------------------------------------------------------------------------------

    // ---------------------------------------------------------------------------------------------------------------------
    // Busca Cliente por RUT	(customsearch_2w_busca_cliente_x_rut)
    // https://7115118-sb1.app.netsuite.com/app/common/search/searchresults.nl?searchid=2022
    // ---------------------------------------------------------------------------------------------------------------------
    const buscarClientePorRUT = (rut) => {
        let customerSearchObj = search.create({
            type: "customer",
            filters: [["custentity_2wrut", "is", rut] /* RUT de cliente */],
            columns: [
                search.createColumn({ name: "entityid", label: "Nombre" }),
                search.createColumn({ name: "custentity_pac_numficha", label: "Ficha" }),
                search.createColumn({ name: "custentity_2wrut", label: "RUT" }),
                search.createColumn({ name: "email", label: "email" })
            ]
        });
        let results = [];
        let searchResultCount = customerSearchObj.runPaged().count;
        nLog.debug("customerSearchObj result count", searchResultCount);
        customerSearchObj.run().each(function (result) {
            results.push(result);
            return true;
        });
        return results;
    };
    // ---------------------------------------------------------------------------------------------------------------------

    // ---------------------------------------------------------------------------------------------------------------------
    // Busca Cliente por Ficha	(customsearch_2w_busca_cliente_x_ficha)
    // https://7115118-sb1.app.netsuite.com/app/common/search/searchresults.nl?searchid=2021
    // ---------------------------------------------------------------------------------------------------------------------
    const buscarClientePorFicha = (ficha) => {
        let customerSearchObj = search.create({
            type: "customer",
            filters: [["custentity_pac_numficha", "is", ficha] /* N�mero de ficha de paciente/cliente */],
            columns: [
                search.createColumn({ name: "entityid", label: "Nombre" }),
                search.createColumn({ name: "custentity_pac_numficha", label: "Ficha" }),
                search.createColumn({ name: "custentity_2wrut", label: "RUT" }),
                search.createColumn({ name: "email", label: "email" })
            ]
        });
        let results = [];
        let searchResultCount = customerSearchObj.runPaged().count;
        nLog.debug("customerSearchObj result count", searchResultCount);
        customerSearchObj.run().each(function (result) {
            results.push(result);
            return true;
        });
        return results;
    };
    // ---------------------------------------------------------------------------------------------------------------------

    // ---------------------------------------------------------------------------------------------------------------------
    // Valida Reporte de Caja	(customsearch_2w_valida_reporte_caja)
    // https://7115118-sb1.app.netsuite.com/app/common/search/searchresults.nl?searchid=2017
    // ---------------------------------------------------------------------------------------------------------------------
    const validaReporteCaja = (idCaja, fechaCaja, aperturaCaja) => {
        let customrecord_2w_recaudaciones_rootSearchObj = search.create({
            type: "customrecord_2w_recaudaciones_root",
            filters: [
                ["custrecord_2w_r_unidad_caja", "equalto", idCaja] /* ID Caja */,
                "AND",
                ["custrecord_2w_r_fecha_caja", "on", fechaCaja] /* Fecha del reporte de caja */,
                "AND",
                ["custrecord_2w_r_apertura_caja", "equalto", aperturaCaja] /* N�mero de apertura/turno de caja */
            ],
            columns: [
                search.createColumn({ name: "custrecord_2w_r_unidad_caja", label: "Unidad Caja" }),
                search.createColumn({ name: "custrecord_2w_r_fecha_caja", label: "Fecha Caja" }),
                search.createColumn({ name: "custrecord_2w_r_apertura_caja", label: "Apertura Caja" }),
                search.createColumn({ name: "custrecord_2w_r_razon_social_caja", label: "Razon Social Caja" })
            ]
        });
        let results = [];
        let searchResultCount = customrecord_2w_recaudaciones_rootSearchObj.runPaged().count;
        nLog.debug("customrecord_2w_recaudaciones_rootSearchObj result count", searchResultCount);
        customrecord_2w_recaudaciones_rootSearchObj.run().each(function (result) {
            results.push(result);
            return true;
        });
        return results;
    };
    // ---------------------------------------------------------------------------------------------------------------------

    // ---------------------------------------------------------------------------------------------------------------------
    // Valida Recaudaciones (Detalle)	(customsearch_2w_valida_recaudaciones_det)
    // https://7115118-sb1.app.netsuite.com/app/common/search/searchresults.nl?searchid=2012
    // ---------------------------------------------------------------------------------------------------------------------
    const validaRecaudacionesDetalle = (idCaja, numeroMovimiento) => {
        let customrecord_2w_recaudaciones_detSearchObj = search.create({
            type: "customrecord_2w_recaudaciones_det",
            filters: [["custrecord_2w_d_unidad_caja", "anyof", idCaja] /* ID Unidad Caja */, "AND", ["custrecord_2w_d_numero_movimiento", "equalto", numeroMovimiento] /* N�mero movimiento */],
            columns: [
                search.createColumn({ name: "custrecord_2w_d_unidad_caja", label: "Unidad Caja" }),
                search.createColumn({ name: "custrecord_2w_d_numero_movimiento", label: "N�mero de Movimiento" }),
                search.createColumn({ name: "custrecord_2w_d_id_paciente", label: "Id paciente" }),
                search.createColumn({ name: "custrecord_2w_d_ficha", label: "Ficha" }),
                search.createColumn({ name: "custrecord_2w_d_ingreso", label: "Ingreso" }),
                search.createColumn({ name: "custrecord_2w_d_prefactura", label: "Prefactura" }),
                search.createColumn({ name: "custrecord_2w_d_cuenta_paciente", label: "Cuenta Paciente" }),
                search.createColumn({ name: "custrecord_2w_d_cliente", label: "Cliente" })
            ]
        });
        let results = [];
        let searchResultCount = customrecord_2w_recaudaciones_detSearchObj.runPaged().count;
        nLog.debug("customrecord_2w_recaudaciones_detSearchObj result count", searchResultCount);
        customrecord_2w_recaudaciones_detSearchObj.run().each(function (result) {
            results.push(result);
            return true;
        });
        return results;
    };
    // ---------------------------------------------------------------------------------------------------------------------

    // ---------------------------------------------------------------------------------------------------------------------
    // Valida Facturas en Recaudaciones	(customsearch_2w_valida_factura_recaudaci)
    // https://7115118-sb1.app.netsuite.com/app/common/search/searchresults.nl?searchid=2018
    // ---------------------------------------------------------------------------------------------------------------------
    const validaFacturasRecaudaciones = (idSubsidiaria, folioFactura, tipoDocumento) => {
        let customrecord_2w_recaudaciones_facturasSearchObj = search.create({
            type: "customrecord_2w_recaudaciones_facturas",
            filters: [
                ["custrecord_2w_f_subsidiaria", "anyof", idSubsidiaria] /* ID Subsidiaria */,
                "AND",
                ["custrecord_2w_f_tipo_documento", "is", tipoDocumento] /* Tipo Documento "Afecto/Exento"*/,
                "AND",
                ["custrecord_2w_f_folio_documento", "is", folioFactura] /* Folio factura */
            ],
            columns: [
                search.createColumn({ name: "custrecord_2w_f_subsidiaria", label: "Subsidiaria" }),
                search.createColumn({ name: "custrecord_2w_f_folio_documento", label: "Folio Documento" }),
                search.createColumn({ name: "custrecord_2w_f_tipo_documento", label: "Tipo Documento" }),
                search.createColumn({ name: "custrecord_2w_f_razon_social", label: "Raz�n Social" }),
                search.createColumn({ name: "custrecord_2w_f_fecha_documento", label: "Fecha Documento" }),
                search.createColumn({ name: "custrecord_2w_f_fecha_vencimiento", label: "Fecha Vencimiento" }),
                search.createColumn({ name: "custrecord_2w_f_rut_cliente", label: "RUT Cliente" }),
                search.createColumn({ name: "custrecord_2w_f_condicion_pago", label: "Condici�n Pago" }),
                search.createColumn({ name: "custrecord_2w_f_tipo_facturacion", label: "Tipo Facturaci�n" }),
                search.createColumn({ name: "custrecord_2w_f_tipo_doc_ref", label: "Tipo Documento Referencia" }),
                search.createColumn({ name: "custrecord_2w_f_folio_doc_ref", label: "Folio Documento Referencia" }),
                search.createColumn({ name: "custrecord_2w_f_cod_ref", label: "C�digo Referencia" }),
                search.createColumn({ name: "custrecord_2w_f_cliente", label: "Cliente" })
            ]
        });
        let results = [];
        let searchResultCount = customrecord_2w_recaudaciones_facturasSearchObj.runPaged().count;
        nLog.debug("customrecord_2w_recaudaciones_facturasSearchObj result count", searchResultCount);
        customrecord_2w_recaudaciones_facturasSearchObj.run().each(function (result) {
            results.push(result);
            return true;
        });
        return results;
    };

    // ---------------------------------------------------------------------------------------------------------------------

    // ---------------------------------------------------------------------------------------------------------------------
    // Valida Boletas en Recaudaciones	(customsearch_2w_valida_boleta_recaudacio)
    // https://7115118-sb1.app.netsuite.com/app/common/search/searchresults.nl?searchid=2019
    // ---------------------------------------------------------------------------------------------------------------------
    const validaBoletasRecaudaciones = (idSubsidiaria, folioBoleta, tipoDocumento) => {
        let customrecord_2w_recaudaciones_bolSearchObj = search.create({
            type: "customrecord_2w_recaudaciones_bol",
            filters: [
                ["custrecord_2w_bol_subsidiaria", "anyof", idSubsidiaria] /* ID Subsidiaria */,
                "AND",
                ["custrecord_2w_bol_tipo_documento", "is", tipoDocumento] /* Tipo Documento "Afecto/Exento"*/,
                "AND",
                ["custrecord_2w_bol_folio_boleta", "is", folioBoleta] /* Folio boleta */
            ],
            columns: [
                search.createColumn({ name: "custrecord_2w_bol_id_detalle", label: "ID Detalle" }),
                search.createColumn({ name: "custrecord_2w_bol_folio_boleta", label: "Folio Boleta" }),
                search.createColumn({ name: "custrecord_2w_bol_fecha_emision", label: "Fecha Emisi�n" }),
                search.createColumn({ name: "custrecord_2w_bol_razon_social_cobro", label: "Raz�n Social Cobro" }),
                search.createColumn({ name: "custrecord_2w_bol_monto_neto", label: "Monto Neto" }),
                search.createColumn({ name: "custrecord_2w_bol_monto_exento", label: "Monto Exento" }),
                search.createColumn({ name: "custrecord_2w_bol_monto_iva", label: "Monto IVA" }),
                search.createColumn({ name: "custrecord_2w_bol_monto_total", label: "Monto Total" }),
                search.createColumn({ name: "custrecord_2w_bol_tipo_documento", label: "Tipo de Documento" }),
                search.createColumn({ name: "custrecord_2w_bol_cliente", label: "Cliente" })
            ]
        });
        let results = [];
        let searchResultCount = customrecord_2w_recaudaciones_bolSearchObj.runPaged().count;
        nLog.debug("customrecord_2w_recaudaciones_bolSearchObj result count", searchResultCount);
        customrecord_2w_recaudaciones_bolSearchObj.run().each(function (result) {
            results.push(result);
            return true;
        });
        return results;
    };
    // ---------------------------------------------------------------------------------------------------------------------

    // ---------------------------------------------------------------------------------------------------------------------
    // Valida NC Emitidas en Recaudaciones	(customsearch_2w_valida_nc_recaudaciones)
    // https://7115118-sb1.app.netsuite.com/app/common/search/searchresults.nl?searchid=2020
    // ---------------------------------------------------------------------------------------------------------------------
    const validaNCRecaudaciones = (idSubsidiaria, folioNC) => {
        let customrecord_2w_recaudaciones_nceSearchObj = search.create({
            type: "customrecord_2w_recaudaciones_nce",
            filters: [["custrecord_2w_nce_subsidiaria", "anyof", idSubsidiaria] /* ID Subsidiaria */, "AND", ["custrecord_2w_nce_folio_nc", "is", folioNC] /* Folio NC */],
            columns: [
                search.createColumn({ name: "custrecord_2w_nce_subsidiaria", label: "Subsidiaria" }),
                search.createColumn({ name: "custrecord_2w_nce_folio_nc", label: "Folio NC" }),
                search.createColumn({ name: "custrecord_2w_nce_id_detalle", label: "ID Detalle" }),
                search.createColumn({ name: "custrecord_2w_nce_rut_receptor", label: "RUT Receptor" }),
                search.createColumn({ name: "custrecord_2w_nce_tipo_documento_ref", label: "Tipo Documento Referencia" }),
                search.createColumn({ name: "custrecord_2w_nce_folio_referencia", label: "Folio Referencia" }),
                search.createColumn({ name: "custrecord_2w_nce_fecha_referencia", label: "Fecha Referencia" }),
                search.createColumn({ name: "custrecord_2w_nce_codigo_referencia", label: "C�digo Referencia" }),
                search.createColumn({ name: "custrecord_2w_nce_fecha_emision", label: "Fecha Emisi�n" }),
                search.createColumn({ name: "custrecord_2w_nce_razon_social_cobro", label: "Raz�n Social Cobro" }),
                search.createColumn({ name: "custrecord_2w_nce_monto_neto", label: "Monto Neto" }),
                search.createColumn({ name: "custrecord_2w_nce_monto_exento", label: "Monto Exento" }),
                search.createColumn({ name: "custrecord_2w_nce_monto_iva", label: "Monto IVA" }),
                search.createColumn({ name: "custrecord_2w_nce_monto_total", label: "Monto Total" }),
                search.createColumn({ name: "custrecord_2w_nce_receptor", label: "Receptor" })
            ]
        });
        let results = [];
        let searchResultCount = customrecord_2w_recaudaciones_nceSearchObj.runPaged().count;
        nLog.debug("customrecord_2w_recaudaciones_nceSearchObj result count", searchResultCount);
        customrecord_2w_recaudaciones_nceSearchObj.run().each(function (result) {
            results.push(result);
            return true;
        });
        return results;
    };
    // ---------------------------------------------------------------------------------------------------------------------

    // ---------------------------------------------------------------------------------------------------------------------
    // Valida Bonos en Recaudaciones	(customsearch_2w_valida_bonos_recaudacion)
    // https://7115118-sb1.app.netsuite.com/app/common/search/searchresults.nl?searchid=2024
    // ---------------------------------------------------------------------------------------------------------------------
    const validaBonosRecaudaciones = (idSubsidiaria, folioBono) => {
        let customrecord_2w_recaudaciones_bonSearchObj = search.create({
            type: "customrecord_2w_recaudaciones_bon",
            filters: [["custrecord_2w_bon_subsidiaria", "anyof", idSubsidiaria] /* ID Subsidiaria */, "AND", ["custrecord_2w_bon_folio_bono", "is", folioBono] /* Folio Bono */],
            columns: [
                search.createColumn({ name: "custrecord_2w_bon_subsidiaria", label: "Subsidiaria" }),
                search.createColumn({ name: "custrecord_2w_bon_folio_bono", label: "Folio Bono" }),
                search.createColumn({ name: "custrecord_2w_bon_razon_social_cobro", label: "Raz�n Social Cobro" }),
                search.createColumn({ name: "custrecord_2w_bon_monto_neto", label: "Monto Neto" }),
                search.createColumn({ name: "custrecord_2w_bon_monto_exento", label: "Monto Exento" }),
                search.createColumn({ name: "custrecord_2w_bon_monto_iva", label: "Monto IVA" }),
                search.createColumn({ name: "custrecord_2w_bon_monto_total", label: "Monto Total" }),
                search.createColumn({ name: "custrecord_2w_bon_copago_bono", label: "Copago Bono" }),
                search.createColumn({ name: "custrecord_2w_bon_copago_cobrado", label: "Copago Cobrado" }),
                search.createColumn({ name: "custrecord_2w_bon_bonificacion_adicional", label: "Bonificaci�n Adicional" }),
                search.createColumn({ name: "custrecord_2w_bon_fecha_emision", label: "Fecha Emisi�n" }),
                search.createColumn({ name: "custrecord_2w_bon_rut_prevision", label: "RUT Previsi�n" }),
                search.createColumn({ name: "custrecord_2w_bon_tipo_bono", label: "Tipo Bono" }),
                search.createColumn({ name: "custrecord_2w_bon_rut_entidad_facturacio", label: "RUT Entidad a Facturar" }),
                search.createColumn({ name: "custrecord_2w_bon_cliente", label: "Cliente" }),
                search.createColumn({ name: "custrecord_2w_bon_prevision_paciente", label: "Previsi�n Paciente" }),
                search.createColumn({ name: "custrecord_2w_bon_entidad_facturacion", label: "Entidad Facturaci�n" })
            ]
        });
        let results = [];
        let searchResultCount = customrecord_2w_recaudaciones_bonSearchObj.runPaged().count;
        nLog.debug("customrecord_2w_recaudaciones_bonSearchObj result count", searchResultCount);
        customrecord_2w_recaudaciones_bonSearchObj.run().each(function (result) {
            results.push(result);
            return true;
        });
        return results;
    };
    // ---------------------------------------------------------------------------------------------------------------------

    // Valida Coberturas Emitidas en Recaudaciones	(customsearch_2w_valida_coberturas_recaud)
    // https://7115118-sb1.app.netsuite.com/app/common/search/searchresults.nl?searchid=2026
    const validaCoberturasRecaudaciones = (idSubsidiaria, folioCobertura) => {
        let customrecord_2w_recaudaciones_cobSearchObj = search.create({
            type: "customrecord_2w_recaudaciones_cob",
            filters: [["custrecord_2w_cob_subsidiaria", "anyof", idSubsidiaria] /* ID Subsidiaria */, "AND", ["custrecord_2w_cob_folio", "is", folioCobertura] /* Folio Cobro */],
            columns: [
                search.createColumn({ name: "custrecord_2w_cob_subsidiaria", label: "Subsidiaria" }),
                search.createColumn({ name: "custrecord_2w_cob_folio", label: "Folio" }),
                search.createColumn({ name: "custrecord_2w_cob_id_detalle", label: "ID Detalle" }),
                search.createColumn({ name: "custrecord_2w_cob_razon_social_cobro", label: "Raz�n Social Cobro" }),
                search.createColumn({ name: "custrecord_2w_cob_monto_neto", label: "Monto Neto" }),
                search.createColumn({ name: "custrecord_2w_cob_monto_exento", label: "Monto Exento" }),
                search.createColumn({ name: "custrecord_2w_cob_monto_iva", label: "Monto IVA" }),
                search.createColumn({ name: "custrecord_2w_cob_monto_total", label: "Monto Total" }),
                search.createColumn({ name: "custrecord_2w_cob_rut_financiador", label: "RUT Financiador" }),
                search.createColumn({ name: "custrecord_2w_cob_tipo_financiador", label: "Tipo Financiador" }),
                search.createColumn({ name: "custrecord_2w_cob_cliente", label: "Cliente" }),
                search.createColumn({ name: "custrecord_2w_cob_entidad_financiadora", label: "Entidad Financiadora" })
            ]
        });
        let results = [];
        let searchResultCount = customrecord_2w_recaudaciones_cobSearchObj.runPaged().count;
        nLog.debug("customrecord_2w_recaudaciones_cobSearchObj result count", searchResultCount);
        customrecord_2w_recaudaciones_cobSearchObj.run().each(function (result) {
            results.push(result);
            return true;
        });
        return results;
    };
    // ---------------------------------------------------------------------------------------------------------------------

    return {
        validaCoberturasRecaudaciones,
        validaBonosRecaudaciones,
        validaNCRecaudaciones,
        validaBoletasRecaudaciones,
        validaFacturasRecaudaciones,
        validaRecaudacionesDetalle,
        validaReporteCaja,
        buscarClientePorFicha,
        buscarClientePorRUT,
        buscarSubsidiariaPorRUT
    };
});
