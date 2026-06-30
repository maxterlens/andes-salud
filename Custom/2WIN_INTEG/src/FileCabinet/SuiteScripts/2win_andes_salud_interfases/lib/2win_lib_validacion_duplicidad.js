/**
 * @NApiVersion 2.1
 */
define(["N/search", "N/query"], function (search, query) {
    /**
     * Normaliza un valor para la comparación.
     * Si es una cadena, la convierte a minúsculas y elimina espacios en blanco.
     * Si no es una cadena, la devuelve sin cambios.
     * @param {string|number|null|undefined} value - El valor a normalizar.
     * @returns {string|number|null|undefined} - El valor normalizado.
     */
    function normalizeValue(value) {
        if (typeof value === "string" || value instanceof String) {
            return value.toLowerCase().trim();
        }
        return value;
    }

    /**
     * Valida si ya existe un registro con un valor específico en un campo determinado usando N/search.
     * La función busca registros activos que coincidan con los criterios proporcionados.
     * Para valores de tipo texto, la comparación es insensible a mayúsculas/minúsculas y espacios.
     *
     * @param {Object} options - Parámetros para la validación.
     * @param {string} options.recordType - El tipo de registro a buscar.
     * @param {string} options.fieldId - El ID del campo en el que se buscará el valor.
     * @param {string|number} options.value - El valor a buscar en el campo especificado.
     * @param {number} [options.internalId] - (Opcional) El internal ID del registro actual, para excluirlo de la búsqueda.
     * @returns {boolean} - Devuelve true si se encuentra un duplicado, de lo contrario false.
     */
    function validarDuplicado(options) {
        if (!options.recordType || !options.fieldId || options.value === undefined || options.value === null || options.value === "") {
            throw new Error("Los parámetros recordType, fieldId y value son obligatorios.");
        }

        const normalizedValue = normalizeValue(options.value);
        let fieldFilter;

        // Si el valor es una cadena, usamos una fórmula para una búsqueda insensible a mayúsculas/minúsculas.
        if (typeof normalizedValue === "string") {
            fieldFilter = [`formulatext: LOWER({${options.fieldId}})`, search.Operator.IS, normalizedValue];
        } else {
            // Para otros tipos de datos (números, etc.), usamos una comparación directa.
            fieldFilter = [options.fieldId, search.Operator.IS, normalizedValue];
        }

        const filters = [fieldFilter, "AND", ["isinactive", search.Operator.IS, "F"]];

        if (options.internalId) {
            filters.push("AND");
            filters.push(["internalid", search.Operator.NONEOF, options.internalId]);
        }

        const busqueda = search.create({
            type: options.recordType,
            filters: filters,
            columns: ["internalid"]
        });

        const firstResult = busqueda.run().getRange({ start: 0, end: 1 });

        return firstResult.length > 0;
    }

    /**
     * Valida si ya existe un registro con un valor específico en un campo determinado usando SuiteQL.
     * La función busca registros activos que coincidan con los criterios proporcionados.
     * Para valores de tipo texto, la comparación es insensible a mayúsculas/minúsculas y espacios.
     *
     * @param {Object} options - Parámetros para la validación.
     * @param {string} options.recordType - El tipo de registro a buscar.
     * @param {string} options.fieldId - El ID del campo en el que se buscará el valor.
     * @param {string|number} options.value - El valor a buscar en el campo especificado.
     * @param {number} [options.internalId] - (Opcional) El internal ID del registro actual, para excluirlo de la búsqueda.
     * @returns {boolean} - Devuelve true si se encuentra un duplicado, de lo contrario false.
     */
    function validarDuplicadoSuiteQL(options) {
        if (!options.recordType || !options.fieldId || options.value === undefined || options.value === null || options.value === "") {
            throw new Error("Los parámetros recordType, fieldId y value son obligatorios.");
        }
        const normalizedValue = normalizeValue(options.value);
        const params = [normalizedValue];

        // Construimos la cláusula WHERE dinámicamente para usar LOWER() solo con strings.
        const whereClause = typeof normalizedValue === "string" ? `LOWER(${options.fieldId}) = ?` : `${options.fieldId} = ?`;

        let sql = `
            SELECT ${options.fieldId}
            FROM ${options.recordType}
            WHERE ${whereClause}
            -- AND isinactive = 'F'
        `;

        if (options.internalId) {
            sql += " AND id != ?";
            params.push(options.internalId);
        }
        if (options.customFilter) {
            sql += ` AND ${options.customFilter}`;
        }
        // sql += " LIMIT 1";
        const resultSet = query.runSuiteQL({
            query: sql,
            params: params
        });

        return resultSet.results.length > 0;
    }
    /**
     * Valida la existencia de múltiples valores en la base de datos mediante una sola consulta SuiteQL.
     * * @param {Object} options
     * @param {String} options.recordType - ID del tipo de registro (ej. 'unitstypeuom')
     * @param {String} options.fieldId - ID del campo a evaluar (ej. 'abbreviation')
     * @param {Array} options.valuesArray - Arreglo de valores a buscar
     * @param {String} [options.internalId] - ID interno a excluir de la búsqueda
     * @param {String} [options.customFilter] - Filtro SuiteQL adicional
     * @returns {Array} - Arreglo con los valores que resultaron ser duplicados (vacío si no hay duplicados).
     */
    function validarDuplicadoMasivoSuiteQL(options) {
        if (!options.recordType || !options.fieldId || !options.valuesArray || !Array.isArray(options.valuesArray) || options.valuesArray.length === 0) {
            throw new Error("Los parámetros recordType, fieldId y valuesArray son obligatorios.");
        }

        const params = [];
        const isString = typeof options.valuesArray[0] === "string";

        options.valuesArray.forEach(function (val) {
            let normalizedValue = normalizeValue(val);
            if (isString) {
                normalizedValue = normalizedValue.toLowerCase();
            }
            params.push(normalizedValue);
        });

        const placeholders = params
            .map(function () {
                return "?";
            })
            .join(", ");
        const whereClause = isString ? `LOWER(${options.fieldId}) IN (${placeholders})` : `${options.fieldId} IN (${placeholders})`;

        // Agregamos 'unitstype' a la consulta para saber a qué registro pertenece la línea
        let sql = `
            SELECT ${options.fieldId} AS valor_duplicado, unitstype AS parent_id
            FROM ${options.recordType}
            WHERE ${whereClause}
        `;

        if (options.internalId) {
            sql += " AND unitstype != ?";
            params.push(options.internalId);
        }

        if (options.customFilter) {
            sql += ` AND ${options.customFilter}`;
        }

        const resultSet = query
            .runSuiteQL({
                query: sql,
                params: params
            })
            .asMappedResults();

        const duplicados = [];
        resultSet.forEach((result) => {
            // Ahora devolvemos un objeto con el valor y el ID del registro
            duplicados.push({
                valor: result.valor_duplicado,
                parentId: result.parent_id
            });
        });

        return duplicados;
    }
    return {
        validarDuplicado: validarDuplicado,
        validarDuplicadoSuiteQL: validarDuplicadoSuiteQL,
        validarDuplicadoMasivoSuiteQL: validarDuplicadoMasivoSuiteQL
    };
});
