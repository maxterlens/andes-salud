/**
 * @NApiVersion 2.1
 */
define(["N/search", "N/log", "N/query"], function (search, nLog, query) {
    /**
     * Busca transacciones del flujo de caja por cuenta paciente
     * Usa una sola consulta SuiteQL para obtener todos los tipos de transacciones
     * @param {Object} options - Opciones de búsqueda
     * @param {string} options.cuentaPaciente - Número de cuenta paciente
     * @returns {Object} - Objeto con transacciones clasificadas
     */
    function getTransaccionesCaja({ cuentaPaciente }) {
        if (!cuentaPaciente) {
            nLog.debug("getTransaccionesCaja", "No hay cuenta paciente proporcionada");
            return { 
                boletas: [], 
                facturas: [],
                cargosAnticipo: [], 
                notasCredito: [], 
                bonos: [], 
                coberturas: [], 
                formasPago: [], 
                cierreCaja: [] 
            };
        }

        const resultados = {
            boletas: [],
            facturas: [],
            cargosAnticipo: [],
            notasCredito: [],
            bonos: [],
            coberturas: [],
            formasPago: [],
            cierreCaja: []
        };

        // Consulta SuiteQL unificada para todos los tipos de transacciones
        const suiteQLQuery = `
            SELECT
                t.id,
                t.tranid,
                t.trandate,
                t.recordtype,
                t.memo,
                t.custbody_2wintipodtesii,
                t.custbodynumeromovimiento,
                t.custbody_2winfolioacepta,
                t.custbody_tipo_de_diario,
                l.subsidiary,
                BUILTIN.DF(l.subsidiary) as subsidiary_name,
                COALESCE(SUM(l.debitForeignAmount), 0) as totaldebito
            FROM transaction t
            JOIN transactionline l ON t.id = l.transaction
            WHERE t.custbody_2win_nro_cuenta_paciente = '${cuentaPaciente}'
                AND t.custbody_2win_created_from_income_flow = 'T'
                AND l.mainline = 'T'
            GROUP BY
                t.id,
                t.tranid,
                t.trandate,
                t.recordtype,
                t.memo,
                t.custbody_2wintipodtesii,
                t.custbodynumeromovimiento,
                t.custbody_2winfolioacepta,
                t.custbody_tipo_de_diario,
                l.subsidiary,
                BUILTIN.DF (l.subsidiary)
            ORDER BY t.custbodynumeromovimiento, t.id
        `;

        const queryResults = query.runSuiteQL({ query: suiteQLQuery }).asMappedResults();

        // Usar Set para evitar duplicados (advintercompanyjournalentry aparece 2 veces)
        const procesados = new Set();

        queryResults.forEach((result) => {
            // Crear clave única para evitar duplicados
            const claveUnica = `${result.id}_${result.subsidiary}`;
            if (procesados.has(claveUnica)) {
                return;
            }
            procesados.add(claveUnica);

            const recordType = result.recordtype;
            const memo = result.memo || "";
            const memoLower = memo.toLowerCase();

            const transactionData = {
                id: result.id,
                folio: result.custbody_2winfolioacepta || result.tranid,
                numero: result.tranid,
                fecha: result.trandate,
                memo: memo,
                monto: result.totaldebito,
                subsidiaria: result.subsidiary,
                subsidiariaNombre: result.subsidiary_name,
                numeroMovimiento: result.custbodynumeromovimiento,
                tipoDTE: result.custbody_2wintipodtesii,
                origen: "CAJA"
            };

            // Clasificar por recordtype y memo
            if (recordType === "invoice") {
                // Invoices = Boletas
                transactionData.estado = result.custbody_2wintipodtesii || "Invoice";
                transactionData.recordType = "invoice";
                resultados.boletas.push(transactionData);
            } 
            else if (recordType === "creditmemo") {
                // Credit Memos = Notas de Crédito
                transactionData.estado = "Credit Memo";
                transactionData.recordType = "creditmemo";
                resultados.notasCredito.push(transactionData);
            } 
            else if (recordType === "journalentry" || recordType === "advintercompanyjournalentry") {
                // Journal Entries - clasificar por memo
                transactionData.estado = result.custbody_tipo_de_diario || "Journal Entry";
                transactionData.recordType = recordType;

                // Orden de prioridad: más específicos primero
                if (memoLower.includes("cierre caja general") || memoLower.includes("cierre de caja")) {
                    resultados.cierreCaja.push(transactionData);
                } 
                else if (memoLower.includes("cargo anticipo") || memoLower.includes("cargos cobrados anticipo")) {
                    resultados.cargosAnticipo.push(transactionData);
                } 
                else if (memoLower.includes("pago consolidado") || memoLower.includes("forma pago")) {
                    resultados.formasPago.push(transactionData);
                } 
                else if (memoLower.includes("cobertura")) {
                    resultados.coberturas.push(transactionData);
                } 
                else if (
                    memoLower.includes("bono") || 
                    memoLower.includes("bonificacion") ||
                    memoLower.includes("bonificación")
                ) {
                    resultados.bonos.push(transactionData);
                }
            }
        });

        nLog.audit(
            "getTransaccionesCaja",
            `Encontradas ${resultados.boletas.length} boletas, ${resultados.cargosAnticipo.length} cargos anticipo, ${resultados.bonos.length} bonos, ${resultados.coberturas.length} coberturas, ${resultados.notasCredito.length} NC, ${resultados.formasPago.length} formas pago, ${resultados.cierreCaja.length} cierre caja`
        );

        return resultados;
    }

    /**
     * Busca transacciones del flujo de facturación por folio
     * @param {Object} options - Opciones de búsqueda
     * @param {number} options.salesOrderId - ID de la Sales Order
     * @returns {Object} - Objeto con transacciones clasificadas
     */
    function getTransaccionesFacturacion({ salesOrderId }) {
        if (!salesOrderId) {
            nLog.debug("getTransaccionesFacturacion", "No hay salesOrderId proporcionado");
            return { facturas: [], notasCredito: [], notasDebito: [], pagos: [], journals: [] };
        }

        const resultados = {
            facturas: [],
            notasCredito: [],
            notasDebito: [],
            pagos: [],
            journals: []
        };

        // Obtener cuenta paciente de la Sales Order usando SuiteQL
        const suiteQLSalesOrder = `
            SELECT
                transaction.custbody_2win_nro_cuenta_paciente as cuentaPaciente,
                transactionline.subsidiary
            FROM transaction
            INNER JOIN transactionline ON transactionline.transaction = transaction.id
                AND transactionline.mainline = 'T'
            WHERE transaction.id = '${salesOrderId}'
                AND transaction.type = 'SalesOrd'
        `;

        const salesOrderResult = query.runSuiteQL({ query: suiteQLSalesOrder }).asMappedResults();

        if (!salesOrderResult || salesOrderResult.length === 0) {
            nLog.debug("getTransaccionesFacturacion", "No se encontró la Sales Order");
            return resultados;
        }

        const cuentaPaciente = salesOrderResult[0].cuentaPaciente;

        if (!cuentaPaciente) {
            nLog.debug("getTransaccionesFacturacion", "La Sales Order no tiene cuenta paciente");
            return resultados;
        }

        // Consulta SuiteQL unificada para transacciones de facturación
        // NOTA: custbody_2win_created_from_income_flow = 'F' o NULL para facturación
        const suiteQLQuery = `
            SELECT
                t.id,
                t.tranid,
                t.trandate,
                t.recordtype,
                t.memo,
                t.custbody_2wintipodtesii,
                t.custbodynumeromovimiento,
                t.custbody_2winfolioacepta,
                t.custbody_tipo_de_diario,
                l.subsidiary,
                BUILTIN.DF(l.subsidiary) as subsidiary_name,
                COALESCE(SUM(l.debitForeignAmount), 0) as totaldebito
            FROM transaction t
            JOIN transactionline l ON t.id = l.transaction
            WHERE t.custbody_2win_nro_cuenta_paciente = '${cuentaPaciente}'
                AND (t.custbody_2win_created_from_income_flow = 'F' 
                     OR t.custbody_2win_created_from_income_flow IS NULL)
                AND l.mainline = 'T'
            GROUP BY
                t.id,
                t.tranid,
                t.trandate,
                t.recordtype,
                t.memo,
                t.custbody_2wintipodtesii,
                t.custbodynumeromovimiento,
                t.custbody_2winfolioacepta,
                t.custbody_tipo_de_diario,
                l.subsidiary
            ORDER BY t.trandate DESC, t.id
        `;

        const queryResults = query.runSuiteQL({ query: suiteQLQuery }).asMappedResults();

        // Usar Set para evitar duplicados
        const procesados = new Set();

        queryResults.forEach((result) => {
            // Crear clave única para evitar duplicados
            const claveUnica = `${result.id}_${result.subsidiary}`;
            if (procesados.has(claveUnica)) {
                return;
            }
            procesados.add(claveUnica);

            const recordType = result.recordtype;
            const memo = result.memo || "";
            const memoLower = memo.toLowerCase();

            const transactionData = {
                id: result.id,
                folio: result.custbody_2winfolioacepta || result.tranid,
                numero: result.tranid,
                fecha: result.trandate,
                memo: memo,
                monto: result.totaldebito,
                subsidiaria: result.subsidiary,
                subsidiariaNombre: result.subsidiary_name,
                numeroMovimiento: result.custbodynumeromovimiento,
                tipoDTE: result.custbody_2wintipodtesii,
                origen: "FACTURACIÓN"
            };

            // Clasificar por recordtype y memo
            if (recordType === "invoice") {
                transactionData.recordType = "invoice";
                
                // Distinguir entre Factura y Nota de Débito por memo
                if (memoLower.includes("nota de débito") || memoLower.includes("nota de debito")) {
                    transactionData.estado = "Nota de Débito";
                    resultados.notasDebito.push(transactionData);
                } else {
                    transactionData.estado = "Factura";
                    resultados.facturas.push(transactionData);
                }
            } 
            else if (recordType === "creditmemo") {
                transactionData.estado = "Nota de Crédito";
                transactionData.recordType = "creditmemo";
                
                // Solo incluir si tiene memo de facturación
                if (
                    memoLower.includes("nota de crédito asociada folio") || 
                    memoLower.includes("nota de credito asociada folio")
                ) {
                    resultados.notasCredito.push(transactionData);
                }
            } 
            else if (recordType === "customerpayment") {
                transactionData.estado = "Pago";
                transactionData.recordType = "customerpayment";
                
                // Solo incluir si viene del flujo de facturación
                if (
                    memoLower.includes("pago factura") ||
                    memoLower.includes("pago nota de crédito") ||
                    memoLower.includes("pago nota de credito") ||
                    memoLower.includes("pago nota de débito") ||
                    memoLower.includes("pago nota de debito") ||
                    memoLower.includes("factura asociada folio") ||
                    memoLower.includes("nota de crédito asociada folio") ||
                    memoLower.includes("nota de débito asociada folio")
                ) {
                    resultados.pagos.push(transactionData);
                }
            } 
            else if (recordType === "journalentry" || recordType === "advintercompanyjournalentry") {
                transactionData.estado = "Journal Entry";
                transactionData.recordType = recordType;

                // Solo incluir si viene del flujo de facturación
                if (
                    memoLower.includes("factura asociada folio") ||
                    memoLower.includes("nota de crédito asociada folio") ||
                    memoLower.includes("nota de credito asociada folio") ||
                    memoLower.includes("nota de débito asociada folio") ||
                    memoLower.includes("nota de debito asociada folio") ||
                    memoLower.includes("copago factura asociada folio") ||
                    memoLower.includes("excedente factura asociada folio")
                ) {
                    resultados.journals.push(transactionData);
                }
            }
        });

        nLog.audit(
            "getTransaccionesFacturacion",
            `Encontradas ${resultados.facturas.length} facturas, ${resultados.notasCredito.length} NC, ${resultados.notasDebito.length} ND, ${resultados.pagos.length} pagos, ${resultados.journals.length} journals`
        );

        return resultados;
    }

    return {
        getTransaccionesCaja: getTransaccionesCaja,
        getTransaccionesFacturacion: getTransaccionesFacturacion
    };
});