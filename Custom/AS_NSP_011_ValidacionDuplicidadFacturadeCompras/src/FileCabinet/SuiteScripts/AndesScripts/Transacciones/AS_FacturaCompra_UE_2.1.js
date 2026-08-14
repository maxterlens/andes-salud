/**
 * @NApiVersion 2.1
 * @NScriptType UserEventScript
 */
define(['./handlers/FacturaCompraHandler', 'N/log'], (FacturaCompraHandler, log) => {

    const beforeLoad = (context) => {
        try {
            FacturaCompraHandler.manejarAlertaFacturaPagada(context);
        } catch (e) {
            log.error({ title: 'UE beforeLoad - AS_FacturaCompra', details: e.message });
            throw e;
        }
    };

    return { beforeLoad };
});
