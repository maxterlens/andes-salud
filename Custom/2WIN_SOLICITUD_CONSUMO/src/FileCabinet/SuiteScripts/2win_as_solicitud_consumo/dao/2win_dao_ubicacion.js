/**
 * @NApiVersion 2.1
 * @module ./2win_dao_ubicacion.js
 * @NModuleScope Public
 */
define(["N/log", "N/search"], function (nLog, search) {

    /**
     * @function determinarResponsableUbicacion - Recuperar responsable de ubicacion
     * @param {number} ubicacionId - Id registro
     * @returns {number} - Id de responsable ubicacion
     */
    function determinarResponsableUbicacion(ubicacionId) {
        try {
            nLog.debug("determinarResponsableUbicacion - parametro", {ubicacionId: ubicacionId});
            
            // Recuperar datos ubicacion
            const responsableUbicacion = search.lookupFields({
                type: search.Type.LOCATION,
                id: ubicacionId,
                columns: ["custrecord_2win_responsable_ubicacion"]
            });
            nLog.debug("determinarResponsableUbicacion - responsableUbicacion", {responsableUbicacion: responsableUbicacion});


            // Validar si se recupero responsable ubicacion
            if (responsableUbicacion.custrecord_2win_responsable_ubicacion && responsableUbicacion.custrecord_2win_responsable_ubicacion.length > 0) {
                return responsableUbicacion.custrecord_2win_responsable_ubicacion[0].value
            } else {
                throw new Error(`No se encontró responsable para la ubicación ID: ${ubicacionId}`);
            }
        } catch (error) {
            nLog.error("determinarResponsableUbicacion - error", error);
            throw error;
        }
    }
 
    /**
     * 
     * @param {string} parametro - internalid netsuite ubicacion
     * @returns {boolean} - Valor de campo usebins en registro ubicacion
     */
    function ubicacionUsaDepositos(parametro) {
        try {
            nLog.debug("ubicacionUsaDepositos - parametro", { parametro: parametro });

            let usaDepositos = false;

            // Recuperar datos ubicacion
            const usarDepositos = search.lookupFields({
                type: search.Type.LOCATION,
                id: parametro,
                columns: ["usesbins"]
            });
            nLog.debug("ubicacionUsaDepositos - usarDepositos", { usarDepositos: usarDepositos });

            // Asignar valor recuperado de busqueda
            usaDepositos = usarDepositos.usesbins

            return usaDepositos
        } catch (error) {
            nLog.error("ubicacionUsaDepositos - error", error);
            throw error;
        }
    }

    return {
        determinarResponsableUbicacion: determinarResponsableUbicacion,
        ubicacionUsaDepositos: ubicacionUsaDepositos
    };
});
