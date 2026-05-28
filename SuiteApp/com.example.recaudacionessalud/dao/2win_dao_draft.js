define(["N/query", "N/record", "N/log"], function (query, record, nLog) {
    /**
     * Busca todas las transacciones de una caja en una sola query
     * @param {Object} params - Parámetros de búsqueda
     * @param {string} params.caja - Unidad de caja
     * @param {string} params.fechaCaja - Fecha de caja
     * @param {string} params.aperturaCaja - Apertura de caja
     * @param {string} params.razonSocialCaja - Razón social de caja
     * @returns {Object} Objeto con transacciones indexadas por número de movimiento
     */
    const searchAllTransactionsByCaja = ({ caja, fechaCaja, aperturaCaja, razonSocialCaja }) => {
        const dateObj = new Date(fechaCaja);
        fechaCaja = dateObj.toLocaleDateString("en-GB");
        nLog.audit("searchAllTransactionsByCaja - OPTIMIZACIÓN", `Cargando todas las transacciones para caja ${caja}, fecha ${fechaCaja}`);
        
        const results = query
            .runSuiteQL({
                query: `
            select distinct
                transaction.tranid,
                transaction.id,
                transaction.recordtype,
                transaction.memo,
                BUILTIN.DF (transaction.status) as status,
                transaction.tranDate,
                transaction.custbody_2wintipodtesii,
                transaction.custbody_2winfolioacepta,
                transaction.custbodynumeromovimiento,
                transactionLine.subsidiary,
                NVL(transaction.foreignAmountUnpaid + transaction.foreignAmountPaid,0) as amount
            from
                transaction
                inner join transactionLine on transactionLine.transaction = transaction.id and transactionLine.mainLine ='T'
            where
                custbodyunidadcaja = ?
                and custbodyfechacaja = ?
                and custbodyaperturacaja = ?
                and custbodyrazonsocialcaja = ?
                and transaction.custbody_2win_created_from_income_flow = 'T'
            ORDER BY
                transaction.id DESC`,
                params: [caja, fechaCaja, aperturaCaja, razonSocialCaja]
            })
            .asMappedResults();

        // Indexar transacciones por número de movimiento para acceso O(1)
        const indexedByMovement = {};
        results.forEach((trans) => {
            const movementNumber = trans.custbodynumeromovimiento;
            if (!indexedByMovement[movementNumber]) {
                indexedByMovement[movementNumber] = [];
            }
            indexedByMovement[movementNumber].push(trans);
        });

        nLog.audit("searchAllTransactionsByCaja - Resultado", `Total transacciones: ${results.length}, Movimientos únicos: ${Object.keys(indexedByMovement).length}`);
        return indexedByMovement;
    };

    const searchTransactionByMovementNumber = ({ caja, fechaCaja, aperturaCaja, razonSocialCaja, movementNumber }) => {
        const dateObj = new Date(fechaCaja);
        fechaCaja = dateObj.toLocaleDateString("en-GB");
        nLog.debug("searchTransactionByMovementNumber - Params", { caja, fechaCaja, aperturaCaja, razonSocialCaja, movementNumber });
        const results = query
            .runSuiteQL({
                query: `
            select distinct
                transaction.tranid,
                transaction.id,
                transaction.recordtype,
                transaction.memo,
                BUILTIN.DF (transaction.status) as status,
                transaction.tranDate,
                transaction.custbody_2wintipodtesii,
                transaction.custbody_2winfolioacepta,
                transactionLine.subsidiary,
                NVL(transaction.foreignAmountUnpaid + transaction.foreignAmountPaid,0) as amount
                --nl.nextDoc as applied_in,
                --pl.previousDoc as applied_in2
            from
                transaction
                inner join transactionLine on transactionLine.transaction = transaction.id and transactionLine.mainLine ='T'
                --LEFT join NextTransactionLink as nl on nl.previousDoc = transaction.id
                --LEFT join PreviousTransactionLink as pl on pl.nextDoc = transaction.id
            where
                custbodyunidadcaja = ?
                and custbodyfechacaja = ?
                and custbodyaperturacaja = ?
                and custbodyrazonsocialcaja = ?
                and custbodynumeromovimiento = ?
                and transaction.custbody_2win_created_from_income_flow = 'T'
            ORDER BY
                transaction.id DESC`,
                params: [caja, fechaCaja, aperturaCaja, razonSocialCaja, movementNumber]
            })
            .asMappedResults();
        return results;
    };

    /**
     * Desaplica una nota de crédito de un invoice
     * @param {number} creditMemoId - ID de la nota de crédito
     * @param {number} invoiceId - ID del invoice
     */
    const unapplyCreditMemo = (creditMemoId, invoiceId) => {
        try {
            const cmRecord = record.load({
                type: record.Type.CREDIT_MEMO,
                id: creditMemoId,
                isDynamic: true
            });

            const lineCount = cmRecord.getLineCount({ sublistId: "apply" });
            let unapplied = false;

            for (let i = 0; i < lineCount; i++) {
                const docId = cmRecord.getSublistValue({ sublistId: "apply", fieldId: "doc", line: i });
                if (Number(docId) === Number(invoiceId)) {
                    cmRecord.selectLine({ sublistId: "apply", line: i });
                    cmRecord.setCurrentSublistValue({ sublistId: "apply", fieldId: "apply", value: false });
                    cmRecord.commitLine({ sublistId: "apply" });
                    unapplied = true;
                    break;
                }
            }

            if (unapplied) {
                cmRecord.save({ ignoreMandatoryFields: true });
                nLog.debug("Unapply Credit Memo", `NC ${creditMemoId} desaplicada del Invoice ${invoiceId}`);
            } else {
                nLog.debug("Unapply Credit Memo", `No se encontró aplicación de NC ${creditMemoId} al Invoice ${invoiceId}`);
            }
        } catch (e) {
            nLog.error("Unapply Credit Memo Error", e);
            throw e;
        }
    };

    const deleteTransactionById = (transactionId, type) => {
        try {
            const appliedNCs = query
                .runSuiteQL({
                    query: `
                        SELECT
                        transaction.tranid,
                        transaction.id,
                        transaction.type,
                        transaction.memo,
                        BUILTIN.DF(transaction.status) AS status,
                        transaction.tranDate,
                        transaction.custbody_2wintipodtesii,
                        transaction.custbody_2winfolioacepta,
                        
                        /* Datos del Documento Siguiente (Applied In) */
                        nl.nextDoc AS applied_in_id,
                        AppliedTx.type AS applied_in_type_raw,       /* Código del tipo (ej: CustInvc) */
                        BUILTIN.DF(AppliedTx.type) AS applied_in_type_name, /* Nombre legible (ej: Factura) */
                        AppliedTx.tranid AS applied_in_tranid,       /* Número del documento destino */
                        
                        pl.previousDoc AS applied_in2
                        FROM
                        transaction
                        /* Enlace al siguiente documento (ID) */
                        LEFT JOIN NextTransactionLink AS nl ON nl.previousDoc = transaction.id
                        /* NUEVO JOIN: Obtener detalles del documento siguiente usando el ID de nl */
                        LEFT JOIN Transaction AS AppliedTx ON AppliedTx.id = nl.nextDoc
                        /* Enlace al documento anterior */
                        LEFT JOIN PreviousTransactionLink AS pl ON pl.nextDoc = transaction.id
                        WHERE
                        transaction.id = ?
                        ORDER BY
                        transaction.id DESC
                        `,
                    params: [transactionId]
                })
                .asMappedResults();

            if (appliedNCs && appliedNCs.length > 0) {
                nLog.debug("Desaplicando", `Desaplicando ${appliedNCs.length} NC(s) del ${type} ${transactionId}`);
                appliedNCs.forEach((nc) => {
                    unapplyCreditMemo(nc.applied_in_id, transactionId);
                });
            }
        } catch (e) {
            nLog.error("Error durante desaplicación", e);
        }
    };
    const searchCierreCaja = ({ caja, fechaCaja, aperturaCaja, razonSocialCaja, cajeroRut }) => {
        const dateObj = new Date(fechaCaja);
        fechaCaja = dateObj.toLocaleDateString("en-GB");
        nLog.debug("searchCierreCaja - Params", { caja, fechaCaja, aperturaCaja, razonSocialCaja, cajeroRut });
        const results = query
            .runSuiteQL({
                query: `SELECT distinct
                        T.tranid,
                        T.memo,
                        T.id,
                        T.trandate,
                        tl.entity,
                        Customer.custentity_2wrut,
                        T.type
                        FROM
                        Transaction AS T
                        inner join transactionline tl on tl.transaction = t.id
                        inner join Customer on customer.id = tl.entity
                        WHERE
                        /* Filtro por inicio del texto */
                        T.memo LIKE 'Cierre Caja General%'
                        AND custbodyunidadcaja = ?
                        and custbodyfechacaja = ?
                        and custbodyaperturacaja = ?
                        and custbodyrazonsocialcaja = ?
                        and Customer.custentity_2wrut = ?
                        AND T.type = 'Journal'`,
                params: [caja, fechaCaja, aperturaCaja, razonSocialCaja, cajeroRut]
            })
            .asMappedResults();
        return results;
    };

    /**
     * Revierte una transacción creando una transacción inversa
     * @param {number} transactionId - ID de la transacción a revertir
     * @param {string} type - Tipo de transacción (invoice, creditmemo, customerpayment, Journal)
     * @returns {number} ID de la transacción creada (o null si no se puede revertir)
     */
    const reverseTransaction = (transactionId, type) => {
        try {
            const typeMapping = {
                invoice: { recordType: record.Type.INVOICE, reverseType: record.Type.CREDIT_MEMO },
                creditmemo: { recordType: record.Type.CREDIT_MEMO, reverseType: record.Type.INVOICE },
                customerpayment: { recordType: record.Type.CUSTOMER_PAYMENT, reverseType: "PAYMENT_REVERSE" },
                journalentry: { recordType: record.Type.JOURNAL_ENTRY, reverseType: "JOURNAL_REVERSE" },
                advintercompanyjournalentry: { recordType: record.Type.ADV_INTER_COMPANY_JOURNAL_ENTRY, reverseType: "JOURNAL_REVERSE" }
            };

            const mapping = typeMapping[type];
            if (!mapping) {
                nLog.debug("reverseTransaction", `Tipo no soportado para reversión: ${type}`);
                return null;
            }

            // Para Journal Entry, crear uno nuevo con montos invertidos
            if (type === "journalentry" || type === "advintercompanyjournalentry") {
                try {
                    // INTENTO 1: Reversión Nativa (Ideal para periodos abiertos)
                    // Usamos la fecha de hoy para el reverso
                    record.submitFields({
                        type: mapping.recordType,
                        id: transactionId,
                        values: {
                            reversaldate: new Date()
                        },
                        options: { ignoreMandatoryFields: true }
                    });

                    nLog.audit("Reverso Journal", `ÉXITO: Se programó reversión nativa para JE ${transactionId}`);
                    return transactionId; // Retornamos el ID original indicando éxito
                } catch (nativeError) {
                    nLog.audit("Reverso Journal", `FALLÓ NATIVO (Probable periodo cerrado). Intentando manual... Error: ${nativeError.message}`);

                    // INTENTO 2: Fallback Manual (Clonar e invertir)
                    const jeRecord = record.load({
                        type: mapping.recordType,
                        id: transactionId,
                        isDynamic: false
                    });

                    const newJe = record.create({ type: mapping.recordType, isDynamic: false });

                    // A. Copiar Cabecera
                    // IMPORTANTE: Usamos new Date() en tranDate para asegurar que caiga en periodo abierto
                    newJe.setValue({ fieldId: "tranDate", value: new Date() });
                    newJe.setValue({ fieldId: "subsidiary", value: jeRecord.getValue("subsidiary") });

                    const originalMemo = jeRecord.getValue("memo") || "";
                    newJe.setValue({ fieldId: "memo", value: `REVERSO MANUAL: ${originalMemo}` });
                    newJe.setValue({ fieldId: "custbody_2win_created_from_income_flow", value: true });

                    // Copiar tus campos custom de Caja
                    const customFields = ["custbodyunidadcaja", "custbodyfechacaja", "custbodyaperturacaja", "custbodyrazonsocialcaja", "custbodynumeromovimiento"];
                    customFields.forEach((field) => {
                        const val = jeRecord.getValue(field);
                        if (val) newJe.setValue({ fieldId: field, value: val });
                    });

                    // B. Invertir Líneas (Swap Debit/Credit)
                    const lineCount = jeRecord.getLineCount({ sublistId: "line" });
                    for (let i = 0; i < lineCount; i++) {
                        const debit = jeRecord.getSublistValue({ sublistId: "line", fieldId: "debit", line: i }) || 0;
                        const credit = jeRecord.getSublistValue({ sublistId: "line", fieldId: "credit", line: i }) || 0;

                        // Solo copiamos si hay monto
                        if (debit === 0 && credit === 0) continue;

                        newJe.setSublistValue({ sublistId: "line", fieldId: "account", line: i, value: jeRecord.getSublistValue({ sublistId: "line", fieldId: "account", line: i }) });
                        newJe.setSublistValue({ sublistId: "line", fieldId: "entity", line: i, value: jeRecord.getSublistValue({ sublistId: "line", fieldId: "entity", line: i }) });
                        newJe.setSublistValue({ sublistId: "line", fieldId: "memo", line: i, value: jeRecord.getSublistValue({ sublistId: "line", fieldId: "memo", line: i }) });

                        // Lógica de inversión
                        if (credit > 0) newJe.setSublistValue({ sublistId: "line", fieldId: "debit", line: i, value: credit });
                        if (debit > 0) newJe.setSublistValue({ sublistId: "line", fieldId: "credit", line: i, value: debit });

                        // Copiar departamento/clase/ubicación si existen
                        ["department", "class", "location"].forEach((seg) => {
                            const val = jeRecord.getSublistValue({ sublistId: "line", fieldId: seg, line: i });
                            if (val) newJe.setSublistValue({ sublistId: "line", fieldId: seg, line: i, value: val });
                        });
                    }

                    const newJeId = newJe.save({ ignoreMandatoryFields: true });
                    nLog.audit("Reverso Journal", `ÉXITO: Se creó reverso manual ${newJeId} para el original ${transactionId}`);
                    return newJeId;
                }
            }

            // Para Invoice, crear Credit Memo de reverso
            if (type === "invoice") {
                const invoiceRecord = record.load({
                    type: record.Type.INVOICE,
                    id: transactionId,
                    isDynamic: true
                });

                const customerId = invoiceRecord.getValue({ fieldId: "entity" });
                const tranDate = invoiceRecord.getValue({ fieldId: "tranDate" });
                const subsidiaria = invoiceRecord.getValue({ fieldId: "subsidiary" });
                const lineCount = invoiceRecord.getLineCount({ sublistId: "item" });

                const creditMemo = record.create({
                    type: record.Type.CREDIT_MEMO,
                    isDynamic: true
                });

                creditMemo.setValue({ fieldId: "entity", value: customerId });
                creditMemo.setValue({ fieldId: "tranDate", value: tranDate });
                creditMemo.setValue({ fieldId: "subsidiary", value: subsidiaria });
                creditMemo.setValue({ fieldId: "memo", value: `REVERSO Invoice ${transactionId}` });
                creditMemo.setValue({ fieldId: "custbody_2win_created_from_income_flow", value: true });

                // Copiar líneas con montos invertidos
                for (let i = 0; i < lineCount; i++) {
                    const item = invoiceRecord.getSublistValue({ sublistId: "item", fieldId: "item", line: i });
                    const rate = invoiceRecord.getSublistValue({ sublistId: "item", fieldId: "rate", line: i }) || 0;
                    const quantity = invoiceRecord.getSublistValue({ sublistId: "item", fieldId: "quantity", line: i }) || 1;
                    const tax1amt = invoiceRecord.getSublistValue({ sublistId: "item", fieldId: "tax1amt", line: i }) || 0;

                    creditMemo.selectNewLine({ sublistId: "item" });
                    creditMemo.setCurrentSublistValue({ sublistId: "item", fieldId: "item", value: item });
                    creditMemo.setCurrentSublistValue({ sublistId: "item", fieldId: "quantity", value: quantity });
                    // Invertir el rate (negativo para reverso)
                    creditMemo.setCurrentSublistValue({ sublistId: "item", fieldId: "rate", value: -Math.abs(rate) });
                    creditMemo.setCurrentSublistValue({ sublistId: "item", fieldId: "tax1amt", value: -Math.abs(tax1amt) });
                    creditMemo.commitLine({ sublistId: "item" });
                }

                // Copiar campos personalizados de caja
                creditMemo.setValue({ fieldId: "custbodyunidadcaja", value: invoiceRecord.getValue({ fieldId: "custbodyunidadcaja" }) });
                creditMemo.setValue({ fieldId: "custbodyfechacaja", value: invoiceRecord.getValue({ fieldId: "custbodyfechacaja" }) });
                creditMemo.setValue({ fieldId: "custbodyaperturacaja", value: invoiceRecord.getValue({ fieldId: "custbodyaperturacaja" }) });
                creditMemo.setValue({ fieldId: "custbodyrazonsocialcaja", value: invoiceRecord.getValue({ fieldId: "custbodyrazonsocialcaja" }) });
                creditMemo.setValue({ fieldId: "custbodynumeromovimiento", value: invoiceRecord.getValue({ fieldId: "custbodynumeromovimiento" }) });

                const cmId = creditMemo.save({ ignoreMandatoryFields: true });
                nLog.debug("reverseTransaction", `Invoice ${transactionId} reversado. NC: ${cmId}`);
                return cmId;
            }

            // Para Credit Memo, crear Invoice de reverso
            if (type === "creditmemo") {
                const cmRecord = record.load({
                    type: record.Type.CREDIT_MEMO,
                    id: transactionId,
                    isDynamic: true
                });

                const customerId = cmRecord.getValue({ fieldId: "entity" });
                const tranDate = cmRecord.getValue({ fieldId: "tranDate" });
                const subsidiaria = cmRecord.getValue({ fieldId: "subsidiary" });
                const lineCount = cmRecord.getLineCount({ sublistId: "item" });

                const invoice = record.create({
                    type: record.Type.INVOICE,
                    isDynamic: true
                });

                invoice.setValue({ fieldId: "entity", value: customerId });
                invoice.setValue({ fieldId: "tranDate", value: tranDate });
                invoice.setValue({ fieldId: "subsidiary", value: subsidiaria });
                invoice.setValue({ fieldId: "memo", value: `REVERSO Credit Memo ${transactionId}` });
                invoice.setValue({ fieldId: "custbody_2win_created_from_income_flow", value: true });
                for (let i = 0; i < lineCount; i++) {
                    const item = cmRecord.getSublistValue({ sublistId: "item", fieldId: "item", line: i });
                    const rate = cmRecord.getSublistValue({ sublistId: "item", fieldId: "rate", line: i }) || 0;
                    const quantity = cmRecord.getSublistValue({ sublistId: "item", fieldId: "quantity", line: i }) || 1;
                    const tax1amt = cmRecord.getSublistValue({ sublistId: "item", fieldId: "tax1amt", line: i }) || 0;

                    invoice.selectNewLine({ sublistId: "item" });
                    invoice.setCurrentSublistValue({ sublistId: "item", fieldId: "item", value: item });
                    invoice.setCurrentSublistValue({ sublistId: "item", fieldId: "quantity", value: quantity });
                    invoice.setCurrentSublistValue({ sublistId: "item", fieldId: "rate", value: -Math.abs(rate) });
                    invoice.setCurrentSublistValue({ sublistId: "item", fieldId: "tax1amt", value: -Math.abs(tax1amt) });
                    invoice.commitLine({ sublistId: "item" });
                }

                invoice.setValue({ fieldId: "custbodyunidadcaja", value: cmRecord.getValue({ fieldId: "custbodyunidadcaja" }) });
                invoice.setValue({ fieldId: "custbodyfechacaja", value: cmRecord.getValue({ fieldId: "custbodyfechacaja" }) });
                invoice.setValue({ fieldId: "custbodyaperturacaja", value: cmRecord.getValue({ fieldId: "custbodyaperturacaja" }) });
                invoice.setValue({ fieldId: "custbodyrazonsocialcaja", value: cmRecord.getValue({ fieldId: "custbodyrazonsocialcaja" }) });
                invoice.setValue({ fieldId: "custbodynumeromovimiento", value: cmRecord.getValue({ fieldId: "custbodynumeromovimiento" }) });

                const invId = invoice.save({ ignoreMandatoryFields: true });
                nLog.debug("reverseTransaction", `Credit Memo ${transactionId} reversado. Invoice: ${invId}`);
                return invId;
            }

            // Para Payments, revertir desaplicando y creando nota de crédito
            if (type === "customerpayment") {
                const paymentRecord = record.load({
                    type: record.Type.CUSTOMER_PAYMENT,
                    id: transactionId,
                    isDynamic: true
                });

                // Desaplicamos el pago de todas las facturas
                const lineCount = paymentRecord.getLineCount({ sublistId: "apply" });
                for (let i = 0; i < lineCount; i++) {
                    const docId = paymentRecord.getSublistValue({ sublistId: "apply", fieldId: "doc", line: i });
                    const apply = paymentRecord.getSublistValue({ sublistId: "apply", fieldId: "apply", line: i });
                    if (apply) {
                        paymentRecord.selectLine({ sublistId: "apply", line: i });
                        paymentRecord.setCurrentSublistValue({ sublistId: "apply", fieldId: "apply", value: false });
                        paymentRecord.commitLine({ sublistId: "apply" });
                    }
                }

                paymentRecord.setValue({ fieldId: "memo", value: `REVERSO Payment ${transactionId}` });
                paymentRecord.save({ ignoreMandatoryFields: true });
                nLog.debug("reverseTransaction", `Payment ${transactionId} desaplicado`);
                return transactionId;
            }

            return null;
        } catch (error) {
            nLog.error("reverseTransaction Error", `ID: ${transactionId}, Type: ${type}, Error: ${error.message}`);
            return null;
        }
    };

    /**
     * Filtra transacciones excluyendo invoices (boletas)
     * @param {Array} transactions - Array de transacciones
     * @returns {Array} Transacciones sin invoices
     */
    const filterOutInvoices = (transactions) => {
        return transactions.filter((t) => t.recordtype !== "invoice");
    };

    /**
     * Elimina físicamente una transacción de NetSuite.
     * Primero desaplica NCs vinculadas, luego ejecuta record.delete().
     * @param {number} transactionId - ID interno de la transacción
     * @param {string} recordtype - Tipo de registro (invoice, creditmemo, customerpayment, journalentry, advintercompanyjournalentry)
     * @returns {boolean} true si se eliminó correctamente, false si falló
     */
    const deleteTransaction = (transactionId, recordtype) => {
        try {
            const typeMapping = {
                invoice: record.Type.INVOICE,
                creditmemo: record.Type.CREDIT_MEMO,
                customerpayment: record.Type.CUSTOMER_PAYMENT,
                journalentry: record.Type.JOURNAL_ENTRY,
                advintercompanyjournalentry: record.Type.ADV_INTER_COMPANY_JOURNAL_ENTRY
            };

            const nsType = typeMapping[recordtype];
            if (!nsType) {
                nLog.error("deleteTransaction", `Tipo no soportado para eliminación: ${recordtype}, ID: ${transactionId}`);
                return false;
            }

            // Primero desaplicar NCs vinculadas (reutiliza lógica existente)
            deleteTransactionById(transactionId, recordtype);

            // Eliminar la transacción físicamente
            record.delete({ type: nsType, id: transactionId });
            nLog.audit("deleteTransaction", `Transacción eliminada: ID ${transactionId}, Tipo: ${recordtype}`);
            return true;
        } catch (error) {
            nLog.error("deleteTransaction Error", `ID: ${transactionId}, Tipo: ${recordtype}, Error: ${error.message}`);
            return false;
        }
    };

    /**
     * Busca todos los cierres de caja sin filtrar por cajero
     * @param {Object} params - Parámetros de búsqueda
     * @param {string} params.caja - Unidad de caja
     * @param {string} params.fechaCaja - Fecha de caja
     * @param {string} params.aperturaCaja - Apertura de caja
     * @param {string} params.razonSocialCaja - Razón social de caja
     * @returns {Array} Array de cierres de caja encontrados
     */
    const searchAllCierresCaja = ({ caja, fechaCaja, aperturaCaja, razonSocialCaja }) => {
        const dateObj = new Date(fechaCaja);
        fechaCaja = dateObj.toLocaleDateString("en-GB");
        nLog.debug("searchAllCierresCaja - Params", { caja, fechaCaja, aperturaCaja, razonSocialCaja });
        const results = query
            .runSuiteQL({
                query: `SELECT distinct
                        T.tranid,
                        T.memo,
                        T.id,
                        T.trandate,
                        tl.entity,
                        Customer.custentity_2wrut,
                        T.recordtype as type,
                        FROM
                        Transaction AS T
                        inner join transactionline tl on tl.transaction = t.id
                        inner join Customer on customer.id = tl.entity
                        WHERE
                        T.memo LIKE 'Cierre Caja General%'
                        AND custbodyunidadcaja = ?
                        and custbodyfechacaja = ?
                        and custbodyaperturacaja = ?
                        and custbodyrazonsocialcaja = ?
                        AND T.type = 'Journal'`,
                params: [caja, fechaCaja, aperturaCaja, razonSocialCaja]
            })
            .asMappedResults();
        return results;
    };

    return {
        searchAllTransactionsByCaja,
        searchTransactionByMovementNumber,
        deleteTransactionById,
        searchCierreCaja,
        searchAllCierresCaja,
        unapplyCreditMemo,
        reverseTransaction,
        filterOutInvoices,
        deleteTransaction
    };
});
