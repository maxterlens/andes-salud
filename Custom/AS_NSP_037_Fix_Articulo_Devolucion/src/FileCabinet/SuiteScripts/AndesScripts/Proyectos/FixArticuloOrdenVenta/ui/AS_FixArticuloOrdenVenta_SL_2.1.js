/**
 * @NApiVersion 2.1
 * @NScriptType Suitelet
 * @NModuleScope SameAccount
 *
 * @description AS_NSP_037 - Ajuste de Artículos en Órdenes de Venta (FixArticuloOrdenVenta).
 *              Carga un CSV con la cantidad final por línea de OV, valida contra NetSuite y, al
 *              procesar, ajusta las OV y sus Ejecuciones con un Map/Reduce.
 *              Pantallas: Carga, Validación, Historial y Detalle. Lógica en ./handlers y ../services.
 */
define(["./handlers/FixArticuloOrdenVentaHandler", "N/log"], (Handler, nLog) => {
    const onRequest = (context) => {
        try {
            Handler.handleRequest(context);
        } catch (e) {
            nLog.error({ title: "AS_NSP_037 - AS_FixArticuloOrdenVenta_SL | onRequest", details: e });
            context.response.write(
                `Error en Ajuste de Artículos en OV: ${String((e && e.message) || e)
                    .replace(/&/g, "&amp;")
                    .replace(/</g, "&lt;")}`
            );
        }
    };

    return { onRequest };
});
