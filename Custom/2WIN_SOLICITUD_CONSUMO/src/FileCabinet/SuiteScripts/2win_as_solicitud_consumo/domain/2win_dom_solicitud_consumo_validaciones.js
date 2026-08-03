/**
 * @NApiVersion 2.1
 * @module ./2win_dom_solicitud_consumo_validaciones.js
 * @NModuleScope Public
 */
define([
    "N/log",
    "N/runtime",
    "../dao/2win_dao_ubicacion",
    "../lib/2win_lib_auditoria",
], function (
    nLog, 
    runtime,
    daoUbicacion,
    libAuditoria,
) {
    // Variable para almacenar datos del proceso
    let proceso = {
        nombreProceso: "andessalud solicitud de consumo",
        scriptId: "",
        etapa: "",
        estado: "000",
        tokenProceso: "",
        descripcionResultado: ""
    };

    const ESTADOS = {
        ENVIO_PENDIENTE: "7",
        ENVIADA: "8",
        CERRADA: "9",
    };

    /**
     * 
     * @param {string} internalidResponsableUbicacion 
     * @param {string} internalidUsuarioActual 
     * @param {object} registroSolicitudConsumo 
     * @returns 
     */
    function validarBloqueo(internalidResponsableUbicacion, internalidUsuarioActual, registroSolicitudConsumo) {
        try {
            nLog.audit("validarBloqueo - parametro", {
                internalidResponsableUbicacion: internalidResponsableUbicacion,
                internalidUsuarioActual: internalidUsuarioActual,
                registroSolicitudConsumo: registroSolicitudConsumo
            });

            // console.log("validarBloqueo - parametro", {
            //     internalidResponsableUbicacion: internalidResponsableUbicacion,
            //     internalidUsuarioActual: internalidUsuarioActual,
            //     registroSolicitudConsumo: registroSolicitudConsumo
            // });
            
            // Recuperar id de solicitante
            const internalidSolicitante = registroSolicitudConsumo.getValue("custrecord_2win_consumo_solicitante");

            // Recuperar id de estado
            const estadoId = registroSolicitudConsumo.getValue("custrecord_2win_consumo_estado");

            nLog.debug("validarBloqueo - ids", {
                estado: estadoId,
                internalidResponsableUbicacion: internalidResponsableUbicacion,
                internalidUsuarioActual: internalidUsuarioActual
            });

            // Validaciones segun estado y usuario
            if (
                (estadoId === ESTADOS.ENVIO_PENDIENTE && internalidUsuarioActual !== internalidSolicitante) || // estado es ENVIO_PENDIENTE y el usuario actual es diferente del solicitante
                (estadoId === ESTADOS.ENVIADA && internalidUsuarioActual !== internalidResponsableUbicacion) || // estado es ENVIADA y el usuario actual es diferente del responsable de la bodega
                (estadoId === ESTADOS.CERRADA) // estado es CERRADA
            ) {
                // Bloquear
                return true
            }

        } catch (error) {
            nLog.error("validarBloqueo - error", error);
            // console.error('validarBloqueo - error', { 
            //     error: error
            // });
            throw error;
        }
    }

    /**
     * 
     * @param {string} internalidUbicacion 
     * @returns 
     */
    function obtenerResponsableUbicacion(internalidUbicacion) {
        try {
            nLog.audit("obtenerResponsableUbicacion - internalidUbicacion", {
                internalidUbicacion: internalidUbicacion
            });
            // console.log("obtenerResponsableUbicacion - internalidUbicacion", {
            //     internalidUbicacion: internalidUbicacion
            // });
            
            // Recuperar responsable de ubicacion
            const internalidResponsableUbicacion = daoUbicacion.determinarResponsableUbicacion(internalidUbicacion);
            
            return internalidResponsableUbicacion
        } catch (error) {
            nLog.error("obtenerResponsableUbicacion - error", error);
            // console.error('obtenerResponsableUbicacion - error', { 
            //     error: error
            // });
            throw error;
        }
    }

    return {
        validarBloqueo: validarBloqueo,
        obtenerResponsableUbicacion: obtenerResponsableUbicacion
    };
});