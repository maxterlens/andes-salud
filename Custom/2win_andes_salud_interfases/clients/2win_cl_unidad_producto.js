/**
 *@NApiVersion 2.1
 *@NScriptType ClientScript
 */
define(["N/query"], function (query) {
    /**
     * Validación que se ejecuta cuando el usuario intenta agregar o confirmar una línea en una sublista.
     * @param {Object} context
     * @returns {boolean} - True para permitir agregar la línea, False para bloquearla.
     */
    function validateLine(context) {
        try {
            let currentRecord = context.currentRecord;

            // Nos aseguramos de que estamos validando la sublista correcta
            if (context.sublistId === "uom") {
                // 1. Capturar los valores de la línea que el usuario está editando/intentando agregar
                let newAbbr = currentRecord.getCurrentSublistValue({
                    sublistId: "uom",
                    fieldId: "abbreviation"
                });

                let newName = currentRecord.getCurrentSublistValue({
                    sublistId: "uom",
                    fieldId: "unitname"
                });

                // 2. Obtener el índice de la línea actual (para no compararla consigo misma al editar)
                let currentIndex = currentRecord.getCurrentSublistIndex({
                    sublistId: "uom"
                });

                // 3. Obtener el total de líneas confirmadas actualmente en la sublista
                let lineCount = currentRecord.getLineCount({ sublistId: "uom" });

                // 4. Recorrer la sublista en pantalla buscando duplicados
                for (let i = 0; i < lineCount; i++) {
                    // Saltamos la línea actual si el usuario solo la está editando
                    if (i === currentIndex) continue;

                    let existingAbbr = currentRecord.getSublistValue({
                        sublistId: "uom",
                        fieldId: "abbreviation",
                        line: i
                    });

                    let existingName = currentRecord.getSublistValue({
                        sublistId: "uom",
                        fieldId: "unitname",
                        line: i
                    });

                    // Validación de Abreviatura (insensible a mayúsculas/minúsculas)
                    if (newAbbr && existingAbbr && newAbbr.toLowerCase() === existingAbbr.toLowerCase()) {
                        alert(`La abreviatura '${newAbbr}' ya está en uso en la línea ${i + 1} de esta pantalla.`);
                        return false; // Bloquea la inserción de la línea
                    }

                    // Validación de Nombre (insensible a mayúsculas/minúsculas)
                    if (newName && existingName && newName.toLowerCase() === existingName.toLowerCase()) {
                        alert(`El nombre '${newName}' ya está en uso en la línea ${i + 1} de esta pantalla.`);
                        return false; // Bloquea la inserción de la línea
                    }
                }
            }

            return true; // Si pasa todas las validaciones, permite insertar la línea
        } catch (err) {
            console.error("ClientScript validateLine Error:", err);
            // En caso de un error inesperado de código, permitimos avanzar.
            // El User Event atrapará cualquier duplicado en el backend de todos modos.
            return true;
        }
    }

    function saveRecord(context) {
        try {
            let currentRecord = context.currentRecord;
            let currentRecordId = currentRecord.id || "";
            let lineCount = currentRecord.getLineCount({ sublistId: "uom" });

            let seenAbbreviationsLocal = new Set();
            let abbreviationsForGlobalCheck = [];

            // 1. RECORREMOS LA PANTALLA
            for (let i = 0; i < lineCount; i++) {
                let abbr = currentRecord.getSublistValue({
                    sublistId: "uom",
                    fieldId: "abbreviation",
                    line: i
                });

                if (abbr) {
                    let normalizedAbbr = abbr.toLowerCase().trim();

                    // Validación LOCAL: ¿Lo repitió en esta misma pantalla?
                    if (seenAbbreviationsLocal.has(normalizedAbbr)) {
                        alert(`No se puede guardar. La abreviatura '${abbr}' está repetida en esta misma pantalla (Línea ${i + 1}).`);
                        return false;
                    }
                    seenAbbreviationsLocal.add(normalizedAbbr);
                    abbreviationsForGlobalCheck.push(normalizedAbbr);
                }
            }

            // 2. VALIDACIÓN GLOBAL (SuiteQL desde el navegador)
            if (abbreviationsForGlobalCheck.length > 0) {
                // Armamos los parámetros dinámicos (?, ?, ?)
                let placeholders = abbreviationsForGlobalCheck.map(() => "?").join(", ");
                let sqlParams = [...abbreviationsForGlobalCheck];

                let sql = `
                    SELECT abbreviation 
                    FROM unitstypeuom 
                    WHERE LOWER(abbreviation) IN (${placeholders})
                `;

                // Si estamos editando un registro, excluimos las unidades de ESTE registro
                // para que no detecte sus propias unidades como duplicados.
                if (currentRecordId) {
                    sql += ` AND unitstype != ?`;
                    sqlParams.push(currentRecordId);
                }

                // Ejecutamos la consulta síncrona
                let resultSet = query.runSuiteQL({
                    query: sql,
                    params: sqlParams
                });

                // Si la consulta arroja resultados, significa que ya existen a nivel global
                if (resultSet.results.length > 0) {
                    let duplicadosGlobales = resultSet.results.map((r) => r.values.abbreviation);
                    alert(`ERROR GLOBAL:\nLas siguientes abreviaturas ya están registradas en el sistema por otro registro de Unidades: ${duplicadosGlobales.join(", ")}.\nPor favor, cámbielas.`);
                    return false; // Bloqueamos el guardado
                }
            }

            return false; // Todo está perfecto, permitimos guardar
        } catch (err) {
            console.error("ClientScript saveRecord Error:", err);
            return false; // Si hay error de código, el UserEvent lo atrapará en el backend.
        }
    }

    return {
        saveRecord: saveRecord,
        validateLine: validateLine
    };
});
