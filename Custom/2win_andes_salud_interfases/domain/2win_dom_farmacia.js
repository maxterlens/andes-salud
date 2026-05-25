/**
 * @NApiVersion 2.1
 * @module ./2win_dom_farmacia.js
 * @NModuleScope Public
 */
define([
    "../lib/2win_lib_auditoria",
    "../lib/2win_lib_custodia",
    "../dao/2win_dao_cliente",
    "../dao/2win_dao_orden_venta",
    "N/log",
    "N/runtime",
    "../dao/2win_dao_producto",
    "../lib/2win_lib_formato",
    "../dao/2win_dao_farmacia"
], function (libAuditoria, libCustodia, daoCliente, daoOrdenVenta, nLog, runtime, daoProducto, libFormato, daoFarmacia) {
    // Variable para almacenar la respuesta
    const payload = {
        tipoMensaje: "",
        estado: "success",
        codigo: 200,
        mensaje: "Operación recibida correctamente",
        tipo_proceso: "Operaciones Consumo",
        id_proceso: "",
        data: {
            response: []
        }
    };

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

    const consultarStock = (parametro) => {
        try {
            nLog.audit("crearOrdenFarmacia - parametro", parametro);

            parametro = parametro[0];
            const { tipoMensaje, datos } = parametro;
            const {
                codigoServicio,
                estado,
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
            } = datos;
            // Ajustar objeto proceso
            custodia.custrecord_2win_as_tiempo_proceso = Date.now(); // Marca de inicio
            custodia.custrecord_2win_as_interface = "Consultar Stock Farmacia";
            custodia.datosEntrada = JSON.stringify(parametro);
            custodia.externalid = numeroCuentaPaciente ? `consultarStockFarmacia_${numeroCuentaPaciente}` : "consultarStockFarmacia_sinControlID";
            proceso.etapa = consultarStock.name;
            proceso.scriptId = runtime.getCurrentScript().id;
            proceso.tokenProceso = libAuditoria.obtenerToken(); // Generar token para auditoria
            payload.tipoMensaje = tipoMensaje || "";

            // Ejecutar busqueda para validar existencia de registro custodia para el mensaje
            custodia.internalid = libCustodia.busquedaRegistroCustodia(custodia.externalid);

            if (!codigoProducto) throw new Error("Producto no definido");
            if (!codigoBodega) throw new Error("Bodega no definida");
            if (!unidadProducto) throw new Error("Unidad de producto no definida");
            if (!cantidad) throw new Error("Cantidad a asignar no definida");
            if (!valorNeto && !valorExento) throw new Error("Valor Monetario de producto no definido");
            const productoDatos = daoProducto.getStockProductoById(codigoProducto, codigoBodega);
            if (!productoDatos) throw new Error("Código de bodega o producto no válido");
            if (productoDatos.abbreviation !== unidadProducto.trim()) throw new Error("Unidad de producto no valida");
            let ordenVentaId, idFinanciador;
            if (numeroCuentaPaciente) ordenVentaId = daoOrdenVenta.buscar(numeroCuentaPaciente, true);
            if (!ordenVentaId) throw new Error("Orden de venta no encontrada.");
            if (RutFinanciador) idFinanciador = daoCliente.busquedaRegistroPorRut(libFormato.formatearRut(RutFinanciador))[0].internalid;
            const Farmacia = new daoFarmacia(ordenVentaId);
            const lineaData = {
                item: codigoProducto,
                custcol_2win_flag_item_provisional: true,
                custcol_2win_as_nombre_convenio: NombreConvenio,
                custcol_2win_as_codigo_convenio: CodConvenio,
                custcol_2win_as_nombre_paquete: NombrePaquete,
                custcol_2win_as_codigo_paquete: CodPaquete,
                custcol_2win_as_codigo_servicio: codigoServicio,
                inventorylocation: productoDatos.locationid,
                subsidiarylocation: productoDatos.locationsubsidiary,
                custcol_2win_as_rut_financiador: idFinanciador,
                quantity: cantidad,
                price: -1,
                rate: valorNeto,
                tax1amt: valorIVA * cantidad,
                custcol_2win_as_identificador_fila: identificadorUnicoFila
            };
            Object.keys(lineaData).forEach((key) => {
                if (!lineaData[key]) delete lineaData[key];
                if (key === "custcol_2win_as_rut_financiador" && !lineaData[key]) delete lineaData[key];
            });
            switch (estado) {
                case "Agregar":
                    if (productoDatos.quantityavailable < cantidad) {
                        throw new Error("No hay stock disponible");
                    }
                    Farmacia.crearLinea(lineaData);
                    Farmacia.save();
                    payload.mensaje = "Validacion de stock completada";
                    payload.estado = true;
                    payload.codigo = 200;
                    payload.data = {};
                    break;
                case "Modificar":
                    if (productoDatos.quantityavailable < cantidad) {
                        throw new Error("No hay stock disponible");
                    }
                    Farmacia.eliminar(identificadorUnicoFila);
                    Farmacia.crearLinea(lineaData);
                    Farmacia.save();
                    payload.mensaje = "Validacion de stock completada";
                    payload.estado = true;
                    payload.codigo = 200;
                    payload.data = {};
                    break;
                case "Eliminar":
                    Farmacia.eliminar(identificadorUnicoFila);
                    Farmacia.save();
                    payload.mensaje = "Validacion de stock completada";
                    payload.estado = true;
                    payload.codigo = 200;
                    payload.data = {};
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
                proceso.registroCustodia = libCustodia.actualizarRegistro(custodia);
            }
            return payload;
        } catch (error) {
            nLog.error("consultarStock - error", error);

            proceso.estado = "001";
            proceso.descripcionResultado = error.message;
            libAuditoria.crearReporteAuditoria(proceso);
            custodia.respuesta = error.message;
            custodia.codigoRespuesta = proceso.estado;

            if (custodia.internalid && custodia.internalid.length > 0) {
                custodia.internalid = custodia.internalid[0].internalid;
                proceso.registroCustodia = libCustodia.actualizarRegistro(custodia);
            } else {
                custodia.reintentos = 0;
                proceso.registroCustodia = libCustodia.guardarOActualizarRegistro(custodia);
            }

            throw error;
        }
    };

    const actualizarPrecioProducto = (parametro) => {
        try {
            nLog.audit("actualizarPrecioProducto - parametro", parametro);
            const { tipoMensaje, consumoMedicamentos, numeroCuentaPaciente } = parametro;
            nLog.debug("actualizarPrecioProducto - consumoMedicamentos", consumoMedicamentos);

            custodia.custrecord_2win_as_tiempo_proceso = Date.now();
            custodia.custrecord_2win_as_interface = "Actualizar Precio Productos";
            custodia.datosEntrada = JSON.stringify(parametro);
            custodia.externalid = numeroCuentaPaciente ? `actualizarPrecioProducto_${numeroCuentaPaciente}` : "actualizarPrecioProducto_sinControlID";
            proceso.etapa = actualizarPrecioProducto.name;
            proceso.scriptId = runtime.getCurrentScript().id;
            proceso.tokenProceso = libAuditoria.obtenerToken();
            payload.tipoMensaje = tipoMensaje || "";

            custodia.internalid = libCustodia.busquedaRegistroCustodia(custodia.externalid);
            const ordenVentaId = daoOrdenVenta.buscar(numeroCuentaPaciente, true);
            if (!ordenVentaId) throw new Error("Orden de venta no encontrada.");

            const Farmacia = new daoFarmacia(ordenVentaId);

            const lineasConError = [];
            const lineasExitosas = [];

            consumoMedicamentos.forEach((consumoMedicamento) => {
                try {
                    const { identificadorUnicoFila, valorNeto, valorIVA } = consumoMedicamento;

                    if (!identificadorUnicoFila) throw new Error("Identificador único de fila no definido");
                    if (valorNeto === undefined || valorNeto === null) throw new Error("Valor neto no definido");
                    if (valorIVA === undefined || valorIVA === null) throw new Error("Valor IVA no definido");

                    Farmacia.modificarPrecio(identificadorUnicoFila, valorNeto, valorIVA);

                    lineasExitosas.push({
                        identificadorUnicoFila: identificadorUnicoFila,
                        valorNeto: valorNeto,
                        valorIVA: valorIVA
                    });
                } catch (error) {
                    nLog.error("actualizarPrecioProducto - Error en línea", {
                        identificadorUnicoFila: consumoMedicamento.identificadorUnicoFila,
                        error: error.message
                    });

                    lineasConError.push({
                        identificadorUnicoFila: consumoMedicamento.identificadorUnicoFila || "NO_DEFINIDO",
                        error: error.message
                    });
                }
            });

            if (lineasExitosas.length === 0) {
                throw new Error(`Todas las líneas de actualización de precio fallaron. Errores: ${lineasConError.map((err) => `[${err.identificadorUnicoFila}] ${err.error}`).join("; ")}`);
            }

            Farmacia.save();

            const mensajeErrores = lineasConError.length > 0 ? ` con ${lineasConError.length} línea(s) con error` : "";
            proceso.descripcionResultado = `Precios actualizados correctamente: ${lineasExitosas.length} línea(s) exitosa(s)${mensajeErrores}`;
            libAuditoria.crearReporteAuditoria(proceso);

            if (lineasConError.length > 0) {
                payload.estado = "partial";
                payload.codigo = 207;
                payload.mensaje = `Actualización de precios procesada: ${lineasExitosas.length} exitosas, ${lineasConError.length} con error`;
                payload.data = {
                    lineasExitosas: lineasExitosas.length,
                    lineasConError: lineasConError
                    // detalleExitosas: lineasExitosas
                };
                custodia.respuesta = `Actualización parcial: ${lineasExitosas.length} exitosas, ${lineasConError.length} con error`;
            } else {
                payload.mensaje = "Actualización de precios completada con éxito";
                payload.data = {
                    lineasExitosas: lineasExitosas.length,
                    lineasConError: []
                };
                custodia.respuesta = "Actualización de precios completada con éxito";
            }

            custodia.codigoRespuesta = proceso.estado;

            if (custodia.internalid && custodia.internalid.length > 0) {
                custodia.internalid = custodia.internalid[0].internalid;
                proceso.registroCustodia = libCustodia.actualizarRegistro(custodia);
            } else {
                custodia.reintentos = 0;
                proceso.registroCustodia = libCustodia.guardarOActualizarRegistro(custodia);
            }

            return payload;
        } catch (error) {
            nLog.error("actualizarPrecioProducto - error", error);

            proceso.estado = "001";
            proceso.descripcionResultado = error.message;
            libAuditoria.crearReporteAuditoria(proceso);
            custodia.respuesta = error.message;
            custodia.codigoRespuesta = proceso.estado;

            if (custodia.internalid && custodia.internalid.length > 0) {
                custodia.internalid = custodia.internalid[0].internalid;
                proceso.registroCustodia = libCustodia.actualizarRegistro(custodia);
            } else {
                custodia.reintentos = 0;
                proceso.registroCustodia = libCustodia.guardarOActualizarRegistro(custodia);
            }

            throw error;
        }
    };

    const crearOrdenConsumo = (parametro) => {
        try {
            nLog.audit("crearOrdenConsumo - parametro", parametro);
            const { tipoMensaje, consumoMedicamentos } = parametro;
            nLog.debug("crearOrdenConsumo - consumoMedicamentos", consumoMedicamentos);
            const { pacNumficha, ingCorrel, consumo, numeroCuentaPaciente, identificadorUnicoPaciente, detalleLineasEliminar, detalleConsumo } = consumoMedicamentos;
            let isConsumo = true;
            if (consumo === "N") isConsumo = false;

            custodia.custrecord_2win_as_tiempo_proceso = Date.now();
            custodia.custrecord_2win_as_interface = "Confirmar consumo";
            custodia.datosEntrada = JSON.stringify(parametro);
            custodia.externalid = numeroCuentaPaciente ? `crearOrdenConsumo_${numeroCuentaPaciente}` : "crearOrdenConsumo_sinControlID";
            proceso.etapa = crearOrdenConsumo.name;
            proceso.scriptId = runtime.getCurrentScript().id;
            proceso.tokenProceso = libAuditoria.obtenerToken();
            payload.tipoMensaje = tipoMensaje || "";

            custodia.internalid = libCustodia.busquedaRegistroCustodia(custodia.externalid);
            const ordenVentaId = daoOrdenVenta.buscar(numeroCuentaPaciente, true);
            if (!ordenVentaId) throw new Error("Orden de venta no encontrada.");
            const Farmacia = new daoFarmacia(ordenVentaId);

            if (isConsumo) {
                const detalleLineasEliminarMapeado = detalleLineasEliminar?.map((e) => e.identificadorUnicoFila) ?? [];

                nLog.audit("crearOrdenConsumo - Iniciando pre-carga de datos", {
                    totalLineas: detalleConsumo.length
                });

                const itemsLocations = [];
                const rutsFinanciadores = [];

                detalleConsumo.forEach((e) => {
                    if (e.proCodigo && e.bodega) {
                        itemsLocations.push({
                            itemId: e.proCodigo,
                            locationCode: e.bodega
                        });
                    }
                    if (e.rutFinanciador) {
                        rutsFinanciadores.push(libFormato.formatearRut(e.rutFinanciador));
                    }
                });

                let mapaStock = new Map();
                let mapaClientes = new Map();

                if (itemsLocations.length > 0) {
                    mapaStock = daoProducto.getStockMasivo(itemsLocations);
                    nLog.audit("crearOrdenConsumo - Stock cargado", {
                        combinacionesBuscadas: itemsLocations.length,
                        combinacionesEncontradas: mapaStock.size
                    });
                }

                if (rutsFinanciadores.length > 0) {
                    mapaClientes = daoCliente.busquedaMasivaPorRut(rutsFinanciadores);
                    nLog.audit("crearOrdenConsumo - Clientes cargados", {
                        rutsBuscados: rutsFinanciadores.length,
                        clientesEncontrados: mapaClientes.size
                    });
                }

                const lineasConError = [];
                const lineasExitosas = [];

                detalleConsumo.forEach((e) => {
                    try {
                        const {
                            crgCorrel,
                            proCodigo,
                            cantidad,
                            bodega,
                            unidadMedida,
                            codServicio,
                            codConvenio,
                            nombreConvenio,
                            rutFinanciador,
                            codPaquete,
                            nombrePaquete,
                            valorNeto,
                            valorExento,
                            valorIVA,
                            valorTotal
                        } = e;

                        if (!proCodigo) throw new Error("Producto no definido");
                        if (!bodega) throw new Error("Bodega no definida");
                        if (!unidadMedida) throw new Error("Unidad de producto no definida");
                        if (!cantidad) throw new Error("Cantidad a asignar no definida");
                        if (!valorNeto && !valorExento) throw new Error("Valor Monetario de producto no definido");

                        const claveStock = `${proCodigo}_${bodega}`;
                        const productoDatos = mapaStock.get(claveStock);

                        if (!productoDatos) throw new Error(`No se encontró el producto de código ${proCodigo} en la bodega ${bodega}`);
                        if (productoDatos.quantityavailable < cantidad) throw new Error(`No hay stock disponible para el producto ${proCodigo} en la bodega ${bodega}`);
                        if (productoDatos.abbreviation !== unidadMedida.trim()) throw new Error(`Unidad de producto no valida ${unidadMedida.trim()} vs ${productoDatos.abbreviation}`);
                        nLog.debug("productoDatos", productoDatos);
                        let idFinanciador;
                        if (rutFinanciador) {
                            const rutFormateado = libFormato.formatearRut(rutFinanciador);
                            idFinanciador = mapaClientes.get(rutFormateado);
                            if (!idFinanciador) {
                                throw new Error(`No se encontró el cliente con RUT ${rutFormateado}`);
                            }
                        }

                        lineasExitosas.push({
                            item: proCodigo,
                            custcol_2win_flag_item_provisional: false,
                            custcol_2win_as_nombre_convenio: nombreConvenio,
                            custcol_2win_as_codigo_convenio: codConvenio,
                            custcol_2win_as_nombre_paquete: nombrePaquete,
                            custcol_2win_as_codigo_paquete: codPaquete,
                            custcol_2win_as_codigo_servicio: codServicio,
                            inventorylocation: productoDatos.locationid,
                            subsidiarylocation: productoDatos.locationsubsidiary,
                            custcol_2win_as_rut_financiador: idFinanciador,
                            quantity: cantidad,
                            price: -1,
                            rate: valorNeto,
                            tax1amt: valorIVA * cantidad,
                            custcol_2win_as_identificador_fila: crgCorrel
                        });
                    } catch (error) {
                        nLog.error("crearOrdenConsumo - Error en línea", {
                            crgCorrel: e.crgCorrel,
                            proCodigo: e.proCodigo,
                            error: error.message
                        });

                        lineasConError.push({
                            crgCorrel: e.crgCorrel,
                            proCodigo: e.proCodigo || "NO_DEFINIDO",
                            error: error.message
                        });
                    }
                });

                // Si todas las líneas fallaron, lanzar error
                if (lineasExitosas.length === 0) {
                    throw new Error(`Todas las líneas de consumo fallaron. Errores: ${lineasConError.map((err) => `[${err.crgCorrel}] ${err.error}`).join("; ")}`);
                }

                // Procesar solo las líneas exitosas
                const resultadoGuardar = Farmacia.guardarOrden(detalleLineasEliminarMapeado, lineasExitosas);

                // --- Manejo de errorGeneral (fallo catastrófico en guardarOrden) ---
                if (resultadoGuardar.errorGeneral) {
                    throw new Error(`Error crítico al guardar la orden: ${resultadoGuardar.errorGeneral}`);
                }

                Farmacia.save();

                // Combinar errores de validación inicial con errores de guardado
                const erroresTotales = [...lineasConError];

                // Agregar líneas que no se pudieron eliminar
                if (resultadoGuardar.lineasNoEliminadas && resultadoGuardar.lineasNoEliminadas.length > 0) {
                    resultadoGuardar.lineasNoEliminadas.forEach((lineaNoEliminada) => {
                        erroresTotales.push({
                            crgCorrel: lineaNoEliminada.identificador,
                            proCodigo: "N/A",
                            error: `[Eliminación fallida] ${lineaNoEliminada.error}`
                        });
                    });
                }

                // Agregar líneas duplicadas al array de errores
                if (resultadoGuardar.lineasDuplicadas && resultadoGuardar.lineasDuplicadas.length > 0) {
                    resultadoGuardar.lineasDuplicadas.forEach((lineaDuplicada) => {
                        erroresTotales.push({
                            crgCorrel: lineaDuplicada.identificador,
                            proCodigo: lineaDuplicada.item,
                            error: lineaDuplicada.error
                        });
                    });
                }

                const totalExitosas = resultadoGuardar.lineasExitosas ? resultadoGuardar.lineasExitosas.length : 0;

                const mensajeErrores = erroresTotales.length > 0 ? ` con ${erroresTotales.length} línea(s) con error` : "";
                proceso.descripcionResultado = `Consumo registrado correctamente: ${totalExitosas} línea(s) exitosa(s)${mensajeErrores}`;
                libAuditoria.crearReporteAuditoria(proceso);

                if (erroresTotales.length > 0) {
                    payload.estado = "partial";
                    payload.codigo = 207;

                    const lineasSinStock = erroresTotales.filter((err) => err.error.includes("No hay stock disponible") || err.error.includes("Stock insuficiente")).map((err) => err.crgCorrel);

                    const lineasConStock = resultadoGuardar.lineasExitosas ? resultadoGuardar.lineasExitosas.map((l) => l.identificador) : [];

                    const lineasConOtrosErrores = erroresTotales.filter((err) => !(err.error.includes("No hay stock disponible") || err.error.includes("Stock insuficiente")));

                    payload.data = {
                        lineasExitosas: totalExitosas,
                        lineasConError: lineasConOtrosErrores,
                        // detalleExitosas: resultadoGuardar.lineasExitosas || [],
                        lineasNoEliminadas: resultadoGuardar.lineasNoEliminadas || []
                    };
                    payload.SinStock = lineasSinStock;
                    payload.Cargos = lineasConStock;
                    payload.mensaje = `Consumo procesado: ${totalExitosas} exitosas, ${lineasConOtrosErrores.length} con error`;
                    custodia.respuesta = `Consumo parcial: ${totalExitosas} exitosas, ${lineasConOtrosErrores.length} con error`;
                } else {
                    const lineasConStock = resultadoGuardar.lineasExitosas ? resultadoGuardar.lineasExitosas.map((l) => l.identificador) : [];

                    payload.mensaje = "Consumo confirmado con exito";
                    payload.data = {
                        lineasExitosas: totalExitosas,
                        lineasConError: [],
                        lineasNoEliminadas: []
                    };
                    payload.SinStock = [];
                    payload.Cargos = lineasConStock;
                    custodia.respuesta = "Consumo confirmado con exito";
                }

                custodia.codigoRespuesta = proceso.estado;

                if (custodia.internalid && custodia.internalid.length > 0) {
                    custodia.internalid = custodia.internalid[0].internalid;
                    proceso.registroCustodia = libCustodia.actualizarRegistro(custodia);
                } else {
                    custodia.reintentos = 0;
                    proceso.registroCustodia = libCustodia.guardarOActualizarRegistro(custodia);
                }

                return payload;
            } else {
                Farmacia.eliminarLineasProvisionales();
                Farmacia.save();

                proceso.descripcionResultado = "Anulacion de consumo registrado correctamente";
                libAuditoria.crearReporteAuditoria(proceso);

                custodia.respuesta = "Anulacion de consumo confirmado con exito";
                payload.mensaje = "Anulacion de consumo confirmado con exito";
                custodia.codigoRespuesta = proceso.estado;

                if (custodia.internalid && custodia.internalid.length > 0) {
                    custodia.internalid = custodia.internalid[0].internalid;
                    proceso.registroCustodia = libCustodia.actualizarRegistro(custodia);
                } else {
                    custodia.reintentos = 0;
                    proceso.registroCustodia = libCustodia.guardarOActualizarRegistro(custodia);
                }

                return payload;
            }
        } catch (error) {
            nLog.error("crearOrdenConsumo - error", error);

            proceso.estado = "001";
            proceso.descripcionResultado = error.message;
            libAuditoria.crearReporteAuditoria(proceso);
            custodia.respuesta = error.message;
            custodia.codigoRespuesta = proceso.estado;

            if (custodia.internalid && custodia.internalid.length > 0) {
                custodia.internalid = custodia.internalid[0].internalid;
                proceso.registroCustodia = libCustodia.actualizarRegistro(custodia);
            } else {
                custodia.reintentos = 0;
                proceso.registroCustodia = libCustodia.guardarOActualizarRegistro(custodia);
            }

            throw error;
        }
    };

    const devolverConsumo = (parametro) => {
        try {
            if (parametro.length === 0) {
                payload.mensaje = "No se hizo nada porque no hay data que procesar";
                return payload;
            }
            nLog.audit("devolverConsumo - parametro", parametro);
            let { tipoMensaje, devolucionMedicamentos } = parametro[0];
            nLog.debug("devolverConsumo - devolucionMedicamentos", devolucionMedicamentos);
            devolucionMedicamentos = [devolucionMedicamentos];
            const { numeroCuentaPaciente } = devolucionMedicamentos[0] || {};
            custodia.custrecord_2win_as_tiempo_proceso = Date.now();
            custodia.custrecord_2win_as_interface = "Devolver Consumo Farmacia";
            custodia.datosEntrada = JSON.stringify(parametro);
            custodia.externalid = numeroCuentaPaciente ? `devolverConsumo_${numeroCuentaPaciente}` : "devolverConsumo_sinControlID";
            proceso.etapa = devolverConsumo.name;
            proceso.scriptId = runtime.getCurrentScript().id;
            proceso.tokenProceso = libAuditoria.obtenerToken();
            payload.tipoMensaje = tipoMensaje || "";

            custodia.internalid = libCustodia.busquedaRegistroCustodia(custodia.externalid);

            const ordenVentaId = daoOrdenVenta.buscar(numeroCuentaPaciente, true);
            if (!ordenVentaId) throw new Error("Orden de venta no encontrada.");

            const Farmacia = new daoFarmacia(ordenVentaId);

            const lineasConError = [];
            const lineasExitosas = [];

            devolucionMedicamentos.forEach((devolucionMedicamento) => {
                try {
                    let { identificadorUnicoPaciente, numeroFicha, numeroIngreso, codigoProducto, cantidadDevuelta, IdentificadorUnicoFila } = devolucionMedicamento;
                    cantidadDevuelta = Number(cantidadDevuelta);
                    if (!IdentificadorUnicoFila && !identificadorUnicoPaciente) throw new Error("Identificador único de fila no definido");
                    if (!cantidadDevuelta) throw new Error("Cantidad devuelta no definida");
                    if (cantidadDevuelta <= 0) throw new Error("Cantidad devuelta debe ser mayor a cero");

                    const identificadorFinal = IdentificadorUnicoFila || identificadorUnicoPaciente;
                    Farmacia.devolver(identificadorFinal, cantidadDevuelta);

                    lineasExitosas.push({
                        identificadorUnicoFila: identificadorFinal,
                        codigoProducto: codigoProducto || "NO_DEFINIDO",
                        cantidadDevuelta: cantidadDevuelta,
                        numeroFicha: numeroFicha,
                        numeroIngreso: numeroIngreso
                    });
                } catch (error) {
                    nLog.error("devolverConsumo - Error en línea", {
                        identificadorUnicoFila: devolucionMedicamento.IdentificadorUnicoFila || devolucionMedicamento.identificadorUnicoPaciente,
                        error: error.message
                    });

                    lineasConError.push({
                        identificadorUnicoFila: devolucionMedicamento.IdentificadorUnicoFila || devolucionMedicamento.identificadorUnicoPaciente || "NO_DEFINIDO",
                        codigoProducto: devolucionMedicamento.codigoProducto || "NO_DEFINIDO",
                        error: error.message
                    });
                }
            });

            if (lineasExitosas.length === 0) {
                throw new Error(`Todas las líneas de devolución fallaron. Errores: ${lineasConError.map((err) => `[${err.identificadorUnicoFila}] ${err.error}`).join("; ")}`);
            }

            Farmacia.save();

            const mensajeErrores = lineasConError.length > 0 ? ` con ${lineasConError.length} línea(s) con error` : "";
            proceso.descripcionResultado = `Devoluciones procesadas correctamente: ${lineasExitosas.length} línea(s) exitosa(s)${mensajeErrores}`;
            libAuditoria.crearReporteAuditoria(proceso);

            if (lineasConError.length > 0) {
                payload.estado = "partial";
                payload.codigo = 207;
                payload.mensaje = `Devoluciones procesadas: ${lineasExitosas.length} exitosas, ${lineasConError.length} con error`;
                payload.data = {
                    lineasExitosas: lineasExitosas.length,
                    lineasConError: lineasConError
                    // detalleExitosas: lineasExitosas
                };
                custodia.respuesta = `Devolución parcial: ${lineasExitosas.length} exitosas, ${lineasConError.length} con error`;
            } else {
                payload.mensaje = "Devoluciones procesadas con éxito";
                payload.data = {
                    lineasExitosas: lineasExitosas.length,
                    lineasConError: []
                };
                custodia.respuesta = "Devoluciones procesadas con éxito";
            }

            custodia.codigoRespuesta = proceso.estado;

            if (custodia.internalid && custodia.internalid.length > 0) {
                custodia.internalid = custodia.internalid[0].internalid;
                proceso.registroCustodia = libCustodia.actualizarRegistro(custodia);
            } else {
                custodia.reintentos = 0;
                proceso.registroCustodia = libCustodia.guardarOActualizarRegistro(custodia);
            }

            return payload;
        } catch (error) {
            nLog.error("devolverConsumo - error", error);

            proceso.estado = "001";
            proceso.descripcionResultado = error.message;
            libAuditoria.crearReporteAuditoria(proceso);
            custodia.respuesta = error.message;
            custodia.codigoRespuesta = proceso.estado;

            if (custodia.internalid && custodia.internalid.length > 0) {
                custodia.internalid = custodia.internalid[0].internalid;
                proceso.registroCustodia = libCustodia.actualizarRegistro(custodia);
            } else {
                custodia.reintentos = 0;
                proceso.registroCustodia = libCustodia.guardarOActualizarRegistro(custodia);
            }

            throw error;
        }
    };

    return { consultarStock, actualizarPrecioProducto, crearOrdenConsumo, devolverConsumo };
});
