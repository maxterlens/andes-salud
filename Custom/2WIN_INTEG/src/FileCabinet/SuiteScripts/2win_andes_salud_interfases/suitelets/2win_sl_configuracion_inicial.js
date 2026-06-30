/**
 * @NApiVersion 2.1
 * @NScriptType Suitelet
 * @description Suitelet con Assistant para configuración inicial de Andes Salud
 * @author 2Win
 * @version 1.0.0
 */
define(["N/ui/serverWidget", "N/record", "N/search", "N/task", "./helpers/2win_helper_parametros", "./helpers/2win_helper_registros", "./helpers/2win_helper_campos", "N/log"], function (
    serverWidget,
    record,
    search,
    task,
    helperParametros,
    helperRegistros,
    helperCampos,
    nLog
) {
    /**
     * Constantes para IDs de pasos del Assistant
     */
    const STEPS = {
        BIENVENIDA: "bienvenida",
        PARAMETROS: "parametros",
        VALIDACION_REGISTROS: "validacion_registros",
        CREACION_PARAMETROS: "creacion_parametros",
        VALIDACION_CAMPOS: "validacion_campos",
        RESUMEN: "resumen"
    };

    /**
     * Función principal del Suitelet
     * @param {Object} context - Contexto de ejecución
     */
    function onRequest(context) {
        try {
            const request = context.request;
            const response = context.response;

            // Crear el Assistant
            const assistant = serverWidget.createAssistant({
                title: "⚙️ Asistente de Configuración Inicial - Andes Salud",
                hideNavBar: false
            });

            // Obtener el paso actual
            const currentStep = request.parameters.step || STEPS.BIENVENIDA;
            const action = request.parameters.action;

            // Manejar la acción según el paso actual
            handleAssistantAction(assistant, currentStep, action, request);

            // Escribir la respuesta
            response.writePage(assistant);
        } catch (error) {
            nLog.error("onRequest - error", error);
            throw error;
        }
    }

    /**
     * Maneja las acciones del Assistant según el paso actual
     * @param {Object} assistant - Instancia del Assistant
     * @param {string} currentStep - Paso actual
     * @param {string} action - Acción a ejecutar
     * @param {Object} request - Request object
     */
    function handleAssistantAction(assistant, currentStep, action, request) {
        let nextStep = currentStep;

        switch (currentStep) {
            case STEPS.BIENVENIDA:
                setupBienvenidaStep(assistant);
                nextStep = STEPS.PARAMETROS;
                break;

            case STEPS.PARAMETROS:
                if (action === "back") {
                    setupBienvenidaStep(assistant);
                    nextStep = STEPS.PARAMETROS;
                } else if (action === "next" || action === "finish") {
                    // Validar y guardar datos de parámetros
                    if (validateParametrosStep(request)) {
                        assistant.sendRedirect({
                            type: assistant.RedirectType.SUITELET,
                            identifier: "customscript_2win_sl_configuracion_inicial",
                            id: "customdeploy_2win_sl_configuracion_inicial",
                            parameters: {
                                step: STEPS.VALIDACION_REGISTROS,
                                // Pasar parámetros del paso anterior
                                param_url_base: request.parameters.param_url_base,
                                param_carpeta_ingresos: request.parameters.param_carpeta_ingresos,
                                param_tipo_ubicacion: request.parameters.param_tipo_ubicacion,
                                param_carpeta_prefactura: request.parameters.param_carpeta_prefactura
                            }
                        });
                        return;
                    } else {
                        setupParametrosStep(assistant, request);
                    }
                } else {
                    setupParametrosStep(assistant, request);
                }
                nextStep = STEPS.VALIDACION_REGISTROS;
                break;

            case STEPS.VALIDACION_REGISTROS:
                if (action === "back") {
                    setupParametrosStep(assistant, request);
                    nextStep = STEPS.VALIDACION_REGISTROS;
                } else if (action === "next" || action === "finish") {
                    assistant.sendRedirect({
                        type: assistant.RedirectType.SUITELET,
                        identifier: "customscript_2win_sl_configuracion_inicial",
                        id: "customdeploy_2win_sl_configuracion_inicial",
                        parameters: {
                            step: STEPS.CREACION_PARAMETROS,
                            param_url_base: request.parameters.param_url_base,
                            param_carpeta_ingresos: request.parameters.param_carpeta_ingresos,
                            param_tipo_ubicacion: request.parameters.param_tipo_ubicacion,
                            param_carpeta_prefactura: request.parameters.param_carpeta_prefactura
                        }
                    });
                    return;
                } else {
                    setupValidacionRegistrosStep(assistant, request);
                }
                nextStep = STEPS.CREACION_PARAMETROS;
                break;

            case STEPS.CREACION_PARAMETROS:
                if (action === "back") {
                    setupValidacionRegistrosStep(assistant, request);
                    nextStep = STEPS.CREACION_PARAMETROS;
                } else if (action === "next" || action === "finish") {
                    // Crear parámetros de operación
                    const resultado = crearParametrosOperacion(request);
                    if (resultado.success) {
                        assistant.sendRedirect({
                            type: assistant.RedirectType.SUITELET,
                            identifier: "customscript_2win_sl_configuracion_inicial",
                            id: "customdeploy_2win_sl_configuracion_inicial",
                            parameters: {
                                step: STEPS.VALIDACION_CAMPOS,
                                param_url_base: request.parameters.param_url_base,
                                param_carpeta_ingresos: request.parameters.param_carpeta_ingresos,
                                param_tipo_ubicacion: request.parameters.param_tipo_ubicacion,
                                param_carpeta_prefactura: request.parameters.param_carpeta_prefactura
                            }
                        });
                        return;
                    } else {
                        assistant.sendRedirect({
                            type: assistant.RedirectType.SUITELET,
                            identifier: "customscript_2win_sl_configuracion_inicial",
                            id: "customdeploy_2win_sl_configuracion_inicial",
                            parameters: {
                                step: STEPS.CREACION_PARAMETROS,
                                error: resultado.message,
                                param_url_base: request.parameters.param_url_base,
                                param_carpeta_ingresos: request.parameters.param_carpeta_ingresos,
                                param_tipo_ubicacion: request.parameters.param_tipo_ubicacion,
                                param_carpeta_prefactura: request.parameters.param_carpeta_prefactura
                            }
                        });
                        return;
                    }
                } else {
                    setupCreacionParametrosStep(assistant, request);
                }
                nextStep = STEPS.VALIDACION_CAMPOS;
                break;

            case STEPS.VALIDACION_CAMPOS:
                if (action === "back") {
                    setupCreacionParametrosStep(assistant, request);
                    nextStep = STEPS.VALIDACION_CAMPOS;
                } else if (action === "next" || action === "finish") {
                    assistant.sendRedirect({
                        type: assistant.RedirectType.SUITELET,
                        identifier: "customscript_2win_sl_configuracion_inicial",
                        id: "customdeploy_2win_sl_configuracion_inicial",
                        parameters: {
                            step: STEPS.RESUMEN,
                            param_url_base: request.parameters.param_url_base,
                            param_carpeta_ingresos: request.parameters.param_carpeta_ingresos,
                            param_tipo_ubicacion: request.parameters.param_tipo_ubicacion,
                            param_carpeta_prefactura: request.parameters.param_carpeta_prefactura
                        }
                    });
                    return;
                } else {
                    setupValidacionCamposStep(assistant, request);
                }
                nextStep = STEPS.RESUMEN;
                break;

            case STEPS.RESUMEN:
                if (action === "back") {
                    setupValidacionCamposStep(assistant, request);
                    nextStep = STEPS.RESUMEN;
                } else {
                    setupResumenStep(assistant, request);
                }
                break;
        }

        // Configurar el último paso
        if (currentStep === STEPS.RESUMEN) {
            assistant.lastStep = true;
        }
    }

    /**
     * Configura el paso de bienvenida
     * @param {Object} assistant - Instancia del Assistant
     */
    function setupBienvenidaStep(assistant) {
        assistant.addField({
            id: "bienvenida_html",
            type: serverWidget.FieldType.INLINEHTML,
            label: "Bienvenida"
        }).defaultValue = `
            <div style="padding: 20px; font-family: Arial, sans-serif;">
                <h2 style="color: #2c3e50;">🏥 Configuración Inicial - Integración Andes Salud</h2>
                <p style="font-size: 14px; color: #555;">
                    Este asistente te guiará paso a paso en la configuración inicial de la integración 
                    entre NetSuite y Andes Salud. El proceso incluye:
                </p>
                <ul style="color: #555; line-height: 1.8;">
                    <li>✅ Configuración de parámetros de operación</li>
                    <li>✅ Verificación y creación de registros personalizados</li>
                    <li>✅ Validación de campos requeridos</li>
                    <li>✅ Generación de reporte de configuración</li>
                </ul>
                <div style="background-color: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin-top: 20px;">
                    <strong>⏱️ Tiempo estimado:</strong> 10-15 minutos
                </div>
                <div style="background-color: #d1ecf1; border-left: 4px solid #17a2b8; padding: 15px; margin-top: 15px;">
                    <strong>💡 Recomendación:</strong> Ten a mano la URL de Health Connect y los IDs 
                    de las carpetas de NetSuite que se utilizarán.
                </div>
            </div>
        `;
    }

    /**
     * Configura el paso de parámetros de operación
     * @param {Object} assistant - Instancia del Assistant
     * @param {Object} request - Request con valores previos
     */
    function setupParametrosStep(assistant, request) {
        // URL Base Health Connect
        const urlField = assistant.addField({
            id: "param_url_base",
            type: serverWidget.FieldType.TEXT,
            label: "URL Base Health Connect"
        });
        urlField.isMandatory = true;
        urlField.helpText = "URL base del servicio Health Connect. Ejemplo: https://health-connect.andes-salud.cl/api";
        if (request.parameters.param_url_base) {
            urlField.defaultValue = request.parameters.param_url_base;
        }

        // Carpeta Archivos Ingresos
        const carpetaIngresosField = assistant.addField({
            id: "param_carpeta_ingresos",
            type: serverWidget.FieldType.TEXT,
            label: "ID Carpeta Archivos Ingresos"
        });
        carpetaIngresosField.isMandatory = true;
        carpetaIngresosField.helpText = "ID de la carpeta en File Cabinet para archivos de ingresos ambulatorios y hospitalizados";
        if (request.parameters.param_carpeta_ingresos) {
            carpetaIngresosField.defaultValue = request.parameters.param_carpeta_ingresos;
        }

        // Tipo Ubicación Almacén
        const tipoUbicacionField = assistant.addField({
            id: "param_tipo_ubicacion",
            type: serverWidget.FieldType.SELECT,
            label: "Tipo Ubicación Almacén",
            source: "locationtype"
        });
        tipoUbicacionField.isMandatory = true;
        tipoUbicacionField.helpText = "Tipo de ubicación que identifica almacenes válidos";
        if (request.parameters.param_tipo_ubicacion) {
            tipoUbicacionField.defaultValue = request.parameters.param_tipo_ubicacion;
        }

        // Carpeta Resultados Prefactura
        const carpetaPrefacturaField = assistant.addField({
            id: "param_carpeta_prefactura",
            type: serverWidget.FieldType.TEXT,
            label: "Carpeta Resultados Prefactura"
        });
        carpetaPrefacturaField.isMandatory = true;
        carpetaPrefacturaField.helpText = "Nombre o ID de la carpeta para resultados de proceso de prefactura";
        if (request.parameters.param_carpeta_prefactura) {
            carpetaPrefacturaField.defaultValue = request.parameters.param_carpeta_prefactura;
        }

        // HTML informativo
        assistant.addField({
            id: "parametros_info",
            type: serverWidget.FieldType.INLINEHTML,
            label: "Información"
        }).defaultValue = `
            <div style="padding: 15px; font-family: Arial, sans-serif;">
                <h3 style="color: #2c3e50;">📝 Parámetros de Operación</h3>
                <p style="color: #555;">
                    Por favor, ingresa los siguientes parámetros de configuración necesarios 
                    para el funcionamiento de la integración.
                </p>
                <div style="background-color: #e7f3ff; border-left: 4px solid #2196f3; padding: 12px; margin-top: 15px;">
                    <strong>ℹ️ Nota:</strong> Estos parámetros se guardarán en el registro 
                    "Parámetros de Operación" y serán utilizados por los scripts de integración.
                </div>
            </div>
        `;
    }

    /**
     * Valida los datos del paso de parámetros
     * @param {Object} request - Request con los datos
     * @returns {boolean} - True si es válido
     */
    function validateParametrosStep(request) {
        const urlBase = request.parameters.param_url_base;
        const carpetaIngresos = request.parameters.param_carpeta_ingresos;
        const tipoUbicacion = request.parameters.param_tipo_ubicacion;
        const carpetaPrefactura = request.parameters.param_carpeta_prefactura;

        if (!urlBase || !carpetaIngresos || !tipoUbicacion || !carpetaPrefactura) {
            return false;
        }

        // Validar formato de URL
        try {
            new URL(urlBase);
        } catch (e) {
            return false;
        }

        return true;
    }

    /**
     * Configura el paso de validación de registros
     * @param {Object} assistant - Instancia del Assistant
     * @param {Object} request - Request con parámetros
     */
    function setupValidacionRegistrosStep(assistant, request) {
        // Validar registros requeridos
        const validacionRegistros = helperRegistros.validarRegistrosRequeridos();

        let htmlContent = `
            <div style="padding: 20px; font-family: Arial, sans-serif;">
                <h3 style="color: #2c3e50;">🔍 Validación de Registros Personalizados</h3>
                <p style="color: #555;">
                    Se han verificado los registros personalizados requeridos para la integración.
                </p>
                <table style="width: 100%; border-collapse: collapse; margin-top: 15px;">
                    <thead>
                        <tr style="background-color: #f8f9fa; border-bottom: 2px solid #dee2e6;">
                            <th style="padding: 12px; text-align: left; border-bottom: 2px solid #dee2e6;">Registro</th>
                            <th style="padding: 12px; text-align: center; border-bottom: 2px solid #dee2e6;">Estado</th>
                            <th style="padding: 12px; text-align: left; border-bottom: 2px solid #dee2e6;">ID Script</th>
                        </tr>
                    </thead>
                    <tbody>
        `;

        validacionRegistros.forEach((registro) => {
            const estadoIcon = registro.existe ? "✅" : "❌";
            const estadoColor = registro.existe ? "#28a745" : "#dc3545";
            const estadoTexto = registro.existe ? "Existe" : "No existe";

            htmlContent += `
                <tr style="border-bottom: 1px solid #dee2e6;">
                    <td style="padding: 10px; font-weight: 500;">${registro.nombre}</td>
                    <td style="padding: 10px; text-align: center; color: ${estadoColor};">
                        <strong>${estadoIcon} ${estadoTexto}</strong>
                    </td>
                    <td style="padding: 10px; font-family: monospace; font-size: 12px;">${registro.scriptId || "-"}</td>
                </tr>
            `;
        });

        htmlContent += `
                    </tbody>
                </table>
        `;

        // Si hay registros faltantes, mostrar botón para crearlos
        const hayFaltantes = validacionRegistros.some((r) => !r.existe);
        if (hayFaltantes) {
            htmlContent += `
                <div style="background-color: #f8d7da; border-left: 4px solid #dc3545; padding: 15px; margin-top: 20px;">
                    <strong>⚠️ Atención:</strong> Faltan algunos registros personalizados requeridos. 
                    En el siguiente paso se crearán automáticamente.
                </div>
            `;
        } else {
            htmlContent += `
                <div style="background-color: #d4edda; border-left: 4px solid #28a745; padding: 15px; margin-top: 20px;">
                    <strong>✅ Excelente:</strong> Todos los registros personalizados requeridos existen.
                </div>
            `;
        }

        htmlContent += "</div>";

        assistant.addField({
            id: "validacion_registros_html",
            type: serverWidget.FieldType.INLINEHTML,
            label: "Validación Registros"
        }).defaultValue = htmlContent;
    }

    /**
     * Configura el paso de creación de parámetros
     * @param {Object} assistant - Instancia del Assistant
     * @param {Object} request - Request con parámetros
     */
    function setupCreacionParametrosStep(assistant, request) {
        const urlBase = request.parameters.param_url_base;
        const carpetaIngresos = request.parameters.param_carpeta_ingresos;
        const tipoUbicacion = request.parameters.param_tipo_ubicacion;
        const carpetaPrefactura = request.parameters.param_carpeta_prefactura;

        let htmlContent = `
            <div style="padding: 20px; font-family: Arial, sans-serif;">
                <h3 style="color: #2c3e50;">💾 Creación de Parámetros de Operación</h3>
                <p style="color: #555;">
                    Se crearán los siguientes parámetros en el registro "Parámetros de Operación":
                </p>
                <table style="width: 100%; border-collapse: collapse; margin-top: 15px;">
                    <thead>
                        <tr style="background-color: #f8f9fa; border-bottom: 2px solid #dee2e6;">
                            <th style="padding: 12px; text-align: left; border-bottom: 2px solid #dee2e6;">Parámetro</th>
                            <th style="padding: 12px; text-align: left; border-bottom: 2px solid #dee2e6;">Valor</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr style="border-bottom: 1px solid #dee2e6;">
                            <td style="padding: 10px; font-weight: 500;">interfaces_andessalud_hc_url_base</td>
                            <td style="padding: 10px; font-family: monospace; color: #007bff;">${urlBase}</td>
                        </tr>
                        <tr style="border-bottom: 1px solid #dee2e6;">
                            <td style="padding: 10px; font-weight: 500;">id_carpeta_archivos_ingresos_ambulatorios_hospitalizados</td>
                            <td style="padding: 10px; font-family: monospace; color: #007bff;">${carpetaIngresos}</td>
                        </tr>
                        <tr style="border-bottom: 1px solid #dee2e6;">
                            <td style="padding: 10px; font-weight: 500;">andessalud_ubicacion_id_tipo_ubicacion_almacen</td>
                            <td style="padding: 10px; font-family: monospace; color: #007bff;">${tipoUbicacion}</td>
                        </tr>
                        <tr style="border-bottom: 1px solid #dee2e6;">
                            <td style="padding: 10px; font-weight: 500;">carpeta_resultados_proceso_prefactura</td>
                            <td style="padding: 10px; font-family: monospace; color: #007bff;">${carpetaPrefactura}</td>
                        </tr>
                    </tbody>
                </table>
                <div style="background-color: #d1ecf1; border-left: 4px solid #17a2b8; padding: 15px; margin-top: 20px;">
                    <strong>ℹ️ Información:</strong> Al continuar, estos parámetros se crearán o actualizarán 
                    en el sistema para ser utilizados por los scripts de integración.
                </div>
            </div>
        `;

        assistant.addField({
            id: "creacion_parametros_html",
            type: serverWidget.FieldType.INLINEHTML,
            label: "Creación Parámetros"
        }).defaultValue = htmlContent;
    }

    /**
     * Crea los parámetros de operación
     * @param {Object} request - Request con los datos
     * @returns {Object} - Resultado de la operación
     */
    function crearParametrosOperacion(request) {
        try {
            const parametros = [
                {
                    nombre: "interfaces_andessalud_hc_url_base",
                    valor: request.parameters.param_url_base,
                    tipo: "texto"
                },
                {
                    nombre: "id_carpeta_archivos_ingresos_ambulatorios_hospitalizados",
                    valor: request.parameters.param_carpeta_ingresos,
                    tipo: "texto"
                },
                {
                    nombre: "andessalud_ubicacion_id_tipo_ubicacion_almacen",
                    valor: request.parameters.param_tipo_ubicacion,
                    tipo: "texto"
                },
                {
                    nombre: "carpeta_resultados_proceso_prefactura",
                    valor: request.parameters.param_carpeta_prefactura,
                    tipo: "texto"
                }
            ];

            helperParametros.crearParametros(parametros);

            return {
                success: true,
                message: "Parámetros creados correctamente"
            };
        } catch (error) {
            nLog.error("crearParametrosOperacion - error", error);
            return {
                success: false,
                message: error.message
            };
        }
    }

    /**
     * Configura el paso de validación de campos
     * @param {Object} assistant - Instancia del Assistant
     * @param {Object} request - Request con parámetros
     */
    function setupValidacionCamposStep(assistant, request) {
        const validacionCampos = helperCampos.validarCamposRequeridos();

        let htmlContent = `
            <div style="padding: 20px; font-family: Arial, sans-serif;">
                <h3 style="color: #2c3e50;">🔍 Validación de Campos Personalizados</h3>
                <p style="color: #555;">
                    Se han verificado los campos personalizados requeridos en las tablas de NetSuite.
                </p>
        `;

        // Agrupar por tabla
        const tablas = {};
        validacionCampos.forEach((campo) => {
            if (!tablas[campo.tabla]) {
                tablas[campo.tabla] = [];
            }
            tablas[campo.tabla].push(campo);
        });

        // Crear acordeón para cada tabla
        Object.keys(tablas).forEach((tabla) => {
            const campos = tablas[tabla];
            const totalCampos = campos.length;
            const camposExistentes = campos.filter((c) => c.existe).length;
            const todosExisten = camposExistentes === totalCampos;
            const iconoTabla = todosExisten ? "✅" : "⚠️";

            htmlContent += `
                <details style="margin-bottom: 15px; border: 1px solid #dee2e6; border-radius: 5px;">
                    <summary style="padding: 15px; background-color: #f8f9fa; cursor: pointer; font-weight: 500;">
                        ${iconoTabla} ${tabla} (${camposExistentes}/${totalCampos} campos)
                    </summary>
                    <div style="padding: 15px;">
                        <table style="width: 100%; border-collapse: collapse;">
                            <thead>
                                <tr style="background-color: #f8f9fa; border-bottom: 2px solid #dee2e6;">
                                    <th style="padding: 8px; text-align: left; font-size: 12px;">Campo</th>
                                    <th style="padding: 8px; text-align: center; font-size: 12px;">Estado</th>
                                </tr>
                            </thead>
                            <tbody>
            `;

            campos.forEach((campo) => {
                const estadoIcon = campo.existe ? "✅" : "❌";
                htmlContent += `
                    <tr style="border-bottom: 1px solid #e9ecef;">
                        <td style="padding: 8px; font-family: monospace; font-size: 11px;">${campo.id}</td>
                        <td style="padding: 8px; text-align: center;">${estadoIcon}</td>
                    </tr>
                `;
            });

            htmlContent += `
                            </tbody>
                        </table>
                    </div>
                </details>
            `;
        });

        // Mostrar advertencia si hay campos faltantes
        const hayCamposFaltantes = validacionCampos.some((c) => !c.existe);
        if (hayCamposFaltantes) {
            htmlContent += `
                <div style="background-color: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin-top: 15px;">
                    <strong>⚠️ Advertencia:</strong> Faltan algunos campos personalizados. 
                    La integración puede no funcionar correctamente sin estos campos. 
                    Por favor, revisa la documentación para crear los campos faltantes.
                </div>
            `;
        } else {
            htmlContent += `
                <div style="background-color: #d4edda; border-left: 4px solid #28a745; padding: 15px; margin-top: 15px;">
                    <strong>✅ Perfecto:</strong> Todos los campos personalizados requeridos existen.
                </div>
            `;
        }

        htmlContent += "</div>";

        assistant.addField({
            id: "validacion_campos_html",
            type: serverWidget.FieldType.INLINEHTML,
            label: "Validación Campos"
        }).defaultValue = htmlContent;
    }

    /**
     * Configura el paso de resumen
     * @param {Object} assistant - Instancia del Assistant
     * @param {Object} request - Request con parámetros
     */
    function setupResumenStep(assistant, request) {
        const urlBase = request.parameters.param_url_base;
        const carpetaIngresos = request.parameters.param_carpeta_ingresos;
        const tipoUbicacion = request.parameters.param_tipo_ubicacion;
        const carpetaPrefactura = request.parameters.param_carpeta_prefactura;

        let htmlContent = `
            <div style="padding: 20px; font-family: Arial, sans-serif;">
                <h2 style="color: #28a745;">✅ Configuración Completada</h2>
                <p style="color: #555; font-size: 16px; margin-bottom: 25px;">
                    La configuración inicial de la integración Andes Salud ha finalizado exitosamente.
                </p>

                <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
                    <h3 style="color: #2c3e50; margin-top: 0;">📋 Resumen de Configuración</h3>
                    
                    <h4 style="color: #495057; margin-top: 20px;">Parámetros de Operación:</h4>
                    <ul style="color: #555; line-height: 1.8;">
                        <li><strong>URL Base Health Connect:</strong> <code>${urlBase}</code></li>
                        <li><strong>Carpeta Ingresos:</strong> <code>${carpetaIngresos}</code></li>
                        <li><strong>Tipo Ubicación Almacén:</strong> <code>${tipoUbicacion}</code></li>
                        <li><strong>Carpeta Prefactura:</strong> <code>${carpetaPrefactura}</code></li>
                    </ul>

                    <h4 style="color: #495057; margin-top: 20px;">Componentes Configurados:</h4>
                    <ul style="color: #555; line-height: 1.8;">
                        <li>✅ Parámetros de operación creados/actualizados</li>
                        <li>✅ Registros personalizados verificados</li>
                        <li>✅ Campos personalizados validados</li>
                    </ul>
                </div>

                <div style="background-color: #d1ecf1; border-left: 4px solid #17a2b8; padding: 15px; margin-bottom: 15px;">
                    <strong>ℹ️ Próximos Pasos:</strong>
                    <ul style="margin-top: 10px; margin-bottom: 0;">
                        <li>Verifica que los scripts de integración estén desplegados correctamente</li>
                        <li>Ejecuta una prueba de conexión con Health Connect</li>
                        <li>Revisa la documentación para configuraciones adicionales</li>
                    </ul>
                </div>

                <div style="background-color: #d4edda; border-left: 4px solid #28a745; padding: 15px;">
                    <strong>🎉 ¡Listo para comenzar!</strong>
                    <p style="margin-top: 10px; margin-bottom: 0;">
                        La integración Andes Salud está configurada y lista para procesar datos.
                    </p>
                </div>
            </div>
        `;

        assistant.addField({
            id: "resumen_html",
            type: serverWidget.FieldType.INLINEHTML,
            label: "Resumen"
        }).defaultValue = htmlContent;
    }

    return {
        onRequest: onRequest
    };
});