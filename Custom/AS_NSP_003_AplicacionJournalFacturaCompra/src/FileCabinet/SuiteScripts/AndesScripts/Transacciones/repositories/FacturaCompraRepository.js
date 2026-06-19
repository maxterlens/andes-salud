/**
 * @NApiVersion 2.1
 * @NModuleScope SameAccount
 */
define(['N/record', 'N/search', 'N/query', 'N/log'], (record, search, query, log) => {

    const SUBLIST_APPLY             = 'apply';
    const TOLERANCE                 = 0.001;
    const APPROVED_APPROVAL_STATUS  = '2';

    // ─── Acceso a datos ───────────────────────────────────────────────────────

    /**
     * Busca la primera cuenta bancaria activa, no resumen, de la subsidiaria y moneda indicadas.
     * Devuelve el internal ID de la cuenta o null si no encuentra ninguna.
     */
    const obtenerCuentaBancoPorSubsidiaria = (subsidiaryId, currencyId) => {
        const sql = `
            SELECT 
                a.id
            FROM 
                account a
            WHERE 
                NVL(a.isinactive, 'F') = 'F'
                AND a.accttype IN ('Bank')
                AND NVL(a.issummary, 'F') = 'F'
                AND BUILTIN.MNFILTER(a.subsidiary, 'MN_INCLUDE', '', 'TRUE', '${subsidiaryId}') = 'T'
                AND a.currency IN ('${currencyId}')`;
        const results = query.runSuiteQL({
            query: sql,
        }).asMappedResults();
        return results.length > 0 ? String(results[0].id) : null;
    };

    /**
     * Para un conjunto de IDs de transacción devuelve un mapa { [id]: { recordtype, entity, account } }.
     * Usa mainline = T para obtener una sola fila por transacción con la cuenta cabecera (AP).
     */
    const obtenerDatosTransaccionesEnLote = (transaccionIds) => {
        const resultado = {};
        if (!transaccionIds || transaccionIds.length === 0) return resultado;

        const txnSearch = search.create({
            type: search.Type.TRANSACTION,
            filters: [
                search.createFilter({ name: 'internalid', operator: search.Operator.ANYOF, values: transaccionIds }),
                search.createFilter({ name: 'approvalstatus', operator: search.Operator.ANYOF, values: APPROVED_APPROVAL_STATUS }),
                search.createFilter({ name: 'mainline', operator: search.Operator.IS, values: 'T' })
            ],
            columns: [
                search.createColumn({ name: 'internalid' }),
                search.createColumn({ name: 'recordtype' }),
                search.createColumn({ name: 'entity' }),
                search.createColumn({ name: 'account' }),
                search.createColumn({ name: 'statusref' })
            ]
        });

        txnSearch.run().each((result) => {
            resultado[result.id] = {
                recordtype: result.getValue({ name: 'recordtype' }),
                entity: result.getValue({ name: 'entity' }) || '',
                account: result.getValue({ name: 'account' }) || '',
                status: result.getValue({ name: 'statusref' }) || ''
            };
            return true;
        });

        return resultado;
    };

    /**
     * Para un conjunto de IDs de cuenta devuelve un mapa { [id]: type }.
     */
    const obtenerTiposCuentaEnLote = (accountIds) => {
        const resultado = {};
        if (!accountIds || accountIds.length === 0) return resultado;

        const acctSearch = search.create({
            type: search.Type.ACCOUNT,
            filters: [
                search.createFilter({ name: 'internalid', operator: search.Operator.ANYOF, values: accountIds })
            ],
            columns: [
                search.createColumn({ name: 'internalid' }),
                search.createColumn({ name: 'type' })
            ]
        });

        acctSearch.run().each((result) => {
            resultado[result.id] = result.getValue({ name: 'type' });
            return true;
        });

        return resultado;
    };

    /**
     * Crea un pago de proveedor transformando la factura de compra, busca el asiento
     * de diario en el sublist apply, valida que el importe coincida y lo aplica.
     *
     * No guarda nada si el journal no se encuentra o si los importes no coinciden.
     */
    const aplicarJournalAFactura = (journalId, facturaId, importe) => {
        log.error({
            title: 'FacturaCompraRepository',
            details: `Iniciando aplicación: journal=${journalId} → factura=${facturaId}, importe=${importe}`
        });

        const vendorPayment = record.transform({
            fromType: record.Type.VENDOR_BILL,
            fromId: facturaId,
            toType: record.Type.VENDOR_PAYMENT,
            isDynamic: true
        });

        const account = vendorPayment.getValue({ fieldId: 'account' });
        if (!account) {
            const subsidiaryId   = vendorPayment.getValue({ fieldId: 'subsidiary' });
            const currencyId     = vendorPayment.getValue({ fieldId: 'currency' });
            const cuentaBancoId  = obtenerCuentaBancoPorSubsidiaria(subsidiaryId, currencyId);

            if (!cuentaBancoId) {
                log.error({
                    title:   'FacturaCompraRepository',
                    details: `No se encontró cuenta bancaria activa para la subsidiaria ${subsidiaryId}. Se omite la aplicación del journal ${journalId} a la factura ${facturaId}.`
                });
                return;
            }

            vendorPayment.setValue({ fieldId: 'account', value: cuentaBancoId });
        }

        const lineCount = vendorPayment.getLineCount({ sublistId: SUBLIST_APPLY });
        let facturaProcesada = false;
        let journalAplicado = false;

        for (let i = 0; i < lineCount; i++) {
            const lineId = String(vendorPayment.getSublistValue({ sublistId: SUBLIST_APPLY, fieldId: 'internalid', line: i }));

            // Ajustar el importe aplicado de la factura al importe de la línea del journal
            if (!facturaProcesada && lineId === String(facturaId)) {
                vendorPayment.selectLine({ sublistId: SUBLIST_APPLY, line: i });
                vendorPayment.setCurrentSublistValue({ sublistId: SUBLIST_APPLY, fieldId: 'apply', value: true });
                vendorPayment.setCurrentSublistValue({ sublistId: SUBLIST_APPLY, fieldId: 'amount', value: importe });
                vendorPayment.commitLine({ sublistId: SUBLIST_APPLY });
                facturaProcesada = true;
                continue;
            }

            // Aplicar el journal: validar importe y marcar
            if (!journalAplicado && lineId === String(journalId)) {
                const importeDisponible = Number(vendorPayment.getSublistValue({ sublistId: SUBLIST_APPLY, fieldId: 'due', line: i }) || 0);
                log.error('importes', { importeDisponible, importe });
                if (importeDisponible + importe > TOLERANCE) {
                    log.error({
                        title: 'FacturaCompraRepository',
                        details: `Importe no coincide para journal ${journalId}: disponible en apply=${importeDisponible}, línea journal=${importe}. Se omite la aplicación.`
                    });
                    return;
                }

                vendorPayment.selectLine({ sublistId: SUBLIST_APPLY, line: i });
                vendorPayment.setCurrentSublistValue({ sublistId: SUBLIST_APPLY, fieldId: 'apply', value: true });
                vendorPayment.setCurrentSublistValue({ sublistId: SUBLIST_APPLY, fieldId: 'amount', value: importeDisponible });
                vendorPayment.commitLine({ sublistId: SUBLIST_APPLY });
                journalAplicado = true;
            }

            if (facturaProcesada && journalAplicado) break;
        }

        if (!journalAplicado) {
            log.error({
                title: 'FacturaCompraRepository',
                details: `Journal ${journalId} no encontrado en el sublist apply del pago generado para factura ${facturaId}. Verifique que el journal tenga el mismo proveedor y una línea de crédito en cuenta por pagar.`
            });
            return;
        }

        const pagoId = vendorPayment.save({ ignoreMandatoryFields: true });
        log.error({
            title: 'FacturaCompraRepository',
            details: `Pago de proveedor creado: id=${pagoId} (journal=${journalId} → factura=${facturaId}, importe=${importe})`
        });
    };

    return {
        obtenerDatosTransaccionesEnLote,
        obtenerTiposCuentaEnLote,
        aplicarJournalAFactura
    };
});
