/**
 *@NApiVersion 2.1
 *@NScriptType UserEventScript
 */
define(["N/log", "N/runtime", "../domain/2win_dom_evento", "../lib/2win_lib_cliente"], function (nLog, runtime, { EventService, ExternalEventServiceAdapter, NivelEvento }, libCliente) {
    function beforeLoad(context) {}

    function beforeSubmit(context) {}

    function afterSubmit(context) {
        let newRecord = context.newRecord;

        if (context.type === context.UserEventType.CREATE) {
            const typeOperation = newRecord.getValue("custrecord_2win_as_cl_tipo_mensaje");
            const hl7Message = newRecord.getValue("custrecord_2win_as_cl_mensaje_hl7");

            if (typeOperation === "merge") {
                const client = libCliente.fusionarRegistroNetsuite({ messageRaw: hl7Message });

                const eventService = new EventService({
                    externalAdapter: new ExternalEventServiceAdapter({ url: "https://2win.mooo.com/receive", token: "" })
                });
                const eventData = {
                    customerId: client.id,
                    action: context.type,
                    user: runtime.getCurrentUser().id
                };
                const serviceResponse = eventService.registerEvent({
                    tipo: "CUSTOMER_MERGED",
                    fuente: runtime.getCurrentScript().id,
                    datos: eventData,
                    nivel: NivelEvento.INFO,
                    relatedRecordType: newRecord.type,
                    relatedRecordId: client.id
                });
                nLog.audit("MainTriggerScript: Evento enviado a servicio externo", { response: serviceResponse });
            }
            if (typeOperation === "edicion") {
                const client = libCliente.editarRegistro({ messageRaw: hl7Message });
                nLog.debug("edit", client);
                const eventService = new EventService({
                    externalAdapter: new ExternalEventServiceAdapter({ url: "https://2win.mooo.com/receive", token: "" })
                });
                const eventData = {
                    customerId: client.id,
                    action: context.type,
                    user: runtime.getCurrentUser().id
                };
                const serviceResponse = eventService.registerEvent({
                    tipo: "CUSTOMER_EDITED",
                    fuente: runtime.getCurrentScript().id,
                    datos: eventData,
                    nivel: NivelEvento.INFO,
                    relatedRecordType: newRecord.type,
                    relatedRecordId: client.id
                });
                nLog.audit("MainTriggerScript: Evento enviado a servicio externo", { response: serviceResponse });
            }
            if (typeOperation === "creacion") {
                const client = libCliente.crearRegistro({ messageRaw: hl7Message });
                const eventService = new EventService({
                    externalAdapter: new ExternalEventServiceAdapter({ url: "https://2win.mooo.com/receive", token: "" })
                });
                const eventData = {
                    customerId: client.id,
                    action: context.type,
                    user: runtime.getCurrentUser().id
                };
                const serviceResponse = eventService.registerEvent({
                    tipo: "CUSTOMER_CREATED",
                    fuente: runtime.getCurrentScript().id,
                    datos: eventData,
                    nivel: NivelEvento.INFO,
                    relatedRecordType: newRecord.type,
                    relatedRecordId: client.id
                });
                nLog.audit("MainTriggerScript: Evento enviado a servicio externo", { response: serviceResponse });
            }
        }
    }

    return {
        // beforeLoad: beforeLoad,
        // beforeSubmit: beforeSubmit,
        afterSubmit: afterSubmit
    };
});
