/**
 * @NApiVersion 2.1
 * @NScriptType customglplugin
 * @NModuleScope Public
 */

define(["N/search", "N/runtime", "N/currency", "../dao/MappingDAO", "../constants/2win_constants", "N/log"], (search, runtime, currency, MappingDAO, { getFlow }, nLog) => {

    const customizeGlImpact = (context) => {

        let { transactionRecord, standardLines, customLines, book } = context;

        let features = {
            isMultibook: runtime.isFeatureInEffect({ feature: "MULTIBOOK" }),
            isOneWorld: runtime.isFeatureInEffect({ feature: "SUBSIDIARIES" })
        }

        let data = getData(transactionRecord, features);
        let exchangeRate = getExchangeRateByBook(transactionRecord, book, features);

        // Agregar líneas adicionales para IVA de bonos si aplica
        let ivaLines = getIvaLines(transactionRecord, features);

        // Combinar datos existentes con líneas de IVA
        data = data.concat(ivaLines);

        for (let i = 0; i < data.length; i++) {
            const { amount, debit, credit, department, class_, location, memo, entity } = data[i];

            if (amount === 0) continue;

            let debitLine = customLines.addNewLine();
            debitLine.accountId = debit;
            debitLine.debitAmount = amount * exchangeRate;
            debitLine.memo = memo;
            if (department) debitLine.departmentId = department;
            if (class_) debitLine.classId = class_;
            if (location) debitLine.locationId = location;
            debitLine.entityId = entity;
            debitLine.isBookSpecific = true;

            let creditLine = customLines.addNewLine();
            creditLine.accountId = credit;
            creditLine.creditAmount = amount * exchangeRate;
            creditLine.memo = memo;
            if (department) creditLine.departmentId = department;
            if (class_) creditLine.classId = class_;
            if (location) creditLine.locationId = location;
            creditLine.entityId = entity;
            creditLine.isBookSpecific = true;
        }
    }

    /**
     * Obtiene las líneas GL adicionales para IVA de bonos
     * @param {Record} transactionRecord - Registro de la transacción
     * @param {Object} features - Características habilitadas
     * @returns {Array} Array de objetos con datos para líneas GL de IVA
     */
    function getIvaLines(transactionRecord, features) {
        let result = [];

        try {
            // Verificar que la transacción sea de tipo invoice o creditmemo
            let recordType = transactionRecord.type;
            if (recordType !== "invoice" && recordType !== "creditmemo") {
                nLog.debug("getIvaLines", `Transacción no es invoice ni creditmemo: ${recordType}`);
                return result;
            }

            // Verificar que tenga el campo custbody_2wintipodtesii
            let tipoDtesii = transactionRecord.getValue({ fieldId: "custbody_2wintipodtesii" });
            if (!tipoDtesii) {
                nLog.debug("getIvaLines", "Transacción no tiene custbody_2wintipodtesii");
                return result;
            }
            if (![1, 2, 4, 5, 11, 13].includes(Number(tipoDtesii))) {
                nLog.debug("getIvaLines", "Transacción no es del tipo dte valido");
                return result;
            }

            // Verificar que la transacción tenga IVA
            let totalIva = transactionRecord.getValue({ fieldId: "taxtotal" }) || 0;
            if (totalIva <= 0) {
                nLog.debug("getIvaLines", `Transacción no tiene IVA: ${totalIva}`);
                return result;
            }

            // Obtener el articuloBoleta de BonosEmitidos
            const bonoEmitidoMapping = MappingDAO.getItemMapping({
                categoria: getFlow("BonosEmitidos")
            });

            const bonoIvaMapping = MappingDAO.getItemMapping({
                categoria: getFlow("BonoIva")
            });

            if (!bonoEmitidoMapping.articuloBoleta || !bonoEmitidoMapping.cuentaContableDebito || !bonoIvaMapping.cuentaContableCredito) {
                nLog.error("getIvaLines", "No se encontraron mapeos necesarios para IVA de bonos");
                return result;
            }

            // Recorrer líneas para buscar items de bono con IVA
            let lineCount = transactionRecord.getLineCount({ sublistId: "item" });
            nLog.debug("lineCount", lineCount)
            for (let i = 0; i < lineCount; i++) {
                let item = transactionRecord.getSublistValue({
                    sublistId: "item",
                    fieldId: "item",
                    line: i
                });

                // Verificar si el item es de tipo bono
                if (item !== bonoEmitidoMapping.articuloBoleta) {
                    continue;
                }

                // Obtener el monto de IVA de esta línea
                let tax1amt = transactionRecord.getSublistValue({
                    sublistId: "item",
                    fieldId: "tax1amt",
                    line: i
                }) || 0;

                // Si no tiene IVA, continuar
                if (tax1amt <= 0) {
                    continue;
                }

                // Obtener dimensiones de la línea
                let department = transactionRecord.getSublistValue({
                    sublistId: "item",
                    fieldId: "department",
                    line: i
                }) || null;

                let class_ = transactionRecord.getSublistValue({
                    sublistId: "item",
                    fieldId: "class",
                    line: i
                }) || null;

                let location = transactionRecord.getSublistValue({
                    sublistId: "item",
                    fieldId: "location",
                    line: i
                }) || null;

                let entity = transactionRecord.getSublistValue({
                    sublistId: "item",
                    fieldId: "entity",
                    line: i
                }) || null;

                // let memo = transactionRecord.getSublistValue({
                //     sublistId: "item",
                //     fieldId: "description",
                //     line: i
                // }) || "IVA Bono";

                // Crear par de líneas: Débito BoletasEmitidas / Crédito BonoIva
                result.push({
                    amount: Math.abs(tax1amt),
                    debit: recordType === "invoice" ? bonoIvaMapping.cuentaContableCredito : bonoEmitidoMapping.cuentaContableDebito,
                    credit: recordType === "invoice" ? bonoEmitidoMapping.cuentaContableDebito : bonoIvaMapping.cuentaContableCredito,
                    department: department,
                    class_: class_,
                    location: location,
                    memo: `Bono - IVA`,
                    entity: entity
                });

                nLog.audit("getIvaLines", `Agregadas líneas IVA para item ${item} - Monto: ${tax1amt}`);
            }

        } catch (e) {
            nLog.error("getIvaLines Error", e);
        }

        return result;
    }

    /**
     * Obtiene los datos necesarios para generar las líneas GL personalizadas
     * @param {Record} transactionRecord - Registro de la transacción
     * @param {Object} features - Características habilitadas
     * @returns {Array} Array de objetos con datos para líneas GL
     */
    function getData(transactionRecord, features) {
        let result = [];
        let lineCount = transactionRecord.getLineCount({ sublistId: "line" });

        for (let i = 0; i < lineCount; i++) {
            let amount = transactionRecord.getSublistValue({
                sublistId: "line",
                fieldId: "amount",
                line: i
            });

            let account = transactionRecord.getSublistValue({
                sublistId: "line",
                fieldId: "account",
                line: i
            });

            // Si no hay cuenta o monto, continuar
            if (!account || !amount) continue;

            // Determinar si es débito o crédito basado en el signo
            let isDebit = amount > 0;
            let absAmount = Math.abs(amount);

            // Obtener dimensiones (departamento, clase, ubicación, entidad)
            let department = transactionRecord.getSublistValue({
                sublistId: "line",
                fieldId: "department",
                line: i
            }) || null;

            let class_ = transactionRecord.getSublistValue({
                sublistId: "line",
                fieldId: "class",
                line: i
            }) || null;

            let location = transactionRecord.getSublistValue({
                sublistId: "line",
                fieldId: "location",
                line: i
            }) || null;

            let entity = transactionRecord.getSublistValue({
                sublistId: "line",
                fieldId: "entity",
                line: i
            }) || null;

            let memo = transactionRecord.getSublistValue({
                sublistId: "line",
                fieldId: "memo",
                line: i
            }) || "";

            // Para cada línea, crear un par débito/crédito
            // En asientos contables, cada línea afecta dos cuentas
            // Aquí asumimos que la cuenta de la línea es la principal
            // y necesitamos la cuenta contrapartida. En un caso real,
            // esto dependería de la lógica de negocio específica.

            // Por simplicidad, usaremos la misma cuenta para ambos
            // En un caso real, deberías obtener la cuenta de contrapartida
            // de algún campo específico o de una regla de negocio.

            result.push({
                amount: absAmount,
                debit: isDebit ? account : getContraAccount(transactionRecord, i),
                credit: isDebit ? getContraAccount(transactionRecord, i) : account,
                department: department,
                class_: class_,
                location: location,
                memo: memo,
                entity: entity
            });
        }

        return result;
    }

    /**
     * Obtiene la cuenta de contrapartida para una línea
     * Nota: Esta es una implementación de ejemplo. Deberías reemplazarla
     * con tu lógica de negocio específica.
     */
    function getContraAccount(transactionRecord, lineIndex) {
        // En un caso real, podrías:
        // 1. Tener un campo personalizado en la línea que especifique la cuenta de contrapartida
        // 2. Usar una regla basada en el tipo de cuenta
        // 3. Buscar en un mapeo predefinido

        // Por ahora, devolvemos una cuenta hardcodeada como ejemplo
        // En producción, esto debe ser dinámico
        return 123; // ID de cuenta de contrapartida por defecto
    }

    /**
     * Obtiene la tasa de cambio para el libro especificado
     * @param {Record} transactionRecord - Registro de la transacción
     * @param {Object} book - Objeto libro
     * @param {Object} features - Características habilitadas
     * @returns {Number} Tasa de cambio
     */
    function getExchangeRateByBook(transactionRecord, book, features) {
        // Si no hay multilibro o el libro es el principal, usar tasa de transacción
        if (!features.isMultibook || book.isPrimary) {
            return transactionRecord.getValue({ fieldId: "exchangerate" }) || 1;
        }

        // Para libros secundarios, obtener la tasa específica del libro
        // NetSuite almacena tasas por libro en campos específicos
        // Ejemplo: 'exchangerate1', 'exchangerate2', etc. dependiendo del libro
        // Esto es un ejemplo - verifica la documentación de NetSuite para campos exactos

        let bookSpecificRateField = `exchangerate${book.bookId}`; // Asume que book.bookId existe
        let rate = transactionRecord.getValue({ fieldId: bookSpecificRateField });

        return rate || 1;
    }

    return {
        customizeGlImpact
    }
})
