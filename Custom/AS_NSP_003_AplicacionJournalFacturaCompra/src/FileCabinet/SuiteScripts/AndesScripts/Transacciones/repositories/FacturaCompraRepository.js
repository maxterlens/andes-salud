/**
 * @NApiVersion 2.1
 * @NModuleScope SameAccount
 */
define(['N/record', 'N/search', 'N/log'], (record, search, log) => {

    const SUBLIST_APPLY             = 'apply';
    const TOLERANCE                 = 0.001;
    const APPROVED_APPROVAL_STATUS  = '2';
    const DEFAULT_ACCOUNT_ID        = 853;

    // ─── Acceso a datos ───────────────────────────────────────────────────────

    /**
     * Devuelve el tipo de record de una transacción (e.g. 'vendorbill', 'salesorder').
     */
    const obtenerTipoTransaccion = (transaccionId) => {
        const fields = search.lookupFields({
            type: search.Type.TRANSACTION,
            id: transaccionId,
            columns: ['recordtype']
        });
        return fields.recordtype;
    };

    /**
     * Devuelve el tipo contable de una cuenta (e.g. 'AcctPay', 'AcctRec', 'Bank').
     */
    const obtenerTipoCuenta = (accountId) => {
        const fields = search.lookupFields({
            type: search.Type.ACCOUNT,
            id: accountId,
            columns: ['type']
        });
        return fields.type;
    };

    /**
     * Devuelve la entidad (proveedor) y la cuenta por pagar de una factura de compra.
     */
    const obtenerDatosFactura = (facturaId) => {
        const fields = search.lookupFields({
            type: record.Type.VENDOR_BILL,
            id: facturaId,
            columns: ['entity', 'account']
        });
        return {
            entity: fields.entity && fields.entity.length > 0 ? String(fields.entity[0].value) : null,
            account: fields.account && fields.account.length > 0 ? String(fields.account[0].value) : null
        };
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
                search.createColumn({ name: 'status' })
            ]
        });

        txnSearch.run().each((result) => {
            resultado[result.id] = {
                recordtype: result.getValue({ name: 'recordtype' }),
                entity: result.getValue({ name: 'entity' }) || '',
                account: result.getValue({ name: 'account' }) || '',
                status: result.getValue({ name: 'status' }) || ''
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
            vendorPayment.setValue({ fieldId: 'account', value: DEFAULT_ACCOUNT_ID });
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
        obtenerTipoTransaccion,
        obtenerTipoCuenta,
        obtenerDatosFactura,
        obtenerDatosTransaccionesEnLote,
        obtenerTiposCuentaEnLote,
        aplicarJournalAFactura
    };
});
