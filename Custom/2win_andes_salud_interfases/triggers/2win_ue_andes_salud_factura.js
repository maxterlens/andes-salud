/**
 *@NApiVersion 2.1
 *@NScriptType UserEventScript
 */
define(["N/record", "N/query", "N/format", "N/log"], function (record, query, format, nLog) {
    function beforeLoad(context) {}

    function beforeSubmit(context) {}

    function afterSubmit(context) {
        try {
            if (context.type === context.UserEventType.DELETE) {
                handleDelete(context);
                return;
            }
            // handleCreateOrUpdate(context);
        } catch (error) {
            nLog.error("Error en afterSubmit", error);
        }
    }

    const handleDelete = (context) => {
        const oldRecord = context.oldRecord;
        const tranid = oldRecord.getValue("tranid");

        try {
            const journalsToDelete = query
                .runSuiteQL({
                    query: `
                    SELECT id 
                    FROM transaction 
                    WHERE recordtype = 'journalentry' 
                    AND transaction.custbody_2win_tran_origin = ?
                `,
                    params: [oldRecord.id]
                })
                .asMappedResults();

            if (journalsToDelete.length > 0) {
                nLog.debug("Asientos a eliminar", journalsToDelete);
                journalsToDelete.forEach((journal) => {
                    try {
                        record.delete({ type: record.Type.JOURNAL_ENTRY, id: journal.id });
                        nLog.debug("Asiento Eliminado", `Journal ID: ${journal.id} eliminado exitosamente.`);
                    } catch (e) {
                        nLog.error("Error al eliminar asiento individual", `Journal ID: ${journal.id}, Error: ${e.message}`);
                    }
                });
            } else {
                nLog.debug("Sin asientos para eliminar", `No se encontraron asientos para la factura ${tranid}`);
            }
        } catch (e) {
            nLog.error("Error buscando asientos para eliminar", `Factura tranid: ${tranid}, Error: ${e.message}`);
        }
    };

    const handleCreateOrUpdate = (context) => {
        const newRecord = context.newRecord;
        const listaAsientos = searchAsientos(newRecord.id);
        nLog.debug("listaAsientos", listaAsientos);
        if (listaAsientos.length === 0) {
            nLog.debug("Sin líneas para procesar", "No se generará asiento contable.");
            return;
        }

        const existingJournal = findExistingJournal(newRecord);
        const invoiceDate = format.parse({ type: format.Type.DATE, value: listaAsientos[0].fecha });

        if (existingJournal) {
            const journalDate = format.parse({ type: format.Type.DATE, value: existingJournal.trandate });
            if (invoiceDate.getTime() === journalDate.getTime()) {
                // Misma fecha, actualizar asiento
                updateJournalEntry({
                    journalId: existingJournal.id,
                    lineas: listaAsientos,
                    memo: listaAsientos[0].glosa,
                    cuentaPaciente: newRecord.getValue("custbody_2w_as_cuenta_paciente")
                });
                nLog.debug("Proceso Finalizado", `Factura ID: ${newRecord.id} - Journal ID: ${existingJournal.id} actualizado.`);
            } else {
                // Fecha diferente, reversar y crear nuevo
                reverseJournalEntry(existingJournal.id);
                const newJournalId = createJournalEntry({
                    lineas: listaAsientos,
                    trandate: listaAsientos[0].fecha,
                    memo: listaAsientos[0].glosa,
                    cuentaPaciente: newRecord.getValue("custbody_2w_as_cuenta_paciente"),
                    subsidiaria: newRecord.getValue("subsidiary"),
                    invoiceId: newRecord.id
                });
                updateInvoiceLines(newRecord.id, newJournalId);
                nLog.debug("Proceso Finalizado", `Factura ID: ${newRecord.id} - Journal Reversado: ${existingJournal.id}, Nuevo Journal: ${newJournalId}`);
            }
        } else {
            // No existe asiento, crear uno nuevo
            const idJournal = createJournalEntry({
                lineas: listaAsientos,
                trandate: listaAsientos[0].fecha,
                memo: listaAsientos[0].glosa,
                cuentaPaciente: newRecord.getValue("custbody_2w_as_cuenta_paciente"),
                subsidiaria: newRecord.getValue("subsidiary")
            });
            updateInvoiceLines(newRecord.id, idJournal);
            nLog.debug("Proceso Finalizado", `Factura ID: ${newRecord.id} - Journal ID: ${idJournal} creado.`);
        }
    };

    const findExistingJournal = (invoiceRecord) => {
        const journalId = invoiceRecord.getSublistValue({ sublistId: "item", fieldId: "custcol_2w_id_diario_asociado", line: 0 });
        if (!journalId) return null;

        try {
            const journalFields = query
                .runSuiteQL({
                    query: `SELECT trandate FROM transaction WHERE id = ? AND recordtype = 'journalentry'`,
                    params: [journalId]
                })
                .asMappedResults();

            if (journalFields.length > 0) {
                return { id: journalId, trandate: journalFields[0].trandate };
            }
        } catch (e) {
            nLog.error("Error buscando asiento existente", e);
        }
        return null;
    };
    const searchAsientos = (id) => {
        const listaAsientos = query
            .runSuiteQL({
                query: `
            SELECT
                tl.subsidiary AS idEmpresa,
                t.trandate AS fecha,
                tl.class AS id_clase,
                tl.department AS id_cecos,
                'RebIng-' || t.tranid || '-' || t.custbody_2w_as_cuenta_paciente || '-' || TO_CHAR (SYSDATE, 'YYYYMMDD') AS idEntry,
                tl.expenseaccount AS id_cuenta_contable,
                a.acctnumber AS cuentaContable, -- Obtener el número de cuenta desde la tabla Account
                SUM(NVL (tl.debitForeignAmount, 0)) AS credito, -- Suma simple de débitos por grupo
                SUM(NVL (tl.creditForeignAmount, 0)) AS debito, -- Suma simple de créditos (ya filtramos taxLine='F')
                'Rebaja de Ingresos Duplicados No.' || t.tranid || ' (' || c.entityid || ')' AS glosa, -- Usar t.entity y join a Customer para entityid
                t.entity AS id_cliente, -- Usar t.entity para el ID del cliente principal
                t.custbody_2w_as_cuenta_paciente AS idCuentaPaciente
            FROM
                transactionline tl
                INNER JOIN transaction t ON t.id = tl.transaction
                INNER JOIN account a ON tl.expenseaccount = a.id -- Unir con Account para obtener el número
                INNER JOIN customer c ON t.entity = c.id -- Unir con Customer para obtener entityid
            WHERE
                tl.transaction = ? -- Asegúrate que este ID es correcto o usa un parámetro '?'
                --AND tl.taxLine = 'F' -- Excluir líneas de impuestos
                -- AND tl.mainline = 'F' -- Considera agregar esto si SOLO quieres líneas de detalle
            GROUP BY
                tl.subsidiary,
                t.trandate,
                tl.class,
                tl.department,
                t.tranid, -- Agrupar por componentes de idEntry
                t.custbody_2w_as_cuenta_paciente, -- Agrupar por componentes de idEntry y seleccionado directamente
                tl.expenseaccount, -- Agrupar por ID de cuenta
                a.acctnumber, -- Agrupar por número de cuenta
                c.entityid, -- Agrupar por componente de glosa
                t.entity -- Agrupar por ID de cliente
            ORDER BY -- Opcional: añadir un orden para consistencia
                id_cuenta_contable
            `,
                params: [id]
            })
            .asMappedResults();
        return listaAsientos;
    };
    const updateInvoiceLines = (invoiceId, journalId) => {
        const invoiceRecord = record.load({
            type: record.Type.INVOICE,
            id: invoiceId,
            isDynamic: true
        });

        const lineCount = invoiceRecord.getLineCount({ sublistId: "item" });

        for (let i = 0; i < lineCount; i++) {
            invoiceRecord.selectLine({ sublistId: "item", line: i });

            invoiceRecord.setCurrentSublistValue({
                sublistId: "item",
                fieldId: "custcol_2w_id_diario_asociado",
                value: journalId
            });

            invoiceRecord.commitLine({ sublistId: "item" });
        }

        // Guardar la orden de venta una sola vez
        invoiceRecord.save({ ignoreMandatoryFields: true, enableSourcing: false, enableTriggers: false });
    };
    const createJournalEntry = ({ subsidiaria, trandate, lineas, memo, cuentaPaciente, invoiceId }) => {
        const recordJournal = record.create({ type: record.Type.JOURNAL_ENTRY, isDynamic: true });
        recordJournal.setValue({ fieldId: "subsidiary", value: subsidiaria });
        recordJournal.setValue({ fieldId: "currency", value: 1 }); // Mejora: Obtener de la factura
        recordJournal.setValue("approvalstatus", 2); // Aprobado
        recordJournal.setValue({ fieldId: "trandate", value: format.parse({ type: format.Type.DATE, value: trandate }) });
        recordJournal.setValue({ fieldId: "memo", value: memo });
        recordJournal.setValue({ fieldId: "custbody_2win_tran_origin", value: invoiceId });
        if (cuentaPaciente) {
            recordJournal.setValue("custbody_2w_as_cuenta_paciente", cuentaPaciente);
        }

        lineas.forEach((linea) => {
            if (Number(linea.debito) === 0 && Number(linea.credito) === 0) {
                nLog.debug("Saltar línea con débito y crédito cero", linea);
                return; // Saltar esta línea
            }
            recordJournal.selectNewLine({ sublistId: "line" });
            recordJournal.setCurrentSublistValue({ sublistId: "line", fieldId: "account", value: linea.id_cuenta_contable });
            recordJournal.setCurrentSublistValue({ sublistId: "line", fieldId: "debit", value: linea.debito });
            recordJournal.setCurrentSublistValue({ sublistId: "line", fieldId: "credit", value: linea.credito });
            recordJournal.setCurrentSublistValue({ sublistId: "line", fieldId: "entity", value: linea.id_cliente });
            recordJournal.setCurrentSublistValue({ sublistId: "line", fieldId: "class", value: linea.id_clase });
            recordJournal.setCurrentSublistValue({ sublistId: "line", fieldId: "department", value: linea.id_cecos });
            recordJournal.setCurrentSublistValue({ sublistId: "line", fieldId: "memo", value: linea.glosa });
            if (cuentaPaciente) {
                recordJournal.setCurrentSublistValue({ sublistId: "line", fieldId: "custcol_2w_as_cuenta_paciente", value: cuentaPaciente });
            }
            recordJournal.commitLine({ sublistId: "line" });
        });

        const journalId = recordJournal.save({ ignoreMandatoryFields: true });
        nLog.debug("Journal Entry Created", `ID: ${journalId}`);
        return journalId;
    };

    const updateJournalEntry = ({ journalId, lineas, memo, cuentaPaciente }) => {
        const recordJournal = record.load({ type: record.Type.JOURNAL_ENTRY, id: journalId, isDynamic: true });
        recordJournal.setValue({ fieldId: "memo", value: memo });
        if (cuentaPaciente) {
            recordJournal.setValue("custbody_2w_as_cuenta_paciente", cuentaPaciente);
        }

        // Remover líneas existentes
        const lineCount = recordJournal.getLineCount({ sublistId: "line" });
        for (let i = lineCount - 1; i >= 0; i--) {
            recordJournal.removeLine({ sublistId: "line", line: i });
        }

        // Agregar nuevas líneas
        lineas.forEach((linea) => {
            recordJournal.selectNewLine({ sublistId: "line" });
            recordJournal.setCurrentSublistValue({ sublistId: "line", fieldId: "account", value: linea.id_cuenta_contable });
            recordJournal.setCurrentSublistValue({ sublistId: "line", fieldId: "debit", value: linea.debito });
            recordJournal.setCurrentSublistValue({ sublistId: "line", fieldId: "credit", value: linea.credito });
            recordJournal.setCurrentSublistValue({ sublistId: "line", fieldId: "entity", value: linea.id_cliente });
            recordJournal.setCurrentSublistValue({ sublistId: "line", fieldId: "class", value: linea.id_clase });
            recordJournal.setCurrentSublistValue({ sublistId: "line", fieldId: "department", value: linea.id_cecos });
            recordJournal.setCurrentSublistValue({ sublistId: "line", fieldId: "memo", value: linea.glosa });
            if (cuentaPaciente) {
                recordJournal.setCurrentSublistValue({ sublistId: "line", fieldId: "custcol_2w_as_cuenta_paciente", value: cuentaPaciente });
            }
            recordJournal.commitLine({ sublistId: "line" });
        });

        recordJournal.save({ ignoreMandatoryFields: true });
        nLog.debug("Journal Entry Updated", `ID: ${journalId}`);
    };

    const reverseJournalEntry = (journalId) => {
        try {
            const reverseJournal = record.copy({
                type: record.Type.JOURNAL_ENTRY,
                id: journalId,
                isDynamic: true
            });
            const memo = reverseJournal.getValue("memo");
            reverseJournal.setValue("memo", `Reversa de: ${memo}`);
            reverseJournal.setValue("reversaldate", new Date()); // O la fecha que corresponda

            const lineCount = reverseJournal.getLineCount({ sublistId: "line" });
            for (let i = 0; i < lineCount; i++) {
                reverseJournal.selectLine({ sublistId: "line", line: i });
                const debit = reverseJournal.getCurrentSublistValue({ sublistId: "line", fieldId: "debit" });
                const credit = reverseJournal.getCurrentSublistValue({ sublistId: "line", fieldId: "credit" });
                reverseJournal.setCurrentSublistValue({ sublistId: "line", fieldId: "debit", value: credit });
                reverseJournal.setCurrentSublistValue({ sublistId: "line", fieldId: "credit", value: debit });
                reverseJournal.commitLine({ sublistId: "line" });
            }

            const reverseJournalId = reverseJournal.save({ ignoreMandatoryFields: true });
            nLog.debug("Journal Entry Reversed", `ID Original: ${journalId}, ID Reversa: ${reverseJournalId}`);
            return reverseJournalId;
        } catch (e) {
            nLog.error("Error al reversar asiento", `Journal ID: ${journalId}, Error: ${e.message}`);
            return null;
        }
    };
    return {
        // beforeLoad: beforeLoad,
        // beforeSubmit: beforeSubmit,
        afterSubmit: afterSubmit
    };
});
