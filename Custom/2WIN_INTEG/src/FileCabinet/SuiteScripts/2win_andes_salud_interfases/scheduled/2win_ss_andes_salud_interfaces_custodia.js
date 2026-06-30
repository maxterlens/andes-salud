/**
 * @NApiVersion 2.1
 * @NScriptType ScheduledScript
 * @description Script programado para buscar y reprocesar eventos fallidos registrados en la custodia.
 */
define([
    "../domain/2win_dom_departamento",
    "../domain/2win_dom_subsidiaria",
    "../domain/2win_dom_ubicacion",
    "../domain/2win_dom_pago",
    "../lib/2win_lib_custodia",
    "../dao/2win_dao_replay_config",
    "N/search",
    "N/log",
    "N/record" // Añadir N/record
], function (domDepartamento, domSubsidiaria, domUbicacion, domPago, libCustodia, replayConfigDao, search, nLog, record) {
    /**
     * @function execute - Punto de entrada del script programado.
     */
    function execute(context) {
        try {
            nLog.audit("INICIO", "Buscando registros de custodia para reprocesar.");

            const registrosFallidos = libCustodia.busquedaRegistrosPorCodigoError("001");

            if (!registrosFallidos || registrosFallidos.length === 0) {
                nLog.audit("FIN", "No se encontraron registros de custodia para reprocesar.");
                return;
            }

            nLog.audit("", `Se encontraron ${registrosFallidos.length} registros para reprocesar.`);
            const limits = replayConfigDao.getRetryLimits();
            nLog.debug("Límites de reintentos obtenidos", JSON.stringify(limits));
            registrosFallidos.forEach(function (custodiaSearchResult) {
                const interfaceReplayCounter = custodiaSearchResult.getValue("custrecord_2win_as_reintentos");
                const interfaceType = custodiaSearchResult.getValue("custrecord_2win_as_interface");
                const custodiaId = custodiaSearchResult.id;
                if (Number(interfaceReplayCounter) >= (Number(limits[interfaceType]) || 3)) return;
                nLog.debug(`Procesando custodia ID: ${custodiaId}`, `Tipo de Interfaz: ${interfaceType}`);
                try {
                    // Cargar el registro completo para tener acceso a todos los campos
                    const custodiaRecord = record.load({
                        type: "customrecord_2win_andessalud_custodia",
                        id: custodiaId,
                        isDynamic: true
                    });

                    switch (true) {
                        case interfaceType.includes("centro de costos"):
                            domDepartamento.reprocesarEvento(custodiaRecord);
                            break;
                        case interfaceType.includes("empresa"):
                            domSubsidiaria.reprocesarEvento(custodiaRecord);
                            break;
                        case interfaceType.includes("bodega"):
                            domUbicacion.reprocesarEvento(custodiaRecord);
                            break;
                        case interfaceType.includes("recaudacion"):
                            domPago.reprocesarEvento(custodiaRecord);
                            break;
                        default:
                            nLog.error("TIPO DE INTERFAZ NO MANEJADO", `El tipo '${interfaceType}' en custodia ID ${custodiaId} no tiene regla de reproceso.`);
                            break;
                    }

                    nLog.audit("Reproceso Exitoso", `El registro de custodia ID ${custodiaId} fue reprocesado.`);
                } catch (reprocessError) {
                    nLog.error(`Error reprocesando custodia ID: ${custodiaId}`, reprocessError);
                } finally {
                    // Incrementar el contador de reintentos independientemente del resultado
                    // try {
                    //     const currentRetries =
                    //         search.lookupFields({
                    //             type: "customrecord_2win_andessalud_custodia",
                    //             id: custodiaId,
                    //             columns: ["custrecord_2win_as_reintentos"]
                    //         }).custrecord_2win_as_reintentos || 0;
                    //     // const currentRetries =
                    //     //     record
                    //     //         .load({
                    //     //             type: "customrecord_2win_andessalud_custodia",
                    //     //             id: custodiaId
                    //     //         })
                    //     //         .getValue("custrecord_2win_as_reintentos") || 0;

                    //     record.submitFields({
                    //         type: "customrecord_2win_andessalud_custodia",
                    //         id: custodiaId,
                    //         values: {
                    //             custrecord_2win_as_reintentos: Number(currentRetries) + 1
                    //         }
                    //     });
                    //     nLog.debug("Contador Actualizado", `Se incrementó el contador de reintentos para la custodia ID: ${custodiaId}`);
                    // } catch (updateError) {
                    //     nLog.error(`Error al actualizar el contador de reintentos para la custodia ID: ${custodiaId}`, updateError);
                    // }
                }
            });

            nLog.audit("FIN", "Proceso de reintentos de custodia completado.");
        } catch (error) {
            nLog.error("Error fatal en el script de custodia", error);
        }
    }

    return { execute: execute };
});
