/**
 * @NApiVersion 2.1
 * @module ./2win_dom_producto.js
 * @NModuleScope Public
 */
define([
    "../lib/2win_lib_auditoria",
    "../lib/2win_lib_custodia",
    "../dao/2win_dao_producto",
    "N/log",
    "N/runtime",
    "../dao/2win_dao_orden_venta",
    "../dao/2win_dao_cliente",
    "../dao/2win_dao_departamento",
    "../dao/2win_dao_static_params_operacion",
    "../lib/2win_lib_formato",
    "../dao/2win_dao_ubicacion"
], function (libAuditoria, libCustodia, daoProducto, nLog, runtime, daoOrdenVenta, daoCliente, daoDepartamento, daoParametrosOperacion, libFormato, daoUbicacion) {
    // Variable para almacenar la respuesta

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
    const actualizacionPrecio = (parametro) => {
        const respuesta = {
            tipoMensaje: "ActualizacionPrecioProducto",
            estado: {
                success: true,
                codigo: 200,
                mensaje: "Acción registrada correctamente en NetSuite"
            },
            data: {}
        };
        try {
            const { consumoMedicamentos, tipoMensaje } = JSON.stringify(parametro)[0];
            const {
                identificadorUnicoPaciente,
                numeroFicha,
                numeroIngreso,
                numeroCuentaPaciente,
                identificadorUnicoFila,
                codigoProducto,
                codigoServicio,
                codigoBodega,
                CodConvenio,
                NombreConvenio,
                RutFinanciador,
                CodPaquete,
                NombrePaquete,
                valorNeto,
                valorExento,
                valorIVA,
                valorTotal
            } = consumoMedicamentos;
            nLog.audit("editar_producto - parametro", parametro);

            // Ajustar objeto proceso
            custodia.custrecord_2win_as_tiempo_proceso = Date.now(); // Marca de inicio
            custodia.custrecord_2win_as_interface = "Editar Producto";
            custodia.datosEntrada = JSON.stringify(parametro);
            custodia.externalid = `editar_producto_${parametro.MSH.controlID}`;
            proceso.etapa = actualizacionPrecio.name;
            proceso.scriptId = runtime.getCurrentScript().id;
            proceso.tokenProceso = libAuditoria.obtenerToken(); // Generar token para auditoria
            respuesta.tipoMensaje = parametro.MSH.messageType;

            // Ejecutar busqueda para validar existencia de registro custodia para el mensaje
            custodia.internalid = libCustodia.busquedaRegistroCustodia(custodia.externalid);

            // Validar existencia de datos para ejecucion
            if (parametro.consumoMedicamentos.identificadorUnicoFila) {
                const recipeId = daoProducto.searchRecipe(parametro.consumoMedicamentos.identificadorUnicoFila);

                // Crear registro auditoria
                proceso.descripcionResultado = "Registro editado correctamente";
                libAuditoria.crearReporteAuditoria(proceso);

                // Ajustar propiedades de respuesta
                custodia.respuesta = "Actualización de cargos recibido con éxito";
                respuesta.estado.mensaje = "Actualización de cargos recibido con éxito";
                respuesta.estado.success = true;
                custodia.codigoRespuesta = proceso.estado;

                // Validar si existe registro de custodia
                if (custodia.internalid && custodia.internalid.length > 0) {
                    custodia.internalid = custodia.internalid[0].internalid;
                    // Actualizar registro de custodia
                    proceso.registroCustodia = libCustodia.actualizarRegistro(custodia);
                }
            } else {
                throw new Error("No se han recibido datos para ejecucion");
            }
        } catch (error) {
            nLog.error("editar_producto - error", error);

            // Crear registro auditoria
            proceso.estado = "001";
            proceso.descripcionResultado = error.message;
            libAuditoria.crearReporteAuditoria(proceso);
            custodia.respuesta = error.message;
            custodia.codigoRespuesta = proceso.estado;

            // Ajustar propiedades de respuesta
            respuesta.estado.mensaje = error.message;
            respuesta.estado.codigo = 400;
            respuesta.estado.success = false;

            // Validar si existe registro de custodia
            if (custodia.internalid && custodia.internalid.length > 0) {
                custodia.internalid = custodia.internalid[0].internalid;
                // Actualizar registro de custodia
                proceso.registroCustodia = libCustodia.actualizarRegistro(custodia);
            } else {
                custodia.reintentos = 0;
                // Crear registro de custodia
                proceso.registroCustodia = libCustodia.guardarOActualizarRegistro(custodia);
            }

            throw error;
        }
    };
    const consultarStock = (parametro) => {
        const respuesta = {
            tipoMensaje: "STOCK^VAL",
            estado: {
                success: null,
                codigo: null,
                mensaje: null
            },
            data: {
                resultado: null
            }
        };
        try {
            parametro = parametro[0];
            const {
                codigoServicio,
                unidadProducto,
                numeroCuentaPaciente,
                identificadorUnicoFila,
                codigoProducto,
                codigoBodega,
                CodConvenio,
                cantidad,
                NombreConvenio,
                RutFinanciador,
                CodPaquete,
                NombrePaquete,
                valorNeto,
                valorExento,
                valorIVA,
                valorTotal
            } = parametro.datos;
            nLog.audit("consultarStock - parametro", parametro);

            // Ajustar objeto proceso
            custodia.custrecord_2win_as_tiempo_proceso = Date.now(); // Marca de inicio
            custodia.custrecord_2win_as_interface = "Consultar Stock";
            custodia.datosEntrada = JSON.stringify(parametro);
            custodia.externalid = `consultarStock_${codigoProducto}_${parametro.datos.numeroIngreso}`;
            proceso.etapa = consultarStock.name;
            proceso.scriptId = runtime.getCurrentScript().id;
            proceso.tokenProceso = libAuditoria.obtenerToken(); // Generar token para auditoria
            respuesta.tipoMensaje = parametro.tipoMensaje;

            // Ejecutar busqueda para validar existencia de registro custodia para el mensaje
            custodia.internalid = libCustodia.busquedaRegistroCustodia(custodia.externalid);
            let data = { consumoMedicamentos: {} };
            // Validar existencia de datos para ejecucion
            if (codigoProducto && parametro.datos.cantidad && codigoBodega) {
                //------------------------------Validaciones--------------------------------------
                const productoDatos = daoProducto.getStockProductoById(codigoProducto, codigoBodega);
                if (!productoDatos) throw new Error("Código de bodega o producto no válido");
                if (productoDatos.abbreviation !== unidadProducto.trim()) throw new Error("Unidad de producto no valida");
                let ordenVentaId, customerId, idFinanciador;
                if (numeroCuentaPaciente) ordenVentaId = daoOrdenVenta.buscar(numeroCuentaPaciente);
                // if (parametro.datos.numeroFicha) customerId = daoCliente.busquedaRegistroPorNroFicha(parametro.datos.numeroFicha);
                if (RutFinanciador) idFinanciador = daoCliente.busquedaRegistroPorRut(libFormato.formatearRut(RutFinanciador));

                //------------------------------Operaciones--------------------------------------

                switch (parametro.datos.estado) {
                    case "Agregar":
                        if (productoDatos.quantityavailable < parametro.datos.cantidad) {
                            respuesta.estado.mensaje = "No hay stock disponible";
                            respuesta.estado.success = false;
                            respuesta.estado.codigo = 200;
                            respuesta.data.resultado = false;
                            return respuesta;
                        }
                        if (!ordenVentaId) throw new Error(`Admision no entontrada con numero de cuenta ${numeroCuentaPaciente}`);

                        daoOrdenVenta.agregarLineaFarmacia({
                            id: ordenVentaId,
                            save: true,
                            datosLinea: {
                                item: codigoProducto,
                                custcol_2win_as_nombre_convenio: NombreConvenio,
                                custcol_2win_as_codigo_convenio: CodConvenio,
                                custcol_2win_as_nombre_paquete: NombrePaquete,
                                custcol_2win_as_codigo_paquete: CodPaquete,
                                custcol_2win_as_codigo_servicio: codigoServicio,
                                inventorylocation: productoDatos.locationid,
                                subsidiarylocation: productoDatos.locationsubsidiary,
                                // custcol_2win_as_rut_financiador: idFinanciador,
                                quantity: cantidad,
                                price: -1,
                                rate: ((valorNeto / cantidad) * 100) / 100,
                                tax1amt: valorIVA,
                                custcol_2win_as_identificador_fila: identificadorUnicoFila
                            }
                        });

                        respuesta.estado.codigo = 200;
                        respuesta.estado.success = true;
                        respuesta.estado.mensaje = "Validación de stock completada";
                        respuesta.data.resultado = true;
                        break;
                    case "Modificar":
                        if (!ordenVentaId) throw new Error("Orden de venta no encontrada.");
                        if (productoDatos.quantityavailable < parametro.datos.cantidad) {
                            respuesta.estado.mensaje = "No hay stock disponible";
                            respuesta.estado.success = false;
                            respuesta.estado.codigo = 200;
                            respuesta.data.resultado = false;
                            return respuesta;
                        }
                        data.consumoMedicamentos = parametro.datos;
                        daoOrdenVenta.actualizarLineasRegistro(data);
                        respuesta.estado.codigo = 200;
                        respuesta.estado.success = true;
                        respuesta.estado.mensaje = "Validación de stock completada";
                        respuesta.data.resultado = true;
                        break;
                    case "Eliminar":
                        if (!ordenVentaId) throw new Error("Orden de venta no encontrada.");
                        data.consumoMedicamentos = parametro.datos;
                        daoOrdenVenta.eliminarLineaRegistro(data);
                        respuesta.estado.codigo = 200;
                        respuesta.estado.success = true;
                        respuesta.estado.mensaje = "Validación de stock completada";
                        respuesta.data.resultado = true;
                        break;

                    default:
                        throw new Error("Estado no definido o no contemplado.");
                }

                // Crear registro auditoria
                proceso.descripcionResultado = "Consulta de stock realizada correctamente";
                libAuditoria.crearReporteAuditoria(proceso);

                // Ajustar propiedades de respuesta
                custodia.respuesta = "Consulta de stock recibido con éxito";

                custodia.codigoRespuesta = proceso.estado;

                // Validar si existe registro de custodia
                if (custodia.internalid && custodia.internalid.length > 0) {
                    custodia.internalid = custodia.internalid[0].internalid;
                    // Actualizar registro de custodia
                    proceso.registroCustodia = libCustodia.actualizarRegistro(custodia);
                }
                return respuesta;
            } else {
                throw new Error("No se han recibido datos para ejecucion");
            }
        } catch (err) {
            nLog.error("consultarStock - error", err);

            // Crear registro auditoria
            proceso.estado = "001";
            proceso.descripcionResultado = err.message;
            libAuditoria.crearReporteAuditoria(proceso);
            custodia.respuesta = err.message;
            custodia.codigoRespuesta = proceso.estado;

            // Ajustar propiedades de respuesta
            respuesta.estado.mensaje = err.message;
            respuesta.estado.codigo = 400;
            respuesta.estado.success = false;

            // Validar si existe registro de custodia
            if (custodia.internalid && custodia.internalid.length > 0) {
                custodia.internalid = custodia.internalid[0].internalid;
                // Actualizar registro de custodia
                proceso.registroCustodia = libCustodia.actualizarRegistro(custodia);
            } else {
                custodia.reintentos = 0;
                // Crear registro de custodia
                proceso.registroCustodia = libCustodia.guardarOActualizarRegistro(custodia);
            }

            throw err;
        }
    };
    /**
     *
     * @param {object} parametro
     * @param {string} parametro.CodigoBodega
     * @returns
     */
    const listarPorBodega = (parametro) => {
        parametro = parametro[0] || {};
        const codigoBodega = parametro.datos?.CodigoBodega;
        const respuesta = {
            bodega: codigoBodega || "",
            subsidiaria: "",
            productos: [],
            success: false,
            error: "Código de bodega no válido o sin stock disponible."
        };
        try {
            nLog.audit("listarPorBodega - parametro", parametro);

            // Ajustar objeto proceso
            custodia.custrecord_2win_as_tiempo_proceso = Date.now(); // Marca de inicio
            custodia.custrecord_2win_as_interface = "Listar por Bodega";
            custodia.datosEntrada = JSON.stringify(parametro);
            custodia.externalid = `listarPorBodega_${new Date().getTime()}`;
            proceso.etapa = listarPorBodega.name;
            proceso.scriptId = runtime.getCurrentScript().id;
            proceso.tokenProceso = libAuditoria.obtenerToken(); // Generar token para auditoria
            respuesta.tipoMensaje = `listarPorBodega_${codigoBodega}`;

            // Ejecutar busqueda para validar existencia de registro custodia para el mensaje
            custodia.internalid = libCustodia.busquedaRegistroCustodia(custodia.externalid);

            // Validar existencia de datos para ejecucion
            if (codigoBodega) {
                const listProducts = daoProducto.listProductsByLocation(codigoBodega);
                respuesta.subsidiaria = listProducts[0]?.rutsubsidiaria

                respuesta.productos = listProducts;
                // Crear registro auditoria
                proceso.descripcionResultado = "Listado por bodega realizado correctamente";
                libAuditoria.crearReporteAuditoria(proceso);

                // Ajustar propiedades de respuesta
                custodia.respuesta = "Listado por bodega recibido con éxito";
                respuesta.mensaje = "Listado por bodega recibido con éxito";
                respuesta.success = true;
                custodia.codigoRespuesta = "000";

                // Validar si existe registro de custodia
                if (custodia.internalid && custodia.internalid.length > 0) {
                    custodia.internalid = custodia.internalid[0].internalid;
                    // Actualizar registro de custodia
                    proceso.registroCustodia = libCustodia.actualizarRegistro(custodia);
                }
                respuesta.error = "";
                return respuesta;
            } else {
                throw new Error("No se han recibido datos para ejecucion");
            }
        } catch (error) {
            nLog.error("listarPorBodega - error", error);

            // Crear registro auditoria
            proceso.estado = "001";
            proceso.descripcionResultado = error.message;
            libAuditoria.crearReporteAuditoria(proceso);
            custodia.respuesta = error.message;
            custodia.codigoRespuesta = proceso.estado;

            // Ajustar propiedades de respuesta
            respuesta.error = error.message;
            respuesta.codigo = 400;
            respuesta.success = false;

            // Validar si existe registro de custodia
            if (custodia.internalid && custodia.internalid.length > 0) {
                custodia.internalid = custodia.internalid[0].internalid;
                // Actualizar registro de custodia
                proceso.registroCustodia = libCustodia.actualizarRegistro(custodia);
            } else {
                custodia.reintentos = 0;
                // Crear registro de custodia
                proceso.registroCustodia = libCustodia.guardarOActualizarRegistro(custodia);
            }

            throw error;
        }
    }; /**
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
            custodia.custrecord_2win_as_interface = "creacion producto send in";
            custodia.externalid = `creacion_producto_send_in_${parametro.getValue({ fieldId: "" })}`;
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
                tipoMensaje: "CREACION^PRODUCTO",
                datos: {
                    FechaCreacion: libFormato.formatearFecha(new Date()),
                    ...daoProducto.recuperarCamposRegistro(parametro)
                }
            };

            custodia.datosEntrada = JSON.stringify(cuerpoPeticion);
            nLog.debug("eventoCreacionRegistro - cuerpoPeticion", cuerpoPeticion);

            // Ejecutar peticion al servicio externo usando el DAO
            // El endpoint real para bodega debe ser confirmado. Usando un placeholder lógico.
            let url = `${valoresParametrosOperacion[0].text}/cre-producto`;
            let respuesta = daoProducto.enviarUnidadProducto(url, cuerpoPeticion);

            // Validar codigo de respuesta (asumiendo 202 como en departamento)
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
            custodia.custrecord_2win_as_interface = "edicion unidad producto send upd"; // "edicion_producto_send_upd"
            custodia.externalid = `edicion_producto_send_upd_${parametro.getValue({ fieldId: "custrecord_2w_codigo_ubicacion" })}`;
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
                tipoMensaje: "MODIFICACION^PRODUCTO",

                datos: {
                    FechaActualizacion: libFormato.formatearFecha(new Date()),
                    ...daoProducto.recuperarCamposRegistro(parametro)
                }
            };
            custodia.datosEntrada = JSON.stringify(cuerpoPeticion);
            nLog.debug("eventoEdicionRegistro - cuerpoPeticion", cuerpoPeticion);

            // Ejecutar peticion al servicio externo usando el DAO
            let url = `${valoresParametrosOperacion[0].text}/upd-producto`;
            let respuesta = daoProducto.enviarUnidadProducto(url, cuerpoPeticion);

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

        const registro = daoProducto.getRecord(idRegistro);

        if (tipoInterfaz.includes("creacion")) {
            return eventoCreacionRegistro(registro);
        } else if (tipoInterfaz.includes("edicion")) {
            return eventoEdicionRegistro(registro);
        } else {
            throw new Error(`Tipo de interfaz no reconocido en custodia: ${tipoInterfaz}`);
        }
    }

    return {
        editar: actualizacionPrecio,
        consultarStock,
        listarPorBodega,
        eventoCreacionRegistro: eventoCreacionRegistro,
        eventoEdicionRegistro: eventoEdicionRegistro,
        reprocesarEvento: reprocesarEvento
    };
});
