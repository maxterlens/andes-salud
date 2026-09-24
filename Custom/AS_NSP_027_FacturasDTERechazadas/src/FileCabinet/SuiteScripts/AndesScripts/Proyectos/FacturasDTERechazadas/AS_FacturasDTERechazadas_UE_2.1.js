/**
 * AS_NSP_027 — Facturas DTE Rechazadas
 * @description Trigger de la sincronizacion: apenas 2WIN crea o edita una fila en
 *              customrecord_2win_recepcion_dte_rechaza, pasa su id al SyncHandler.
 *              Es un UE hasta que la cuenta reconozca Event Subscriber; el handler
 *              no sabe quien lo llama, asi que cambiar el trigger es cambiar solo
 *              este archivo.
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

        try {
            const resultado = syncHandler.sincronizarFila(recordId);

            log.debug({
                title  : CONSTANTES.LOGS.SYNC,
                details: 'recordId: ' + recordId
                       + ' | rutEmisor: ' + (resultado ? resultado.rutEmisor : '')
                       + ' | vendorId: ' + (resultado ? resultado.idVendor : '')
                       + ' | rutReceptor: ' + (resultado ? resultado.rutReceptor : '')
                       + ' | subsidiaryId: ' + (resultado ? resultado.idSubsidiaria : '')
                       + ' | idDteRechazado: ' + (resultado ? resultado.idDteRechazado : ''),
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
