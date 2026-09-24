/**
 * AS_NSP_025 — Facturas DTE Rechazadas
 * @NApiVersion 2.1
 * @NScriptType UserEventScript
 * @NModuleScope Public
 * @scriptid     customscript_as_ue_dte_rechazo_sync
 * @deploymentid customdeploy_as_ue_dte_rechazo_sync
 */
define(['./lib/AS_FacturasDTERechazadasConstants', './handlers/AS_FacturasDTERechazadasSyncHandler'],
    (CONSTANTES, syncHandler) => {

    function afterSubmit(context) {
        if (context.type !== context.UserEventType.CREATE && context.type !== context.UserEventType.EDIT) {
            return;
        }

        const recordId = context.newRecord.id;

        log.debug({ title: CONSTANTES.LOGS.SYNC_START, details: 'recordId: ' + recordId });

        try {
            const resultado = syncHandler.sincronizarFila(recordId);

            log.debug({
                title  : CONSTANTES.LOGS.SYNC_END,
                details: 'recordId: ' + recordId
                       + ' | rutEmisor: ' + (resultado ? resultado.rutEmisor : '')
                       + ' | vendorId: ' + (resultado ? resultado.idVendor : '')
                       + ' | rutReceptor: ' + (resultado ? resultado.rutReceptor : '')
                       + ' | subsidiaryId: ' + (resultado ? resultado.idSubsidiaria : '')
                       + ' | cacheId: ' + (resultado ? resultado.idCache : ''),
            });
        } catch (fallo) {
            log.error({
                title  : CONSTANTES.LOGS.ERROR,
                details: 'sync UE rechazo id: ' + recordId + ' | motivo: ' + (fallo.message || fallo),
            });
        }
    }

    return { afterSubmit };
});
