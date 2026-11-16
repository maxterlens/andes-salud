/**
 * @NApiVersion 2.1
 * @NModuleScope Public
 */
define([
    "N/ui/message",
    "N/runtime",
    "N/ui/serverWidget",
    "N/url",
], function (
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
    function generarVistaRegistrosReinyeccion() {
        try {
            // Crear formulario para reinyeccion
            const form = serverWidget.createForm({
                title: "Resumen reinyeccion"
            });

            // Se vincula el Client Script al formulario
            form.clientScriptModulePath = "/SuiteScripts/andes_recaudaciones/tools/reinyeccion_recaudaciones/client/2win_cs_reinyeccion_recaudacion.js";

            // Obtener la URL original
            let scriptObj = runtime.getCurrentScript();
            const suiteletUrl = url.resolveScript({
                scriptId: scriptObj.id,
                deploymentId: scriptObj.deploymentId
            });
            log.debug("generarVistaRegistrosReinyeccion - suiteletUrl", {
                suiteletUrl: suiteletUrl
            });

            // --- BOTONES ---
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

            // --- SUBLISTA ---
            const sublistaResumenReinyeccion = form.addSublist({
                id: "custlist_2win_vista_auditoria_resumen",
                label: "Resumen procesos reinyeccion",
                type: serverWidget.SublistType.LIST
            });

            // --- CAMPOS ---
            sublistaResumenReinyeccion.addField({
                id: "custlist_2win_vista_auditoria_internalid",
                label: "Internal Id",
                type: serverWidget.FieldType.TEXT
            });
            sublistaResumenReinyeccion.addField({
                id: "custlist_2win_vista_auditoria_proceso",
                label: "Proceso",
                type: serverWidget.FieldType.TEXT
            });
            // sublistaResumenReinyeccion.addField({
            //     id: "custlist_2win_vista_auditoria_id_script",
            //     label: "Id script",
            //     type: serverWidget.FieldType.TEXT
            // });
            // sublistaResumenReinyeccion.addField({
            //     id: "custlist_2win_vista_auditoria_etapa",
            //     label: "Etapa",
            //     type: serverWidget.FieldType.TEXT
            // });
            sublistaResumenReinyeccion.addField({
                id: "custlist_2win_vista_auditoria_estado",
                label: "Estado",
                type: serverWidget.FieldType.TEXT
            });
            sublistaResumenReinyeccion.addField({
                id: "custlist_2win_vista_auditoria_token",
                label: "Token / Identificador unico",
                type: serverWidget.FieldType.TEXT
            });
            sublistaResumenReinyeccion.addField({
                id: "custlist_2win_vista_auditoria_descripcion",
                label: "Descripcion",
                type: serverWidget.FieldType.TEXT
            });
            sublistaResumenReinyeccion.addField({
                id: "custlist_2win_vista_auditoria_status_reinyeccion",
                label: "Estado reinyeccion",
                type: serverWidget.FieldType.TEXT
            });
            sublistaResumenReinyeccion.addField({
                id: "custlist_2win_vista_auditoria_detalle_reinyeccion",
                label: "Detalle reinyeccion",
                type: serverWidget.FieldType.TEXT
            });

            // Retornar formulario generado
            return form;
        } catch (error) {
            log.error("generarVistaRegistrosReinyeccion - error", error);
            throw error;
        }
    }

    /* =========================
    * MANIPULAR VISTA
    * ========================= */

    /**
     * @function poblarVistaRegistrosReinyeccion
     * @param {object} form - Vista creada para mostrar resumen
     * @param {Array<object>} registrosReinyeccion - Registros a mostrar en la vista
     * @returns {object} - Vista con campos poblados
     */
    function poblarVistaRegistrosReinyeccion(form, registrosReinyeccion) {
        try {
            log.debug("poblarVistaRegistrosReinyeccion - parametros", {
                registrosReinyeccion: registrosReinyeccion,
                extension: registrosReinyeccion.length,
                form: form
            });

            // --- VALIDAR REGISTROS DE CARGA EXISTENTES ---
            if (registrosReinyeccion.length === 0) {
                // Mensaje informativo
                form.addPageInitMessage({
                    title: "Procesando registros",
                    message: "Recargue la pagina para visualizar el resumen del procesamiento.",
                    type: message.Type.INFORMATION
                });
                // message.create({
                //     title: "Procesando registros",
                //     message: "Recargue la pagina para visaulizar resumen de prosesamiento",
                //     type: message.Type.INFORMATION
                // }).show();
            } else if (registrosReinyeccion.length > 0) {
                // --- LLENAR SUBLISTA CON DATOS DE REGISTROS DE CARGA EXISTENTES ---
                registrosReinyeccion.forEach(function (registro, index) {
                    // Recuperar sublista para ser manipulada
                    const sublistaResumenCargaArchivos = form.getSublist({ id: "custlist_2win_vista_auditoria_resumen" });

                    // Poblar cada uno de los campos de la sublista con informacion recuperada de registro carga archivo
                    sublistaResumenCargaArchivos.setSublistValue({
                        id: "custlist_2win_vista_auditoria_internalid",
                        line: index,
                        value: registro.custrecord_2w_rein_recaudacion_auditoria || "-"
                    });
                    sublistaResumenCargaArchivos.setSublistValue({
                        id: "custlist_2win_vista_auditoria_proceso",
                        line: index,
                        value: registro.custrecord_2w_rein_recaudacion_proceso || "-"
                    });
                    // sublistaResumenCargaArchivos.setSublistValue({
                    //     id: "custlist_2win_vista_auditoria_id_script",
                    //     line: index,
                    //     value: registro.custrecord_2win_auditoria_id_script || "-"
                    // });
                    // sublistaResumenCargaArchivos.setSublistValue({
                    //     id: "custlist_2win_vista_auditoria_etapa",
                    //     line: index,
                    //     value: registro.custrecord_2win_auditoria_etapa || "-"
                    // });
                    sublistaResumenCargaArchivos.setSublistValue({
                        id: "custlist_2win_vista_auditoria_estado",
                        line: index,
                        value: registro.custrecord_2win_auditoria_estado || "-"
                    });
                    sublistaResumenCargaArchivos.setSublistValue({
                        id: "custlist_2win_vista_auditoria_token",
                        line: index,
                        value: registro.custrecord_2w_rein_recaudacion_identifi || "-"
                    });
                    sublistaResumenCargaArchivos.setSublistValue({
                        id: "custlist_2win_vista_auditoria_descripcion",
                        line: index,
                        value: registro.custrecord_2win_auditoria_descripcion || "-"
                    });
                    sublistaResumenCargaArchivos.setSublistValue({
                        id: "custlist_2win_vista_auditoria_status_reinyeccion",
                        line: index,
                        value: registro.custrecord_2w_rein_recaudacion_status || "-"
                    });
                    sublistaResumenCargaArchivos.setSublistValue({
                        id: "custlist_2win_vista_auditoria_detalle_reinyeccion",
                        line: index,
                        value: registro.custrecord_2w_rein_recaudacion_detalle || "-"
                    });
                });
            }

            // Retornar formulario generado
            return form;
        } catch (error) {
            log.error("poblarVistaRegistrosReinyeccion - error", error);
            throw error;
        }
    }


    function recuperarSeleccion(formulario) {
        try {
            log.debug("recuperarSeleccion - parametro", {
                parametro: formulario
            });
            const numLineas = formulario.getLineCount({
                group: "custlist_2win_vista_auditoria_resumen"
            });
            log.debug("recuperarSeleccion - numLineas", {
                numLineas: numLineas
            });

            let casosSeleccionados = [];

            // Recopilar los IDs seleccionados
            for (let i = 0; i < numLineas; i++) {
                let seleccionada = formulario.getSublistValue({
                    group: "custlist_2win_vista_auditoria_resumen",
                    name: "custlist_2win_vista_auditoria_seleccion",
                    line: i
                });

                if (seleccionada === "T") {
                    let internalid = formulario.getSublistValue({
                        group: "custlist_2win_vista_auditoria_resumen",
                        name: "custlist_2win_vista_auditoria_internalid",
                        line: i
                    });
                    let proceso = formulario.getSublistValue({
                        group: "custlist_2win_vista_auditoria_resumen",
                        name: "custlist_2win_vista_auditoria_proceso",
                        line: i
                    });
                    let identificador = formulario.getSublistValue({
                        group: "custlist_2win_vista_auditoria_resumen",
                        name: "custlist_2win_vista_auditoria_token",
                        line: i
                    });

                    casosSeleccionados.push({
                        custrecord_2w_rein_recaudacion_auditoria: internalid,
                        // custrecord_2w_rein_recaudacion_proceso: proceso,
                        // custrecord_2w_rein_recaudacion_identifi: identificador
                    });
                }
            }

            log.debug("recuperarSeleccion - casosSeleccionados", {
                extension: casosSeleccionados.length,
                casosSeleccionados: casosSeleccionados
            });
            return casosSeleccionados;
        } catch (error) {
            log.error("recuperarSeleccion - error", error.message);
            throw error;
        }
    }

    return {
        generarVistaRegistrosReinyeccion: generarVistaRegistrosReinyeccion,
        poblarVistaRegistrosReinyeccion: poblarVistaRegistrosReinyeccion,
        recuperarSeleccion: recuperarSeleccion
    };
});
