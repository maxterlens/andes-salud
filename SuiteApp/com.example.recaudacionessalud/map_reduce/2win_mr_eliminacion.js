/**
 *@NApiVersion 2.1
 *@NScriptType MapReduceScript
 */
define(["N/runtime", "N/log", "N/record", "N/task", "N/query", "N/cache", "../dao/2win_dao_draft"], function (
    runtime,
    nLog,
    record,
    task,
    query,
    cache,
    { unapplyCreditMemo }
) {
    /**
     * Desaplica todos los pagos de una factura
     * @param {number} invoiceId - ID de la factura
     */
    function desaplicarPagosInvoice(invoiceId) {
        try {
            const invoiceRecord = record.load({
                type: record.Type.INVOICE,
                id: invoiceId,
                isDynamic: true
            });

            const lineCount = invoiceRecord.getLineCount({ sublistId: "apply" });
            let paymentsDesaplicados = 0;

            for (let i = 0; i < lineCount; i++) {
                const docType = invoiceRecord.getSublistValue({ sublistId: "apply", fieldId: "type", line: i });
                const docId = invoiceRecord.getSublistValue({ sublistId: "apply", fieldId: "doc", line: i });
                const apply = invoiceRecord.getSublistValue({ sublistId: "apply", fieldId: "apply", line: i });

                if (apply && docType === "Pmt") {
                    invoiceRecord.selectLine({ sublistId: "apply", line: i });
                    invoiceRecord.setCurrentSublistValue({ sublistId: "apply", fieldId: "apply", value: false });
                    invoiceRecord.commitLine({ sublistId: "apply" });
                    paymentsDesaplicados++;
                    nLog.audit("Desaplicando pago", `Invoice ${invoiceId} - Payment ${docId} desaplicado`);
                }
            }

            if (paymentsDesaplicados > 0) {
                invoiceRecord.save({ ignoreMandatoryFields: true });
                nLog.audit("Pagos desaplicados", `Invoice ${invoiceId} - ${paymentsDesaplicados} pago(s) desaplicado(s)`);
            }
        } catch (e) {
            nLog.error("Error al desaplicar pagos de Invoice", `Invoice ID: ${invoiceId}, Error: ${e.message}`);
            throw e;
        }
    }

    /**
     * Desaplica todas las aplicaciones de un Customer Payment
     * @param {number} paymentId - ID del pago
     */
    function desaplicarCustomerPayment(paymentId) {
        try {
            const paymentRecord = record.load({
                type: record.Type.CUSTOMER_PAYMENT,
                id: paymentId,
                isDynamic: true
            });

            const lineCount = paymentRecord.getLineCount({ sublistId: "apply" });
            let invoicesDesaplicadas = 0;

            for (let i = 0; i < lineCount; i++) {
                const apply = paymentRecord.getSublistValue({ sublistId: "apply", fieldId: "apply", line: i });
                if (apply) {
                    paymentRecord.selectLine({ sublistId: "apply", line: i });
                    paymentRecord.setCurrentSublistValue({ sublistId: "apply", fieldId: "apply", value: false });
                    paymentRecord.commitLine({ sublistId: "apply" });
                    invoicesDesaplicadas++;
                }
            }

            if (invoicesDesaplicadas > 0) {
                paymentRecord.save({ ignoreMandatoryFields: true });
                nLog.audit("Facturas desaplicadas", `Payment ${paymentId} - ${invoicesDesaplicadas} factura(s) desaplicada(s)`);
            }
        } catch (e) {
            nLog.error("Error al desaplicar Customer Payment", `Payment ID: ${paymentId}, Error: ${e.message}`);
            throw e;
        }
    }

    /**
     * Busca y desaplica todas las Notas de Crédito aplicadas a una transacción
     * @param {number} transactionId - ID de la transacción
     */
    function desaplicarNotasCredito(transactionId) {
        try {
            const appliedNCs = query
                .runSuiteQL({
                    query: `
                        SELECT
                            nl.nextDoc AS nc_id,
                            transaction.type AS nc_type
                        FROM
                            transaction
                        LEFT JOIN NextTransactionLink AS nl ON nl.previousDoc = transaction.id
                        WHERE
                            transaction.id = ?
                        `,
                    params: [transactionId]
                })
                .asMappedResults();

            if (appliedNCs && appliedNCs.length > 0) {
                nLog.audit("Desaplicando NCs", `Transacción ${transactionId} - ${appliedNCs.length} NC(s) aplicadas`);
                appliedNCs.forEach((nc) => {
                    if (nc.nc_type === "CustCred") {
                        unapplyCreditMemo(nc.nc_id, transactionId);
                    }
                });
            }
        } catch (e) {
            nLog.error("Error al desaplicar Notas de Crédito", `Transaction ID: ${transactionId}, Error: ${e.message}`);
            throw e;
        }
    }

    /**
     * Elimina una transacción después de desaplicar todas sus aplicaciones
     * @param {number} transactionId - ID de la transacción
     * @param {string} type - Tipo de transacción
     * @returns {Object} Resultado de la eliminación
     */
    function eliminarTransaccion(transactionId, type) {
        const resultado = {
            exito: true,
            mensaje: "",
            transaccionId: transactionId,
            tipo: type
        };

        try {
            nLog.audit("Iniciando eliminación", `Tipo: ${type}, ID: ${transactionId}`);

            // Desaplicar Notas de Crédito (para todos los tipos)
            // desaplicarNotasCredito(transactionId);

            // Desaplicar pagos específicos por tipo
            if (type === "invoice") {
                desaplicarPagosInvoice(transactionId);
            } else if (type === "customerpayment") {
                desaplicarCustomerPayment(transactionId);
            }

            // Eliminar el registro
            record.delete({
                type: type,
                id: transactionId
            });

            resultado.mensaje = "Transacción eliminada exitosamente";
            nLog.audit("Eliminación exitosa", `Tipo: ${type}, ID: ${transactionId}`);
        } catch (e) {
            resultado.exito = false;
            resultado.mensaje = `Error: ${e.message}`;
            nLog.error("Error al eliminar transacción", `Tipo: ${type}, ID: ${transactionId}, Error: ${e.message}`);
        }

        return resultado;
    }

    /**
     * Elimina una prefactura
     * @param {number} prefacturaId - ID de la prefactura
     * @returns {Object} Resultado de la eliminación
     */
    function eliminarPrefactura(prefacturaId) {
        const resultado = {
            exito: true,
            mensaje: "",
            prefacturaId: prefacturaId
        };

        try {
            nLog.audit("Iniciando eliminación de prefactura", `ID: ${prefacturaId}`);

            // Eliminar el registro de prefactura
            record.delete({
                type: "customrecord_2w_as_prefactura",
                id: prefacturaId
            });

            resultado.mensaje = "Prefactura eliminada exitosamente";
            nLog.audit("Eliminación de prefactura exitosa", `ID: ${prefacturaId}`);
        } catch (e) {
            resultado.exito = false;
            resultado.mensaje = `Error: ${e.message}`;
            nLog.error("Error al eliminar prefactura", `ID: ${prefacturaId}, Error: ${e.message}`);
        }

        return resultado;
    }

    /**
     * Obtiene los datos de entrada desde el cache
     */
    function getInputData() {
        try {
            // Recuperar ID del cache
            const cacheId = runtime.getCurrentScript().getParameter({ name: "custscript_2w_mr_eliminacion_cache_id" });
            nLog.debug("getInputData - cacheId", cacheId);

            // Validar que se haya recibido el parámetro
            if (!cacheId) {
                nLog.error("getInputData - error", "Falta parámetro custscript_2w_mr_eliminacion_cache_id");
                return [];
            }

            // Leer del cache
            // const cacheObj = cache.getCache({ name: "eliminacion_transacciones" });
            // const cachedData = cacheObj.get({ key: cacheId });

            // if (!cachedData) {
            //     nLog.error("getInputData - error", `No se encontraron datos en el cache con ID: ${cacheId}`);
            //     return [];
            // }

            const datos = JSON.parse(cacheId);
            nLog.debug("getInputData - datos", {
                totalRegistros: datos.length,
                flujo: datos[0]?.flujo || "desconocido"
            });

            return datos;
        } catch (error) {
            nLog.error("getInputData - error", error);
            return [];
        }
    }

    /**
     * Procesa cada registro individual
     */
    function map(context) {
        try {
            const registro = JSON.parse(context.value);
            nLog.debug("map - registro", registro);

            let resultado;

            if (registro.tipoRegistro === "prefactura") {
                resultado = eliminarPrefactura(registro.id);
            } else {
                resultado = eliminarTransaccion(registro.id, registro.tipoRegistro);
            }

            // Escribir el resultado
            context.write({
                key: String(registro.id),
                value: JSON.stringify({
                    id: registro.id,
                    tipo: registro.tipoRegistro,
                    exito: resultado.exito,
                    mensaje: resultado.mensaje
                })
            });

            nLog.debug("map - resultado", resultado);
        } catch (error) {
            nLog.error("map - error", error);
            // Escribir el error en el contexto
            context.write({
                key: context.key,
                value: JSON.stringify({
                    id: context.key,
                    tipo: "desconocido",
                    exito: false,
                    mensaje: `Error en map: ${error.message}`
                })
            });
        }
    }

    /**
     * Genera el resumen del proceso
     */
    function summarize(summary) {
        try {
            nLog.audit("Resumen MapReduce - Iniciado", "Procesando resumen de eliminación");

            const cacheId = runtime.getCurrentScript().getParameter({ name: "custscript_2w_mr_eliminacion_cache_id" });

            // Recopilar resultados
            const resultados = {
                totalProcesados: 0,
                exitosos: 0,
                errores: 0,
                detalle: []
            };

            // Procesar resultados del map
            summary.output.iterator().each(function (key, value) {
                const resultado = JSON.parse(value);
                resultados.totalProcesados++;
                resultados.detalle.push(resultado);

                if (resultado.exito) {
                    resultados.exitosos++;
                } else {
                    resultados.errores++;
                }

                return true;
            });

            nLog.audit("Resumen MapReduce", {
                totalProcesados: resultados.totalProcesados,
                exitosos: resultados.exitosos,
                errores: resultados.errores
            });

            // Actualizar el cache con los resultados finales
            if (cacheId) {
                const cacheObj = cache.getCache({ name: "eliminacion_transacciones" });
                const resumenFinal = {
                    estado: "COMPLETADO",
                    fechaTermino: new Date().toISOString(),
                    resultados: resultados
                };
                cacheObj.put({
                    key: cacheId + "_resultado",
                    value: JSON.stringify(resumenFinal),
                    ttl: 3600 // 1 hora de TTL
                });
                nLog.audit("Cache actualizado", `Resultados guardados en cache: ${cacheId}_resultado`);
            }

            // Estadísticas de uso
            let scriptObj = runtime.getCurrentScript();
            nLog.debug("Unidades restantes", scriptObj.getRemainingUsage());
            nLog.debug("Tiempo total de ejecución", summary.seconds + " segundos");
        } catch (error) {
            nLog.error("summarize - error", error);
        }
    }

    return {
        getInputData: getInputData,
        map: map,
        summarize: summarize
    };
});