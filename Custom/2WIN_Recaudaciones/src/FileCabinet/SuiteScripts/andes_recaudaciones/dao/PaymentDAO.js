/**
 * @NApiVersion 2.1
 */
define(["N/error", "N/record", "N/log", "N/search"], function (nError, record, nLog, search) {
    function createPayment(data) {
        try {
            nLog.debug("PaymentDAO - parametro", data);
            if (!Array.isArray(data.invoicesToPay) || !data.invoicesToPay.length) {
                throw new Error("No se puede crear el pago: no se informaron documentos destino");
            }
            data.invoicesToPay.forEach((documento, indice) => {
                if (!documento || documento.id == null || String(documento.id).trim() === "" ||
                    !Number.isSafeInteger(Number(documento.id)) || Number(documento.id) <= 0) {
                    throw new Error(`No se puede crear el pago: documento destino ${indice + 1} sin ID interno válido. Revisar la factura referenciada y el estado preparado. Clave: ${data.processKey || "sin clave"}`);
                }
            });
            // Aislar ids de invoice y journal para lineas apply y credit
            let idsInvoices = data.invoicesToPay.map((inv) => String(inv.id)).join(",");
            let idsJournals = data.journalEntriesPago.map(String).join(",");

            const newRecord = record.create({
                type: record.Type.CUSTOMER_PAYMENT,
                isDynamic: true,
                // Valores por defecto para reducir el numero de lineas en sublistas apply y credit
                defaultValues: {
                    entity: data.customerId,
                    subsidiary: data.subsidiaria,
                    invoices: idsInvoices,
                    credits: idsJournals
                }
            });
            if (data.processKey) newRecord.setValue({ fieldId: "custbody_2win_as_rec_fact_key", value: data.processKey });

            newRecord.setValue({ fieldId: "customer", value: data.customerId });
            newRecord.setValue({ fieldId: "subsidiary", value: data.invoicesToPay[0]?.subsidiaria || data.subsidiaria }); // Subsidiaria
            newRecord.setValue({ fieldId: "trandate", value: new Date(data.fechaTransaccion) });
            newRecord.setValue({ fieldId: "custbody_2win_created_from_income_flow", value: true });
            newRecord.setValue({ fieldId: "memo", value: "Pago Generico" });
            // newRecord.setValue({ fieldId: "paymentmethod", value: data.paymentMethod }); // ID interno del metodo de pago
            // newRecord.setValue({ fieldId: "account", value: data.account }); // Cuenta donde cae el dinero

            // Campos adicionales del CSV para pagos (Customer Payment = Y)
            if (data.metodoPago) newRecord.setValue({ fieldId: "custbody_2w_metodo_de_pago", value: data.metodoPago });
            if (data.referencia) newRecord.setValue({ fieldId: "custbody_2w_as_referencia", value: data.referencia });
            if (data.idPaciente) newRecord.setValue({ fieldId: "custbody_2w_as_id_paciente", value: data.idPaciente });

            // Campos de caja
            if (data.unidadCaja) newRecord.setValue({ fieldId: "custbodyunidadcaja", value: data.unidadCaja });
            if (data.fechaCaja) newRecord.setValue({ fieldId: "custbodyfechacaja", value: new Date(data.fechaCaja) });
            if (data.aperturaCaja) newRecord.setValue({ fieldId: "custbodyaperturacaja", value: data.aperturaCaja });
            if (data.razonSocialCaja) newRecord.setValue({ fieldId: "custbodyrazonsocialcaja", value: data.razonSocialCaja });
            if (data.numeroMovimiento) newRecord.setValue({ fieldId: "custbodynumeromovimiento", value: data.numeroMovimiento });

            if (data.invoicesToPay && data.invoicesToPay.length > 0) {
                // Aplicacion a facturas
                let pagosAplicados = 0;
                const lineCount = newRecord.getLineCount({ sublistId: "apply" });
                for (let i = 0; i < lineCount; i++) {
                    const docId = newRecord.getSublistValue({ sublistId: "apply", fieldId: "doc", line: i });

                    const invoiceToPay = data.invoicesToPay.find((inv) => Number(inv.id) === Number(docId));
                    if (invoiceToPay) {
                        newRecord.selectLine({ sublistId: "apply", line: i });
                        newRecord.setCurrentSublistValue({ sublistId: "apply", fieldId: "apply", value: true });
                        if (invoiceToPay.amount) newRecord.setCurrentSublistValue({ sublistId: "apply", fieldId: "amount", value: invoiceToPay.amount });

                        newRecord.commitLine({ sublistId: "apply" });
                        pagosAplicados += invoiceToPay.amount;
                    }
                }

                // Validar si ya se iteraron todas las lineas y no se aplico una factura
                if (pagosAplicados === 0) {
                    nLog.error("PaymentDAO - createPayment", `Se aplicaron 0 Facturas del total de: ${data.invoicesToPay.length} Facturas por aplicar para el pago de cliente: ${data.customerId} y subsidiaria: ${data.subsidiaria}`);
                }
            }
            if (data.journalEntriesPago && data.journalEntriesPago.length > 0) {
                const lineCountJE = newRecord.getLineCount({ sublistId: "credit" });
                for (let j = 0; j < lineCountJE; j++) {
                    const docIdJE = newRecord.getSublistValue({ sublistId: "credit", fieldId: "doc", line: j });
                    const journalToPay = data.journalEntriesPago.find((inv) => Number(inv) === Number(docIdJE));
                    if (journalToPay) {
                        newRecord.selectLine({ sublistId: "credit", line: j });
                        newRecord.setCurrentSublistValue({ sublistId: "credit", fieldId: "apply", value: true });
                        newRecord.commitLine({ sublistId: "credit" });
                    }
                }
            }
            // newRecord.setValue({ fieldId: "payment", value: 0 }); // Monto total
            const montoAdeudado = newRecord.getValue({ fieldId: "payment" }); // Monto total2222
            if (montoAdeudado > 0) throw new Error(`Desbalance de pago: existe monto faltante de ${montoAdeudado} pesos en Asiento de metodos de pago`);
            const newId = newRecord.save({ enableSourcing: true, ignoreMandatoryFields: true });
            nLog.audit("PaymentDAO", `Pago creado: ${newId}`);
            return newId;
        } catch (e) {
            nLog.error("PaymentDAO Error", e);
            if (data.memo && data.customerId) {
                throw nError.create({
                    name: "CUSTOM_ERROR",
                    message: "Error: " + e.message + ", en creacion " + data.memo + " para cliente id " + data.customerId
                });
            } else {
                throw e;
            }
        }
    }

    /**
     * Crea un reembolso (Customer Refund) en NetSuite
     * @param {Object} data - Datos del reembolso
     * @returns {number} - ID del reembolso creado
     */
    function createRefund(data) {
        try {
            const newRecord = record.create({
                type: record.Type.CUSTOMER_REFUND,
                isDynamic: true
            });

            newRecord.setValue({ fieldId: "customer", value: data.customerId });
            newRecord.setValue({ fieldId: "trandate", value: new Date(data.fechaTransaccion) });
            newRecord.setValue({ fieldId: "account", value: data.account }); // Cuenta desde donde sale el dinero
            newRecord.setValue({ fieldId: "total", value: data.monto }); // Monto total del reembolso
            newRecord.setValue({ fieldId: "custbody_2win_created_from_income_flow", value: true });
            // Agregar memo si existe
            if (data.memo) {
                newRecord.setValue({ fieldId: "memo", value: data.memo });
            }

            // Método de pago si está disponible
            if (data.paymentMethod) {
                newRecord.setValue({ fieldId: "paymentmethod", value: data.paymentMethod });
            }

            // Campos adicionales del CSV para reembolsos (Customer Payment = Y)
            if (data.metodoPago) newRecord.setValue({ fieldId: "custbody_2w_metodo_de_pago", value: data.metodoPago });
            if (data.referencia) newRecord.setValue({ fieldId: "custbody_2w_as_referencia", value: data.referencia });
            if (data.idPaciente) newRecord.setValue({ fieldId: "custbody_2w_as_id_paciente", value: data.idPaciente });

            // Campos de caja
            if (data.unidadCaja) newRecord.setValue({ fieldId: "custbodyunidadcaja", value: data.unidadCaja });
            if (data.fechaCaja) newRecord.setValue({ fieldId: "custbodyfechacaja", value: new Date(data.fechaCaja) });
            if (data.aperturaCaja) newRecord.setValue({ fieldId: "custbodyaperturacaja", value: data.aperturaCaja });
            if (data.razonSocialCaja) newRecord.setValue({ fieldId: "custbodyrazonsocialcaja", value: data.razonSocialCaja });
            if (data.numeroMovimiento) newRecord.setValue({ fieldId: "custbodynumeromovimiento", value: data.numeroMovimiento });

            // Campos personalizados opcionales
            if (data.rutReembolso) {
                // newRecord.setValue({ fieldId: "custbody_rut_reembolso", value: data.rutReembolso });
            }

            const newId = newRecord.save();
            nLog.audit("PaymentDAO", `Reembolso creado: ${newId}`);
            return newId;
        } catch (e) {
            nLog.error("PaymentDAO createRefund Error", e);
            throw e;
        }
    }

    return {
        createPayment: createPayment,
        createRefund: createRefund
    };
});
