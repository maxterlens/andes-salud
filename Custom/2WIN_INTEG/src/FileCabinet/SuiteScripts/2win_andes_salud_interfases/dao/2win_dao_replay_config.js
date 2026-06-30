/**
 * @NApiVersion 2.1
 * @NModuleScope Public
 * @module ./2win_dao_replay_config
 * @description DAO para gestionar la configuración de reintentos desde customrecord_2win_andes_salud_replay_con.
 */
define(["N/search", "N/log"], function (search, nLog) {
    /**
     * @function getRetryLimitForFlow
     * @description Obtiene el límite de reintentos para un flujo de interfaz específico.
     * @param {string} flowName - El nombre del flujo (ej. "centro de costos").
     * @returns {number|null} El límite de reintentos, o null si no se encuentra.
     */
    function getRetryLimitForFlow(flowName) {
        if (!flowName) {
            nLog.error("DAO Replay Config", "El nombre del flujo es requerido.");
            return null;
        }

        try {
            const configSearch = search.create({
                type: "customrecord_2win_andes_salud_replay_con",
                filters: [["name", "is", flowName]],
                columns: [
                    search.createColumn({
                        name: "custrecord_2win_interface_max_replays",
                        label: "retryLimit"
                    })
                ]
            });

            const searchResult = configSearch.run().getRange({ start: 0, end: 1 });

            if (searchResult && searchResult.length > 0) {
                const retryLimit = searchResult[0].getValue({ name: "custrecord_2win_interface_max_replays" });
                // Asegurarse de que el valor es un número antes de devolverlo.
                return retryLimit ? parseInt(retryLimit, 10) : null;
            } else {
                nLog.error("DAO Replay Config", `No se encontró configuración de reintentos para el flujo: ${flowName}`);
                return null;
            }
        } catch (e) {
            nLog.error({
                title: `Error al buscar el límite de reintentos para el flujo: ${flowName}`,
                details: e.message
            });
            return null;
        }
    }
    function getRetryLimits() {
        const limits = {};
        const configSearch = search.create({
            type: "customrecord_2win_andes_salud_replay_con",
            columns: ["name", "custrecord_2win_interface_max_replays"]
        });

        const searchResult = configSearch.run().getRange({ start: 0, end: 1000 });
        searchResult.map((result) => {
            limits[result.getValue({ name: "name" })] = parseInt(result.getValue({ name: "custrecord_2win_interface_max_replays" }), 10);
        });
        return limits;
    }
    return {
        getRetryLimitForFlow: getRetryLimitForFlow,
        getRetryLimits: getRetryLimits
    };
});
