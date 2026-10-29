/**
 *@NApiVersion 2.x
 *@NScriptType WorkflowActionScript
 */
define(['./domain/2win_dom_generar_reembolso'],

    function(reembolso) {

        function onAction(scriptContext) {

            try {

                var newRecord = scriptContext.newRecord;
                var id_orden_venta = newRecord.id;
                log.debug("onAction", "Id Informe Gasto: " + id_orden_venta);

                reembolso.procesar(newRecord);            

            } catch (error) {
                log.error("onAction", error);
            }
        }

        return {
            onAction: onAction
        }
    }
);
