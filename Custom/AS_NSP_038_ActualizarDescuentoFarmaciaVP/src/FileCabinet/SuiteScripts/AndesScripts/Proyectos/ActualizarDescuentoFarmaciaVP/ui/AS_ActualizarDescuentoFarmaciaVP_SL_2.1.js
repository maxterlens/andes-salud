/**
 * @NApiVersion 2.1
 * @NScriptType Suitelet
 * @NModuleScope SameAccount
 *
 * @description AS_NSP_038 - Actualizar Descuento Farmacia Venta Público (ActualizarDescuentoFarmaciaVP).
 *              Busca las facturas de venta abiertas de Farmacia Venta Público cuyo descuento (artículo de
 *              servicio debajo del artículo) no tiene la cantidad del artículo, valida que el ajuste cuadre
 *              con el importe restante y, al procesar, corrige las facturas con un Map/Reduce.
 *              Pantallas: Parámetros, Validación, Historial y Detalle. Lógica en ./handlers y ../services.
 */
define(["./handlers/ActualizarDescuentoFarmaciaVPHandler", "N/log"], (Handler, nLog) => {
    const onRequest = (context) => {
        try {
            Handler.handleRequest(context);
        } catch (e) {
            nLog.error({ title: "AS_NSP_038 - AS_ActualizarDescuentoFarmaciaVP_SL | onRequest", details: e });
            context.response.write(
                `Error en Actualizar Descuento Farmacia VP: ${String((e && e.message) || e)
                    .replace(/&/g, "&amp;")
                    .replace(/</g, "&lt;")}`
            );
        }
    };

    return { onRequest };
});
