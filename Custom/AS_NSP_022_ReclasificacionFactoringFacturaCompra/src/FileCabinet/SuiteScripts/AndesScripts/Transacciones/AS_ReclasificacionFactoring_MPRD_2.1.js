/**
 * AS_NSP_022 — Reclasificacion de Factura de Compra a Factoring
 * @description Entry point del Map/Reduce que reclasifica la factura. Solo rutea:
 *              el trabajo lo resuelve AS_ReclasificacionFactoringHandler.
 *
 *              Procesa una factura por corrida, la que le pasa el User Event al
 *              encolar. Es Map/Reduce y no Scheduled porque un deployment de
 *              Scheduled atiende de a una tarea: dos usuarios reclasificando a la
 *              vez hacian fallar al segundo con INPROGRESS.
 *
 * @NApiVersion 2.1
 * @NScriptType MapReduceScript
 * @NModuleScope Public
 * @scriptid     customscript_as_mr_reclasif_factoring
 * @deploymentid customdeploy_as_mr_reclasif_factoring
 */
define(['N/runtime', './handlers/AS_ReclasificacionFactoringHandler', './lib/AS_FactoringConstants'],
    (runtime, reclasificacionFactoringHandler, CONSTANTES) => {

    const getInputData = () => {
        const idFactura = runtime.getCurrentScript().getParameter({ name: CONSTANTES.MAPREDUCE.FACTURA });

        return [idFactura];
    };

    const map = (context) => {
        try {
            reclasificacionFactoringHandler.reclasificarAFactoring(context.value);
        } catch (fallo) {
            log.error({
                title  : CONSTANTES.LOGS.ERROR,
                details: 'factura: ' + context.value + ' | operacion: reclasificar'
                       + ' | motivo: ' + (fallo.message || fallo),
            });

            throw fallo;
        }
    };

    return { getInputData, map };
});
