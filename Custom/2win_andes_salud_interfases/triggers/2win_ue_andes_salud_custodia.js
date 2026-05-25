/**
 * @NApiVersion 2.1
 * @NScriptType UserEventScript
 * @NModuleScope public
 */
define(["N/record", "N/log", "../dao/2win_dao_replay_config"], function (record, nLog, replayConfigDao) {
    /**
     * Crea un registro de seguimiento (replay) para una transacción de custodia.
     * Se activa al crear o editar un registro de custodia si la respuesta ha cambiado.
     * El límite de reintentos se obtiene por flujo desde 'customrecord_2win_andes_salud_replay_con'.
     * @param {object} context
     */
    function afterSubmit(context) {
        try {
            const newRecord = context.newRecord;
            const oldRecord = context.oldRecord;
            const eventType = context.type;

            const shouldCreateLog = eventType === "create" || eventType === "xedit" || eventType === "edit";

            if (shouldCreateLog) {
                let retryLimit = null;
                const interfaceType = newRecord.getValue("custrecord_2win_as_interface");
                if (!interfaceType) {
                    nLog.error("Lógica de Replay", "El campo 'Tipo de Interfaz' está vacío en la custodia. No se puede determinar el límite de reintentos.");
                    // Obtener el límite de reintentos específico para este flujo.
                    retryLimit = replayConfigDao.getRetryLimitForFlow(interfaceType);
                }

                // const DEFAULT_RETRY_LIMIT = 3;

                // // Usar el límite específico o un valor por defecto si no hay configuración.
                // const finalRetryLimit = typeof retryLimit === "number" ? retryLimit : DEFAULT_RETRY_LIMIT;

                const retryCounter = newRecord.getValue("custrecord_2win_as_reintentos") || 0;

                // if (retryCounter < finalRetryLimit + 1) {
                nLog.debug("Evento detectado", `Tipo: ${eventType}, Interfaz: ${interfaceType}`);

                const custodiaId = newRecord.id;
                const uuid = newRecord.getValue("custrecord_2win_as_uuid") || "-";
                const inputData = newRecord.getValue("custrecord_2win_as_datos_entrada");
                const outputData = newRecord.getValue("custrecord_2win_as_respuesta");
                const statusCode = newRecord.getValue("custrecord_2win_as_codigo_respuesta");

                nLog.debug("Creando seguimiento de comunicación", `ID de Custodia: ${custodiaId}`);

                const newCommunicationRecord = record.create({
                    type: "customrecord_2win_andessalud_custodia_re"
                });
                nLog.debug("Nuevo registro de comunicación creado", `uuid: ${uuid}`);
                newCommunicationRecord.setValue("name", uuid);
                nLog.debug("Nuevo registro de comunicación creado", `retryCounter: ${retryCounter}`);
                newCommunicationRecord.setValue("custrecord_2win_andessalud_r_index", retryCounter);
                nLog.debug("Nuevo registro de comunicación creado", `custodiaId: ${custodiaId}`);
                newCommunicationRecord.setValue("custrecord_2win_andessalud_r_parent", custodiaId);
                nLog.debug("Nuevo registro de comunicación creado", `inputData: ${inputData}`);
                newCommunicationRecord.setValue("custrecord_2win_andessalud_r_input", inputData);
                nLog.debug("Nuevo registro de comunicación creado", `outputData: ${outputData}`);
                newCommunicationRecord.setValue("custrecord_2win_andessalud_r_output", outputData);
                nLog.debug("Nuevo registro de comunicación creado", `statusCode: ${statusCode}`);
                newCommunicationRecord.setValue("custrecord_2win_andessalud_r_status", statusCode);

                const newRecordId = newCommunicationRecord.save();

                nLog.audit("Seguimiento creado exitosamente", `Nuevo ID: ${newRecordId} para Custodia ID: ${custodiaId}`);
                // } else {
                //     nLog.error("Límite de reintentos alcanzado", `No se creará seguimiento para Custodia ID: ${newRecord.id}. Límite: ${finalRetryLimit}, Intentos: ${retryCounter}`);
                // }
            } else {
                nLog.debug("Evento no procesado", `Tipo: ${eventType}. No hubo cambios en la respuesta.`);
            }
        } catch (e) {
            nLog.error("Error al crear el seguimiento de comunicación", e);
        }
    }

    return {
        afterSubmit: afterSubmit
    };
});
