/**
 * AS_NSP_040 — Recuento de Inventario Manual
 * @description Entry point del Scheduled que procesa la cola AS Recuento
 *              Inventario Manual Cola. No tiene programacion: lo lanzan el
 *              Suitelet al dejar una solicitud y la vista de una solicitud
 *              Pendiente. Un solo deployment: nunca corren dos a la vez.
 *
 * @NApiVersion 2.1
 * @NScriptType ScheduledScript
 * @NModuleScope Public
 * @scriptid     customscript_as_rec_inv_man_ss
 * @deploymentid customdeploy_as_rec_inv_man_ss
 * @author Andes Salud
 * @version 1.1.0
 */
define(['./handler/AS_ColaHandler'],
    (colaHandler) => {

    function execute() {
        try {
            colaHandler.procesarCola();
        } catch (fallo) {
            log.error({ title: 'RECUENTO INVENTARIO MANUAL ERROR', details: 'motivo: ' + (fallo.message || fallo) });
            throw fallo;
        }
    }

    return { execute };
});
