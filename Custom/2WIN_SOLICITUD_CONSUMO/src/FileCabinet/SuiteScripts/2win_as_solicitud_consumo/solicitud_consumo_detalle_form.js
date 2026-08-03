/**
 * @NApiVersion 2.1
 * @NScriptType UserEventScript
 * @NModuleScope Public
 */
define([
    "N/record", 
    "N/search", 
    "N/email", 
    "N/runtime", 
    "N/url", 
    "N/redirect", 
    "N/log", 
    "N/config", 
    "N/ui/serverWidget",
    "./dao/2win_dao_2win_solicitud_consumo_det",
    "./dao/2win_dao_static_params_operacion",
    "./domain/2win_dom_solicitud_consumo_validaciones",
    "./lib/2win_lib_email"
], function (
    record,
    search,
    email,
    runtime,
    url,
    redirect,
    nLog,
    config,
    serverWidget,
    daoSolicitudConsumoDetalle,
    daoParametrosOperacion,
    domSolicitudConsumoValidaciones,
    libEmail
) {

    const ESTADOS = {
        ENVIO_PENDIENTE: "7",
        ENVIADA: "8",
        CERRADA: "9",
    };

    /**
     * beforeLoad - Configura formulario, botones y valores por defecto
     */
    function beforeLoad(scriptContext) {
        try {
            nLog.debug("beforeLoad - scriptContext", { 
                type: scriptContext.type,
                scriptContext: scriptContext
            });
            if (runtime.executionContext !== runtime.ContextType.USER_INTERFACE) {
                return;
            }
            
            // === MODO EDIT/VIEW: Bloquear campos según estado ===
            if (scriptContext.type === scriptContext.UserEventType.EDIT || scriptContext.type === scriptContext.UserEventType.VIEW) {

                const form = scriptContext.form;
                const currentRecord = scriptContext.newRecord;
                const referanciaSolicitudConsumo = currentRecord.getValue("custrecord_2win_consumo_det_ref");
    
                // Cargar registro de referencia
                const registroReferencia = record.load({ type: "customrecord_2win_solicitud_consumo", id: referanciaSolicitudConsumo});
    
                // Recuperar estado de registro solicitud de consumo para ser usado en validaciones
                const estado = registroReferencia.getValue("custrecord_2win_consumo_estado");

                // Validar bloqueo de campos formulario antes de que se cargue
                daoSolicitudConsumoDetalle.bloquearCamposAntesDeCargarRegistro(form, estado, ESTADOS, registroReferencia);
            }
        } catch (error) {
            nLog.error("beforeLoad - error", error);
            throw {
                name: error.name || "CUSTOM_VALIDATION_ERROR",
                message: error.message,
                notifyOff: true
            };
        }
    }

    /**
     * beforeSubmit - Ejecuta validaciones por evento antes del envio del formulario
     */
    function beforeSubmit(scriptContext) {
        try {
            nLog.debug("beforeSubmit - scriptContext", { 
                type: scriptContext.type,
                scriptContext: scriptContext
            });
            if (runtime.executionContext !== runtime.ContextType.USER_INTERFACE) {
                return;
            }

            let currentRecord;

            // Validar tipo de evento para recuperar registro
            if (
                scriptContext.type === scriptContext.UserEventType.CREATE ||
                scriptContext.type === scriptContext.UserEventType.EDIT ||
                scriptContext.type === scriptContext.UserEventType.COPY ||
                scriptContext.type === scriptContext.UserEventType.XEDIT
            ) {
                currentRecord = scriptContext.newRecord;
            } else if ( scriptContext.type === scriptContext.UserEventType.DELETE ) {
                currentRecord = scriptContext.oldRecord;
            }

            // Recuperar referencia a solicitud de consumo desde el registro detalle
            const referanciaSolicitudConsumo = currentRecord.getValue("custrecord_2win_consumo_det_ref");

            // Cargar registro de referencia
            const registroReferencia = record.load({ type: "customrecord_2win_solicitud_consumo", id: referanciaSolicitudConsumo});

            // Recuperar estado de registro solicitud consumo para ser usado en validaciones
            const estado = registroReferencia.getValue("custrecord_2win_consumo_estado");
            
            // Casos
            if (
                scriptContext.type === scriptContext.UserEventType.CREATE || 
                scriptContext.type === scriptContext.UserEventType.DELETE || 
                scriptContext.type === scriptContext.UserEventType.EDIT ||
                scriptContext.type === scriptContext.UserEventType.COPY ||
                scriptContext.type === scriptContext.UserEventType.XEDIT
            ) {
                // Recuperar el internalid del usuario actual
                let internalidUsuarioActual = String(runtime.getCurrentUser().id);

                // Recuperar el responsable de la ubicación al iniciar
                const internalidUbicacion = registroReferencia.getValue("custrecord_2win_consumo_ubicacion");
                let internalidResponsableUbicacion = null;
                if (internalidUbicacion) {
                    // Se recupera el responsable de la bodega para validar permisos en las acciones de la sublista
                    internalidResponsableUbicacion = domSolicitudConsumoValidaciones.obtenerResponsableUbicacion(internalidUbicacion);
                }
                let bloqueo = domSolicitudConsumoValidaciones.validarBloqueo(internalidResponsableUbicacion, internalidUsuarioActual, registroReferencia);
                if (bloqueo) {
                    throw new Error(`<b>ACCION NO PERMITIDA:</b> No tiene permitida esta accion para el registro, valide estado de solicitud`);
                }
            }
        } catch (error) {
            nLog.error("beforeSubmit - error", error);
            throw {
                name: error.name || "CUSTOM_VALIDATION_ERROR",
                message: error.message,
                notifyOff: true
            };
        }
    }

    return {
        beforeLoad: beforeLoad,
        beforeSubmit
    };
});
