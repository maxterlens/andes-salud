/**
 * AS_NSP_018 — Prestamo, Devolucion y Merma
 * @description Muestra la consulta de stock, la herramienta de apoyo a
 *              desarrollo y QA: lee las ubicaciones y, si ya se eligio una, los
 *              articulos con stock disponible, y se los pasa al form.
 * @NApiVersion 2.1
 * @NModuleScope Public
 */
define(['../constants/AS_MovimientoInventarioConstants', '../data/query/AS_MovimientoInventarioQuery', '../form/AS_ConsultaStockForm'],
    (CONSTANTES, movimientoQuery, consultaStockForm) => {

    // ─────────────────────────────────────────────────────────────────────────
    // Principales
    // ─────────────────────────────────────────────────────────────────────────

    function mostrarConsulta(context) {
        const parametros = obtenerParametros(context.request);

        const articulos = parametros.ubicacion
                        ? movimientoQuery.obtenerArticulosConStock(parametros.ubicacion, CONSTANTES.CONSULTA_STOCK.TOPE_ARTICULOS)
                        : null;

        context.response.writePage(consultaStockForm.construirConsulta(parametros, movimientoQuery.obtenerUbicacionesPorSubsidiaria(), articulos));
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Secundarias
    // ─────────────────────────────────────────────────────────────────────────

    function obtenerParametros(request) {
        return {
            subsidiaria: request.parameters.subsidiaria || '',
            ubicacion  : request.parameters.ubicacion || '',
        };
    }

    return {
        mostrarConsulta: mostrarConsulta,
    };
});
