/**
 * @NApiVersion 2.1
 * @NScriptType MapReduceScript
 * @NModuleScope SameAccount
 * @scriptid    customscript_as_alerta_oc_pend_recep
 * @author      Andes Salud
 * @version     2.1
 */
define(['./handlers/AlertaOrdenCompraHandler', 'N/log'],
    (AlertaOrdenCompraHandler, log) => {

        const getInputData = () => AlertaOrdenCompraHandler.buscarOrdenesPendientesRecepcion();

        const map = (context) => {
            try {
                AlertaOrdenCompraHandler.procesarOrdenCompra(context);
            } catch (e) {
                log.error({
                    title:   `Error al procesar la OC | id ${context.key}`,
                    details: `${e.name}: ${e.message} | `
                             + `Datos de la OC: ${context.value} | `
                             + `${e.stack}`
                });

                context.write({ key: context.key, value: 'ERROR' });
            }
        };

        const summarize = (context) => {
            AlertaOrdenCompraHandler.resumirEjecucion(context);
        };


        return {
            getInputData,
            map,
            summarize
        };
    }
);
