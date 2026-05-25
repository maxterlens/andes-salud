/**
 * @NApiVersion 2.1
 * @module ./2win_dom_ubicacion.js
 * @NModuleScope Public
 */
define([
    "../lib/2win_lib_auditoria",
    "../lib/2win_lib_custodia",
    "../lib/2win_lib_formato",
    "../dao/2win_dao_static_params_operacion",
    "../dao/2win_dao_ubicacion",
    "./2win_dom_evento",
    "N/log",
    "N/runtime"
], function (libAuditoria, libCustodia, libFormato, daoParametrosOperacion, daoUbicacion, { EventService, ExternalEventServiceAdapter, NivelEvento }, nLog, runtime) {
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
            custodia.custrecord_2win_as_interface = "creacion bodega send in"; // "creacion_bodega_send_in"
            custodia.externalid = `creacion_bodega_send_in_${parametro.getValue({ fieldId: "custrecord_2w_codigo_ubicacion" })}`;
            custodia.custrecord_2win_as_id_registro = parametro.id;

            // Ejecutar busqueda para validar existencia de registro custodia para el mensaje
            custodia.registroExistente = libCustodia.busquedaRegistroPorExternalid(custodia.externalid);

            // Nombres de parametros de operacion necesarios
            let nombresParmetrosOperacion = ["andessalud_ubicacion_id_tipo_ubicacion_almacen", "interfaces_andessalud_hc_url_base"];
            let valoresParametrosOperacion = [];

            // Recuperar cada parametro de operacion
            nombresParmetrosOperacion.forEach(function (nombreParametro) {
                let parametroOperacion = daoParametrosOperacion.getParam(nombreParametro);
                nLog.debug("eventoCreacionRegistro - parametroOperacion", parametroOperacion);
                valoresParametrosOperacion.push(parametroOperacion);
            });
            nLog.debug("eventoCreacionRegistro - valoresParametrosOperacion", valoresParametrosOperacion);

            // Recuperar y validar tipo de ubicacion
            let tipoUbicacionValor = parametro.getValue({ fieldId: "locationtype"});
            nLog.debug("eventoCreacionRegistro - locationtype", {
                tipoUbicacionValor: tipoUbicacionValor,
            });

            // Si ubicacion no es de tipo Almacén en ninguno de los casos, no procesar
            if (!tipoUbicacionValor || tipoUbicacionValor !== valoresParametrosOperacion[0].text) {
                nLog.audit("eventoCreacionRegistro - tipoUbicacion", "El tipo de ubicacion no es Almacén. No se procesara el evento.");
                return;
            };

            // Recuperar campos de registro
            let cuerpoPeticion = {
                tipoMensaje: "SEND^IN",
                datos: {
                    FechaCreacion: libFormato.formatearFecha(new Date())
                }
            };
            cuerpoPeticion.datos.Bodega = daoUbicacion.recuperarCamposRegistro(parametro);
            custodia.datosEntrada = JSON.stringify(cuerpoPeticion);
            nLog.debug("eventoCreacionRegistro - cuerpoPeticion", cuerpoPeticion);

            // Ejecutar peticion al servicio externo usando el DAO
            let url = `${valoresParametrosOperacion[1].text}/cre-bodega`;
            let respuesta = daoUbicacion.enviarBodega(url, cuerpoPeticion);

            // Validar codigo de respuesta (asumiendo 202 como en departamento)
            if (respuesta.code !== 202) {
                throw new Error(`Error peticion - codigo: ${respuesta.code} - cuerpo: ${JSON.stringify(respuesta.body)}`);
            } else {
                // Parsear cuerpo respuesta
                let bodyParseado = JSON.parse(respuesta.body);
                nLog.debug("eventoCreacionRegistro - bodyParseado", bodyParseado);

                // Validar que el cuerpo de la respuesta contenga datos
                if (bodyParseado.length > 0) {
                    // Validar propiedades en cuerpo de respuesta
                    if (!bodyParseado[0].estado.success || bodyParseado[0].estado.codigo !== 202) {
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
     * @param {Object} oldRecord - Parametro para ejecucion.
     * @param {Object} newRecord - Parametro para ejecucion.
     * @returns {Object} - Datos de ejecucion.
     */
    function eventoEdicionRegistro(oldRecord, newRecord) {
        try {
            nLog.audit("eventoEdicionRegistro - parametro", newRecord);

            // Ajustar objeto proceso
            proceso.etapa = eventoEdicionRegistro.name;
            proceso.scriptId = runtime.getCurrentScript().id;
            proceso.tokenProceso = libAuditoria.obtenerToken(); // Generar token para auditoria
            proceso.tipoRegistroCreado = newRecord.type;
            proceso.idRegistroCreado = newRecord.id;
            custodia.custrecord_2win_as_tiempo_proceso = Date.now(); // Marca de inicio
            custodia.custrecord_2win_as_interface = "edicion bodega send upd"; // "edicion_bodega_send_upd"
            custodia.externalid = `edicion_bodega_send_upd_${newRecord.getValue({ fieldId: "custrecord_2w_codigo_ubicacion" })}`;
            custodia.custrecord_2win_as_id_registro = newRecord.id;

            // Ejecutar busqueda para validar existencia de registro custodia para el mensaje
            custodia.registroExistente = libCustodia.busquedaRegistroPorExternalid(custodia.externalid);

            // Nombres de parametros de operacion necesarios
            let nombresParmetrosOperacion = ["andessalud_ubicacion_id_tipo_ubicacion_almacen", "interfaces_andessalud_hc_url_base"];
            let valoresParametrosOperacion = [];

            // Recuperar cada parametro de operacion
            nombresParmetrosOperacion.forEach(function (nombreParametro) {
                let parametroOperacion = daoParametrosOperacion.getParam(nombreParametro);
                nLog.debug("eventoEdicionRegistro - parametroOperacion", parametroOperacion);
                valoresParametrosOperacion.push(parametroOperacion);
            });
            nLog.debug("eventoEdicionRegistro - valoresParametrosOperacion", valoresParametrosOperacion);

            // Recuperar y validar tipo de ubicacion
            let tipoUbicacionActualValor = newRecord.getValue({ fieldId: "locationtype"});
            let tipoUbicacionAnteriorValor = oldRecord.getValue({ fieldId: "locationtype"});
            nLog.debug("eventoCreacionRegistro - locationtype", {
                tipoUbicacionActualValor: tipoUbicacionActualValor,
                tipoUbicacionAnteriorValor: tipoUbicacionAnteriorValor
            });

            // Si ubicacion no es de tipo Almacén en ninguno de los casos, no procesar
            if (
                !tipoUbicacionActualValor || 
                !tipoUbicacionAnteriorValor ||
                tipoUbicacionActualValor !== valoresParametrosOperacion[0].text || 
                tipoUbicacionAnteriorValor !== valoresParametrosOperacion[0].text
            ) {
                nLog.audit("eventoCreacionRegistro - tipoUbicacion", "El tipo de ubicacion no es Almacén. No se procesara el evento.");
                return;
            };

            // Recuperar campos de registro
            let cuerpoPeticion = {
                tipoMensaje: "SEND^UPD",
                datos: {
                    FechaActualizacion: libFormato.formatearFecha(new Date())
                }
            };
            cuerpoPeticion.datos.Bodega = daoUbicacion.recuperarCamposRegistro(newRecord);
            nLog.debug("eventoEdicionRegistro - cuerpoPeticion", cuerpoPeticion);
            
            // Manejar los campos FechaInicioVigencia y FechaFinVigencia basado en cambios en isinactive
            const isInactiveNew = newRecord.getValue({ fieldId: "isinactive" });
            
            // Si isinactive esta marcado
            if (isInactiveNew) {
                // Recuperar valor anterior de isinactive
                const isInactiveOld = oldRecord.getValue({ fieldId: "isinactive" });

                // Caso marca mantenga mismo valor
                if (isInactiveOld === isInactiveNew) {
                    nLog.audit("eventoEdicionRegistro - isinactive", {
                        isInactiveOld: isInactiveOld,
                        isInactiveNew: isInactiveNew
                    });
                    // No enviar fecha fin vigencia
                    delete cuerpoPeticion.datos.Bodega.FechaFinVigencia;  
                };
            };
            custodia.datosEntrada = JSON.stringify(cuerpoPeticion);

            // Ejecutar peticion al servicio externo usando el DAO
            let url = `${valoresParametrosOperacion[1].text}/upd-bodega`;
            let respuesta = daoUbicacion.enviarBodega(url, cuerpoPeticion);

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
                    if (!bodyParseado[0].estado.success || bodyParseado[0].estado.codigo !== 202) {
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
     * @function eventoEliminacionRegistro - Maneja la eliminación de una ubicación.
     * @param {Object} parametro - Registro de ubicación eliminado.
     * @returns {Object} - Resultado del proceso.
     */
    function eventoEliminacionRegistro(parametro) {
        try {
            nLog.audit("eventoEliminacionRegistro - parametro", parametro);
            
            // Ajustar objeto proceso
            proceso.etapa = eventoEliminacionRegistro.name;
            proceso.scriptId = runtime.getCurrentScript().id;
            proceso.tokenProceso = libAuditoria.obtenerToken(); // Generar token para auditoría
            proceso.tipoRegistroCreado = parametro.type;
            proceso.idRegistroCreado = parametro.id;
            custodia.custrecord_2win_as_tiempo_proceso = Date.now(); // Marca de inicio
            custodia.custrecord_2win_as_interface = "eliminacion bodega send del"; // Interface para eliminación
            custodia.externalid = `eliminacion_bodega_send_del_${parametro.getValue({ fieldId: "custrecord_2w_codigo_ubicacion" })}`;
            custodia.custrecord_2win_as_id_registro = parametro.id;

            // Buscar registro de custodia existente
            custodia.registroExistente = libCustodia.busquedaRegistroPorExternalid(custodia.externalid);
            
            // Parámetros de operación
            let nombresParmetrosOperacion = ["andessalud_ubicacion_id_tipo_ubicacion_almacen", "interfaces_andessalud_hc_url_base"];
            const valoresParametrosOperacion = [];
            nombresParmetrosOperacion.forEach(function (nombreParametro) {
                const parametroOperacion = daoParametrosOperacion.getParam(nombreParametro);
                nLog.debug("eventoEliminacionRegistro - parametroOperacion", parametroOperacion);
                valoresParametrosOperacion.push(parametroOperacion);
            });
            
            // Recuperar y validar tipo de ubicacion
            let tipoUbicacionValor = parametro.getValue({ fieldId: "locationtype"});
            nLog.debug("eventoCreacionRegistro - locationtype", {
                tipoUbicacionValor: tipoUbicacionValor,
            });

            // Si ubicacion no es de tipo Almacén en ninguno de los casos, no procesar
            if (!tipoUbicacionValor || tipoUbicacionValor !== valoresParametrosOperacion[0].text) {
                nLog.audit("eventoCreacionRegistro - tipoUbicacion", "El tipo de ubicacion no es Almacén. No se procesara el evento.");
                return;
            };

            // Cuerpo de petición para eliminacion
            const cuerpoPeticion = {
                tipoMensaje: "SEND^DEL",
                datos: {
                    // Se envía la fecha de fin de vigencia en el campo correspondiente al registro
                    FechaEliminacion: libFormato.formatearFecha(new Date())
                }
            };
            cuerpoPeticion.datos.Bodega = daoUbicacion.recuperarCamposRegistro(parametro);

            // Validar si registro ya estaba inactivo
            let inactivo = parametro.getValue({ fieldId: "isinactive" });
            if (inactivo) {
                delete cuerpoPeticion.datos.Bodega.FechaFinVigencia;
            };
            custodia.datosEntrada = JSON.stringify(cuerpoPeticion);
            nLog.debug("eventoEliminacionRegistro - cuerpoPeticion", cuerpoPeticion);

            // Envío al endpoint de eliminación
            const url = `${valoresParametrosOperacion[1].text}/upd-bodega`;
            const respuesta = daoUbicacion.enviarBodega(url, cuerpoPeticion);

            if (respuesta.code !== 202) {
                throw new Error(`Error petición - código: ${respuesta.code} - cuerpo: ${JSON.stringify(respuesta.body)}`);
            } else {
                // Parsear cuerpo respuesta
                let bodyParseado = JSON.parse(respuesta.body);
                nLog.debug("eventoEdicionRegistro - bodyParseado", bodyParseado);

                // Validar que el cuerpo de la respuesta contenga datos
                if (bodyParseado.length > 0) {
                    // Validar propiedades en cuerpo de respuesta
                    if (!bodyParseado[0].estado.success || bodyParseado[0].estado.codigo !== 202) {
                        throw new Error(`Error respuesta - codigo: ${respuesta.code} - cuerpo: ${JSON.stringify(respuesta.body)}`);
                    }
                } else {
                    throw new Error(`Error respuesta - codigo: ${respuesta.code} - cuerpo: ${JSON.stringify(respuesta.body)}`);
                }
            }

            const bodyParseado = JSON.parse(respuesta.body);
            nLog.debug("eventoEliminacionRegistro - bodyParseado", bodyParseado);

            // Registro de auditoría
            proceso.descripcionResultado = "Evento de eliminación capturado exitosamente";
            libAuditoria.crearReporteAuditoria(proceso);
            custodia.codigoRespuesta = proceso.estado;
            custodia.respuesta = proceso.descripcionResultado;

            // Actualizar o crear registro de custodia
            if (custodia.registroExistente && custodia.registroExistente.length > 0 && custodia.registroExistente[0].codigoRespuesta !== "000") {
                custodia.internalid = custodia.registroExistente[0].internalid;
                proceso.registroCustodia = libCustodia.actualizarRegistro(custodia);
            }

            return proceso;
        } catch (error) {
            nLog.error("eventoEliminacionRegistro - error", error);
            proceso.estado = "001";
            proceso.descripcionResultado = error.message;
            custodia.codigoRespuesta = proceso.estado;
            custodia.respuesta = error.message;
            libAuditoria.crearReporteAuditoria(proceso);
            if (custodia.registroExistente && custodia.registroExistente.length > 0) {
                custodia.internalid = custodia.registroExistente[0].internalid;
                proceso.registroCustodia = libCustodia.actualizarRegistro(custodia);
            } else {
                custodia.reintentos = 0;
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
            proceso.tipoRegistroCreado = "location";
            proceso.idRegistroCreado = parametro.id;
            custodia.custrecord_2win_as_tiempo_proceso = Date.now(); // Marca de inicio
            custodia.custrecord_2win_as_interface = "eliminacion bodega send del";
            custodia.externalid = `eliminacion_bodega_send_del_${parametro.datosEntrada.datos.Bodega.CodigoBodega}`;
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

            // Ejecutar peticion al servicio externo
            let respuesta = daoUbicacion.enviarRegistro(`${valoresParametrosOperacion[0].text}/upd-bodega`, cuerpoPeticion);

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
     * @function reintentoEdicion - Función para procesar evento de un registro en netsuite.
     * @param {Object} parametro - Parametro para ejecucion.
     * @returns {Object} - Datos de ejecucion.
     */
    function reintentoEdicion(parametro) {
        try {
            nLog.audit("reintentoEdicion - parametro", parametro);

            // Ajustar objeto proceso
            proceso.etapa = reintentoEdicion.name;
            proceso.scriptId = runtime.getCurrentScript().id;
            proceso.tokenProceso = libAuditoria.obtenerToken(); // Generar token para auditoria
            proceso.tipoRegistroCreado = "location";
            proceso.idRegistroCreado = parametro.id;
            custodia.custrecord_2win_as_tiempo_proceso = Date.now(); // Marca de inicio
            custodia.custrecord_2win_as_interface = "edicion bodega send upd";
            custodia.externalid = `edicion_bodega_send_upd_${parametro.datosEntrada.datos.Bodega.CodigoBodega}`;
            custodia.custrecord_2win_as_id_registro = parametro.id;

            // Ejecutar busqueda para validar existencia de registro custodia para el mensaje
            custodia.registroExistente = libCustodia.busquedaRegistroPorExternalid(custodia.externalid);

            // Nombres de parametros de operacion necesarios
            let nombresParmetrosOperacion = ["interfaces_andessalud_hc_url_base"];
            let valoresParametrosOperacion = [];

            // Recuperar cada parametro de operacion
            nombresParmetrosOperacion.forEach(function (nombreParametro) {
                let parametroOperacion = daoParametrosOperacion.getParam(nombreParametro);
                nLog.debug("reintentoEdicion - parametroOperacion", parametroOperacion);
                valoresParametrosOperacion.push(parametroOperacion);
            });
            nLog.debug("reintentoEdicion - valoresParametrosOperacion", valoresParametrosOperacion);
            
            // Aislar datos de entrada
            let cuerpoPeticion = parametro.datosEntrada;
            custodia.datosEntrada = JSON.stringify(cuerpoPeticion);
            nLog.debug("reintentoEdicion - cuerpoPeticion", cuerpoPeticion);

            // Ejecutar peticion al servicio externo
            let respuesta = daoUbicacion.enviarRegistro(`${valoresParametrosOperacion[0].text}/upd-bodega`, cuerpoPeticion);

            // Validar codigo de respuesta
            if (respuesta.code !== 202) {
                throw new Error(`Error peticion - codigo: ${respuesta.code} - cuerpo: ${JSON.stringify(respuesta.body)}`);
            } else {
                // Parsear cuerpo respuesta
                let bodyParseado = JSON.parse(respuesta.body);
                nLog.debug("reintentoEdicion - bodyParseado", bodyParseado);

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
            nLog.error("reintentoEdicion - error", error);

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

        const registro = daoUbicacion.getRecord(idRegistro);

        if (tipoInterfaz.includes("creacion")) {
            return eventoCreacionRegistro(registro);
        } else if (tipoInterfaz.includes("edicion")) {
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
                return reintentoEdicion(parametro);
            } else {
                throw new Error(`No hay datos de entrada para reprocesar en registro custodia: ${datosEntrada}`);
            }
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
