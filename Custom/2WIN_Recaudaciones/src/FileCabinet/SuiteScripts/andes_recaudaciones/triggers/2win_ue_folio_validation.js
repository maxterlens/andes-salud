/**
 *@NApiVersion 2.1
 *@NScriptType UserEventScript
 */
define([], function () {
    function beforeLoad(context) {}

    function beforeSubmit(context) {
        if (context.type === context.UserEventType.CREATE || context.type === context.UserEventType.COPY) {
            const newRecord = context.newRecord;
            const oldRecord = context.oldRecord;

            const folioBoleta = newRecord.getValue("custbody_2winfolioacepta");
            const tipoDte = newRecord.getValue("custbody_2wintipodtesii");
            const recordtype = newRecord.getValue("type");
            const subsidiaria = newRecord.getValue("subsidiary");
            
            if (folioBoleta && recordtype && subsidiaria) {
                const externalId = `${recordtype}-${subsidiaria}-${tipoDte}-${folioBoleta}`;
                newRecord.setValue({ fieldId: "externalid", value: externalId });
            }
        }
    }

    function afterSubmit(context) {}

    return {
        beforeLoad: beforeLoad,
        beforeSubmit: beforeSubmit,
        afterSubmit: afterSubmit
    };
});
