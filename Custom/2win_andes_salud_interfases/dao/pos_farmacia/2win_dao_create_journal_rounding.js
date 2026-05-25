/**
 * @NApiVersion 2.x
 * @NModule 2win_dao_create_journal_rounding
 * @NModuleScope public
 * @description DAO para crear Journal Entry de ajuste por redondeo en pagos POS Farmacia.
 *              El journal se aplica a una factura o nota de crédito para cerrar su saldo abierto
 *              cuando existe una diferencia de redondeo (1-5 CLP) entre el total de la transacción
 *              y el monto pagado/reembolsado.
 */

define(["N/record", "N/log", "N/search"], function (record, nLog, search) {

    /**
     * Obtiene el total y monto pendiente de una transacción (invoice o creditmemo)
     * @param {string} transactionId - Internal ID de la transacción
     * @param {string} transactionType - "invoice" o "creditmemo"
     * @returns {Object} - { success, total, amountRemaining, account }
     */
    function getTransactionDetails(transactionId, transactionType) {
        try {
            var fields = search.lookupFields({
                type: transactionType,
                id: transactionId,
                columns: ["total", "amountremaining", "account"]
            });

            var total = parseFloat(fields.total) || 0;
            var amountRemaining = parseFloat(fields.amountremaining) || 0;
            var account = fields.account && fields.account.length > 0 ? fields.account[0].value : null;

            return {
                success: true,
                total: total,
                amountRemaining: amountRemaining,
                account: account
            };
        } catch (e) {
            nLog.error("Error en getTransactionDetails", e);
            return {
                success: false,
                error: e.message || String(e)
            };
        }
    }

    /**
     * Crea un Journal Entry de ajuste por redondeo aplicado a una factura o nota de crédito
     * @param {Object} data
     * @param {string} data.idTransaccion - Internal ID de la factura o nota de crédito
     * @param {string} data.tipoTransaccion - "invoice" o "creditmemo"
     * @param {string} data.cliente - Internal ID del cliente
     * @param {string} data.subsidiaria - Internal ID de la subsidiaria
     * @param {string} [data.departamento] - Internal ID del departamento/centro de costo (opcional)
     * @param {string} [data.ubicacion] - Internal ID de la ubicación (opcional)
     * @param {number} data.montoRedondeo - Monto de redondeo (absoluto, siempre positivo)
     * @param {string} data.cuentaRedondeo - Internal ID de la cuenta contable de redondeo
     * @param {string} data.cuentaAR - Internal ID de la cuenta Accounts Receivable
     * @param {string} data.direccionJournal - "DEBITO_AR" o "CREDITO_AR"
     *        - "CREDITO_AR": cuando el pago fue menor que la factura (redondeo a favor del cliente)
     *          Se CREDITA AR para reducir el saldo pendiente de la factura
     *        - "DEBITO_AR": cuando el pago fue mayor que la factura (redondeo en contra del cliente)
     *          Se DEBITA AR para reducir el saldo del reembolso / nota de crédito
     * @returns {Object} - { success: boolean, result: string, error: string }
     */
    function createJournalRounding(data) {
        try {
            nLog.audit("Inicio createJournalRounding", {
                transaccion: data.idTransaccion,
                tipo: data.tipoTransaccion,
                cliente: data.cliente,
                subsidiaria: data.subsidiaria,
                ubicacion: data.ubicacion,
                departamento: data.departamento,
                montoRedondeo: data.montoRedondeo,
                cuentaRedondeo: data.cuentaRedondeo,
                cuentaAR: data.cuentaAR,
                direccion: data.direccionJournal
            });

            // Validaciones de campos críticos
            if (!data.cuentaRedondeo) {
                return { success: false, error: "Cuenta de redondeo no proporcionada o es null" };
            }
            if (!data.cuentaAR) {
                return { success: false, error: "Cuenta Accounts Receivable no proporcionada o es null" };
            }
            if (!data.cliente) {
                return { success: false, error: "Cliente no proporcionado o es null" };
            }
            if (!data.subsidiaria) {
                return { success: false, error: "Subsidiaria no proporcionada o es null" };
            }
            if (!data.montoRedondeo || data.montoRedondeo <= 0) {
                return { success: false, error: "Monto de redondeo inválido: " + data.montoRedondeo };
            }
            if (data.direccionJournal !== "CREDITO_AR" && data.direccionJournal !== "DEBITO_AR") {
                return { success: false, error: "Dirección de journal inválida: " + data.direccionJournal };
            }

            var absMonto = Math.abs(data.montoRedondeo);


            var je = record.create({
                type: record.Type.JOURNAL_ENTRY,
                isDynamic: true
            });

            // Setear campos de header
            je.setValue({ fieldId: "subsidiary", value: Number(data.subsidiaria) });
            je.setValue({ fieldId: "trandate", value: new Date() });
            je.setValue({ fieldId: "memo", value: "Ajuste por redondeo POS Farmacia - " + (data.tipoTransaccion === "invoice" ? "Venta" : "Devolución") });

            if (data.departamento) {
                je.setValue({ fieldId: "department", value: Number(data.departamento) });
            }
            if (data.ubicacion) {
                je.setValue({ fieldId: "location", value: Number(data.ubicacion) });
            }

            var memoLinea = "Redondeo " + (data.tipoTransaccion === "invoice" ? "Factura" : "NC") + " ID: " + data.idTransaccion;

            if (data.direccionJournal === "CREDITO_AR") {
                // Pago fue MENOR que la factura → factura queda con saldo pendiente
                // Débito: Cuenta Redondeo (gasto/pérdida)
                // Crédito: Accounts Receivable (reduce saldo pendiente de la factura)

                // Línea 1: Débito a cuenta de redondeo
                je.selectNewLine({ sublistId: "line" });
                je.setCurrentSublistValue({ sublistId: "line", fieldId: "account", value: Number(data.cuentaRedondeo) });
                je.setCurrentSublistValue({ sublistId: "line", fieldId: "debit", value: absMonto });
                je.setCurrentSublistValue({ sublistId: "line", fieldId: "memo", value: memoLinea });
                if (data.departamento) {
                    je.setCurrentSublistValue({ sublistId: "line", fieldId: "department", value: Number(data.departamento) });
                }
                if (data.ubicacion) {
                    je.setCurrentSublistValue({ sublistId: "line", fieldId: "location", value: Number(data.ubicacion) });
                }
                je.commitLine({ sublistId: "line" });

                // Línea 2: Crédito a Accounts Receivable con entity
                je.selectNewLine({ sublistId: "line" });
                je.setCurrentSublistValue({ sublistId: "line", fieldId: "account", value: Number(data.cuentaAR) });
                je.setCurrentSublistValue({ sublistId: "line", fieldId: "credit", value: absMonto });
                je.setCurrentSublistValue({ sublistId: "line", fieldId: "entity", value: Number(data.cliente) });
                je.setCurrentSublistValue({ sublistId: "line", fieldId: "memo", value: memoLinea });
                if (data.departamento) {
                    je.setCurrentSublistValue({ sublistId: "line", fieldId: "department", value: Number(data.departamento) });
                }
                if (data.ubicacion) {
                    je.setCurrentSublistValue({ sublistId: "line", fieldId: "location", value: Number(data.ubicacion) });
                }
                je.commitLine({ sublistId: "line" });

            } else if (data.direccionJournal === "DEBITO_AR") {
                // Pago fue MAYOR que la factura → cliente pagó de más
                // Débito: Accounts Receivable (cancela el crédito a favor del cliente)
                // Crédito: Cuenta Redondeo (ingreso/ganancia)

                // Línea 1: Débito a Accounts Receivable con entity
                je.selectNewLine({ sublistId: "line" });
                je.setCurrentSublistValue({ sublistId: "line", fieldId: "account", value: Number(data.cuentaAR) });
                je.setCurrentSublistValue({ sublistId: "line", fieldId: "debit", value: absMonto });
                je.setCurrentSublistValue({ sublistId: "line", fieldId: "entity", value: Number(data.cliente) });
                je.setCurrentSublistValue({ sublistId: "line", fieldId: "memo", value: memoLinea });
                if (data.departamento) {
                    je.setCurrentSublistValue({ sublistId: "line", fieldId: "department", value: Number(data.departamento) });
                }
                if (data.ubicacion) {
                    je.setCurrentSublistValue({ sublistId: "line", fieldId: "location", value: Number(data.ubicacion) });
                }
                je.commitLine({ sublistId: "line" });

                // Línea 2: Crédito a cuenta de redondeo
                je.selectNewLine({ sublistId: "line" });
                je.setCurrentSublistValue({ sublistId: "line", fieldId: "account", value: Number(data.cuentaRedondeo) });
                je.setCurrentSublistValue({ sublistId: "line", fieldId: "credit", value: absMonto });
                je.setCurrentSublistValue({ sublistId: "line", fieldId: "memo", value: memoLinea });
                if (data.departamento) {
                    je.setCurrentSublistValue({ sublistId: "line", fieldId: "department", value: Number(data.departamento) });
                }
                if (data.ubicacion) {
                    je.setCurrentSublistValue({ sublistId: "line", fieldId: "location", value: Number(data.ubicacion) });
                }
                je.commitLine({ sublistId: "line" });
            }

            var jeId = je.save({
                enableSourcing: true,
                ignoreMandatoryFields: true
            });

            nLog.audit("Journal de redondeo creado", {
                journalId: jeId,
                transaccion: data.idTransaccion,
                tipo: data.tipoTransaccion,
                monto: absMonto,
                direccion: data.direccionJournal
            });

            return { success: true, result: jeId };

        } catch (e) {
            nLog.error("Error en createJournalRounding", e);
            return { success: false, error: (e && e.message) ? e.message : String(e) };
        }
    }

    return {
        createJournalRounding: createJournalRounding,
        getTransactionDetails: getTransactionDetails
    };
});