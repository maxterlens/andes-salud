/**
 * @NApiVersion 2.1
 * @module ./2win_dom_solicitud_consumo.js
 * @NModuleScope Public
 */
define([
    "N/file",
    "N/log",
    "N/record",
    "N/redirect",
    "N/render",
    "N/runtime",
    "../dao/2win_dao_2win_solicitud_consumo_det",
    "../dao/2win_dao_2win_solicitud_consumo",
    "../dao/2win_dao_ajuste_inventario",
    "../dao/2win_dao_balance_inventario",
    "../dao/2win_dao_config",
    "../dao/2win_dao_static_params_operacion",
    "../dao/2win_dao_ubicacion",
    "../lib/2win_lib_auditoria",
    "../lib/2win_lib_email"
], function (
    file, 
    nLog, 
    record, 
    redirect, 
    render, 
    runtime,
    daoSolicitudConsumoDetalle, 
    daoSolicitudConsumo, 
    daoAjusteInventario, 
    daoBalanceInventario,
    daoConfig,
    daoParametrosOperacion,
    daoUbicacion,
    libAuditoria,
    libEmail
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
        ENVIADA: "8",
        CERRADA: "9"
    };

    /**
     * @function eventoGeneracionPdf - Función para procesar evento de un registro en netsuite.
     * @param {Object} parametro - Parametro para ejecucion.
     * @returns {Object} - Datos de ejecucion.
     */
    function eventoGeneracionPdf(parametro) {
        try {
            nLog.audit("eventoGeneracionPdf - parametro", parametro);
            
            // Ajustar objeto proceso
            proceso.etapa = eventoGeneracionPdf.name;
            proceso.scriptId = runtime.getCurrentScript().id;
            proceso.tokenProceso = libAuditoria.obtenerToken(); // Generar token para auditoria
            proceso.tipoRegistroCreado = parametro.type;
            proceso.idRegistroCreado = parametro.id;

            /**@description - Enviar datos a plantilla avanzada para generar PDF segun datos recuperados de registro */

            // Recuperar logo de ambiente
            // Variables para recuperar parametros de operacion requeridos
            let nombresParmetrosOperacion = ["andessalud_solicitud_consumo_logo_ambiente"];
            let valoresParametrosOperacion = [];

            // Recuperar cada parametro de operacion
            nombresParmetrosOperacion.forEach(function (nombreParametro) {
                let parametroOperacion = daoParametrosOperacion.getParam(nombreParametro);
                nLog.debug("eventoGeneracionPdf - parametroOperacion", parametroOperacion);
                valoresParametrosOperacion.push(parametroOperacion);
            });
            nLog.debug("eventoGeneracionPdf - valoresParametrosOperacion", valoresParametrosOperacion);

            let urlLogoAmbiente = valoresParametrosOperacion[0].text
            
            // Recuperar lineas detalle
            let datosLineasDetalle = daoSolicitudConsumoDetalle.obtenerRegistroPorIdReferencia(parametro.id);

            // Crear renderer
            let renderer = render.create();
            
            // Asignar el scriptId de la plantilla avanzada
            renderer.setTemplateByScriptId({ scriptId: "CUSTTMPL_2WIN_CONSTANCIA_ENTREGA" }); // Mayuscula evita error

            // Agregar record con alias record esperado por plantilla
            renderer.addRecord({ templateName: "record", record: parametro });

            // Agregar objeto con alias "childLines" que contiene datos de lineas detalle recuperadas
            renderer.addCustomDataSource({
                format: render.DataSource.OBJECT,
                alias: "childLines", // Alias esperado por plantilla
                data: { data: datosLineasDetalle }
            });

            renderer.addCustomDataSource({
                format: render.DataSource.OBJECT,
                alias: "urlLogoAmbiente", // Alias esperado por plantilla
                data: { data: urlLogoAmbiente }
            });

            // Renderizar pdf
            let pdfFile = renderer.renderAsPdf();
            nLog.audit("eventoGeneracionPdf - pdfFile", pdfFile);

            // Crear registro auditoria
            proceso.descripcionResultado = "procesado correctamente";
            // libAuditoria.crearReporteAuditoria(proceso);

            return pdfFile;
        } catch (error) {
            nLog.error("eventoGeneracionPdf - error", error);
            
            // Crear registro auditoria
            proceso.estado = "001";
            proceso.descripcionResultado = error.message;
            // libAuditoria.crearReporteAuditoria(proceso);

            throw error;
        }
    }

    /**
     * @function generarBotonConsumir - Función para procesar evento de un registro en netsuite.
     * @param {Object} usuarioActual - Parametro para ejecucion.
     * @param {Object} formulario - Parametro para ejecucion.
     * @param {Object} objetoRegistro - Parametro para ejecucion.
     * @returns {Object} - Datos de ejecucion.
     */
    function generarBotonConsumir(usuarioActual, formulario, objetoRegistro) {
        try {
            nLog.audit("generarBotonConsumir - parametro", {
                usuarioActual: usuarioActual,
                formulario: formulario,
                objetoRegistro: objetoRegistro
            });
            
            // Ajustar objeto proceso
            proceso.etapa = generarBotonConsumir.name;
            proceso.scriptId = runtime.getCurrentScript().id;
            proceso.tokenProceso = libAuditoria.obtenerToken(); // Generar token para auditoria
            proceso.tipoRegistroCreado = objetoRegistro.type;
            proceso.idRegistroCreado = objetoRegistro.id;
            
            // Recuperar ubicacion seleccionada en registro
            const ubicacionId = objetoRegistro.getValue("custrecord_2win_consumo_ubicacion");

            // Recuperar responsable de ubicacion
            const idResponsableUbicacion = daoUbicacion.determinarResponsableUbicacion(ubicacionId);

            // Recuperar id de usuario actual
            const idUsuarioActual = String(usuarioActual.id);
            nLog.debug("generarBotonConsumir - ids", {
                idResponsableUbicacion: idResponsableUbicacion,
                idUsuarioActual: idUsuarioActual
            })

            // Validar si el usuario actual es el responsable de ubicacion
            if (idUsuarioActual === idResponsableUbicacion) {
                // Agregar boton para consumir a formulario
                formulario.addButton({
                    id: "custpage_btn_consumir",
                    label: "Consumir",
                    functionName: `consumirSolicitud(${objetoRegistro.id})` // Funcion inyectada en el user event
                });
            } else {
                nLog.audit("generarBotonConsumir - false", "El id de usuario actual: " + idUsuarioActual + " no es responsable de la ubicacion: " + idResponsableUbicacion);
            };

            // Crear registro auditoria
            proceso.descripcionResultado = "procesado correctamente";
            // libAuditoria.crearReporteAuditoria(proceso);

        } catch (error) {
            nLog.error("generarBotonConsumir - error", error);
            
            // Crear registro auditoria
            proceso.estado = "001";
            proceso.descripcionResultado = error.message;
            // libAuditoria.crearReporteAuditoria(proceso);

            throw error;
        }
    }

    /**
     * @function procesarConsumo - Función para procesar evento de un registro en netsuite.
     * @param {Object} parametro - Parametro para ejecucion.
     * @returns {Object} - Datos de ejecucion.
     */
    function procesarConsumo(parametro) {
        try {
            nLog.audit("procesarConsumo - parametro", parametro);
            
            // Ajustar objeto proceso
            proceso.etapa = procesarConsumo.name;
            proceso.scriptId = runtime.getCurrentScript().id;
            proceso.tokenProceso = libAuditoria.obtenerToken(); // Generar token para auditoria
            proceso.tipoRegistroCreado = "customrecord_2win_solicitud_consumo";
            proceso.idRegistroCreado = parametro.request.parameters.solicitud

            // Recuperar parametro de id registro solicitud
            const solicitudId = parametro.request.parameters.solicitud

            // Recuperar url de registro para redireccionar en caso de error
            const urlOrigen = libEmail.recuperarUrlRegistro({recordType: "customrecord_2win_solicitud_consumo", recordId: solicitudId});
            const urlOrigenHtml = encodeURIComponent(urlOrigen); // Url para usar en html

            // Recuperar datos del registro solicitud
            const registroSolicitud = daoSolicitudConsumo.recuperarCamposRegistro({type: "customrecord_2win_solicitud_consumo", id: solicitudId});

            // Validar estado de solicitud
            if (registroSolicitud.custrecord_2win_consumo_estado !== ESTADOS.ENVIADA) {
                throw new Error("La solicitud no está en estado Enviada");
            };

            // Recuperar lineas de detalle solicitud
            const lineas = daoSolicitudConsumoDetalle.recuperarLineasParaConfirmarConsumo(solicitudId);

            // Validar lineas recuperadas
            if (!lineas || lineas.length === 0) {
                throw new Error("No se encontraron líneas para esta solicitud");
            };

            // Agrupar lineas por centro de costo
            const lineasPorCC = {};
            const internalidsAriculos = [];

            lineas.forEach((linea) => {
                const departamentoId = linea.getValue("custrecord_2win_consumo_det_departamento");
                const key = departamentoId || "SIN_CC";

                /**@description - Se podria agregar un elemento unico sin agrupar por key */
                if (!lineasPorCC[key]) {
                    lineasPorCC[key] = {
                        departamentoId: departamentoId,
                        lineas: []
                    };
                }

                lineasPorCC[key].lineas.push({
                    articuloId: linea.getValue("custrecord_2win_consumo_det_articulo"),
                    articuloNombre: linea.getText("custrecord_2win_consumo_det_articulo"),
                    cantidad: linea.getValue("custrecord_2win_consumo_det_cantidad"),
                    ubicacionId: linea.getValue("custrecord_2win_consumo_det_ubicacion"),
                    unidad: linea.getValue("custrecord_2win_consumo_det_unidad")
                });
                internalidsAriculos.push(linea.getValue("custrecord_2win_consumo_det_articulo"))
            });
            
            // Crear ajuste inventario - 1 por centro de costo
            const ajustesCreados = [];
            const solicitudRec = record.load({ type: "customrecord_2win_solicitud_consumo", id: solicitudId });

            for (let ccKey in lineasPorCC) {
                const grupo = lineasPorCC[ccKey];
                const ajusteId = daoAjusteInventario.crearAjusteInventario(internalidsAriculos, grupo, solicitudRec);
                ajustesCreados.push(ajusteId);
                nLog.audit("procesarConsumo - ajusteId", {
                    ajusteId: ajusteId,
                    ccKey: ccKey
                });
            }
            // nLog.audit("procesarConsumo - ajustesCreados", { 
            //     extension: ajustesCreados.length,
            //     ajustesCreados: ajustesCreados 
            // });

            // Actualizar campos de solicitud en base a datos procesados
            record.submitFields({
                type: "customrecord_2win_solicitud_consumo",
                id: solicitudId,
                values: {
                    custrecord_2win_consumo_estado: ESTADOS.CERRADA,
                    custrecord_2win_consumo_ajustes_ids: ajustesCreados.join(", ")
                }
            });

            // Crear registro auditoria
            proceso.descripcionResultado = "procesado correctamente";
            libAuditoria.crearReporteAuditoria(proceso);

            // Redirigir de vuelta a la solicitud
            redirect.toRecord({
                type: "customrecord_2win_solicitud_consumo",
                id: solicitudId
            });
            
        } catch (error) {
            nLog.error("procesarConsumo - error", error);
            
            // Crear registro auditoria
            proceso.estado = "001";
            proceso.descripcionResultado = error.message;
            libAuditoria.crearReporteAuditoria(proceso);

            throw error;
        }
    }

    return {
        eventoGeneracionPdf: eventoGeneracionPdf,
        generarBotonConsumir: generarBotonConsumir,
        procesarConsumo: procesarConsumo
    };
});