/**
 * @NApiVersion 2.1
 */
define(["N/record", "N/log", "N/search", "N/query"], function (record, nLog, search, query) {
    function createJournalEntry(data) {
        try {
            nLog.debug("JournalData", data);
            const newRecord = record.create({
                type: record.Type.JOURNAL_ENTRY,
                isDynamic: true
            });
            const tipoDeDiario = data.tipoDeDiario;
            newRecord.setValue({ fieldId: "trandate", value: new Date(data.fechaTransaccion) });
            newRecord.setValue({ fieldId: "subsidiary", value: data.subsidiaria || 1 });
            newRecord.setValue({ fieldId: "memo", value: data.memo });
            newRecord.setValue({ fieldId: "approvalstatus", value: 2 });
            newRecord.setValue({ fieldId: "custbody_2win_tran_origin", value: data.transaccionOrigen });
            newRecord.setValue({ fieldId: "custbody_2winfolioacepta", value: data.folioBoleta });
            newRecord.setValue({ fieldId: "custbody_tipo_de_diario", value: tipoDeDiario });
            newRecord.setValue({ fieldId: "custbody_2win_tran_origin", value: data.transaccionOrigen });
            newRecord.setValue({ fieldId: "custbody_2win_created_from_income_flow", value: true });
            // Campos adicionales del CSV para journals (Journal = Y)
            if (data.cuentaPaciente) newRecord.setValue({ fieldId: "custbody_2win_nro_cuenta_paciente", value: data.cuentaPaciente });
            if (data.fichaPaciente) newRecord.setValue({ fieldId: "custbody_2w_as_ficha_paciente", value: data.fichaPaciente });
            if (data.convenioPaciente) newRecord.setValue({ fieldId: "custbody_2w_convenio_paciente", value: data.convenioPaciente });
            if (data.idPaciente) newRecord.setValue({ fieldId: "custbody_2w_as_id_paciente", value: data.idPaciente });
            if (data.reversoPago) newRecord.setValue({ fieldId: "custbody_2w_as_reverso_pago", value: data.reversoPago });

            // Campos de caja
            if (data.unidadCaja) newRecord.setValue({ fieldId: "custbodyunidadcaja", value: data.unidadCaja });
            if (data.fechaCaja) newRecord.setValue({ fieldId: "custbodyfechacaja", value: new Date(data.fechaCaja) });
            if (data.aperturaCaja) newRecord.setValue({ fieldId: "custbodyaperturacaja", value: data.aperturaCaja });
            if (data.razonSocialCaja) newRecord.setValue({ fieldId: "custbodyrazonsocialcaja", value: data.razonSocialCaja });
            if (data.numeroMovimiento) newRecord.setValue({ fieldId: "custbodynumeromovimiento", value: data.numeroMovimiento });

            // Lineas
            data.lines.forEach((line) => {
                newRecord.selectNewLine({ sublistId: "line" });
                newRecord.setCurrentSublistValue({ sublistId: "line", fieldId: "account", value: line.account });
                newRecord.setCurrentSublistValue({ sublistId: "line", fieldId: "memo", value: line.memo });

                newRecord.setCurrentSublistValue({ sublistId: "line", fieldId: "debit", value: line.debit });

                newRecord.setCurrentSublistValue({ sublistId: "line", fieldId: "credit", value: line.credit });

                if (line.entity) {
                    newRecord.setCurrentSublistValue({ sublistId: "line", fieldId: "entity", value: line.entity });
                }
                if (line.folio) {
                    newRecord.setCurrentSublistValue({ sublistId: "line", fieldId: "custcol_2w_folio", value: line.folio });
                }
                newRecord.commitLine({ sublistId: "line" });
            });

            const newId = newRecord.save({ enableSourcing: true, ignoreMandatoryFields: true });
            nLog.audit("JournalEntryDAO", `JE creado: ${newId} - Tipo: ${tipoDeDiario}`);
            return newId;
        } catch (e) {
            nLog.error("JournalEntryDAO Error", e);
            throw e;
        }
    }

    /**
     * Crea una Journal Entry Intercompañía
     * @param {Object} data - Datos de la JE intercompañía
     * @returns {number} - ID de la JE creada
     */
    function createIntercompanyJournalEntry(data) {
        try {
            nLog.debug("createIntercompanyJournalEntry", data);
            const newRecord = record.create({
                type: "advintercompanyjournalentry",
                isDynamic: false
            });

            // -------- CABECERA --------
            newRecord.setValue({ fieldId: "trandate", value: new Date(data.fechaTransaccion) });
            newRecord.setValue({ fieldId: "subsidiary", value: data.subsidiaria });
            newRecord.setValue({ fieldId: "memo", value: data.memo });
            newRecord.setValue({ fieldId: "approvalstatus", value: 2 });
            const tipoDeDiario = data.tipoDeDiario || null;
            newRecord.setValue({ fieldId: "custbody_tipo_de_diario", value: tipoDeDiario });
            newRecord.setValue({ fieldId: "custbody_2win_created_from_income_flow", value: true });
            // ------ CAMPOS CUSTOM ------
            if (data.tipoDeDiario) newRecord.setValue({ fieldId: "custbody_tipo_de_diario", value: data.tipoDeDiario });
            if (data.transaccionOrigen) newRecord.setValue({ fieldId: "custbody_2win_tran_origin", value: data.transaccionOrigen });
            if (data.folioBoleta) newRecord.setValue({ fieldId: "custbody_2winfolioacepta", value: data.folioBoleta });

            if (data.cuentaPaciente) newRecord.setValue({ fieldId: "custbody_2win_nro_cuenta_paciente", value: data.cuentaPaciente });
            if (data.fichaPaciente) newRecord.setValue({ fieldId: "custbody_2w_as_ficha_paciente", value: data.fichaPaciente });
            if (data.convenioPaciente) newRecord.setValue({ fieldId: "custbody_2w_convenio_paciente", value: data.convenioPaciente });
            if (data.idPaciente) newRecord.setValue({ fieldId: "custbody_2w_as_id_paciente", value: data.idPaciente });
            if (data.reversoPago) newRecord.setValue({ fieldId: "custbody_2w_as_reverso_pago", value: data.reversoPago });

            // Campos de caja
            if (data.unidadCaja) newRecord.setValue({ fieldId: "custbodyunidadcaja", value: data.unidadCaja });
            if (data.fechaCaja) newRecord.setValue({ fieldId: "custbodyfechacaja", value: new Date(data.fechaCaja) });
            if (data.aperturaCaja) newRecord.setValue({ fieldId: "custbodyaperturacaja", value: data.aperturaCaja });
            if (data.razonSocialCaja) newRecord.setValue({ fieldId: "custbodyrazonsocialcaja", value: data.razonSocialCaja });
            if (data.numeroMovimiento) newRecord.setValue({ fieldId: "custbodynumeromovimiento", value: data.numeroMovimiento });

            let lineIndex = 0;

            // -------- LÍNEAS SUBSIDIARIA ORIGEN --------
            if (data.linesOrigen) {
                data.linesOrigen.forEach(function (line) {
                    newRecord.setSublistValue({ sublistId: "line", fieldId: "account", line: lineIndex, value: line.account });
                    newRecord.setSublistValue({ sublistId: "line", fieldId: "memo", line: lineIndex, value: line.memo });
                    newRecord.setSublistValue({ sublistId: "line", fieldId: "linesubsidiary", line: lineIndex, value: line.subsidiaria });

                    if (line.debit > 0) {
                        newRecord.setSublistValue({ sublistId: "line", fieldId: "debit", line: lineIndex, value: line.debit });
                    } else {
                        newRecord.setSublistValue({ sublistId: "line", fieldId: "credit", line: lineIndex, value: line.credit });
                    }

                    if (line.entity) {
                        newRecord.setSublistValue({ sublistId: "line", fieldId: "entity", line: lineIndex, value: line.entity });
                    }
                    if (line.folio) {
                        newRecord.setSublistValue({ sublistId: "line", line: lineIndex, fieldId: "custcol_2w_folio", value: line.folio });
                    }

                    lineIndex++;
                });
            }

            // -------- LÍNEAS SUBSIDIARIA DESTINO --------
            if (data.linesDestino) {
                data.linesDestino.forEach(function (line) {
                    newRecord.setSublistValue({ sublistId: "line", fieldId: "account", line: lineIndex, value: line.account });
                    newRecord.setSublistValue({ sublistId: "line", fieldId: "memo", line: lineIndex, value: line.memo });
                    newRecord.setSublistValue({ sublistId: "line", fieldId: "linesubsidiary", line: lineIndex, value: line.subsidiaria });

                    if (line.debit > 0) {
                        newRecord.setSublistValue({ sublistId: "line", fieldId: "debit", line: lineIndex, value: line.debit });
                    } else {
                        newRecord.setSublistValue({ sublistId: "line", fieldId: "credit", line: lineIndex, value: line.credit });
                    }

                    if (line.entity) {
                        newRecord.setSublistValue({ sublistId: "line", fieldId: "entity", line: lineIndex, value: line.entity });
                    }
                    if (line.folio) {
                        newRecord.setSublistValue({ sublistId: "line", line: lineIndex, fieldId: "custcol_2w_folio", value: line.folio });
                    }
                    lineIndex++;
                });
            }

            const newId = newRecord.save({
                enableSourcing: true,
                ignoreMandatoryFields: false
            });

            nLog.audit("JournalEntryDAO", `AIJE creado estático: ${newId}`);
            return newId;
        } catch (e) {
            nLog.error("JournalEntryDAO Intercompany Error", e);
            throw e;
        }
    }

    /**
     * Busca Journal Entries por folio a nivel de línea
     * @param {string} folio - Folio a buscar
     * @returns {Array} - Array con los resultados de la búsqueda
     */
    function getJournalEntriesByFolio(data) {
        try {
            const { folios, tipoDocumento } = data;

            // 1. Cláusula de salvaguarda inicial
            if (!folios || !Array.isArray(folios) || folios.length === 0) {
                return [];
            }

            // 2. FILTRADO DE DUPLICADOS EN EL ARREGLO DE FOLIOS
            const uniqueFolios = [...new Set(folios)];

            // 3. Generación de marcadores basada estrictamente en valores únicos
            const placeholders = uniqueFolios.map(() => "?").join(",");

            // 4. Construcción de la Query
            let sql = `
            SELECT DISTINCT
                t.id,
                t.memo as memomain,
                t.tranid,
                t.recordtype,
                tl.expenseaccount,
                tl.memo,
                tl.entity,
                tl.custcol_2w_folio
            FROM
                transaction t
                INNER JOIN transactionline tl ON tl.transaction = t.id
            WHERE
                (t.memo = 'Pago Consolidado' OR t.memo = 'Bonos Bonificación Adicional - (Consolidado)' OR t.memo LIKE 'Forma Pago -%') 
                AND t.custbody_2win_created_from_income_flow = 'T'
                AND t.isreversal = 'F'
                AND t.reversaldate IS NULL
                AND tl.custcol_2w_folio IN (${placeholders})
            ORDER BY
                t.id DESC
        `;

            // 5. Ejecución segura con el arreglo limpio
            const results = query
                .runSuiteQL({
                    query: sql,
                    params: uniqueFolios // Enviamos únicamente los valores únicos
                })
                .asMappedResults(); // Recuerda: las llaves del JSON resultante vendrán siempre en minúsculas.

            return results;
        } catch (e) {
            nLog.error("getJournalEntriesByFolio Error", e);
            throw e;
        }
    }

    // Maximo de folios por consulta. Oracle limita a 1000 los elementos de un IN;
    // se usa 500 para dejar margen y mantener cada consulta bajo el tope de 5000 filas de runSuiteQL.
    const TAMANO_BLOQUE_FOLIOS = 500;
    const MAX_FILAS_RUNSUITEQL = 5000;

    /**
     * Normaliza un folio para usarlo como llave de indice (misma regla que Number(a) === Number(b))
     * @param {string|number} folio
     * Devuelve null si el folio no es numerico (igual que antes: NaN nunca coincidia).
     * @returns {string|null}
     */
    function normalizarFolio(folio) {
        const numero = Number(folio);
        return Number.isNaN(numero) ? null : String(numero);
    }

    /**
     * Busca en bloque los Journal Entries de TODOS los folios recibidos y devuelve un indice por folio.
     * Reemplaza N llamadas a getJournalEntriesByFolio (10 unidades c/u) por ceil(N / 500) llamadas.
     * @param {Object} data
     * @param {Array<string|number>} data.folios - Folios a buscar (se deduplican)
     * @returns {Map<string, Array<Object>>} - Llave: folio normalizado. Valor: filas encontradas para ese folio
     */
    function getJournalEntriesIndexByFolios(data) {
        try {
            const { folios } = data;
            const indice = new Map();

            if (!folios || !Array.isArray(folios) || folios.length === 0) {
                return indice;
            }

            const uniqueFolios = [...new Set(folios.filter((folio) => folio !== undefined && folio !== null && folio !== "").map(String))];

            for (let i = 0; i < uniqueFolios.length; i += TAMANO_BLOQUE_FOLIOS) {
                const bloque = uniqueFolios.slice(i, i + TAMANO_BLOQUE_FOLIOS);
                const placeholders = bloque.map(() => "?").join(",");

                const sql = `
                SELECT DISTINCT
                    t.id,
                    t.memo as memomain,
                    t.tranid,
                    t.recordtype,
                    tl.expenseaccount,
                    tl.memo,
                    tl.entity,
                    tl.custcol_2w_folio
                FROM
                    transaction t
                    INNER JOIN transactionline tl ON tl.transaction = t.id
                WHERE
                    (t.memo = 'Pago Consolidado' OR t.memo = 'Bonos Bonificación Adicional - (Consolidado)' OR t.memo LIKE 'Forma Pago -%')
                    AND t.custbody_2win_created_from_income_flow = 'T'
                    AND t.isreversal = 'F'
                    AND t.reversaldate IS NULL
                    AND tl.custcol_2w_folio IN (${placeholders})
                ORDER BY
                    t.id DESC
            `;

                const results = query.runSuiteQL({ query: sql, params: bloque }).asMappedResults();

                // runSuiteQL devuelve como maximo 5000 filas: si se alcanza el tope, el resultado podria estar incompleto
                if (results.length >= MAX_FILAS_RUNSUITEQL) {
                    throw new Error(`getJournalEntriesIndexByFolios: el bloque de ${bloque.length} folios alcanzo el tope de ${MAX_FILAS_RUNSUITEQL} filas; reducir TAMANO_BLOQUE_FOLIOS`);
                }

                results.forEach((fila) => {
                    const llave = normalizarFolio(fila.custcol_2w_folio);
                    if (llave === null) return;
                    if (!indice.has(llave)) indice.set(llave, []);
                    indice.get(llave).push(fila);
                });
            }

            nLog.audit("getJournalEntriesIndexByFolios", `Folios consultados: ${uniqueFolios.length}, folios con asiento: ${indice.size}`);
            return indice;
        } catch (e) {
            nLog.error("getJournalEntriesIndexByFolios Error", e);
            throw e;
        }
    }

    /**
     * Obtiene desde el indice las filas de los folios indicados (equivale al resultado de getJournalEntriesByFolio)
     * @param {Map<string, Array<Object>>} indice - Resultado de getJournalEntriesIndexByFolios
     * @param {Array<string|number>} folios
     * @returns {Array<Object>}
     */
    function getJournalEntriesFromIndex(indice, folios) {
        const llaves = [...new Set(folios.map(normalizarFolio).filter((llave) => llave !== null))];
        const filas = [];
        llaves.forEach((llave) => {
            (indice.get(llave) || []).forEach((fila) => filas.push(fila));
        });
        return filas;
    }

    return {
        createJournalEntry: createJournalEntry,
        createIntercompanyJournalEntry: createIntercompanyJournalEntry,
        getJournalEntriesByFolio: getJournalEntriesByFolio,
        getJournalEntriesIndexByFolios: getJournalEntriesIndexByFolios,
        getJournalEntriesFromIndex: getJournalEntriesFromIndex
    };
});
