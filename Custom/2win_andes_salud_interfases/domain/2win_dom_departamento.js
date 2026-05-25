/**
 * @NApiVersion 2.1
 * @module ./2win_dom_departamento.js
 * @NModuleScope Public
 */
define([
    "../lib/2win_lib_auditoria",
    "../lib/2win_lib_custodia",
    "../lib/2win_lib_formato",
    "../lib/moment",
    "../dao/2win_dao_departamento",
    "../dao/2win_dao_static_params_operacion",
    "N/log",
    "N/runtime"
], function (libAuditoria, libCustodia, libFormato, moment, daoDepartamento, daoParametrosOperacion, nLog, runtime) {
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
     * @function eventoCreacionRegistro - Función para procesar evento de un registro en netsuite.
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
            custodia.custrecord_2win_as_interface = "creacion centro de costos send in"; // "creacion_centro_de_costos_send_in"
            custodia.externalid = `creacion_centro_de_costos_send_in_${parametro.id}`;
            custodia.custrecord_2win_as_id_registro = parametro.id;

            // Ejecutar busqueda para validar existencia de registro custodia para el mensaje
            custodia.registroExistente = libCustodia.busquedaRegistroPorExternalid(custodia.externalid);

            // Nombres de parametros de operacion necesarios
            let nombresParmetrosOperacion = ["interfaces_andessalud_hc_url_base"];
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
                tipoMensaje: "SEND^IN",
                datos: {
                    FechaCreacion: moment().format("YYYY-MM-DD")
                }
            };
            cuerpoPeticion.datos.CentroCosto = daoDepartamento.recuperarCamposRegistro(parametro);
            custodia.datosEntrada = JSON.stringify(cuerpoPeticion);
            nLog.debug("eventoCreacionRegistro - cuerpoPeticion", cuerpoPeticion);

            // Validar que el cuerpo de la peticion tenga los datos esperados
            let propiedadesEsperadas = ["CodServicio", "NombreServicio", "Vigente", "Usuario"];
            libFormato.verificarPropiedades(cuerpoPeticion.datos.CentroCosto, propiedadesEsperadas);

            // Ejecutar peticion al servicio externo
            let respuesta = daoDepartamento.enviarRegistro(`${valoresParametrosOperacion[0].text}/creacion-centrocosto`, cuerpoPeticion);

            // Validar codigo de respuesta
            if (respuesta.code !== 202) {
                throw new Error(`Error peticion - codigo: ${respuesta.code} - cuerpo: ${JSON.stringify(respuesta.body)}`);
            } else {
                // Parsear cuerpo respuesta
                let bodyParseado = JSON.parse(respuesta.body);
                nLog.debug("eventoCreacionRegistro - bodyParseado", bodyParseado);

                // Validar que el cuerpo de la respuesta contenga datos
                if (bodyParseado.length > 0) {
                    // Validar propiedades en cuerpo de respuesta
                    if (bodyParseado[0].tipoMensaje !== cuerpoPeticion.tipoMensaje || !bodyParseado[0].estado.success || bodyParseado[0].estado.codigo !== 202) {
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
     * @function eventoEdicionRegistro - Función para procesar evento de un registro en netsuite.
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
            custodia.custrecord_2win_as_interface = "edicion centro de costos send upd"; // "edicion_centro_de_costos_send_upd"
            custodia.externalid = `edicion_centro_de_costos_send_upd_${parametro.id}`;
            custodia.custrecord_2win_as_id_registro = parametro.id;

            // Ejecutar busqueda para validar existencia de registro custodia para el mensaje
            custodia.registroExistente = libCustodia.busquedaRegistroPorExternalid(custodia.externalid);

            // Nombres de parametros de operacion necesarios
            let nombresParmetrosOperacion = ["interfaces_andessalud_hc_url_base"];
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
                tipoMensaje: "SEND^UPD",
                datos: {
                    FechaActualizacion: moment().format("YYYY-MM-DD")
                }
            };
            cuerpoPeticion.datos.CentroCosto = daoDepartamento.recuperarCamposRegistro(parametro);
            cuerpoPeticion.datos.CentroCosto.Usuario = runtime.getCurrentUser().name;
            custodia.datosEntrada = JSON.stringify(cuerpoPeticion);
            nLog.debug("eventoEdicionRegistro - cuerpoPeticion", cuerpoPeticion);

            // Validar que el cuerpo de la peticion tenga los datos esperados
            let propiedadesEsperadas = ["CodServicio", "NombreServicio", "Vigente", "Usuario"];
            libFormato.verificarPropiedades(cuerpoPeticion.datos.CentroCosto, propiedadesEsperadas);

            // Ejecutar peticion al servicio externo
            let respuesta = daoDepartamento.enviarRegistro(`${valoresParametrosOperacion[0].text}/upd-centrocosto`, cuerpoPeticion);

            // Validar codigo de respuesta
            if (respuesta.code !== 202) {
                throw new Error(`Error peticion - codigo: ${respuesta.code} - cuerpo: ${JSON.stringify(respuesta.body)}`);
            } else {
                // Parsear cuerpo respuesta
                let bodyParseado = JSON.parse(respuesta.body);
                nLog.debug("eventoEdicionRegistro - bodyParseado", bodyParseado);

                // Validar que el cuerpo de la respuesta contenga datos
                if (bodyParseado.length > 0) {
                    // Validar propiedades en cuerpo de respuesta
                    if (bodyParseado[0].tipoMensaje !== cuerpoPeticion.tipoMensaje || !bodyParseado[0].estado.success || bodyParseado[0].estado.codigo !== 202) {
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
     * @function eventoEliminacionRegistro - Función para procesar evento de un registro en netsuite.
     * @param {Object} parametro - Parametro para ejecucion.
     * @returns {Object} - Datos de ejecucion.
     */
    function eventoEliminacionRegistro(parametro) {
        try {
            nLog.audit("eventoEliminacionRegistro - parametro", parametro);

            // Ajustar objeto proceso
            proceso.etapa = eventoEliminacionRegistro.name;
            proceso.scriptId = runtime.getCurrentScript().id;
            proceso.tokenProceso = libAuditoria.obtenerToken(); // Generar token para auditoria
            proceso.tipoRegistroCreado = parametro.type;
            proceso.idRegistroCreado = parametro.id;
            custodia.custrecord_2win_as_tiempo_proceso = Date.now(); // Marca de inicio
            custodia.custrecord_2win_as_interface = "eliminacion centro de costos send del"; // eliminacion_centro_de_costos_send_del
            custodia.externalid = `eliminacion_centro_de_costos_send_del_${parametro.id}`;
            custodia.custrecord_2win_as_id_registro = parametro.id;

            // Ejecutar busqueda para validar existencia de registro custodia para el mensaje
            custodia.registroExistente = libCustodia.busquedaRegistroPorExternalid(custodia.externalid);

            // Nombres de parametros de operacion necesarios
            let nombresParmetrosOperacion = ["interfaces_andessalud_hc_url_base"];
            let valoresParametrosOperacion = [];

            // Recuperar cada parametro de operacion
            nombresParmetrosOperacion.forEach(function (nombreParametro) {
                let parametroOperacion = daoParametrosOperacion.getParam(nombreParametro);
                nLog.debug("eventoEliminacionRegistro - parametroOperacion", parametroOperacion);
                valoresParametrosOperacion.push(parametroOperacion);
            });
            nLog.debug("eventoEliminacionRegistro - valoresParametrosOperacion", valoresParametrosOperacion);
            
            // Recuperar campos de registro
            let cuerpoPeticion = {
                tipoMensaje: "SEND^DEL",
                datos: {
                    FechaEliminacion: moment().format("YYYY-MM-DD"),
                    CentroCosto: {
                        CodServicio: String(parametro.id),
                        Vigente: "N",
                        Usuario: runtime.getCurrentUser().name // Se obtiene del usuario actual porque no se puede cargar del registro
                    }
                }
            };
            custodia.datosEntrada = JSON.stringify(cuerpoPeticion);
            nLog.debug("eventoEliminacionRegistro - cuerpoPeticion", cuerpoPeticion);

            // Validar que el cuerpo de la peticion tenga los datos esperados
            let propiedadesEsperadas = ["CodServicio", "Vigente", "Usuario"];
            libFormato.verificarPropiedades(cuerpoPeticion.datos.CentroCosto, propiedadesEsperadas);

            // Ejecutar peticion al servicio externo
            let respuesta = daoDepartamento.enviarRegistro(`${valoresParametrosOperacion[0].text}/del-centrocosto`, cuerpoPeticion);

            // Validar codigo de respuesta
            if (respuesta.code !== 202) {
                throw new Error(`Error peticion - codigo: ${respuesta.code} - cuerpo: ${JSON.stringify(respuesta.body)}`);
            } else {
                // Parsear cuerpo respuesta
                let bodyParseado = JSON.parse(respuesta.body);
                nLog.debug("eventoEliminacionRegistro - bodyParseado", bodyParseado);

                // Validar que el cuerpo de la respuesta contenga datos
                if (bodyParseado.length > 0) {
                    // Validar propiedades en cuerpo de respuesta
                    if (bodyParseado[0].tipoMensaje !== cuerpoPeticion.tipoMensaje || !bodyParseado[0].estado.success || bodyParseado[0].estado.codigo !== 202) {
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
            nLog.error("eventoEliminacionRegistro - error", error);

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
     * @function reintentoEliminacion - Función para procesar evento de un registro en netsuite.
     * @param {Object} parametro - Parametro para ejecucion.
     * @returns {Object} - Datos de ejecucion.
     */
    function reintentoEliminacion(parametro) {
        try {
            nLog.audit("reintentoEliminacion - parametro", parametro);

            // Ajustar objeto proceso
            proceso.etapa = reintentoEliminacion.name;
            proceso.scriptId = runtime.getCurrentScript().id;
            proceso.tokenProceso = libAuditoria.obtenerToken(); // Generar token para auditoria
            proceso.tipoRegistroCreado = "department";
            proceso.idRegistroCreado = parametro.id;
            custodia.custrecord_2win_as_tiempo_proceso = Date.now(); // Marca de inicio
            custodia.custrecord_2win_as_interface = "eliminacion centro de costos send del"; // eliminacion_centro_de_costos_send_del
            custodia.externalid = `eliminacion_centro_de_costos_send_del_${parametro.datosEntrada.datos.CentroCosto.CodServicio}`;
            custodia.custrecord_2win_as_id_registro = parametro.id;

            // Ejecutar busqueda para validar existencia de registro custodia para el mensaje
            custodia.registroExistente = libCustodia.busquedaRegistroPorExternalid(custodia.externalid);

            // Nombres de parametros de operacion necesarios
            let nombresParmetrosOperacion = ["interfaces_andessalud_hc_url_base"];
            let valoresParametrosOperacion = [];

            // Recuperar cada parametro de operacion
            nombresParmetrosOperacion.forEach(function (nombreParametro) {
                let parametroOperacion = daoParametrosOperacion.getParam(nombreParametro);
                nLog.debug("reintentoEliminacion - parametroOperacion", parametroOperacion);
                valoresParametrosOperacion.push(parametroOperacion);
            });
            nLog.debug("reintentoEliminacion - valoresParametrosOperacion", valoresParametrosOperacion);
            
            // Aislar datos de entrada
            let cuerpoPeticion = parametro.datosEntrada;
            custodia.datosEntrada = JSON.stringify(cuerpoPeticion);
            nLog.debug("reintentoEliminacion - cuerpoPeticion", cuerpoPeticion);

            // Validar que el cuerpo de la peticion tenga los datos esperados
            let propiedadesEsperadas = ["CodServicio", "Vigente", "Usuario"];
            libFormato.verificarPropiedades(cuerpoPeticion.datos.CentroCosto, propiedadesEsperadas);

            // Ejecutar peticion al servicio externo
            let respuesta = daoDepartamento.enviarRegistro(`${valoresParametrosOperacion[0].text}/del-centrocosto`, cuerpoPeticion);

            // Validar codigo de respuesta
            if (respuesta.code !== 202) {
                throw new Error(`Error peticion - codigo: ${respuesta.code} - cuerpo: ${JSON.stringify(respuesta.body)}`);
            } else {
                // Parsear cuerpo respuesta
                let bodyParseado = JSON.parse(respuesta.body);
                nLog.debug("reintentoEliminacion - bodyParseado", bodyParseado);

                // Validar que el cuerpo de la respuesta contenga datos
                if (bodyParseado.length > 0) {
                    // Validar propiedades en cuerpo de respuesta
                    if (bodyParseado[0].tipoMensaje !== cuerpoPeticion.tipoMensaje || !bodyParseado[0].estado.success || bodyParseado[0].estado.codigo !== 202) {
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
            nLog.error("reintentoEliminacion - error", error);

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
        
        // Determinar qué evento llamar basándose en la interfaz
        if (tipoInterfaz.includes("creacion")) {
            // Cargar el registro original que necesita ser procesado
            const registro = daoDepartamento.getRecord(idRegistro);
            return eventoCreacionRegistro(registro);
        } else if (tipoInterfaz.includes("edicion")) {
            // Cargar el registro original que necesita ser procesado
            const registro = daoDepartamento.getRecord(idRegistro);
            return eventoEdicionRegistro(registro);
        } else if (tipoInterfaz.includes("eliminacion")) {
            // Recuperar datos de entrada del registro de custodia, dado que no es posible cargar registro eliminado
            let datosEntrada = custodiaRecord.getValue("custrecord_2win_as_datos_entrada");
            nLog.debug("reprocesarEvento - datosEntrada", datosEntrada);
            datosEntrada = JSON.parse(datosEntrada);

            // Definir parametro para reintento
            let parametro = {
                id: idRegistro,
                datosEntrada: datosEntrada
            };

            // Validar que los datos de entrada existan
            if (datosEntrada) {
                // Ejecutar reintento de envio detalles eliminacion
                return reintentoEliminacion(parametro);
            } else {
                throw new Error(`No hay datos de entrada para reprocesar en registro custodia: ${datosEntrada}`);
            }
        } else {
            throw new Error(`Tipo de interfaz no reconocido en custodia: ${tipoInterfaz}`);
        }
    }

    return {
        eventoCreacionRegistro: eventoCreacionRegistro,
        eventoEdicionRegistro: eventoEdicionRegistro,
        eventoEliminacionRegistro: eventoEliminacionRegistro,
        reprocesarEvento: reprocesarEvento
    };
});