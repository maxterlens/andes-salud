/**
 * @NApiVersion 2.1
 * @NModuleScope Public
 */
define([
    "N/format",
    "N/ui/message",
    "N/runtime",
    "N/ui/serverWidget",
    "N/url",
], function (
    format,
    message,
    runtime,
    serverWidget,
    url
) {

    /* =========================
    * VISTA
    * ========================= */

    /**
     * @returns {object} - Vista para mostarar resumen
     */
    function generarVistaRegistrosAuditoria() {
        try {
            // Crear formulario para carga de archivos
            const form = serverWidget.createForm({
                title: "Registros auditoria erroneos"
            });

            // Se vincula el Client Script al formulario
            form.clientScriptModulePath = "/SuiteScripts/andes_recaudaciones/tools/reinyeccion_recaudaciones/client/2win_cs_reinyeccion_recaudacion.js";

            // Obtener la URL original
            let scriptObj = runtime.getCurrentScript();
            const suiteletUrl = url.resolveScript({
                scriptId: scriptObj.id,
                deploymentId: scriptObj.deploymentId
            });
            log.debug("generarVistaRegistrosAuditoria - suiteletUrl", {
                suiteletUrl: suiteletUrl
            });

            // --- BOTONES ---
            form.addSubmitButton({
                label: "Buscar"
            });
            form.addButton({
                id: "custpage_2win_vista_auditoria_seleccionar",
                label: "✅ Seleccionar Todo",
                functionName: "seleccionarTodos"
            });
            form.addButton({
                id: "custpage_2win_vista_auditoria_volver",
                label: "← Volver",
                functionName: `volverAFormularioBusqueda("${suiteletUrl}")`
            });
            form.addButton({
                id: "custpage_2win_vista_auditoria_recargar",
                label: "🔃 Recargar",
                functionName: `recargarVistaDeResumen`
            });
            form.addButton({
                id: "custpage_2win_vista_auditoria_reinyectar",
                label: "Reinyectar Seleccionados",
                functionName: "confirmarReinyeccion"
            });

            // --- CAMPOS ---
            const campoFecha = form.addField({
                id: "custpage_2win_reinyeccion_recaudaciones_fecha",
                type: serverWidget.FieldType.DATE,
                label: "Fecha registros auditoria",
            });

            // Agregar información/descripción de ayuda
            campoFecha.helpText = "Seleccione la fecha en la cual se buscaran registros de auditoria erroneos para el proceso de recaudaciones andessalud";

            // Asignar un valor por defecto (fecha actual)
            campoFecha.defaultValue = format.format({
                value: new Date(),
                type: format.Type.DATE
            });

            // Marcar campo como OBLIGATORIO
            campoFecha.isMandatory = true;
            // Agregar campo oculto para identificar cuando se envia reinyeccion
            form.addField({
                id: "custpage_2win_vista_auditoria_es_reinyeccion",
                type: serverWidget.FieldType.TEXT,
                label: "Reinyeccion"
            }).updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN });

            // --- SUBLISTA ---
            const sublistaResumenAuditoria = form.addSublist({
                id: "custlist_2win_vista_auditoria_resumen",
                label: "Resumen registros auditoria",
                type: serverWidget.SublistType.LIST
            });

            // Campos sublista
            sublistaResumenAuditoria.addField({
                id: "custlist_2win_vista_auditoria_seleccion",
                type: serverWidget.FieldType.CHECKBOX,
                label: "Seleccionado"
            });
            sublistaResumenAuditoria.addField({
                id: "custlist_2win_vista_auditoria_internalid",
                label: "Internal Id",
                type: serverWidget.FieldType.TEXT
            });
            sublistaResumenAuditoria.addField({
                id: "custlist_2win_vista_auditoria_proceso",
                label: "Proceso",
                type: serverWidget.FieldType.TEXT
            });
            // sublistaResumenAuditoria.addField({
            //     id: "custlist_2win_vista_auditoria_id_script",
            //     label: "Id script",
            //     type: serverWidget.FieldType.TEXT
            // });
            // sublistaResumenAuditoria.addField({
            //     id: "custlist_2win_vista_auditoria_etapa",
            //     label: "Etapa",
            //     type: serverWidget.FieldType.TEXT
            // });
            sublistaResumenAuditoria.addField({
                id: "custlist_2win_vista_auditoria_estado",
                label: "Estado",
                type: serverWidget.FieldType.TEXT
            });
            sublistaResumenAuditoria.addField({
                id: "custlist_2win_vista_auditoria_token",
                label: "Token / Identificador unico",
                type: serverWidget.FieldType.TEXT
            });
            sublistaResumenAuditoria.addField({
                id: "custlist_2win_vista_auditoria_descripcion",
                label: "Descripcion",
                type: serverWidget.FieldType.TEXT
            });
            sublistaResumenAuditoria.addField({
                id: "custlist_2win_vista_auditoria_status_reinyeccion",
                label: "Status reinyeccion",
                type: serverWidget.FieldType.TEXT
            }).updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN });
            sublistaResumenAuditoria.addField({
                id: "custlist_2win_vista_auditoria_detalle_reinyeccion",
                label: "Detalle reinyeccion",
                type: serverWidget.FieldType.TEXT
            }).updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN });

            // Retornar formulario generado
            return form;
        } catch (error) {
            log.error("generarVistaRegistrosAuditoria - error", error);
            throw error;
        }
    }

    /* =========================
    * MANIPULAR VISTA
    * ========================= */

    /**
     * @function poblarVistaRegistrosAuditoria
     * @param {object} form - Vista creada para mostrar resumen
     * @param {Array<object>} registrosAuditoria - Registros a mostrar en la vista
     * @returns {object} - Vista con campos poblados
     */
    function poblarVistaRegistrosAuditoria(form, registrosAuditoria) {
        try {
            log.debug("poblarVistaRegistrosAuditoria - parametros", {
                registrosAuditoria: registrosAuditoria,
                form: form
            });

            // --- VALIDAR REGISTROS DE CARGA EXISTENTES ---
            if (registrosAuditoria.length === 0) {
                // Mensaje informativo
                message.create({
                    title: "Sin Registros",
                    message: "No se encontraron registros para esta fecha.",
                    type: message.Type.INFORMATION
                }).show();
            } else if (registrosAuditoria.length > 0) {
                // --- LLENAR SUBLISTA CON DATOS DE REGISTROS DE CARGA EXISTENTES ---
                registrosAuditoria.forEach(function (registroAuditoria, index) {
                    // Recuperar sublista para ser manipulada
                    const sublistaResumenCargaArchivos = form.getSublist({ id: "custlist_2win_vista_auditoria_resumen" });

                    // Poblar cada uno de los campos de la sublista con informacion recuperada de registro carga archivo
                    sublistaResumenCargaArchivos.setSublistValue({
                        id: "custlist_2win_vista_auditoria_internalid",
                        line: index,
                        value: registroAuditoria.internalid || "-"
                    });
                    sublistaResumenCargaArchivos.setSublistValue({
                        id: "custlist_2win_vista_auditoria_proceso",
                        line: index,
                        value: registroAuditoria.custrecord_2win_auditoria_proceso || "-"
                    });
                    // sublistaResumenCargaArchivos.setSublistValue({
                    //     id: "custlist_2win_vista_auditoria_id_script",
                    //     line: index,
                    //     value: registroAuditoria.custrecord_2win_auditoria_id_script || "-"
                    // });
                    // sublistaResumenCargaArchivos.setSublistValue({
                    //     id: "custlist_2win_vista_auditoria_etapa",
                    //     line: index,
                    //     value: registroAuditoria.custrecord_2win_auditoria_etapa || "-"
                    // });
                    sublistaResumenCargaArchivos.setSublistValue({
                        id: "custlist_2win_vista_auditoria_estado",
                        line: index,
                        value: registroAuditoria.custrecord_2win_auditoria_estado || "-"
                    });
                    sublistaResumenCargaArchivos.setSublistValue({
                        id: "custlist_2win_vista_auditoria_token",
                        line: index,
                        value: registroAuditoria.custrecord_2win_auditoria_token || "-"
                    });
                    sublistaResumenCargaArchivos.setSublistValue({
                        id: "custlist_2win_vista_auditoria_descripcion",
                        line: index,
                        value: registroAuditoria.custrecord_2win_auditoria_descripcion || "-"
                    });
                    sublistaResumenCargaArchivos.setSublistValue({
                        id: "custlist_2win_vista_auditoria_status_reinyeccion",
                        line: index,
                        value: registroAuditoria.custrecord_2win_auditoria_status || "📌 PENDIENTE"
                    });
                    sublistaResumenCargaArchivos.setSublistValue({
                        id: "custlist_2win_vista_auditoria_detalle_reinyeccion",
                        line: index,
                        value: registroAuditoria.custrecord_2win_auditoria_detalle || "📌 PENDIENTE"
                    });
                });
            }

            // Retornar formulario generado
            return form;
        } catch (error) {
            log.error("poblarVistaRegistrosAuditoria - error", error);
            throw error;
        }
    }

    return {
        generarVistaRegistrosAuditoria: generarVistaRegistrosAuditoria,
        poblarVistaRegistrosAuditoria: poblarVistaRegistrosAuditoria
    };
});
