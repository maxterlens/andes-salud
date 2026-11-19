/**
 * @NApiVersion 2.1
 * @NModuleScope SameAccount
 *
 * @description AS_NSP_037 - Utilidades SuiteQL compartidas por los repositorios.
 */
define(["N/query", "../constants/FixArticuloOrdenVentaConstants"], (query, CONST) => {
    const { REGLAS } = CONST;

    /** Ejecuta una consulta SuiteQL paginada (evita el tope de 5000 filas de runSuiteQL). */
    const consultarTodo = (sql, params = []) => {
        const filas = [];
        const paginado = query.runSuiteQLPaged({ query: sql, params, pageSize: 1000 });
        for (const rango of paginado.pageRanges) {
            filas.push(...paginado.fetch({ index: rango.index }).data.asMappedResults());
        }
        return filas;
    };

    /** Ejecuta una consulta corta (sin paginar). */
    const consultar = (sql, params = []) => query.runSuiteQL({ query: sql, params }).asMappedResults();

    /** Divide una lista para no superar el máximo de elementos por cláusula IN. */
    const enLotes = (valores, tamano = REGLAS.TAMANO_LOTE_IN) => {
        const lotes = [];
        for (let i = 0; i < valores.length; i += tamano) lotes.push(valores.slice(i, i + tamano));
        return lotes;
    };

    /** Lista de textos para una cláusula IN, con comillas escapadas. */
    const listaTexto = (valores) => valores.map((v) => `'${String(v).replace(/'/g, "''")}'`).join(",");

    /** Números únicos y válidos (> 0). */
    const listaNumeros = (valores) => [...new Set(valores.map(Number).filter((n) => Number.isFinite(n) && n > 0))];

    /** Número seguro desde un valor de SuiteQL. */
    const numero = (v) => {
        const n = parseFloat(v);
        return Number.isFinite(n) ? n : 0;
    };

    return { consultarTodo, consultar, enLotes, listaTexto, listaNumeros, numero };
});
