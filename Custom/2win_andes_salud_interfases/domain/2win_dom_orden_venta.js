/**
 * @NApiVersion 2.1
 * @module ./2win_dom_orden_venta.js
 * @NModuleScope Public
 */
define([
    "../lib/2win_lib_auditoria",
    "../lib/2win_lib_custodia",
    "../lib/2win_lib_formato",
    "../lib/2win_lib_mapeo_json",
    "../lib/2win_lib_mapeo",
    "../dao/2win_dao_file",
    "../dao/2win_dao_orden_venta",
    "../dao/2win_dao_producto",
    "../dao/2win_dao_static_params_operacion",
    "../dao/2win_dao_agregar_lineas_queue",
    "N/cache",
    "N/crypto/random",
    "N/file",
    "N/log",
    "N/runtime",
    "N/task"
], function (
    libAuditoria,
    libCustodia,
    libFormato,
    libMapeoJson,
    libMapeo,
    daoFile,
    daoOrdenVenta,
    daoProducto,
    daoParametrosOperacion,
    daoAgregarLineasQueue,
    cache,
    random,
    file,
    nLog,
    runtime,
    task
) {
    // Variable para almacenar la respuesta
    let respuesta = {
        tipoMensaje: "",
        estado: {
            success: "",
            codigo: 200,
            mensaje: ""
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

    /**
     * @description Valida existencia previa de uuid y genera uuid.
     * @function obtenerUuid.
     * @param {number} idCarpeta - ID de carpeta.
     * @return {string} - UUID.
     */
    function obtenerUuid(idCarpeta) {
        try {
            nLog.audit("obtenerUuid - idCarpeta", { idCarpeta: idCarpeta });

            // Generar uuid
            let uuid = random.generateUUID();
            nLog.audit("obtenerUuid - uuid", { uuid: uuid });

            // Validar si existe archivo con mismo uuid
            let archivoExistente = daoFile.buscarArchivoPorNombre(uuid, idCarpeta);
            nLog.debug("recepcionDatos - archivoExistente", { archivoExistente: archivoExistente });
            if (archivoExistente && archivoExistente.length > 0) {
                // Si existe archivo, generar nuevo uuid
                obtenerUuid();
            } else {
                return uuid;
            }
        } catch (error) {
            nLog.error("obtenerUuid - error", error);
            throw error;
        }
    }

    /**
     * @function recepcionDatos - Función para recepcionar datos y crear archivo en el gabineta de netsuite.
     * @param {object} parametro - Parametro para ejecucion.
     * @returns {Object} - Datos de ejecucion.
     */
    function recepcionDatos(parametro) {
        try {
            nLog.audit("recepcionDatos - parametro", parametro);

            // Ajustar objeto proceso
            let fecha = new Date();
            proceso.etapa = recepcionDatos.name;
            proceso.scriptId = runtime.getCurrentScript().id;
            proceso.tokenProceso = libAuditoria.obtenerToken(); // Generar token para auditoria
            custodia.custrecord_2win_as_tiempo_proceso = Date.now(); // Marca de inicio
            custodia.custrecord_2win_as_interface = "ingresos ambulatorios";
            custodia.datosEntrada = JSON.stringify(parametro);

            // Nombres de parametros de operacion necesarios
            let nombresParmetrosOperacion = ["id_carpeta_archivos_ingresos_ambulatorios_hospitalizados"];
            let valoresParametrosOperacion = [];

            // Recuperar cada parametro de operacion
            nombresParmetrosOperacion.forEach(function (nombreParametro) {
                let parametroOperacion = daoParametrosOperacion.getParam(nombreParametro);
                nLog.debug("recepcionDatos - parametroOperacion", parametroOperacion);
                valoresParametrosOperacion.push(parametroOperacion);
            });
            nLog.debug("recepcionDatos - valoresParametrosOperacion", valoresParametrosOperacion);

            let uuid = obtenerUuid(valoresParametrosOperacion[0].text); // Se genera uuid para usar como idenfificador de proceso
            custodia.externalid = `ingresos_ambulatorios_${uuid}`;
            respuesta.estado.tipo_proceso = custodia.custrecord_2win_as_interface;
            respuesta.estado.id_proceso = uuid;

            // Validar tipo de mensaje
            if (parametro.tipoMensaje && (parametro.tipoMensaje === "SEND^IN" || parametro.tipoMensaje === "SEND^REV")) {
                custodia.custrecord_2win_as_interface = parametro.tipoMensaje === "SEND^IN" ? "ingresos ambulatorios send in rl" : "ingresos ambulatorios send rev rl";
                respuesta.tipoMensaje = parametro.tipoMensaje;

                // Verificar que el objeto tenga las propiedades necesarias
                if (parametro.datos.FechaEnvio && parametro.datos.Pacientes.length > 0) {
                    custodia.externalid = parametro.tipoMensaje === "SEND^IN" ? `ingresos_ambulatorios_send_in_rl_${uuid}` : `ingresos_ambulatorios_send_rev_rl_${uuid}`;

                    // Definir datos para crear archivo
                    let datosArchivo = {
                        nombre: `${uuid}.json`, // Usar uuid generado como nombre de archivo
                        contenido: JSON.stringify(parametro, null, 2),
                        folder: valoresParametrosOperacion[0].text, // ID de carpeta para ingresos ambulatorios
                        tipo: file.Type.JSON,
                        encoding: file.Encoding.UTF8
                    };

                    // Crear archivo con datos definidos
                    let archivoCreado = daoFile.crearArchivo(datosArchivo);
                    nLog.debug("recepcionDatos - archivoCreado", {
                        archivoCreado: archivoCreado
                    });

                    // Validar el tipo de mensaje para agregar a la cola correspondiente
                    if (parametro.tipoMensaje === "SEND^IN") {
                        // Agregar a la cola de procesamiento de agregar líneas
                        archivoCreado.nombre = datosArchivo.nombre;
                        archivoCreado.tipoMensaje = parametro.tipoMensaje;
                        let resultadoCola = daoAgregarLineasQueue.addToQueue(archivoCreado);
                        nLog.audit("recepcionDatos - addToQueue", resultadoCola);

                        if (!resultadoCola.success) {
                            throw new Error(`Error al agregar a la cola: ${resultadoCola.message}`);
                        }
                        const hayActivos = daoAgregarLineasQueue.verificarMapReduceActivo("customdeploy_2win_mr_andessalud_ov_ag_li");
                        if (!hayActivos) {
                            try {
                                let tareaMapReduce = task.create({
                                    taskType: task.TaskType.MAP_REDUCE,
                                    scriptId: "customscript_2win_mr_andessalud_ov_ag_li",
                                    deploymentId: "customdeploy_2win_mr_andessalud_ov_ag_li",
                                    params: {
                                        cuscript_mr_as_eliminar_datos_entrada: JSON.stringify(archivoCreado)
                                    }
                                });
                                let idTarea = tareaMapReduce.submit();
                                nLog.audit("recepcionDatos - tareaMapReduce SEND^REV", idTarea);
                            } catch (error) {
                                nLog.error("recepcionDatos - error al crear tarea Map/Reduce", error);
                            }
                        } else {
                            nLog.audit("recepcionDatos - tareaMapReduce SEND^IN no iniciada por existencia de tarea activa", {
                                scriptId: "customscript_2win_mr_andessalud_ov_ag_li",
                                deploymentId: "customdeploy_2win_mr_andessalud_ov_ag_li"
                            });
                        }
                    } else if (parametro.tipoMensaje === "SEND^REV") {
                        // Crear y enviar tarea de procesamiento (mantener lógica existente para SEND^REV)
                        archivoCreado.nombre = datosArchivo.nombre;
                        archivoCreado.tipoMensaje = parametro.tipoMensaje;
                        let resultadoCola = daoAgregarLineasQueue.addToQueue(archivoCreado);
                        if (!resultadoCola.success) {
                            throw new Error(`Error al agregar a la cola: ${resultadoCola.message}`);
                        }
                        const hayActivos = daoAgregarLineasQueue.verificarMapReduceActivo("customdeploy_2win_mr_andessalud_ov_el_li");
                        if (!hayActivos) {
                            try {
                                let tareaMapReduce = task.create({
                                    taskType: task.TaskType.MAP_REDUCE,
                                    scriptId: "customscript_2win_mr_andessalud_ov_el_li",
                                    deploymentId: "customdeploy_2win_mr_andessalud_ov_el_li",
                                    params: {
                                        custscript_mr_as_eliminar_datos_entrada: JSON.stringify(archivoCreado)
                                    }
                                });
                                let idTarea = tareaMapReduce.submit();
                                nLog.audit("recepcionDatos - tareaMapReduce SEND^REV", idTarea);
                            } catch (error) {
                                nLog.error("recepcionDatos - error al crear tarea Map/Reduce", error);
                            }
                        } else {
                            nLog.audit("recepcionDatos - tareaMapReduce SEND^REV no iniciada por existencia de tarea activa", {
                                scriptId: "customscript_2win_mr_andessalud_ov_el_li",
                                deploymentId: "customdeploy_2win_mr_andessalud_ov_el_li"
                            });
                        }
                    }

                    proceso.tipoRegistroCreado = file.Type.JSON;
                    proceso.idRegistroCreado = archivoCreado.id;
                    proceso.descripcionResultado = parametro.tipoMensaje === "SEND^IN" ? `Batch de cargos ambulatorios recibido correctamente` : `Actualización de cargos recibido con éxito`;
                } else {
                    respuesta.estado.success = true;
                    respuesta.estado.mensaje = "Archivo recibido pero no se encontraron datos para procesar";
                    return respuesta;
                }
            } else {
                throw new Error(`tipoMensaje: ${parametro.tipoMensaje} no es válido`);
            }

            // Crear registro auditoria
            libAuditoria.crearReporteAuditoria(proceso);

            // Ajustar propiedades de respuesta
            custodia.respuesta = proceso.descripcionResultado;
            respuesta.estado.mensaje = proceso.descripcionResultado;
            respuesta.estado.success = true;
            custodia.codigoRespuesta = proceso.estado;

            // Ejecutar busqueda para validar existencia de registro custodia para el mensaje
            custodia.registroExistente = libCustodia.busquedaRegistroPorExternalid(custodia.externalid);

            // Validar si existe registro de custodia
            if (custodia.registroExistente && custodia.registroExistente.length > 0 && custodia.registroExistente[0].codigoRespuesta !== "000") {
                custodia.internalid = custodia.registroExistente[0].internalid;
                // Actualizar registro de custodia
                proceso.registroCustodia = libCustodia.guardarOActualizarRegistro(custodia);
            }

            return respuesta;
        } catch (error) {
            nLog.error("recepcionDatos - error", error);

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
     * @function validarMapearDatosSendIn - Función optimizada para aplicar validaciones y mapeo a estructura de datos entrante.
     * @param {object} parametro - Parametro para ejecucion.
     * @returns {Object} - Datos de entrada y datos mapeados.
     */
    function validarMapearDatosSendIn(parametro) {
        try {
            nLog.audit("validarMapearDatosSendIn - inicio", {
                cantidadLineas: parametro.detallePrestaciones?.length || 0,
                governanciaInicial: runtime.getCurrentScript().getRemainingUsage()
            });

            // Propiedades necesarias para ejecucion
            let propiedadesNecesariasPaciente = ["IdPaciente", "Ficha", "Ingreso", "CuentaPaciente", "RutEmpresa", "TipoAtencion"];
            let propiedadesNecesariasDetallePrestacion = ["CrgCorrel", "CodigoGrupoPrefactura", "RutFinanciador", "CodigoConvenio", "Total", "CodServicio"];

            // Verificar que el objeto tenga las propiedades necesarias
            libFormato.verificarPropiedades(parametro, propiedadesNecesariasPaciente);

            nLog.audit("", "validarMapearDatosSendIn - iniciando carga masiva de productos");

            // Extraer todos los códigos UPC únicos de las prestaciones
            let codigosProductos = [];
            if (parametro.detallePrestaciones && parametro.detallePrestaciones.length > 0) {
                codigosProductos = parametro.detallePrestaciones.map((p) => p.CodigoGrupoPrefactura).filter((c) => c && c.trim() !== "");
            }

            // Crear caché de productos con búsqueda masiva (SOLO UNA CONSULTA SQL)
            let cacheProductos = {};
            if (codigosProductos.length > 0) {
                cacheProductos = daoProducto.busquedaMasivaPorUpcCode(codigosProductos);
                nLog.audit("validarMapearDatosSendIn - caché de productos creado", {
                    solicitados: codigosProductos.length,
                    encontrados: Object.keys(cacheProductos).length,
                    governanciaDespues: runtime.getCurrentScript().getRemainingUsage()
                });
            }

            let camposMapeados = libMapeoJson.mapearCamposCuerpoIngresoAmbulatorio(parametro);

            // Verificar que el objeto tenga lineas a procesar
            if (parametro.detallePrestaciones && parametro.detallePrestaciones.length > 0) {
                // Variable para almacenar lineas validas para procesar
                camposMapeados.item = [];

                // Recorrer cada detalle para validar que contenga los datos requeridos
                for (let indice = 0; indice < parametro.detallePrestaciones.length; indice++) {
                    try {
                        // Validar datos requeridos
                        libFormato.verificarPropiedades(parametro.detallePrestaciones[indice], propiedadesNecesariasDetallePrestacion);

                        let linea = libMapeoJson.mapearCamposLineaIngresoAmbulatorio(
                            parametro.detallePrestaciones[indice],
                            cacheProductos // Pasar caché masivo de productos
                        );

                        // Aislar linea verificada para procesar
                        camposMapeados.item.push(linea);
                    } catch (error) {
                        nLog.error(`validarMapearDatosSendIn - error - verificarPropiedades - linea ${indice}`, error);

                        // Marcar linea con error para no procesar
                        parametro.detallePrestaciones[indice].error = error.message;
                        parametro.detallePrestaciones[indice].procesado = false;
                    }
                }

                nLog.audit("validarMapearDatosSendIn - procesamiento completado", {
                    lineasProcesadas: camposMapeados.item.length,
                    lineasConError: parametro.detallePrestaciones.filter((p) => p.procesado === false).length,
                    governanciaFinal: runtime.getCurrentScript().getRemainingUsage()
                });
            } else {
                throw new Error("Se requiere detallePrestaciones");
            }

            return { datosEntrada: parametro, camposMapeados: camposMapeados };
        } catch (error) {
            nLog.error("validarMapearDatosSendIn - error", error);
            throw error;
        }
    }

    /**
     * @function validarMapearDatosSendRev - Función para aplicar validaciones y mapeo a estructura de datos entrante.
     * @param {object} parametro - Parametro para ejecucion.
     * @returns {Object} - Datos de entrada y datos mapeados.
     */
    function validarMapearDatosSendRev(parametro) {
        try {
            nLog.audit("validarMapearDatosSendRev - parametro", parametro);

            // Propiedades necesarias para ejecucion
            let propiedadesNecesariasPaciente = ["CuentaPaciente", "RutEmpresa"];
            let propiedadesNecesariasDetallePrestacion = ["CrgCorrel"];

            // Verificar que el objeto tenga las propiedades necesarias
            libFormato.verificarPropiedades(parametro, propiedadesNecesariasPaciente);

            // Mapear campos de cuerpo registro
            let camposMapeados = libMapeoJson.mapearCamposCuerpoIngresoAmbulatorio(parametro);

            // Verificar que el objeto tenga lineas para procesar
            if (parametro.detallePrestaciones && parametro.detallePrestaciones.length > 0) {
                // Variable para almacenar lineas validas para procesar
                camposMapeados.item = [];

                // Recorrer cada detalle para validar que contenga los datos requeridos
                for (let indice = 0; indice < parametro.detallePrestaciones.length; indice++) {
                    try {
                        // Validar datos requeridos
                        libFormato.verificarPropiedades(parametro.detallePrestaciones[indice], propiedadesNecesariasDetallePrestacion);

                        // Mapear campos de linea para registro
                        let linea = libMapeoJson.mapearCamposLineaIngresoAmbulatorio(parametro.detallePrestaciones[indice]);

                        // Aislar linea verificada para procesar
                        camposMapeados.item.push(linea);
                    } catch (error) {
                        nLog.error(`validarMapearDatosSendRev - error - verificarPropiedades - linea ${indice}`, error);

                        // Marcar linea con error para no procesar
                        parametro.detallePrestaciones[indice].error = error.message;
                        parametro.detallePrestaciones[indice].procesado = false;
                    }
                }
            } else {
                throw new Error("Se requiere detallePrestaciones");
            }

            return { datosEntrada: parametro, camposMapeados: camposMapeados };
        } catch (error) {
            nLog.error("validarMapearDatosSendRev - error", error);
            throw error;
        }
    }

    /**
     * @function agregarLineasRegistroNetsuite - Función para editar un registro en netsuite.
     * @param {object} parametro - Parametro para ejecucion.
     * @returns {Object} - Datos de ejecucion.
     */
    function agregarLineasRegistroNetsuite(parametro) {
        try {
            nLog.audit("agregarLineasRegistroNetsuite - parametro", parametro);

            // Editar registro
            proceso.datos = parametro.camposMapeados;
            proceso = daoOrdenVenta.agregarLineasRegistro(proceso);
            nLog.debug("agregarLineasRegistroNetsuite - detallePrestaciones", { detallePrestaciones: parametro.datosEntrada.detallePrestaciones });
            nLog.debug("agregarLineasRegistroNetsuite - proceso.datos.item", { items: proceso.datos.item });

            // Recorre cada linea para la que se ejecuto proceso
            for (let index = 0; index < proceso.datos.item.length; index++) {
                // Recorre cada linea del dato de entrada original
                for (let ind = 0; ind < parametro.datosEntrada.detallePrestaciones.length; ind++) {
                    // Validar si el identificador coincide entre lineas
                    if (proceso.datos.item[index].custcol_2win_as_identificador_fila === parametro.datosEntrada.detallePrestaciones[ind].CrgCorrel) {
                        // Validar si la linea fue procesada
                        if (proceso.datos.item[index].procesado === false) {
                            // Marcar linea en dato de entrada original como no procesada
                            parametro.datosEntrada.detallePrestaciones[ind].error = proceso.datos.item[index].error;
                            parametro.datosEntrada.detallePrestaciones[ind].procesado = false;
                        }
                    }
                }
            }

            return { datosEntrada: parametro.datosEntrada, camposMapeados: parametro.camposMapeados };
        } catch (error) {
            nLog.error("agregarLineasRegistroNetsuite - error", error);
            throw error;
        }
    }

    /**
     * @function eliminarLineasRegistroNetsuite - Función para editar un registro en netsuite.
     * @param {object} parametro - Parametro para ejecucion.
     * @returns {Object} - Datos de ejecucion.
     */
    function eliminarLineasRegistroNetsuite(parametro) {
        try {
            nLog.audit("eliminarLineasRegistroNetsuite - parametro", parametro);

            // Editar registro
            proceso.datos = parametro.camposMapeados;
            proceso = daoOrdenVenta.eliminarLineasRegistro(proceso);
            nLog.debug("eliminarLineasRegistroNetsuite - detallePrestaciones", { detallePrestaciones: parametro.datosEntrada.detallePrestaciones });
            nLog.debug("eliminarLineasRegistroNetsuite - proceso.datos.item", { items: proceso.datos.item });

            // Recorre cada linea para la que se ejecuto proceso
            for (let index = 0; index < proceso.datos.item.length; index++) {
                // Recorre cada linea del dato de entrada original
                for (let ind = 0; ind < parametro.datosEntrada.detallePrestaciones.length; ind++) {
                    // Validar si el identificador coincide entre lineas
                    if (proceso.datos.item[index].custcol_2win_as_identificador_fila === parametro.datosEntrada.detallePrestaciones[ind].CrgCorrel) {
                        // Validar si la linea fue procesada
                        if (proceso.datos.item[index].procesado === false) {
                            // Marcar linea en dato de entrada original como no procesada
                            parametro.datosEntrada.detallePrestaciones[ind].error = proceso.datos.item[index].error;
                            parametro.datosEntrada.detallePrestaciones[ind].procesado = false;
                        }
                    }
                }
            }

            return { datosEntrada: parametro.datosEntrada, camposMapeados: parametro.camposMapeados };
        } catch (error) {
            nLog.error("eliminarLineasRegistroNetsuite - error", error);
            throw error;
        }
    }

    /**
     *
     * @param {*} parametro
     * @returns
     */
    function actualizarLineaRegistroNetsuite(parametro) {
        try {
            nLog.audit("actualizarLineaRegistroNetsuite - parametro", parametro);
            parametro = parametro[0];
            // Ajustar objeto proceso
            custodia.custrecord_2win_as_tiempo_proceso = Date.now(); // Marca de inicio
            custodia.custrecord_2win_as_interface = "actualizarLineaRegistroNetsuite";
            /**@todo - Pendiente definir campo para mensaje */
            custodia.datosEntrada = JSON.stringify(parametro);
            /**@todo - externalid provisional */
            if (!parametro.consumoMedicamentos) {
                throw new Error("No se han recibido datos para ejecucion");
            }

            custodia.externalid = `actualizarLineaRegistroNetsuite_${parametro.consumoMedicamentos.numeroCuentaPaciente}_${parametro.consumoMedicamentos.identificadorUnicoFila}`;
            proceso.etapa = actualizarLineaRegistroNetsuite.name;
            proceso.scriptId = runtime.getCurrentScript().id;
            proceso.tokenProceso = libAuditoria.obtenerToken(); // Generar token para auditoria
            respuesta.tipoMensaje = parametro.tipoMensaje;

            // Ejecutar busqueda para validar existencia de registro custodia para el mensaje
            custodia.internalid = libCustodia.busquedaRegistroCustodia(custodia.externalid);

            // Validar existencia de datos para ejecucion

            daoOrdenVenta.actualizarLineasRegistro(parametro);

            // Crear registro auditoria
            proceso.descripcionResultado = "Registro editado correctamente";
            libAuditoria.crearReporteAuditoria(proceso);

            // Ajustar propiedades de respuesta
            custodia.respuesta = "Actualización de producto recibido con éxito";
            custodia.codigoRespuesta = proceso.estado;

            // Validar si existe registro de custodia
            if (custodia.internalid && custodia.internalid.length > 0) {
                custodia.internalid = custodia.internalid[0].internalid;
                // Actualizar registro de custodia
                proceso.registroCustodia = libCustodia.actualizarRegistro(custodia);
            }

            return {
                tipoMensaje: "ActualizacionPrecioProducto",
                estado: {
                    success: true,
                    codigo: 200,
                    mensaje: "Acción registrada correctamente en NetSuite"
                },
                data: {}
            };
        } catch (error) {
            nLog.error("actualizarLineaRegistroNetsuite - error", error);

            // Crear registro auditoria
            proceso.estado = "001";
            proceso.descripcionResultado = error.message;
            libAuditoria.crearReporteAuditoria(proceso);
            custodia.respuesta = error.message;
            custodia.codigoRespuesta = proceso.estado;

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
    }

    function actualizacionMasivaRegistros(parametro) {
        try {
            nLog.audit("actualizacionMasivaRegistros - parametro", parametro);
            const cuentas = parametro?.gestionCuenta;
            if (!cuentas || !Array.isArray(cuentas) || cuentas.length === 0) {
                throw new Error("El parámetro debe ser un arreglo de registros y no puede estar vacío.");
            }

            // Crear archivo con los datos de actualización
            const uuid = random.generateUUID();
            const nombreArchivo = `${uuid}.json`;
            const datosArchivo = {
                nombre: nombreArchivo,
                contenido: JSON.stringify({ id: uuid, gestionCuenta: cuentas }, null, 2),
                folder: 1247, // carpeta raíz; ajustar según necesidad
                tipo: file.Type.JSON,
                encoding: file.Encoding.UTF8
            };
            const archivoCreado = daoFile.crearArchivo(datosArchivo);
            nLog.debug("actualizacionMasivaRegistros - archivoCreado", archivoCreado);

            // Crear y enviar la tarea Map/Reduce
            const mapReduceTask = task.create({
                taskType: task.TaskType.MAP_REDUCE,
                scriptId: "customscript_2win_mr_andes_salud_ov_a_v",
                deploymentId: "customdeploy_2win_mr_andes_salud_ov_a_v",
                params: {
                    custscript_record_update_file_id: archivoCreado.id
                }
            });

            const taskId = mapReduceTask.submit();

            nLog.audit("Tarea Map/Reduce enviada", `ID de Tarea: ${taskId}`);

            return {
                tipoMensaje: "SEND^UPD",
                estado: "success",
                codigo: 200,
                mensaje: "La actualización del estado de la cuenta recibida correctamente",
                tipo_proceso: "Gestion de Cuentas",
                id_proceso: uuid,
                data: {}
            };
        } catch (error) {
            nLog.error("actualizacionMasivaRegistros - error", error);
            throw error;
        }
    }

    return {
        recepcionDatos: recepcionDatos,
        validarMapearDatosSendIn: validarMapearDatosSendIn,
        validarMapearDatosSendRev: validarMapearDatosSendRev,
        agregarLineasRegistroNetsuite: agregarLineasRegistroNetsuite,
        eliminarLineasRegistroNetsuite: eliminarLineasRegistroNetsuite,
        actualizarLineaRegistroNetsuite: actualizarLineaRegistroNetsuite,
        actualizacionMasivaRegistros: actualizacionMasivaRegistros
    };
});
