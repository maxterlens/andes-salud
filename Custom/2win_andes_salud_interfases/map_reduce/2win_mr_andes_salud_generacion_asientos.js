/**
 * @NApiVersion 2.1
 * @NScriptType MapReduceScript
 */
define(["N/search", "N/log", "N/record", "N/format", "N/query"], function (search, nLog, record, format, query) {
    // ----------------------
    // ETAPA: GET INPUT DATA
    // ----------------------
    function getInputData() {
        // MEJORA SUGERIDA: Si tienes muchas transacciones históricas, considera agregar
        const operationDate = new Date().toISOString(); // Guardamos la fecha de operación para usarla en el proceso
        // un filtro de fecha aquí (ej. AND t.trandate >= '2024-01-01') para optimizar la carga.
        const sql = `
            SELECT
                t.id AS id_sales_order,
                t.tranid,
                so_agrupado.id_diario_asociado AS id_diario_asociado,
            CASE
                WHEN so_agrupado.id_diario_asociado IS NULL THEN 'NUEVO'
                ELSE 'POSIBLE_CAMBIO'
            END AS flag_diferencia,
            NVL (so_agrupado.total_so_lineas, 0) as total_so_lineas,
            NVL (journal_agrupado.total_journal, 0) as total_journal
            FROM
            transaction AS t
            INNER JOIN accountingperiod AS ap ON ap.id = t.postingperiod
            AND ap.closed = 'F'
            AND ap.allLocked = 'F'
            -- Subconsulta 1: Totales y enlace del Sales Order (Agrupado por SO)
            INNER JOIN (
                SELECT
                transaction,
                MIN(NVL (custcol_2w_id_diario_asociado, 0)) AS id_diario_asociado,
                SUM(ABS(foreignAmount)) AS total_so_lineas
                FROM
                transactionLine
                WHERE
                mainLine = 'F'
                AND taxline = 'F'
                --AND custcol_2win_flag_item_provisional = 'F'
                GROUP BY
                transaction
            ) AS so_agrupado ON so_agrupado.transaction = t.id
            -- Subconsulta 2: Totales del Diario vinculado (Agrupado por Diario)
            LEFT JOIN (
                SELECT
                transaction,
                SUM(ABS(foreignAmount)) / 2 AS total_journal
                FROM
                transactionLine
                GROUP BY
                transaction
            ) AS journal_agrupado ON journal_agrupado.transaction = so_agrupado.id_diario_asociado
            -- Join para obtener la fecha del diario para la comparación de fechas
            LEFT JOIN transaction AS t2 ON t2.id = so_agrupado.id_diario_asociado
            WHERE
            t.type = 'SalesOrd'
            --AND t.custbody_2w_as_ficha_paciente IS NOT NULL
            -- AND t.custbody_2w_as_cuenta_paciente IS NOT NULL
            -- AND t.custbody_2win_nro_cuenta_paciente IS NOT NULL
            AND (
                so_agrupado.id_diario_asociado IS NULL
                OR so_agrupado.total_so_lineas <> NVL (journal_agrupado.total_journal, 0)
                --OR t.custbody_2win_as_fecha_envio > t2.trandate
            )
            AND (NVL (so_agrupado.total_so_lineas, 0) > 0)
        `;

        const pagedQuery = query.runSuiteQLPaged({
            query: sql,
            pageSize: 1000
        });

        const pageCount = pagedQuery.pageRanges.length;
        const allResults = [];

        for (let i = 0; i < pageCount; i++) {
            const page = pagedQuery.fetch({ index: i });
            allResults.push(...page.data.asMappedResults());
        }

        nLog.debug("Total Sales Orders a Procesar", allResults.length);
        return allResults.map((result) => {
            result.operationDate = operationDate; // Agregamos la fecha de operación a cada resultado para uso futuro
            return result;
        });
    }

    // ----------------------
    // ETAPA: MAP
    // ----------------------
    function map(context) {
        try {
            const searchResult = JSON.parse(context.value);
            const { id_sales_order, id_diario_asociado, flag_diferencia, operationDate } = searchResult;

            nLog.debug("Iniciando Proceso", `SO ID: ${id_sales_order} | Estado Detectado: ${flag_diferencia}`);

            // 1. OBTENCIÓN DE DIARIOS ANTIGUOS (Movemos esto hacia arriba)
            const oldJournalIds = getOldJournals(id_sales_order);

            // 2. CALCULO DE LÍNEAS CONTABLES (Lo que "debería ser")
            const linesSalesOrder = getSalesOrderLines(id_sales_order, operationDate);

            // CASO CRÍTICO: La SO quedó en 0 (Líneas eliminadas o valor 0)
            if (linesSalesOrder.length === 0) {
                if (oldJournalIds.length > 0) {
                    nLog.audit("Acción: Reversión Total (SO en 0)", `La SO ${id_sales_order} quedó en 0. Reversando diarios asociados.`);

                    // Reversar diarios huérfanos
                    oldJournalIds.forEach((oldJournalId) => {
                        reversarJournal(oldJournalId, operationDate);
                    });

                    // Limpiar el ID del diario en las líneas de la SO (pasamos vacío)
                    updateSalesOrderLines(id_sales_order, "");
                } else {
                    nLog.debug("Skip", `No se encontraron líneas facturables para SO ${id_sales_order} y no hay diarios activos.`);
                }
                return; // Ya procesamos la reversión, salimos.
            }

            // 3. OBTENCIÓN DE DATOS MAESTROS (Si hay líneas que procesar)
            const salesOrderData = getSalesOrderData(id_sales_order);
            let expectedDateObj = new Date(operationDate);
            // if (salesOrderData.fechaEnvio) {
            //     expectedDateObj = format.parse({ type: format.Type.DATE, value: salesOrderData.fechaEnvio });
            // }

            // Mapeo y Balanceo de líneas
            const linesMapped = linesSalesOrder.map((line) => {
                const {
                    id_sales_order,
                    id_empresa_subsidiaria,
                    id_cliente,
                    expenseaccount,
                    numero_cuenta_paciente,
                    fecha,
                    id_clase,
                    id_cecos,
                    id_servicio,
                    taxline,
                    mainline,
                    id_entry,
                    debito,
                    credito,
                    glosa
                } = line;
                return {
                    id_sales_order,
                    id_empresa_subsidiaria,
                    id_cliente,
                    expenseaccount: mainline === "T" ? 1151 : expenseaccount,
                    numero_cuenta_paciente,
                    folio: mainline === "T" ? numero_cuenta_paciente : "",
                    fecha,
                    id_clase,
                    id_cecos,
                    id_servicio,
                    taxline,
                    mainline,
                    id_entry,
                    debito,
                    credito,
                    glosa
                };
            });

            const lineasBalanceadas = processAccountingEntries(linesMapped);
            const newLinesToCompare = lineasBalanceadas.filter((l) => l.taxline !== "T" && (Number(l.debito || 0) !== 0 || Number(l.credito || 0) !== 0));

            // 4. ANÁLISIS DE EXISTENCIA Y CAMBIOS
            let shouldProcess = false;
            let needsLinkUpdate = false; // NUEVA BANDERA: Para actualizar solo el enlace

            if (oldJournalIds.length === 0) {
                nLog.audit("Acción: Crear", `SO ${id_sales_order} no tiene diario activo. Se creará uno.`);
                shouldProcess = true;
            } else if (oldJournalIds.length > 1) {
                nLog.audit("Acción: Limpieza", `SO ${id_sales_order} tiene múltiples diarios. Se limpiarán.`);
                shouldProcess = true;
            } else {
                const lastJournalId = oldJournalIds[0];
                const hasChanged = hasJournalChanged(lastJournalId, newLinesToCompare, id_sales_order, expectedDateObj);

                if (hasChanged) {
                    nLog.audit("Acción: Actualizar", `Diferencias en Fecha o Montos para Journal ${lastJournalId}.`);
                    shouldProcess = true;
                } else {
                    // CLAVE DEL ARREGLO: El diario no ha cambiado contablemente, pero
                    // necesitamos vincular la nueva línea al diario existente.
                    nLog.debug("Sin Acción Contable", `El Journal ${lastJournalId} está sincronizado. Validando enlaces de línea.`);
                    shouldProcess = false;
                    needsLinkUpdate = true;
                }
            }

            // 5. EJECUCIÓN (Reversión, Creación o Vinculación)
            if (shouldProcess) {
                if (oldJournalIds.length > 0) {
                    oldJournalIds.forEach((oldJournalId) => {
                        reversarJournal(oldJournalId, operationDate);
                    });
                }

                const journalId = createJournalEntry({
                    id: id_sales_order,
                    subsidiaria: lineasBalanceadas[0].id_empresa_subsidiaria,
                    trandateObj: expectedDateObj,
                    // trandateObj: new Date('03/31/2026'),
                    lineas: lineasBalanceadas,
                    memo: `Reconocimiento Ingresos Cuenta Paciente Nro. ${lineasBalanceadas[0].numero_cuenta_paciente}`,
                    salesOrderData: salesOrderData
                });

                updateSalesOrderLines(id_sales_order, journalId);
            } else if (needsLinkUpdate) {
                // Solo vinculamos el ID en la Orden de Venta para romper el bucle infinito
                updateSalesOrderLines(id_sales_order, oldJournalIds[0]);
            }
        } catch (error) {
            nLog.error("Error Critical en MAP", error);
        }
    }

    function summarize(summary) {
        let type = summary.toString();
        nLog.audit("Resumen del Script", `Tipo: ${type} - Uso de Concurrencia Finalizado`);

        summary.mapSummary.errors.iterator().each(function (key, error) {
            nLog.error(`Map Error for key: ${key}`, error);
            return true;
        });
    }

    // ---------------------------------------------
    // FUNCIONES AUXILIARES (LOGICA DE NEGOCIO)
    // ---------------------------------------------

    /**
     * MEJORA PRINCIPAL: Compara Contenido Y FECHA
     */
    const hasJournalChanged = (journalId, newLines, salesOrderId, expectedDateObj) => {
        try {
            const oldRec = record.load({ type: record.Type.JOURNAL_ENTRY, id: journalId });

            // 1. COMPARACIÓN DE FECHA
            const currentJournalDate = oldRec.getValue({ fieldId: "trandate" });

            // Convertimos a string ISO (YYYY-MM-DD) para comparar solo el día y evitar problemas de hora
            const date1 = format.format({ value: currentJournalDate, type: format.Type.DATE });
            const date2 = format.format({ value: expectedDateObj, type: format.Type.DATE });

            if (date1 !== date2) {
                nLog.debug("Diferencia Detectada", `Fecha Journal: ${date1} vs Esperada: ${date2}`);
                return true;
            }

            // 2. COMPARACIÓN DE LÍNEAS (Montos, Cuentas, Entidades)
            const lineCount = oldRec.getLineCount({ sublistId: "line" });
            const oldLinesData = [];

            for (let i = 0; i < lineCount; i++) {
                oldLinesData.push({
                    account: String(oldRec.getSublistValue({ sublistId: "line", fieldId: "account", line: i })),
                    debit: Number(oldRec.getSublistValue({ sublistId: "line", fieldId: "debit", line: i }) || 0).toFixed(2),
                    credit: Number(oldRec.getSublistValue({ sublistId: "line", fieldId: "credit", line: i }) || 0).toFixed(2),
                    entity: String(oldRec.getSublistValue({ sublistId: "line", fieldId: "entity", line: i }) || ""),
                    class: String(oldRec.getSublistValue({ sublistId: "line", fieldId: "class", line: i }) || ""),
                    department: String(oldRec.getSublistValue({ sublistId: "line", fieldId: "department", line: i }) || "")
                });
            }

            const newLinesData = newLines.map((l) => ({
                account: String(l.expenseaccount),
                debit: Number(l.debito || 0).toFixed(2),
                credit: Number(l.credito || 0).toFixed(2),
                entity: String(l.id_cliente || ""),
                class: String(l.id_clase || ""),
                department: String(l.id_cecos || "")
            }));

            // Si cantidad de líneas difiere, cambio seguro
            if (oldLinesData.length !== newLinesData.length) return true;

            // Generamos "firmas" para comparar contenido sin importar el orden
            const createSignature = (obj) => `${obj.account}|${obj.debit}|${obj.credit}|${obj.entity}|${obj.class}|${obj.department}`;
            const oldSignatures = oldLinesData.map(createSignature).sort();
            const newSignatures = newLinesData.map(createSignature).sort();
            nLog.debug("Old Signatures", JSON.stringify(oldSignatures));
            nLog.debug("New Signatures", JSON.stringify(newSignatures));
            if (JSON.stringify(oldSignatures) !== JSON.stringify(newSignatures)) {
                nLog.debug("Diferencia Detectada", "Cambio en montos, cuentas o clasificación.");
                return true;
            }

            return false; // Todo idéntico
        } catch (e) {
            nLog.error("Error comparando journals", e);
            return true; // Ante la duda, procesar
        }
    };

    const createJournalEntry = ({ subsidiaria, id, trandateObj, lineas, memo, salesOrderData }) => {
        const recordJournal = record.create({ type: record.Type.JOURNAL_ENTRY, isDynamic: true });

        recordJournal.setValue({ fieldId: "subsidiary", value: subsidiaria });
        recordJournal.setValue({ fieldId: "currency", value: 1 }); // Ajustar si manejas multimeda
        recordJournal.setValue({ fieldId: "memo", value: memo });
        recordJournal.setValue({ fieldId: "approvalstatus", value: 2 }); // Aprobado
        recordJournal.setValue({ fieldId: "custbody_2win_tran_origin", value: id });

        // Usamos la fecha ya validada
        recordJournal.setValue({ fieldId: "trandate", value: trandateObj });

        // Campos personalizados de cabecera
        if (salesOrderData) {
            recordJournal.setValue({ fieldId: "custbody_2win_nro_cuenta_paciente", value: salesOrderData.cuentaPaciente });
            recordJournal.setValue({ fieldId: "custbody_2w_as_ficha_paciente", value: salesOrderData.fichaPaciente });
            recordJournal.setValue({ fieldId: "custbody_2win_prevision_nom", value: salesOrderData.previsionPaciente });
        }

        lineas.forEach((linea) => {
            const { id_cliente, expenseaccount, id_clase, id_cecos, taxline, debito, credito, glosa, folio } = linea;

            if (taxline === "T") return;
            if (Number(debito) === 0 && Number(credito) === 0) return;

            recordJournal.selectNewLine({ sublistId: "line" });
            recordJournal.setCurrentSublistValue({ sublistId: "line", fieldId: "account", value: expenseaccount });
            if (salesOrderData && salesOrderData.cuentaPacienteId) {
                recordJournal.setCurrentSublistValue({ sublistId: "line", fieldId: "custcol_2w_as_cuenta_paciente", value: salesOrderData.cuentaPacienteId });
            }
            if (folio) {
                recordJournal.setCurrentSublistValue({ sublistId: "line", fieldId: "custcol_2w_folio", value: folio });
            }
            recordJournal.setCurrentSublistValue({ sublistId: "line", fieldId: "debit", value: debito });
            recordJournal.setCurrentSublistValue({ sublistId: "line", fieldId: "credit", value: credito });
            recordJournal.setCurrentSublistValue({ sublistId: "line", fieldId: "entity", value: id_cliente });
            recordJournal.setCurrentSublistValue({ sublistId: "line", fieldId: "class", value: id_clase });
            recordJournal.setCurrentSublistValue({ sublistId: "line", fieldId: "department", value: id_cecos });
            recordJournal.setCurrentSublistValue({ sublistId: "line", fieldId: "memo", value: glosa });
            recordJournal.commitLine({ sublistId: "line" });
        });

        const journalIdCreated = recordJournal.save({ ignoreMandatoryFields: true });
        nLog.debug("Journal Creado", `ID: ${journalIdCreated}`);
        return journalIdCreated;
    };

    const processAccountingEntries = (entries) => {
        // Tu lógica original de balanceo Mainline se mantiene intacta
        const entriesByGroup = {};
        for (const entry of entries) {
            if (!entriesByGroup[entry.id_entry]) entriesByGroup[entry.id_entry] = [];
            entriesByGroup[entry.id_entry].push({ ...entry });
        }
        const result = [];
        for (const groupId in entriesByGroup) {
            const group = entriesByGroup[groupId];
            const mainlineEntry = group.find((entry) => entry.mainline === "T");
            if (!mainlineEntry) {
                result.push(...group);
                continue;
            }
            let totalCredit = 0,
                totalTaxCredit = 0,
                totalNonMainlineDebit = 0;
            for (const entry of group) {
                if (entry.credito !== null) totalCredit += entry.credito;
                if (entry.taxline === "T" && entry.credito !== null) totalTaxCredit += entry.credito;
                if (entry.mainline !== "T" && entry.debito !== null) totalNonMainlineDebit += entry.debito;
            }
            const newMainlineValue = totalCredit - totalTaxCredit - totalNonMainlineDebit;
            mainlineEntry.debito = newMainlineValue;
            mainlineEntry.credito = null;
            const filteredGroup = group.filter((entry) => entry.taxline !== "T");
            result.push(...filteredGroup);
        }
        return result.sort((a, b) => (a.debito !== null ? -1 : 1));
    };

    const reversarJournal = (journalId, operationDate) => {
        try {
            const journal = record.load({ type: record.Type.JOURNAL_ENTRY, id: journalId });
            if (journal.getValue("reversaldate")) return; // Ya estaba reversado
            journal.setValue({ fieldId: "reversaldate", value: new Date(operationDate) });
            journal.save({ ignoreMandatoryFields: true });
        } catch (e) {
            nLog.error("Error al reversar", e);
        }
    };

    const getSalesOrderData = (id) => {
        const salesOrderData = search.lookupFields({
            type: record.Type.SALES_ORDER,
            id: id,
            columns: ["custbody_2w_as_ficha_paciente", "custbody_2win_nro_cuenta_paciente", "custbody_2win_prevision_nom", "custbody_2win_as_fecha_envio", "custbody_2w_as_cuenta_paciente"]
        });
        return {
            fichaPaciente: salesOrderData.custbody_2w_as_ficha_paciente,
            cuentaPaciente: salesOrderData.custbody_2win_nro_cuenta_paciente,
            cuentaPacienteId: salesOrderData.custbody_2w_as_cuenta_paciente[0]?.value,
            previsionPaciente: salesOrderData.custbody_2win_prevision_nom,
            fechaEnvio: salesOrderData.custbody_2win_as_fecha_envio
        };
    };

    const getOldJournals = (salesOrderId) => {
        const sql = `SELECT
                        ta.id
                    FROM
                        transaction as ta
                        inner join transactionline as tl on tl.transaction = ta.id
                        and tl.memo LIKE 'Reconocimiento Ingresos%'
                    WHERE
                        type = 'Journal'
                        AND ta.custbody_2win_tran_origin = ?
                        AND ta.reversal IS NULL
                    GROUP BY
                        ta.id`;
        return query
            .runSuiteQL({ query: sql, params: [salesOrderId] })
            .asMappedResults()
            .map((r) => r.id);
    };

    const updateSalesOrderLines = (salesOrderId, journalId) => {
        const salesOrderRecord = record.load({ type: record.Type.SALES_ORDER, id: salesOrderId, isDynamic: false });
        let hasChanges = false;
        const nroLineas = salesOrderRecord.getLineCount({ sublistId: "item" });

        for (let i = 0; i < nroLineas; i++) {
            const currentJournal = salesOrderRecord.getSublistValue({ sublistId: "item", fieldId: "custcol_2w_id_diario_asociado", line: i });
            // const isTemporal = salesOrderRecord.getSublistValue({ sublistId: "item", fieldId: "custcol_2win_flag_item_provisional", line: i });

            // if (isTemporal || String(currentJournal || "") === String(journalId || "")) continue;

            salesOrderRecord.setSublistValue({ sublistId: "item", fieldId: "custcol_2w_id_diario_asociado", line: i, value: journalId || "" });
            hasChanges = true;
        }

        if (hasChanges) {
            salesOrderRecord.save({ ignoreMandatoryFields: true, enableSourcing: false });
        }
    };
    const getSalesOrderLines = (id,operationDate) => {
        const dateObj = new Date(operationDate);

        const day = String(dateObj.getDate()).padStart(2, "0");
        const month = String(dateObj.getMonth() + 1).padStart(2, "0"); // Los meses en JS van de 0 a 11
        const year = dateObj.getFullYear();

        const dateStringSQL = `${day}/${month}/${year}`;

        const dateStringConcat = `${year}${month}${day}`;
        const sql = `
            SELECT
            Transaction.id AS id_sales_order,
            transactionLine.subsidiary AS id_empresa_subsidiaria,
            Customer.id AS id_cliente,
            transactionLine.expenseaccount,
            Transaction.custbody_2win_nro_cuenta_paciente AS numero_cuenta_paciente,
            TO_DATE('${dateStringSQL}', 'DD/MM/YYYY') AS fecha,
            classification.id AS id_clase,
            Department.id AS id_cecos,
            transactionLine.custcol_2win_as_codigo_servicio AS id_servicio,
            transactionLine.taxline,
            transactionLine.mainLine,
            'ReconIng-' || Transaction.tranId || '-' || custbody_2win_nro_cuenta_paciente || '-' || '${dateStringConcat}' AS id_entry,
            SUM(transactionLine.debitForeignAmount) AS debito,
            SUM(transactionline.creditForeignAmount) AS credito,
            'Reconocimiento Ingresos No.' || Transaction.tranid || ' (' || Customer.entityid || ')' AS glosa
            FROM
            Transaction
            INNER JOIN transactionLine ON transactionLine.transaction = transaction.id
            INNER JOIN Customer ON Transaction.entity = Customer.id
            LEFT JOIN classification ON transactionLine.class = classification.id
            LEFT JOIN Department ON transactionLine.department = Department.id
            WHERE
            Transaction.type = 'SalesOrd'
            /*AND Transaction.status = any(
                'A',
                'B',
                'D',
                'E',
                'F'
            )
            AND Transaction.custbody_2win_nro_cuenta_paciente IS NOT NULL*/
            AND (
                transactionLine.creditForeignAmount > 0
                OR transactionLine.debitForeignAmount > 0
            )
            AND Transaction.id = ?
            /*AND (
             transactionLine.mainLine = 'T'
            OR transactionLine.custcol_2win_flag_item_provisional = 'F'
             OR transactionLine.taxline = 'T'
            )*/
            GROUP BY
            Transaction.id,
            transactionLine.subsidiary,
            Customer.id,
            Transaction.custbody_2win_nro_cuenta_paciente,
            classification.id,
            Department.id,
            transactionLine.taxline,
            transactionLine.custcol_2win_as_codigo_servicio,
            transactionLine.mainLine,
            transactionLine.expenseaccount,
            Transaction.tranid,
            Customer.entityid`;
        nLog.debug("SQL para líneas de SO", sql);
        return query.runSuiteQL({ query: sql, params: [id] }).asMappedResults();
    };

    return {
        getInputData: getInputData,
        map: map,
        summarize: summarize
    };
});
