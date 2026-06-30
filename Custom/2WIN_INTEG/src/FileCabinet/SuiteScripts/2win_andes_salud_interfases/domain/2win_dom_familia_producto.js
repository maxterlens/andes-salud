/**
 * @NApiVersion 2.1
 * @module ./2win_dom_familia_producto.js
 * @NModuleScope Public
 */
define([
    "../lib/2win_lib_auditoria",
    "../lib/2win_lib_custodia",
    "../lib/2win_lib_formato",
    "../dao/2win_dao_static_params_operacion",
    "../dao/2win_dao_familia_producto",
    "N/log",
    "N/runtime"
], function (libAuditoria, libCustodia, libFormato, daoParametrosOperacion, daoFamiliaProducto, nLog, runtime) {
    // Variable para almacenar datos del proceso
    let proceso = {
        nombreProceso: "Interfaces andes salud",
        scriptId: "",
        etapa: "",
        estado: "000",
        tokenProceso: "",
        descripcionResultado: ""
    };

    // Variable para almacenar datos de custodia
    let custodia = {};

    /**
     * @function eventoCreacionRegistro - Función para capturar evento de creacion de un registro en netsuite.
     * @param {Object} parametro - Parametro para ejecucion.
     * @returns {Object} - Datos de ejecucion.
     */
    function eventoCreacionRegistro(parametro) {
        try {
            nLog.audit("eventoCreacionRegistro - parametro", parametro);

            // Ajustar objeto proceso
            proceso.etapa = eventoCreacionRegistro.name;
            proceso.scriptId = runtime.getCurrentScript().id;
            proceso.tokenProceso = libAuditoria.obtenerToken(); // Generar token para auditoria
            proceso.tipoRegistroCreado = parametro.type;
            proceso.idRegistroCreado = parametro.id;
            custodia.custrecord_2win_as_tiempo_proceso = Date.now(); // Marca de inicio
            custodia.custrecord_2win_as_interface = "creacion familia_producto send in"; // "creacion_familia_producto_send_in"
            custodia.externalid = `creacion_familia_producto_send_in_${parametro.getValue({ fieldId: "custrecord_2w_codigo_ubicacion" })}`;
            custodia.custrecord_2win_as_id_registro = parametro.id;

            // Ejecutar busqueda para validar existencia de registro custodia para el mensaje
            custodia.registroExistente = libCustodia.busquedaRegistroPorExternalid(custodia.externalid);

            // Nombres de parametros de operacion necesarios
            let nombresParmetrosOperacion = ["interfaces_andessalud_hc_url_base", "intefaces_andessalud_hc_token"];
            let valoresParametrosOperacion = [];

            // Recuperar cada parametro de operacion
            nombresParmetrosOperacion.forEach(function (nombreParametro) {
                let parametroOperacion = daoParametrosOperacion.getParam(nombreParametro);
                nLog.debug("eventoCreacionRegistro - parametroOperacion", parametroOperacion);
                valoresParametrosOperacion.push(parametroOperacion);
            });
            nLog.debug("eventoCreacionRegistro - valoresParametrosOperacion", valoresParametrosOperacion);

            // Recuperar campos de registro
            let cuerpoPeticion = {
                tipoMensaje: "CREACION^FAMILIA^PRODUCTO",
                datos: {
                    FechaCreacion: libFormato.formatearFecha(new Date()),
                    ...daoFamiliaProducto.recuperarCamposRegistro(parametro)
                }
            };
            custodia.datosEntrada = JSON.stringify(cuerpoPeticion);
            nLog.debug("eventoCreacionRegistro - cuerpoPeticion", cuerpoPeticion);

            let url = `${valoresParametrosOperacion[0].text}/cre-familia-producto`;
            let respuesta = daoFamiliaProducto.enviarFamiliaProducto(url, cuerpoPeticion);

            if (respuesta.code !== 200 && respuesta.code !== 204) {
                throw new Error(`Error peticion - codigo: ${respuesta.code} - cuerpo: ${JSON.stringify(respuesta.body)}`);
            } else {
                // Parsear cuerpo respuesta
                let bodyParseado = JSON.parse(respuesta.body);
                nLog.debug("eventoCreacionRegistro - bodyParseado", bodyParseado);

                // Validar que el cuerpo de la respuesta contenga datos
                if (bodyParseado.length > 0) {
                    // Validar propiedades en cuerpo de respuesta
                    if (!bodyParseado[0].estado.success || (bodyParseado[0].estado.codigo !== 200 && bodyParseado[0].estado.codigo !== 204)) {
                        throw new Error(`Error respuesta - codigo: ${respuesta.code} - cuerpo: ${JSON.stringify(respuesta.body)}`);
                    }
                } else {
                    throw new Error(`Error respuesta - codigo: ${respuesta.code} - cuerpo: ${JSON.stringify(respuesta.body)}`);
                }
            }

            // Crear registro auditoria
            proceso.descripcionResultado = "Evento capturado exitosamente";
            libAuditoria.crearReporteAuditoria(proceso);

            custodia.codigoRespuesta = proceso.estado;
            custodia.respuesta = proceso.descripcionResultado;

            // Validar si existe registro de custodia
            if (custodia.registroExistente && custodia.registroExistente.length > 0 && custodia.registroExistente[0].codigoRespuesta !== "000") {
                custodia.internalid = custodia.registroExistente[0].internalid;
                // Actualizar registro de custodia
                proceso.registroCustodia = libCustodia.actualizarRegistro(custodia);
            }

            return proceso;
        } catch (error) {
            nLog.error("eventoCreacionRegistro - error", error);

            // Crear registro auditoria
            proceso.estado = "001";
            proceso.descripcionResultado = error.message;
            custodia.codigoRespuesta = proceso.estado;
            custodia.respuesta = error.message;
            libAuditoria.crearReporteAuditoria(proceso);

            // Validar si existe registro de custodia
            if (custodia.registroExistente && custodia.registroExistente.length > 0) {
                custodia.internalid = custodia.registroExistente[0].internalid;
                // Actualizar registro de custodia
                proceso.registroCustodia = libCustodia.actualizarRegistro(custodia);
            } else {
                custodia.reintentos = 0;
                // Crear registro de custodia
                proceso.registroCustodia = libCustodia.guardarOActualizarRegistro(custodia);
            }

            throw error;
        }
    }

    /**
     * @function eventoEdicionRegistro - Función para capturar evento de edicion de un registro en netsuite.
     * @param {Object} parametro - Parametro para ejecucion.
     * @returns {Object} - Datos de ejecucion.
     */
    function eventoEdicionRegistro(parametro) {
        try {
            nLog.audit("eventoEdicionRegistro - parametro", parametro);

            // Ajustar objeto proceso
            proceso.etapa = eventoEdicionRegistro.name;
            proceso.scriptId = runtime.getCurrentScript().id;
            proceso.tokenProceso = libAuditoria.obtenerToken(); // Generar token para auditoria
            proceso.tipoRegistroCreado = parametro.type;
            proceso.idRegistroCreado = parametro.id;
            custodia.custrecord_2win_as_tiempo_proceso = Date.now(); // Marca de inicio
            custodia.custrecord_2win_as_interface = "edicion familia_producto send upd"; // "edicion_familia_producto_send_upd"
            custodia.externalid = `edicion_familia_producto_send_upd_${parametro.getValue({ fieldId: "custrecord_2w_codigo_ubicacion" })}`;
            custodia.custrecord_2win_as_id_registro = parametro.id;

            // Ejecutar busqueda para validar existencia de registro custodia para el mensaje
            custodia.registroExistente = libCustodia.busquedaRegistroPorExternalid(custodia.externalid);

            // Nombres de parametros de operacion necesarios
            let nombresParmetrosOperacion = ["interfaces_andessalud_hc_url_base", "intefaces_andessalud_hc_token"];
            let valoresParametrosOperacion = [];

            // Recuperar cada parametro de operacion
            nombresParmetrosOperacion.forEach(function (nombreParametro) {
                let parametroOperacion = daoParametrosOperacion.getParam(nombreParametro);
                nLog.debug("eventoEdicionRegistro - parametroOperacion", parametroOperacion);
                valoresParametrosOperacion.push(parametroOperacion);
            });
            nLog.debug("eventoEdicionRegistro - valoresParametrosOperacion", valoresParametrosOperacion);

            // Recuperar campos de registro
            let cuerpoPeticion = {
                tipoMensaje: "MODIFICACION^FAMILIA^PRODUCTO",
                datos: {
                    FechaActualizacion: libFormato.formatearFecha(new Date()),
                    ...daoFamiliaProducto.recuperarCamposRegistro(parametro)
                }
            };
            custodia.datosEntrada = JSON.stringify(cuerpoPeticion);
            nLog.debug("eventoEdicionRegistro - cuerpoPeticion", cuerpoPeticion);

            // Ejecutar peticion al servicio externo usando el DAO
            let url = `${valoresParametrosOperacion[0].text}/upd-familia-producto`;
            let respuesta = daoFamiliaProducto.enviarFamiliaProducto(url, cuerpoPeticion);

            // Validar codigo de respuesta
            if (respuesta.code !== 200 && respuesta.code !== 204) {
                throw new Error(`Error peticion - codigo: ${respuesta.code} - cuerpo: ${JSON.stringify(respuesta.body)}`);
            } else {
                // Parsear cuerpo respuesta
                let bodyParseado = JSON.parse(respuesta.body);
                nLog.debug("eventoEdicionRegistro - bodyParseado", bodyParseado);

                // Validar que el cuerpo de la respuesta contenga datos
                if (bodyParseado.length > 0) {
                    // Validar propiedades en cuerpo de respuesta
                    if (!bodyParseado[0].estado.success || (bodyParseado[0].estado.codigo !== 200 && bodyParseado[0].estado.codigo !== 204)) {
                        throw new Error(`Error respuesta - codigo: ${respuesta.code} - cuerpo: ${JSON.stringify(respuesta.body)}`);
                    }
                } else {
                    throw new Error(`Error respuesta - codigo: ${respuesta.code} - cuerpo: ${JSON.stringify(respuesta.body)}`);
                }
            }

            // Crear registro auditoria
            proceso.descripcionResultado = "Evento capturado exitosamente";
            libAuditoria.crearReporteAuditoria(proceso);

            custodia.codigoRespuesta = proceso.estado;
            custodia.respuesta = proceso.descripcionResultado;

            // Validar si existe registro de custodia
            if (custodia.registroExistente && custodia.registroExistente.length > 0 && custodia.registroExistente[0].codigoRespuesta !== "000") {
                custodia.internalid = custodia.registroExistente[0].internalid;
                // Actualizar registro de custodia
                proceso.registroCustodia = libCustodia.actualizarRegistro(custodia);
            }

            return proceso;
        } catch (error) {
            nLog.error("eventoEdicionRegistro - error", error);

            // Crear registro auditoria
            proceso.estado = "001";
            proceso.descripcionResultado = error.message;
            custodia.codigoRespuesta = proceso.estado;
            custodia.respuesta = error.message;
            libAuditoria.crearReporteAuditoria(proceso);

            // Validar si existe registro de custodia
            if (custodia.registroExistente && custodia.registroExistente.length > 0) {
                custodia.internalid = custodia.registroExistente[0].internalid;
                // Actualizar registro de custodia
                proceso.registroCustodia = libCustodia.actualizarRegistro(custodia);
            } else {
                custodia.reintentos = 0;
                // Crear registro de custodia
                proceso.registroCustodia = libCustodia.guardarOActualizarRegistro(custodia);
            }

            throw error;
        }
    }

    /**
     * @function reprocesarEvento - Reprocesa un evento fallido desde el registro de custodia.
     * @param {Object} custodiaRecord - El registro de custodia que contiene los datos del evento a reprocesar.
     */
    function reprocesarEvento(custodiaRecord) {
        nLog.audit("reprocesarEvento - Iniciando reproceso para custodia ID:", custodiaRecord.id);
        const idRegistro = custodiaRecord.getValue("custrecord_2win_as_id_registro");
        const tipoInterfaz = custodiaRecord.getValue("custrecord_2win_as_interface");

        if (!idRegistro) {
            throw new Error("El registro de custodia no tiene un ID de registro asociado para reprocesar.");
        }

        const registro = daoFamiliaProducto.getRecord(idRegistro);

        if (tipoInterfaz.includes("creacion")) {
            return eventoCreacionRegistro(registro);
        } else if (tipoInterfaz.includes("edicion")) {
            return eventoEdicionRegistro(registro);
        } else {
            throw new Error(`Tipo de interfaz no reconocido en custodia: ${tipoInterfaz}`);
        }
    }

    return {
        eventoCreacionRegistro: eventoCreacionRegistro,
        eventoEdicionRegistro: eventoEdicionRegistro,
        reprocesarEvento: reprocesarEvento
    };
});
