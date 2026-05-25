/**
 *@NApiVersion 2.1
 *@NScriptType UserEventScript
 */
define(["N/ui/serverWidget", "../domain/2win_dom_prefactura"],

    function (serverWidget, dom_prefactura) {

        function beforeLoad(scriptContext) {

            log.audit("beforeLoad - scriptContext", scriptContext);
            if (scriptContext.type === scriptContext.UserEventType.VIEW || scriptContext.type === scriptContext.UserEventType.EDIT) {

                var form = scriptContext.form;
                // Link the Client Script module
                form.clientScriptModulePath = 'SuiteScripts/2win_andes_salud_interfases/clients/2win_cs_andes_salud_detalle_prefactura.js';

                log.audit("beforeLoad - form", form);
                const prefacturaRecord = scriptContext.newRecord;
                log.audit("beforeLoad - prefacturaRecord", prefacturaRecord);
                dom_prefactura.cargarTablaDetalles(prefacturaRecord.id, form);
            }
        }

        return {
            beforeLoad: beforeLoad
        }
    }
);
