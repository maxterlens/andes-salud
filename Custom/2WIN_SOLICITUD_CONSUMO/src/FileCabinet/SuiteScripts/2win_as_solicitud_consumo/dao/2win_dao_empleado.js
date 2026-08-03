/**
 * @NApiVersion 2.1
 * @module ./2win_dao_empleado.js
 * @NModuleScope Public
 */
define(["N/log", "N/search"], function (nLog, search) {

    /**
     * @function recuperarSupervisor - Determinar quién es el aprobador de la solicitud
     * @param {number} solicitanteId - Id registro
     * @returns {number} - Id de supervisor
     */
    function recuperarSupervisor(solicitanteId) {
        try {
            nLog.debug("recuperarSupervisor - parametro", {solicitanteId: solicitanteId});

            const empleadoData = search.lookupFields({
                type: search.Type.EMPLOYEE,
                id: solicitanteId,
                columns: ["supervisor"]
            });
            nLog.debug("recuperarSupervisor - empleadoData", { empleadoData: empleadoData });

            if (empleadoData.supervisor && empleadoData.supervisor.length > 0) {
                return empleadoData.supervisor[0].value;
            }
        } catch (e) {
            nLog.error("recuperarSupervisor - error", e);
        }
        return null;
    }

    return {
        recuperarSupervisor: recuperarSupervisor
    };
});
