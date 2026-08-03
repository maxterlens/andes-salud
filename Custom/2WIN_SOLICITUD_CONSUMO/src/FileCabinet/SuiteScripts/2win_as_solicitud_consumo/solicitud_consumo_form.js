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
    "./dao/2win_dao_2win_solicitud_consumo",
    "./dao/2win_dao_static_params_operacion",
    "./domain/2win_dom_solicitud_consumo_actualizacion_stock_evento_usuario",
    "./domain/2win_dom_solicitud_consumo_detalle",
    "./domain/2win_dom_solicitud_consumo_validaciones",
    "./domain/2win_dom_solicitud_consumo",
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
    daoSolicitudConsumo,
    daoParametrosOperacion,
    domSolicitudConsumoActualizacionStockEventoUsuario,
    domSolicitudConsumoDetalle,
    domSolicitudConsumoValidaciones,
    domSolicitudConsumo,
    libEmail
) {

    const ESTADOS = {
        ENVIO_PENDIENTE: "7",
        ENVIADA: "8",
        CERRADA: "9",
    };

    const ROLE_EMPLOYEE_CENTER = "employee_center";

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

            // ── Redirect para rol Centro de Empleados ──────────────────────
            const currentUser = runtime.getCurrentUser();
            if (currentUser.roleId === ROLE_EMPLOYEE_CENTER) {
                const currentRecord = scriptContext.newRecord;
                let op     = "view";
                let params = { op: "view" };

                if (scriptContext.type === scriptContext.UserEventType.CREATE) {
                    params = { op: "create" };
                } else {
                    params = { op: scriptContext.type === scriptContext.UserEventType.EDIT ? "edit" : "view", id: currentRecord.id };
                }

                const stltUrl = url.resolveScript({
                    scriptId    : "customscript_2win_stlt_solicitud_consumo",
                    deploymentId: "customdeploy_2win_stlt_solicitud_consumo",
                    params      : params
                });

                nLog.debug("beforeLoad - redirect employee_center", { stltUrl });
                redirect.redirect({ url: stltUrl });
                return;
            }
            // ──────────────────────────────────────────────────────────────

            const form = scriptContext.form;
            const currentRecord = scriptContext.newRecord;
            const currentUser = runtime.getCurrentUser();
            const estado = currentRecord.getValue("custrecord_2win_consumo_estado");
            const solicitanteId = Number(currentRecord.getValue("custrecord_2win_consumo_solicitante")); // Se convierte a numerico para coincidir con tipo recuperado en currentUser 

            // === MODO CREATE: Valores por defecto ===
            if (scriptContext.type === scriptContext.UserEventType.CREATE) {
                // Definir valores por defecto
                daoSolicitudConsumo.definirValoresPorDefectoCreacion(currentRecord);
            }

            // === MODO EDIT/VIEW: Bloquear campos según estado ===
            if (scriptContext.type === scriptContext.UserEventType.EDIT || scriptContext.type === scriptContext.UserEventType.VIEW) {
                daoSolicitudConsumo.bloquearCamposAntesDeCargarRegistro(form, estado, ESTADOS, currentRecord);

                // Actualizar stock lineas sublista
                const internalidUbicacion = currentRecord.getValue("custrecord_2win_consumo_ubicacion");
                domSolicitudConsumoActualizacionStockEventoUsuario.actualizarStockLineasDetalleSolicitudConsumoEventoUsuario(internalidUbicacion, currentRecord);
            }

            // === SOLO EN VIEW: Agregar sublista y botones ===
            if (scriptContext.type === scriptContext.UserEventType.VIEW) {

                if (estado === ESTADOS.ENVIO_PENDIENTE && currentUser.id === solicitanteId) {
                    form.addButton({
                        id: "custpage_btn_enviar",
                        label: "Enviar a Bodega",
                        functionName: `enviarSolicitud(${currentRecord.id})`
                    });
                }

                // Botón CONSUMIR - Solo para responsable de bodega cuando estado = Enviada
                if (estado === ESTADOS.ENVIADA) {
                    let generar = domSolicitudConsumo.generarBotonConsumir(currentUser, form, currentRecord);
                }

                // Botón PDF - Cualquier estado
                form.addButton({
                    id: "custpage_btn_pdf_constancia_entrega",
                    label: "PDF constancia entrega",
                    functionName: `generarPdfConstanciaEntrega(${currentRecord.id})`
                });

                // Inyectar funciones cliente
                inyectarFuncionesCliente(form, currentRecord.id);
            } 
        } catch (error) {
            nLog.error("beforeLoad - error", error);
        }
    }

    /**
     * beforeSubmit - Validaciones antes de guardar
     */
    function beforeSubmit(scriptContext) {
        try {
            nLog.debug("beforeSubmit - scriptContext", { 
                type: scriptContext.type,
                scriptContext: scriptContext
            });
            
            let currentRecord;
            let estado;
            
            // Asignar el registro según el evento
            if (scriptContext.type === scriptContext.UserEventType.DELETE) {
                currentRecord = scriptContext.oldRecord;
            } else {
                // Para CREATE, EDIT, XEDIT, COPY, etc.
                currentRecord = scriptContext.newRecord;
                estado = currentRecord.getValue("custrecord_2win_consumo_estado");
            }

            /**
             * Validar que exista al menos una línea en la sublista detalle consumo:
             * - Caso el registro se crea
             * - Caso el registro se edita y el estado es ENVIO_PENDIENTE
             */
            if (
                scriptContext.type === scriptContext.UserEventType.CREATE ||
                scriptContext.type === scriptContext.UserEventType.EDIT
            ) {
                let lineCount = currentRecord.getLineCount({ sublistId: 'recmachcustrecord_2win_consumo_det_ref' });
    
                if (lineCount === 0) {
                    throw new Error(`<b>DETALLE OBLIGATORIO:</b> Debe ingresar al menos una línea en la sublista Detalle.`);
                }
            };

            // Recuperar el internalid del usuario actual
            let internalidUsuarioActual = String(runtime.getCurrentUser().id);

            // Recuperar el responsable de la ubicación al iniciar
            const internalidUbicacion = currentRecord.getValue("custrecord_2win_consumo_ubicacion");
            let internalidResponsableUbicacion = null;
            if (internalidUbicacion) {
                // Se recupera el responsable de la bodega para validar permisos en las acciones de la sublista
                internalidResponsableUbicacion = domSolicitudConsumoValidaciones.obtenerResponsableUbicacion(internalidUbicacion);
            }
            
            // Caso eliminacion
            if (scriptContext.type === scriptContext.UserEventType.DELETE) {
                // Validar si requiere bloqueo
                let bloqueo = domSolicitudConsumoValidaciones.validarBloqueo(internalidResponsableUbicacion, internalidUsuarioActual, currentRecord);
                if (bloqueo) {
                    throw new Error(`<b>ACCION NO PERMITIDA:</b> No tiene permitida esta accion para el registro, valide estado de solicitud`);
                } else {
                    // Recuperar registros de detalle relacionados y eliminarlos para evitar aviso de registros relacionados al eliminar solicitud de consumo.
                    domSolicitudConsumoDetalle.eliminarRegistrosDetalleSolicitudConsumo(currentRecord);
                };
            } else if ( scriptContext.type === scriptContext.UserEventType.EDIT || scriptContext.type === scriptContext.UserEventType.COPY || scriptContext.type === scriptContext.UserEventType.CREATE) {
                // Validar si requiere bloqueo
                let bloqueo = domSolicitudConsumoValidaciones.validarBloqueo(internalidResponsableUbicacion, internalidUsuarioActual, currentRecord);
                if (bloqueo) {
                    throw new Error(`<b>ACCION NO PERMITIDA:</b> No tiene permitida esta accion para el registro, valide estado de solicitud`);
                } else {
                    // Eliminar registros de solicitud consumo detalle solo de lineas que hayan sido quitadas del registro de solicitud de consumo
                    // domSolicitudConsumoDetalle.procesarLineasEditadas(scriptContext.oldRecord, scriptContext.newRecord);
                };
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

    /**
     * afterSubmit - Guardar líneas y enviar notificaciones
     */
    function afterSubmit(scriptContext) {
        try {
            nLog.debug("afterSubmit - scriptContext", { 
                type: scriptContext.type,
                scriptContext: scriptContext
            });

            
            // === NOTIFICACIONES SEGÚN CAMBIO DE ESTADO ===
            if (scriptContext.type === scriptContext.UserEventType.EDIT || scriptContext.type === scriptContext.UserEventType.XEDIT) {
                // const newRecord = scriptContext.newRecord;
                const newRecord = record.load({ type: scriptContext.newRecord.type, id: scriptContext.newRecord.id, isDynamic: true, });
                nLog.debug("afterSubmit - newRecord", { newRecord: newRecord });
                const solicitudId = newRecord.id;
                const tipoRegistro = newRecord.type;
                const estado = newRecord.getValue("custrecord_2win_consumo_estado");
                const solicitanteId = newRecord.getValue("custrecord_2win_consumo_solicitante");
                const ubicacionId = newRecord.getValue("custrecord_2win_consumo_ubicacion");

                const oldRecord = scriptContext.oldRecord;
                const oldEstado = oldRecord.getValue("custrecord_2win_consumo_estado");

                // Cambió a ENVIADA
                if (oldEstado !== ESTADOS.ENVIADA && estado === ESTADOS.ENVIADA) {
                    libEmail.enviarEmailBodega(solicitudId, ubicacionId, tipoRegistro);
                }

                // Cambió a CERRADA (consumida)
                if (oldEstado !== ESTADOS.CERRADA && estado === ESTADOS.CERRADA) {
                    const ajustesIds = newRecord.getValue("custrecord_2win_consumo_ajustes_ids");
                    libEmail.enviarEmailConsumida(solicitudId, solicitanteId, ajustesIds, tipoRegistro);
                }
            }
        } catch (error) {
            nLog.error("afterSubmit - error", { error: error});
        }
    }

    // ============================================================
    // FUNCIONES AUXILIARES
    // ============================================================

    /**
     * Inyectar funciones cliente para botones
     */
    function inyectarFuncionesCliente(form, solicitudId) {

        form.addField({
            id: "custpage_script_inject",
            type: serverWidget.FieldType.INLINEHTML,
            label: " "
        }).defaultValue = `
            <script>
                function enviarSolicitud(id) {
                    if (!confirm('¿Enviar esta solicitud a bodega?')) return;

                    require(['N/record'], function(record) {
                        record.submitFields({
                            type: 'customrecord_2win_solicitud_consumo',
                            id: id,
                            values: {
                                custrecord_2win_consumo_estado: 8 // Enviada
                            }
                        });
                        location.reload();
                    });
                }

                function consumirSolicitud(id) {
                    if (!confirm('¿Confirmar consumo? Se generarán los ajustes de inventario.')) return;

                    // Redirigir a Suitelet para procesamiento
                    require(['N/url'], function(urlMod) {
                        var suiteURL = urlMod.resolveScript({
                            scriptId: 'customscript_2win_sl_consumir',
                            deploymentId: 'customdeploy_2win_sl_consumir',
                            params: { solicitud: id }
                        });
                        window.location.href = suiteURL;
                    });
                }

                function generarPdfConstanciaEntrega(registroId) {
                    if (!confirm('¿Generar pdf para constancia de entrega?')) return;

                    // Redirigir a Suitelet para procesamiento
                    require(['N/url'], function(urlMod) {
                        var suiteURL = urlMod.resolveScript({
                            scriptId: 'customscript_solicitud_consumo_pdf',
                            deploymentId: 'customdeploy_solicitud_consumo_pdf',
                            params: { registroId: registroId }
                        });
                        window.location.href = suiteURL;
                    });
                }
            </script>
        `;
    }

    return {
        beforeLoad: beforeLoad,
        beforeSubmit: beforeSubmit,
        afterSubmit: afterSubmit
    };
});
