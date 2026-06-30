/**
 * @NApiVersion 2.1
 * @module ./2win_dom_item_servicio.js
 * @NModuleScope Public
 */
define([
    "../lib/2win_lib_auditoria",
    "../lib/2win_lib_custodia",
    "../dao/2win_dao_producto",
    "../dao/2win_dao_file",
    "../dao/2win_dao_static_params_operacion",
    "N/log",
    "N/runtime",
    "N/crypto/random",
    "N/task",
    "N/file"
], function (libAuditoria, libCustodia, daoProducto, daoFile, daoParametrosOperacion, nLog, runtime, random, task, file) {
    let proceso = {
        nombreProceso: "Interfaces andes salud",
        scriptId: "",
        etapa: "",
        estado: "000",
        tokenProceso: "",
        descripcionResultado: ""
    };
    let custodia = {};

    const crearRegistro = (parametro) => {
        const respuesta = {
            tipoMensaje: "CrearItem",
            estado: {
                success: true,
                codigo: 200,
                mensaje: "Acción registrada correctamente en NetSuite"
            },
            data: {}
        };

        try {
            nLog.audit("crear_producto - parametro", parametro);

            custodia.custrecord_2win_as_tiempo_proceso = Date.now();
            custodia.custrecord_2win_as_interface = "Crear Producto";
            custodia.datosEntrada = JSON.stringify(parametro);
            custodia.externalid = `crear_prod_servi_${random.generateUUID()}`;
            proceso.etapa = crearRegistro.name;
            proceso.scriptId = runtime.getCurrentScript().id;
            proceso.tokenProceso = libAuditoria.obtenerToken();
            respuesta.tipoMensaje = parametro.tipoMensaje;

            custodia.internalid = libCustodia.busquedaRegistroCustodia(custodia.externalid);
            if (!custodia.internalid) {
                // Mapear conceptos
                const listaConceptos = daoProducto.mapearCamposConcepto(parametro);

                // Crear objeto de datos para el Map/Reduce
                const datosMapReduce = {
                    listaConceptos: listaConceptos,
                    tipoOperacion: "crear",
                    externalid: custodia.externalid
                };

                // Recuperar parámetros de operación
                let nombresParametrosOperacion = ["id_carpeta_archivos_items_servicio"];
                let valoresParametrosOperacion = [];

                nombresParametrosOperacion.forEach(function (nombreParametro) {
                    let parametroOperacion = daoParametrosOperacion.getParam(nombreParametro);
                    nLog.debug("crearRegistro - parametroOperacion", parametroOperacion);
                    valoresParametrosOperacion.push(parametroOperacion);
                });

                // Crear archivo con los datos
                let datosArchivo = {
                    nombre: `items_servicio_crear_${Date.now()}.json`,
                    contenido: JSON.stringify(datosMapReduce, null, 2),
                    folder: valoresParametrosOperacion[0].text, // ID de carpeta para items de servicio
                    tipo: file.Type.JSON,
                    encoding: file.Encoding.UTF8
                };

                // Crear archivo con datos definidos
                let archivoCreado = daoFile.crearArchivo(datosArchivo);
                nLog.debug("crearRegistro - archivoCreado", {
                    archivoCreado: archivoCreado
                });

                // Crear y enviar tarea de procesamiento Map/Reduce
                let tareaMapReduce = task.create({
                    taskType: task.TaskType.MAP_REDUCE,
                    scriptId: "customscript_2win_mr_andessalud_items_se", // Script ID del Map/Reduce que creamos
                    deploymentId: "customdeploy_2win_mr_andessalud_items_se", // Deployment ID (provisional)
                    params: {
                        custscript_mr_as_items_servicio_datos: JSON.stringify(archivoCreado)
                    }
                });
                let idTarea = tareaMapReduce.submit();
                nLog.debug("crearRegistro - idTarea", idTarea);

                proceso.descripcionResultado = "Tarea de creación de items enviada correctamente";
                libAuditoria.crearReporteAuditoria(proceso);

                custodia.respuesta = "Creación de item recibido con éxito";
                respuesta.estado.mensaje = "Creación de item recibido con éxito";
                custodia.codigoRespuesta = proceso.estado;
            } else {
                throw new Error("El registro de custodia ya existe.");
            }
        } catch (error) {
            nLog.error("crear_producto - error", error);

            proceso.estado = "001";
            proceso.descripcionResultado = error.message;
            libAuditoria.crearReporteAuditoria(proceso);
            custodia.respuesta = error.message;
            custodia.codigoRespuesta = proceso.estado;

            respuesta.estado.mensaje = error.message;
            respuesta.estado.codigo = 400;
            respuesta.estado.success = false;

            if (custodia.internalid) {
                custodia.internalid = custodia.internalid[0].internalid;
                proceso.registroCustodia = libCustodia.actualizarRegistro(custodia);
            } else {
                custodia.reintentos = 0;
                proceso.registroCustodia = libCustodia.guardarOActualizarRegistro(custodia);
            }
            throw error;
        }
        return respuesta;
    };

    const editarRegistro = (parametro) => {
        const respuesta = {
            tipoMensaje: "EditarItem",
            estado: {
                success: true,
                codigo: 200,
                mensaje: "Acción registrada correctamente en NetSuite"
            },
            data: {}
        };

        try {
            nLog.audit("editar_producto - parametro", parametro);

            custodia.custrecord_2win_as_tiempo_proceso = Date.now();
            custodia.custrecord_2win_as_interface = "Editar Producto";
            custodia.datosEntrada = JSON.stringify(parametro);
            custodia.externalid = `editar_prod_servi_${random.generateUUID()}`;
            proceso.etapa = editarRegistro.name;
            proceso.scriptId = runtime.getCurrentScript().id;
            proceso.tokenProceso = libAuditoria.obtenerToken();
            respuesta.tipoMensaje = parametro.tipoMensaje;

            custodia.internalid = libCustodia.busquedaRegistroCustodia(custodia.externalid);
            if (!custodia.internalid) {
                // Mapear conceptos
                const listaConceptos = daoProducto.mapearCamposConcepto(parametro);

                // Crear objeto de datos para el Map/Reduce
                const datosMapReduce = {
                    listaConceptos: listaConceptos,
                    tipoOperacion: "editar",
                    externalid: custodia.externalid
                };

                // Recuperar parámetros de operación
                let nombresParametrosOperacion = ["id_carpeta_archivos_items_servicio"];
                let valoresParametrosOperacion = [];

                nombresParametrosOperacion.forEach(function (nombreParametro) {
                    let parametroOperacion = daoParametrosOperacion.getParam(nombreParametro);
                    nLog.debug("editarRegistro - parametroOperacion", parametroOperacion);
                    valoresParametrosOperacion.push(parametroOperacion);
                });

                // Crear archivo con los datos
                let datosArchivo = {
                    nombre: `items_servicio_editar_${Date.now()}.json`,
                    contenido: JSON.stringify(datosMapReduce, null, 2),
                    folder: valoresParametrosOperacion[0].text, // ID de carpeta para items de servicio
                    tipo: file.Type.JSON,
                    encoding: file.Encoding.UTF8
                };

                // Crear archivo con datos definidos
                let archivoCreado = daoFile.crearArchivo(datosArchivo);
                nLog.debug("editarRegistro - archivoCreado", {
                    archivoCreado: archivoCreado
                });

                // Crear y enviar tarea de procesamiento Map/Reduce
                let tareaMapReduce = task.create({
                    taskType: task.TaskType.MAP_REDUCE,
                    scriptId: "customscript_2win_mr_andessalud_items_se", // Script ID del Map/Reduce que creamos
                    deploymentId: "customdeploy_2win_mr_andessalud_items_se", // Deployment ID (provisional)
                    params: {
                        custscript_mr_as_items_servicio_datos: JSON.stringify(archivoCreado)
                    }
                });
                let idTarea = tareaMapReduce.submit();
                nLog.debug("editarRegistro - idTarea", idTarea);

                proceso.descripcionResultado = "Tarea de edición de items enviada correctamente";
                libAuditoria.crearReporteAuditoria(proceso);

                custodia.respuesta = "Actualización de item recibido con éxito";
                respuesta.estado.mensaje = "Actualización de item recibido con éxito";
                custodia.codigoRespuesta = proceso.estado;
            } else {
                throw new Error("El registro de custodia ya existe.");
            }
        } catch (error) {
            nLog.error("editar_producto - error", error);

            proceso.estado = "001";
            proceso.descripcionResultado = error.message;
            libAuditoria.crearReporteAuditoria(proceso);
            custodia.respuesta = error.message;
            custodia.codigoRespuesta = proceso.estado;

            respuesta.estado.mensaje = error.message;
            respuesta.estado.codigo = 400;
            respuesta.estado.success = false;

            if (custodia.internalid) {
                custodia.internalid = custodia.internalid[0].internalid;
                proceso.registroCustodia = libCustodia.actualizarRegistro(custodia);
            } else {
                custodia.reintentos = 0;
                proceso.registroCustodia = libCustodia.guardarOActualizarRegistro(custodia);
            }
            throw error;
        }
        return respuesta;
    };

    return { crearRegistro, editarRegistro };
});
