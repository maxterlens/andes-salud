/**
 * @NApiVersion 2.1
 * @module ./2win_dom_pago.js
 * @NModuleScope Public
 */
define([
    "../lib/2win_lib_auditoria",
    "../lib/2win_lib_custodia",
    "../lib/2win_lib_formato",
    "../lib/moment",
    "../dao/2win_dao_factura",
    "../dao/2win_dao_pago",
    "../dao/2win_dao_static_params_operacion",
    "N/log",
    "N/record",
    "N/runtime",
    "N/search"
], function (libAuditoria, libCustodia, libFormato, moment, daoFactura, daoPago, daoParametrosOperacion, nLog, record, runtime, search) {

    /**
     * @function validarPago - Valida y procesa un pago realizado en NetSuite.
     * @param {Object} parametro - Registro a validar y procesar
     * @returns {Object} Resultado de procesamiento
     */
    function validarPago(parametro) {
        try {
            nLog.debug("validarPago - parametro", {
                parametro: parametro
            })
            let respuesta = {};

            // Recuperar conteo de lineas de pago
            let conteoLineas = parametro.getLineCount({ sublistId: "apply" });
            nLog.debug("validarPago - conteoLineas", conteoLineas);
            let fechaPago = parametro.getValue({ fieldId: "trandate" });

            // Recorrer lineas de pago
            for (let i = 0; i < conteoLineas; i++) {
                // Recuperar valor de campo checkbox aplicar
                let aplicada = parametro.getSublistValue({ sublistId: "apply", fieldId: "apply", line: i });
                nLog.debug("validarPago - aplicada", {
                    linea: i,
                    aplicada: aplicada
                });
                
                // Validar si la linea de pago se aplico a una factura
                if (aplicada) {
                    
                    // Recuperar datos de linea aplicada
                    let idFactura = parametro.getSublistValue({ sublistId: "apply", fieldId: "doc", line: i });
                    let valorAplicadoLinea = parametro.getSublistValue({ sublistId: "apply", fieldId: "amount", line: i });
                    
                    // Cargar factura para recuperar campos usados en validaciones
                    let registroFactura = record.load({ type: record.Type.INVOICE, id: idFactura, isDynamic: false });
                    let referenciaEstado = registroFactura.getValue({ fieldId: "statusRef" });
                    let valorFactura = registroFactura.getValue({ fieldId: "total" });
                    let valorRestante = registroFactura.getValue({ fieldId: "amountremaining" });
                    let valorPagado = registroFactura.getValue({ fieldId: "amountpaid" });
                    let formulario = search.lookupFields({
                        type: registroFactura.type,
                        id: registroFactura.id,
                        columns: ["customform"]
                    });
                    nLog.debug("validarPago - estado", {
                        idFactura: idFactura,
                        referenciaEstado: referenciaEstado,
                        valorFactura: valorFactura, 
                        valorRestante: valorRestante,
                        valorPagado: valorPagado,
                        valorAplicadoLinea: valorAplicadoLinea,
                        formulario: formulario
                    });

                    // Validar si el tipo de formulario es el indicado
                    if (formulario && formulario.customform.length > 0 && formulario.customform[0].text == "DTE - Factura Electrónica (33/34)") {
                        // Evaluar si se aplico valor
                        if (valorAplicadoLinea > 0) {
    
                            // Definir objetos con datos requeridos para procesamiento
                            let datos = {
                                id: parametro.id,
                                type: parametro.type,
                                lineaAplicada: i,
                                fechaPago: moment(fechaPago).format("YYYYMMDD"),
                                factura: registroFactura 
                            };
    
                            // Procesar
                            respuesta = eventoCreacionRegistro(datos);
                        } else {
                            nLog.audit("validarPago - valorAplicadoLinea", `Valor aplicado a la linea es menor o igual a 0 - valor: ${valorAplicadoLinea}`);
                        };
                    } else {
                        nLog.audit("validarPago - formulario", "Formulario de factura no coincide con DTE - Factura Electrónica (33/34)");
                    };
                };
            }
            return respuesta;
        } catch (error) {
            nLog.error("validarPago - error", error);
            throw error
        }
    }

    /**
     * @function eventoCreacionRegistro - Función para procesar evento de un registro en netsuite.
     * @param {Object} parametro - Parametro para ejecucion.
     * @returns {Object} - Datos de ejecucion.
     */
    function eventoCreacionRegistro(parametro) {
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

        try {
            nLog.audit("eventoCreacionRegistro - parametro", parametro);
            nLog.audit("eventoCreacionRegistro - proceso", proceso);

            // Ajustar objeto proceso
            proceso.etapa = eventoCreacionRegistro.name;
            proceso.scriptId = runtime.getCurrentScript().id;
            proceso.tokenProceso = libAuditoria.obtenerToken(); // Generar token para auditoria
            proceso.tipoRegistroCreado = parametro.type;
            proceso.idRegistroCreado = parametro.id;
            custodia.custrecord_2win_as_tiempo_proceso = Date.now(); // Marca de inicio
            custodia.custrecord_2win_as_interface = "recaudacion de factura send in";
            custodia.externalid = `recaudacion_de_factura_send_in_${parametro.id}_${parametro.lineaAplicada}`; // Se contruye con id interno de pago + linea aplicada
            custodia.custrecord_2win_as_id_registro = parametro.id;

            // Ejecutar busqueda para validar existencia de registro custodia
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
                datos: {}
            };

            // Recuperar datos de transacciones
            let datosRegistroFactura = daoFactura.recuperarCamposRegistro(parametro.factura);

            // Definir datos para cuerpoPeticion
            cuerpoPeticion.datos = {
                rutSociedad: datosRegistroFactura.rutSociedad,
                folioFactura: datosRegistroFactura.folioFactura,
                fechaPago: parametro.fechaPago,
                tipoFactura: datosRegistroFactura.tipoFactura
            };

            custodia.datosEntrada = JSON.stringify(cuerpoPeticion);
            nLog.debug("eventoCreacionRegistro - cuerpoPeticion", cuerpoPeticion);

            // Validar que el cuerpo de la peticion tenga los datos esperados
            let propiedadesEsperadas = ["rutSociedad", "folioFactura", "fechaPago", "tipoFactura"];
            libFormato.verificarPropiedades(cuerpoPeticion.datos, propiedadesEsperadas);

            // Ejecutar peticion al servicio externo
            let respuesta = daoPago.enviarRegistro(`${valoresParametrosOperacion[0].text}/rec-factura`, cuerpoPeticion);

            // Validar codigo de respuesta
            if (respuesta.code !== 200) {
                throw new Error(`Error peticion - codigo: ${respuesta.code} - cuerpo: ${JSON.stringify(respuesta.body)}`);
            } else {
                // Parsear cuerpo respuesta
                let bodyParseado = JSON.parse(respuesta.body);
                nLog.debug("eventoCreacionRegistro - bodyParseado", bodyParseado);

                // Validar que el cuerpo de la respuesta contenga datos
                if (bodyParseado.length > 0) {
                    // Validar propiedades en cuerpo de respuesta
                    if (bodyParseado[0].tipoMensaje !== cuerpoPeticion.tipoMensaje || !bodyParseado[0].estado.success || bodyParseado[0].estado.codigo !== 200) {
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
        if (tipoInterfaz.includes("send in")) {
            // Cargar el registro original que necesita ser procesado
            const registro = daoPago.getRecord(idRegistro);
            return validarPago(registro);
        } else {
            throw new Error(`Tipo de interfaz no reconocido en custodia: ${tipoInterfaz}`);
        }
    }

    return {
        validarPago: validarPago,
        eventoCreacionRegistro: eventoCreacionRegistro,
        reprocesarEvento: reprocesarEvento
    };
});