/**
 * @NApiVersion 2.1
 * @NModuleScope Public
 */
define(["N/search", "N/query"], function (search, query) {
    /**
     * Busca las prefacturas asociadas a una orden de venta
     * @param {string} recordId - ID de la orden de venta
     * @returns {Array}
     */
    function searchPrefacturas(recordId) {
        if (!recordId) return []
        return query
            .runSuiteQL({
                query: `
            SELECT
                prefdet.custrecord_2w_as_dpf_ov_origen AS OrdenVentaOrigen,
                SUM(prefdet.custrecord_2w_as_dpf_montoexento) AS MontoExentoTotal,
                SUM(prefdet.custrecord_2w_as_dpf_montoiva) AS MontoIVATotal,
                SUM(prefdet.custrecord_2w_as_dpf_montoneto) AS MontoNetoTotal,
                SUM(prefdet.custrecord_2w_as_dpf_montototal) AS MontoTotal,
                prefdet.custrecord_2w_as_dpf_glosa AS Glosa,
                pref.custrecord_2w_as_pf_estado AS Estado,
                pref.name AS NombrePrefactura,
                pref.custrecord_2w_as_pf_fecha AS FechaPrefactura,
                pref.id AS internalid
            FROM
                CUSTOMRECORD_2W_AS_PREFACTURA_DETALLES AS prefdet
                INNER JOIN CUSTOMRECORD_2W_AS_PREFACTURA AS pref ON prefdet.custrecord_2w_as_dpf_prefactura = pref.id
            WHERE
                prefdet.custrecord_2w_as_dpf_ov_origen = ?
            GROUP BY
                prefdet.custrecord_2w_as_dpf_ov_origen,
                prefdet.custrecord_2w_as_dpf_glosa,
                pref.custrecord_2w_as_pf_estado,
                pref.name,
                pref.custrecord_2w_as_pf_fecha,
                pref.id
            `,
                params: [recordId]
            })
            .asMappedResults();
    }

    /**
     * Busca los journals asociados a una orden de venta
     * @param {string} recordId - ID de la orden de venta
     * @returns {Array}
     */
    function searchJournals(recordId) {
        if (!recordId) return []
        return query
            .runSuiteQL({
                query: `
            SELECT
                ta.id AS internalid,
                MAX(ta.trandate) AS trandate,
                ta.tranid AS tranid,
                BUILTIN.DF(ta.status) AS status,
                ABS(SUM(tl.creditforeignAmount)) AS amount,
                ta.isReversal
            FROM
                transaction as ta
            INNER JOIN transactionline as tl on ta.id = tl.transaction
            WHERE
                ta.type = 'Journal'
                and
                ta.custbody_2win_tran_origin = ?
                and
                tl.memo LIKE 'Reconocimiento Ingresos%'
            GROUP BY
                ta.id,
                ta.tranid,
                BUILTIN.DF(ta.status),
                ta.isReversal
            ORDER BY ta.id DESC
            `,
                params: [recordId]
            })
            .asMappedResults();
    }

    /**
     * Busca las garantías asociadas a una transacción
     * @param {string} recordId - ID de la transacción
     * @returns {Array}
     */
    function searchGarantias(recordId) {
        if (!recordId) return []
        const results = [];
        const garantiasSearch = search.create({
            type: "customrecord_2win_garantias",
            filters: [["custrecord_2win_garantias_ref_trans", "anyof", recordId]],
            columns: [
                search.createColumn({ name: "custrecord_2win_garantias_doc_type" }),
                search.createColumn({ name: "custrecord_2win_garantias_folio_doc" }),
                search.createColumn({ name: "custrecord_2win_garantias_rut_titular" }),
                search.createColumn({ name: "custrecord_2win_garantias_nombre_titular" })
            ]
        });

        garantiasSearch.run().each(function (result) {
            results.push({
                tipoDoc: result.getValue("custrecord_2win_garantias_doc_type"),
                folioDoc: result.getValue("custrecord_2win_garantias_folio_doc"),
                rutTitular: result.getValue("custrecord_2win_garantias_rut_titular"),
                nombreTitular: result.getValue("custrecord_2win_garantias_nombre_titular")
            });
            return true;
        });

        return results;
    }

    /**
     * Busca si existe una orden de venta con el mismo número de cuenta
     * @param {string} nroCuentaPaciente - Número de cuenta del paciente
     * @param {string} subsidiaria - ID de la subsidiaria
     * @param {string} excludeId - ID a excluir de la búsqueda
     * @returns {boolean}
     */
    function searchDuplicateSalesOrder(nroCuentaPaciente, subsidiaria, excludeId) {
        const filters = [["mainline", "is", "T"], "AND", ["custbody_2win_nro_cuenta_paciente", "is", nroCuentaPaciente], "AND", ["subsidiary", "anyof", subsidiaria]];
        if (excludeId) {
            filters.push("AND", ["internalid", "noneof", excludeId]);
        }

        const salesOrders = search
            .create({
                type: "salesorder",
                columns: ["internalid"],
                filters: filters
            })
            .run()
            .getRange(0, 1);

        return salesOrders.length > 0;
    }

    /**
     * Busca un cliente por RUT
     * @param {string} rut - RUT del cliente
     * @returns {string|null} - ID del cliente o null si no existe
     */
    function searchCustomerByRut(rut) {
        const customerSearch = search.create({
            type: "customer",
            filters: [["custentity_2wrut", "is", rut], "and", ["isinactive", "is", "F"]],
            columns: ["internalid"]
        });

        const results = customerSearch.run().getRange(0, 1);
        return results.length > 0 ? results[0].id : null;
    }

    /**
     * Obtiene campos de un registro
     * @param {string} recordType - Tipo de registro
     * @param {string} recordId - ID del registro
     * @param {Array} columns - Array de campos a obtener
     * @returns {Object}
     */
    function lookupFields(recordType, recordId, columns) {
        return search.lookupFields({
            type: recordType,
            id: recordId,
            columns: columns
        });
    }

    return {
        searchPrefacturas: searchPrefacturas,
        searchJournals: searchJournals,
        searchGarantias: searchGarantias,
        searchDuplicateSalesOrder: searchDuplicateSalesOrder,
        searchCustomerByRut: searchCustomerByRut,
        lookupFields: lookupFields
    };
});
