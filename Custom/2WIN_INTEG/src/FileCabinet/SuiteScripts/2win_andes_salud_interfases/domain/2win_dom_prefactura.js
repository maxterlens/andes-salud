/**
 * @NApiVersion 2.1
 * @module ./2win_dom_prefactura.js
 * @NModuleScope Public
 */
define(["N/runtime", "N/task", "N/file", "N/crypto/random", "N/ui/serverWidget", "N/log", "../dao/2win_dao_file", "../dao/2win_dao_static_params_operacion", "../dao/2win_dao_orden_venta", "../dao/2win_dao_subsidiaria", "../dao/2win_dao_cliente", "../dao/2win_dao_prefactura", "../dao/2win_dao_prefactura_queue", "../lib/2win_lib_auditoria", "../lib/2win_lib_peticion"],

    function (runtime, task, file, random, serverWidget, log, dao_file, dao_params, dao_orden_venta, dao_subsidiaria, dao_cliente, dao_prefactura, dao_prefactura_queue, lib_auditoria, lib_peticion) {

        const nLog = log;

        const TIPO_MENSAJE_CREAR = "SEND^IN";
        const TIPO_MENSAJE_EDITAR = "SEND^UPD";
        const TIPO_MENSAJE_ELIMINAR = "SEND^DEL";

        const ID_ESTADO_CREAR_DETALLE = "Nuevo";
        const ID_ESTADO_EDITAR_DETALLE = "Modificado";
        const ID_ESTADO_ELIMINAR_DETALLE = "Eliminado";

        function agendarTareaCrear(request) {

            try {

                // Aplicar validaciones al tipo de mensaje en request
                validarRequestMensaje(request, TIPO_MENSAJE_CREAR);

                // Crear archivo con datos en request
                const archivo_creacion_pf = crearArchivoProceso(request);

                // Agregar a la cola de procesamiento
                archivo_creacion_pf.nombre = archivo_creacion_pf.nombre;
                archivo_creacion_pf.tipoMensaje = TIPO_MENSAJE_CREAR;
                archivo_creacion_pf.uuid = archivo_creacion_pf.uuid;
                const resultadoCola = dao_prefactura_queue.addToQueue(archivo_creacion_pf);
                nLog.audit("agendarTareaCrear - addToQueue", resultadoCola);

                if (!resultadoCola.success) {
                    throw new Error("Error al agregar a la cola: " + resultadoCola.message);
                }

                // Verificar si hay un MapReduce activo para crear prefacturas
                const hayActivos = dao_prefactura_queue.verificarMapReduceActivo("customdeploy_2win_mr_andes_salud_crea_pf");
                if (!hayActivos) {
                    try {
                        const tareaMapReduce = task.create({
                            taskType: task.TaskType.MAP_REDUCE,
                            scriptId: "customscript_2win_mr_andes_salud_crea_pf",
                            deploymentId: "customdeploy_2win_mr_andes_salud_crea_pf",
                            params: {}
                        });
                        const idTarea = tareaMapReduce.submit();
                        nLog.audit("agendarTareaCrear - tareaMapReduce iniciada", idTarea);
                    } catch (error) {
                        nLog.error("agendarTareaCrear - error al crear tarea Map/Reduce", error);
                    }
                } else {
                    nLog.audit("agendarTareaCrear - tareaMapReduce no iniciada por existencia de tarea activa", {
                        scriptId: "customscript_2win_mr_andes_salud_crea_pf",
                        deploymentId: "customdeploy_2win_mr_andes_salud_crea_pf"
                    });
                }

                // Crear registro auditoria
                registrarAuditoria(archivo_creacion_pf.uuid, "Creación Prefactura", "000", "Batch creación prefactura iniciado correctamente");

                return archivo_creacion_pf.uuid;

            } catch (error) {
                // Crear registro auditoria en caso de error
                registrarAuditoria(null, "Creación Prefactura", "001", error.message);
                throw error;
            }
        }

        function agendarTareaEditar(request) {

            try {

                // Aplicar validaciones al tipo de mensaje en request
                validarRequestMensaje(request, TIPO_MENSAJE_EDITAR);

                // Crear archivo con datos definidos en request
                const archivo_edicion_pf = crearArchivoProceso(request);

                // Agregar a la cola de procesamiento
                archivo_edicion_pf.nombre = archivo_edicion_pf.nombre;
                archivo_edicion_pf.tipoMensaje = TIPO_MENSAJE_EDITAR;
                archivo_edicion_pf.uuid = archivo_edicion_pf.uuid;
                const resultadoCola = dao_prefactura_queue.addToQueue(archivo_edicion_pf);
                nLog.audit("agendarTareaEditar - addToQueue", resultadoCola);

                if (!resultadoCola.success) {
                    throw new Error("Error al agregar a la cola: " + resultadoCola.message);
                }

                // Verificar si hay un MapReduce activo para editar prefacturas
                const hayActivos = dao_prefactura_queue.verificarMapReduceActivo("customdeploy_2win_mr_andes_salud_edit_pf");
                if (!hayActivos) {
                    try {
                        const tareaMapReduce = task.create({
                            taskType: task.TaskType.MAP_REDUCE,
                            scriptId: "customscript_2win_mr_andes_salud_edit_pf",
                            deploymentId: "customdeploy_2win_mr_andes_salud_edit_pf",
                            params: {}
                        });
                        const idTarea = tareaMapReduce.submit();
                        nLog.audit("agendarTareaEditar - tareaMapReduce iniciada", idTarea);
                    } catch (error) {
                        nLog.error("agendarTareaEditar - error al crear tarea Map/Reduce", error);
                    }
                } else {
                    nLog.audit("agendarTareaEditar - tareaMapReduce no iniciada por existencia de tarea activa", {
                        scriptId: "customscript_2win_mr_andes_salud_edit_pf",
                        deploymentId: "customdeploy_2win_mr_andes_salud_edit_pf"
                    });
                }

                // Crear registro auditoria
                registrarAuditoria(archivo_edicion_pf.uuid, "Editar Prefactura", "000", "Batch edición prefactura iniciado correctamente");

                return archivo_edicion_pf.uuid;

            } catch (error) {
                // Crear registro auditoria en caso de error
                registrarAuditoria(null, "Editar Prefactura", "001", error.message);
                throw error;
            }
        }

        function agendarTareaEliminar(request) {

            try {

                // Aplicar validaciones al tipo de mensaje en request
                validarRequestMensaje(request, TIPO_MENSAJE_ELIMINAR);

                // Crear archivo con datos definidos en request
                const archivo_eliminar_pf = crearArchivoProceso(request);

                // Agregar a la cola de procesamiento
                archivo_eliminar_pf.nombre = archivo_eliminar_pf.nombre;
                archivo_eliminar_pf.tipoMensaje = TIPO_MENSAJE_ELIMINAR;
                archivo_eliminar_pf.uuid = archivo_eliminar_pf.uuid;
                const resultadoCola = dao_prefactura_queue.addToQueue(archivo_eliminar_pf);
                nLog.audit("agendarTareaEliminar - addToQueue", resultadoCola);

                if (!resultadoCola.success) {
                    throw new Error("Error al agregar a la cola: " + resultadoCola.message);
                }

                // Verificar si hay un MapReduce activo para eliminar prefacturas
                const hayActivos = dao_prefactura_queue.verificarMapReduceActivo("customdeploy_2win_mr_andes_salud_elim_pf");
                if (!hayActivos) {
                    try {
                        const tareaMapReduce = task.create({
                            taskType: task.TaskType.MAP_REDUCE,
                            scriptId: "customscript_2win_mr_andes_salud_elim_pf",
                            deploymentId: "customdeploy_2win_mr_andes_salud_elim_pf",
                            params: {}
                        });
                        const idTarea = tareaMapReduce.submit();
                        nLog.audit("agendarTareaEliminar - tareaMapReduce iniciada", idTarea);
                    } catch (error) {
                        nLog.error("agendarTareaEliminar - error al crear tarea Map/Reduce", error);
                    }
                } else {
                    nLog.audit("agendarTareaEliminar - tareaMapReduce no iniciada por existencia de tarea activa", {
                        scriptId: "customscript_2win_mr_andes_salud_elim_pf",
                        deploymentId: "customdeploy_2win_mr_andes_salud_elim_pf"
                    });
                }

                // Crear registro auditoria
                registrarAuditoria(archivo_eliminar_pf.uuid, "Eliminar Prefactura", "000", "Batch eliminación prefactura iniciado correctamente");

                return archivo_eliminar_pf.uuid;

            } catch (error) {
                // Crear registro auditoria en caso de error
                registrarAuditoria(null, "Eliminar Prefactura", "001", error.message);
                throw error;
            }
        }

        function crear(data) {

            try {

                // Aplicar validaciones al registro
                validarEventoCreaEdita(data, false);

                const nro_cuenta_paciente = String(data.Prefactura.CuentaPaciente).trim();
                const ordenes_venta = obtenerPacienteOrdenesVenta(nro_cuenta_paciente);
                const paciente_ov = ordenes_venta[0];
                const id_orden_venta = String(paciente_ov.id).trim();

                // Armar objeto para crear la prefactura
                const prefactura = {
                    num_prefactura: String(data.Prefactura.NumPrefactura).trim(),
                    ficha: String(data.Prefactura.NumFicha).trim(),
                    ingreso: String(data.Prefactura.Ingreso).trim(),
                    cuenta_paciente: nro_cuenta_paciente,
                    id_paciente: String(paciente_ov.id_paciente).trim(),
                    id_orden_venta: id_orden_venta,
                    monto_neto: 0,
                    monto_exento: 0,
                    monto_iva: 0,
                    monto_total: 0
                }

                // Verificar si la prefactura ya existe en el sistema
                const prefactura_existente = dao_prefactura.buscar(prefactura);
                if (prefactura_existente) {
                    log.error('crear - error', 'Prefactura ya existe en el sistema y no se puede crear nuevamente');
                    throw {
                        name: "VALIDATION_ERROR",
                        message: "Prefactura ya existe en el sistema y no se puede crear nuevamente",
                        code: 400,
                        notifyOff: true
                    };
                }

                // Objects para almacenar IDs ya obtenidos para no hacer múltiples búsquedas
                const prestadores = {};
                const financiadores = {};

                const detalles = [];
                data.detalle.forEach(function (item) {

                    const rut_prestador = String(item.RutPrestador).trim();
                    var id_prestador = obtenerIdPrestador(prestadores, rut_prestador);

                    const rut_financiador = String(item.RutFinanciador).trim();
                    var id_financiador = obtenerIdFinanciador(financiadores, rut_financiador);

                    // Obtener id orden de venta según prestador
                    const ov_detalle = ordenes_venta.find(function (ov) { return ov.id_subsidiaria == id_prestador });
                    log.audit("crear - ov_detalle", ov_detalle);

                    // Acumular totales
                    prefactura.monto_neto += Number(String(item.MontoNeto).trim());
                    prefactura.monto_exento += Number(String(item.MontoExento).trim());
                    prefactura.monto_iva += Number(String(item.MontoIva).trim());
                    prefactura.monto_total += Number(String(item.MontoTotal).trim());

                    // Armar objeto detalle
                    detalles.push({
                        numlinea: String(item.NumLinea).trim(),
                        id_prestador: id_prestador,
                        id_financiador: id_financiador,
                        glosa: String(item.Glosa).trim(),
                        monto_neto: String(item.MontoNeto).trim(),
                        monto_exento: String(item.MontoExento).trim(),
                        monto_iva: String(item.MontoIva).trim(),
                        monto_total: String(item.MontoTotal).trim(),
                        crg_correl: item.CargosAsociados.map(function (c) { return String(c.CrgCorrel).trim() }).join(", "),
                        id_orden_venta: ov_detalle.id
                    });
                });

                // Obtener líneas de las ordenes de venta para vincularlas con la prefactura
                const ids_ordenes_venta = ordenes_venta.map(function (ov) { return ov.id; });
                log.audit("crear - ids ordenes venta", ids_ordenes_venta);
                const lineas_ov = dao_orden_venta.obtenerLineas(ids_ordenes_venta);
                log.audit("crear - lineas ov obtenidas", lineas_ov);

                // Crear prefactura
                const id_prefactura = dao_prefactura.crear(prefactura, detalles, lineas_ov);
                log.audit("crear - id prefactura creada", id_prefactura);

                // Actualizar líneas de la orden de venta con id de prefactura y detalle prefactura
                log.audit("crear - lineas ov a actualizar", lineas_ov);

            } catch (error) {
                throw error;
            }

        }

        function editar(data) {

            try {

                // Aplicar validaciones al registro
                validarEventoCreaEdita(data, true);

                const nro_cuenta_paciente = String(data.Prefactura.CuentaPaciente).trim();
                const ordenes_venta = obtenerPacienteOrdenesVenta(nro_cuenta_paciente);
                const paciente_ov = ordenes_venta[0];
                const id_orden_venta = String(paciente_ov.id).trim();

                // Si todas las validaciones pasan, armar objeto para editar la prefactura
                const prefactura = {
                    num_prefactura: String(data.Prefactura.NumPrefactura).trim(),
                    ficha: String(data.Prefactura.NumFicha).trim(),
                    ingreso: String(data.Prefactura.Ingreso).trim(),
                    cuenta_paciente: nro_cuenta_paciente,
                    id_paciente: String(paciente_ov.id_paciente).trim(),
                    id_orden_venta: id_orden_venta,
                    monto_neto: 0,
                    monto_exento: 0,
                    monto_iva: 0,
                    monto_total: 0
                }

                // Verificar si la prefactura existe en el sistema
                const prefactura_existente = dao_prefactura.buscar(prefactura);
                if (!prefactura_existente) {
                    log.error('editar - error', 'Prefactura no existe en el sistema y no se puede editar');
                    throw {
                        name: "VALIDATION_ERROR",
                        message: 'Prefactura no existe en el sistema y no se puede editar',
                        code: 400,
                        notifyOff: true
                    };
                }
                log.audit("editar - prefactura_existente", prefactura_existente);

                const id_prefactura = prefactura_existente.id;
                log.audit("editar - id_prefactura", id_prefactura);

                // Mantener los montos actuales, se recalcularán al procesar los detalles
                prefactura.monto_neto = Number(prefactura_existente.monto_neto);
                prefactura.monto_exento = Number(prefactura_existente.monto_exento);
                prefactura.monto_iva = Number(prefactura_existente.monto_iva);
                prefactura.monto_total = Number(prefactura_existente.monto_total);

                // Objects para almacenar IDs ya obtenidos para no hacer múltiples búsquedas
                const prestadores = {};
                const financiadores = {};

                const detalles = [];
                const detalles_existentes = dao_prefactura.obtenerDetalles(id_prefactura);
                log.audit("editar - detalles_existentes", detalles_existentes);

                data.detalle.forEach(function (item) {

                    const rut_prestador = String(item.RutPrestador).trim();
                    var id_prestador = obtenerIdPrestador(prestadores, rut_prestador);

                    const rut_financiador = String(item.RutFinanciador).trim();
                    var id_financiador = obtenerIdFinanciador(financiadores, rut_financiador);

                    // Obtener id orden de venta según prestador
                    const ov_detalle = ordenes_venta.find(function (ov) { return ov.id_subsidiaria == id_prestador });
                    log.audit("editar - ov_detalle", ov_detalle);

                    // Procesar según estado del detalle
                    const estado_detalle = String(item.Estado).trim();
                    log.audit("editar - estado_detalle", estado_detalle);

                    // 0: Nuevo -> Se agrega un nuevo registro
                    if (estado_detalle === ID_ESTADO_CREAR_DETALLE) {

                        // Acumular totales
                        prefactura.monto_neto += Number(String(item.MontoNeto).trim());
                        prefactura.monto_exento += Number(String(item.MontoExento).trim());
                        prefactura.monto_iva += Number(String(item.MontoIva).trim());
                        prefactura.monto_total += Number(String(item.MontoTotal).trim());
                        log.audit("editar - recalcular crear", prefactura);

                        // Si el detalle ya existe, agregar su id al objeto
                        detalles.push({
                            numlinea: String(item.NumLinea).trim(),
                            id_prestador: id_prestador,
                            id_financiador: id_financiador,
                            glosa: String(item.Glosa).trim(),
                            monto_neto: String(item.MontoNeto).trim(),
                            monto_exento: String(item.MontoExento).trim(),
                            monto_iva: String(item.MontoIva).trim(),
                            monto_total: String(item.MontoTotal).trim(),
                            crg_correl: item.CargosAsociados.map(function (c) { return String(c.CrgCorrel).trim() }).join(", "),
                            id_orden_venta: ov_detalle.id,
                            estado: String(item.Estado).trim()
                        });

                    } else { // ID_ESTADO_EDITAR_DETALLE o ID_ESTADO_ELIMINAR_DETALLE

                        // Buscar el detalle existente por numlinea                        
                        // 1: Modificado -> Se actualiza la línea indicada en el campo "NumLinea"
                        // 2: Eliminado -> Se borra la línea indicada en el campo "NumLinea"
                        const detalle = detalles_existentes.find(function (d) { return String(d.numlinea).trim() == String(item.NumLinea).trim(); });

                        if (detalle) {

                            if (estado_detalle === ID_ESTADO_EDITAR_DETALLE) {

                                // Recalcular totales cuando se edita la línea
                                // Primero se suman los nuevos valores
                                prefactura.monto_neto += Number(String(item.MontoNeto).trim());
                                prefactura.monto_exento += Number(String(item.MontoExento).trim());
                                prefactura.monto_iva += Number(String(item.MontoIva).trim());
                                prefactura.monto_total += Number(String(item.MontoTotal).trim());

                                // Luego se restan los valores anteriores
                                prefactura.monto_neto -= Number(detalle.monto_neto);
                                prefactura.monto_exento -= Number(detalle.monto_exento);
                                prefactura.monto_iva -= Number(detalle.monto_iva);
                                prefactura.monto_total -= Number(detalle.monto_total);

                                log.audit("editar - recalcular editar", prefactura);

                            } else if (estado_detalle === ID_ESTADO_ELIMINAR_DETALLE) {

                                // Restar totales cuando se elimina la línea
                                prefactura.monto_neto -= Number(detalle.monto_neto);
                                prefactura.monto_exento -= Number(detalle.monto_exento);
                                prefactura.monto_iva -= Number(detalle.monto_iva);
                                prefactura.monto_total -= Number(detalle.monto_total);
                                log.audit("editar - recalcular eliminar", prefactura);
                            }

                            // Si el detalle ya existe, agregar su id al objeto
                            detalles.push({
                                id: detalle.id,
                                numlinea: String(item.NumLinea).trim(),
                                id_prestador: id_prestador,
                                id_financiador: id_financiador,
                                glosa: String(item.Glosa).trim(),
                                monto_neto: String(item.MontoNeto).trim(),
                                monto_exento: String(item.MontoExento).trim(),
                                monto_iva: String(item.MontoIva).trim(),
                                monto_total: String(item.MontoTotal).trim(),
                                crg_correl: item.CargosAsociados.map(function (c) { return String(c.CrgCorrel).trim() }).join(", "),
                                id_orden_venta: ov_detalle.id,
                                estado: String(item.Estado).trim()
                            });

                        } else {

                            log.error('editar - error', 'Detalle con NumLinea ' + String(item.NumLinea).trim() + ' no existe en la prefactura y no se puede editar ó eliminar');
                        }
                    }

                });

                // Obtener líneas de las ordenes de venta para vincularlas con la prefactura
                const ids_ordenes_venta = ordenes_venta.map(function (ov) { return ov.id; });
                log.audit("editar - ids ordenes venta", ids_ordenes_venta);
                const lineas_ov = dao_orden_venta.obtenerLineas(ids_ordenes_venta);
                log.audit("editar - lineas ov obtenidas", lineas_ov);

                dao_prefactura.editar(id_prefactura, prefactura, detalles);
                log.audit("editar - id prefactura editada", id_prefactura);

                return id_prefactura;

            } catch (error) {
                throw error;
            }

        }

        function eliminar(data) {

            try {

                // Aplicar validaciones al registro
                validarEventoEliminacion(data);

                const nro_cuenta_paciente = String(data.Prefactura.CuentaPaciente).trim();
                const ordenes_venta = obtenerPacienteOrdenesVenta(nro_cuenta_paciente);
                const paciente_ov = ordenes_venta[0];
                const id_orden_venta = String(paciente_ov.id).trim();

                const prefactura = {
                    num_prefactura: String(data.Prefactura.NumPrefactura).trim(),
                    ficha: String(data.Prefactura.NumFicha).trim(),
                    ingreso: String(data.Prefactura.Ingreso).trim(),
                    cuenta_paciente: nro_cuenta_paciente,
                    id_paciente: String(paciente_ov.id_paciente).trim(),
                    id_orden_venta: id_orden_venta
                }

                // Verificar si la prefactura existe en Netsuite
                const prefactura_existente = dao_prefactura.buscar(prefactura);
                if (prefactura_existente) {

                    // Obtener id prefactura
                    const id_prefactura = prefactura_existente.id;

                    // Obtener detalles prefactura
                    const detalles = dao_prefactura.obtenerDetalles(id_prefactura);

                    if (detalles && detalles.length > 0) {

                        // Eliminar detalles prefactura
                        detalles.forEach(function (detalle) {
                            const id_detalle = detalle.id;
                            dao_prefactura.eliminarDetalle(id_detalle);
                        });
                    }

                    // Eliminar prefactura                    
                    dao_prefactura.eliminar(id_prefactura);
                    log.audit("eliminar - id prefactura eliminada", id_prefactura);

                    return id_prefactura;
                }

                log.audit('eliminar', 'Prefactura no existe en el sistema y no se puede eliminar');

                throw {
                    name: "VALIDATION_ERROR",
                    message: 'Prefactura no existe en el sistema y no se puede eliminar',
                    code: 400,
                    notifyOff: true
                };

            } catch (error) {
                throw error;
            }
        }

        function obtenerPacienteOrdenesVenta(nro_cuenta_paciente) {

            try {

                var ordenes_venta = dao_orden_venta.obtenerPorNroCuentaPaciente(nro_cuenta_paciente);
                if (!ordenes_venta) {
                    throw {
                        name: "VALIDATION_ERROR",
                        message: 'No se encontró el id paciente asociado al número de cuenta ' + nro_cuenta_paciente,
                        code: 400,
                        notifyOff: true
                    };
                }
                return ordenes_venta;

            } catch (error) {
                throw error;
            }
        }

        function obtenerIdPrestador(prestadores, rut_prestador) {

            try {

                var id_prestador = null;
                rut_prestador = formatearRut(rut_prestador);
                log.audit("obtenerIdPrestador - rut_prestador formateado", rut_prestador);
                if (rut_prestador && prestadores.hasOwnProperty(rut_prestador)) {
                    id_prestador = prestadores[rut_prestador];
                } else {
                    const prestador = dao_subsidiaria.busquedaRegistroPorRut(rut_prestador);
                    //log.audit("obtenerIdPrestador - prestador", prestador);
                    id_prestador = prestador[0].internalid;
                    prestadores[rut_prestador] = id_prestador;
                }

                return id_prestador;

            } catch (error) {
                throw {
                    name: "VALIDATION_ERROR",
                    message: "No se encontró el prestador con RUT " + rut_prestador,
                    code: 400,
                    notifyOff: true
                };
            }
        }

        function obtenerIdFinanciador(financiadores, rut_financiador) {

            try {

                var id_financiador = null;
                rut_financiador = formatearRut(rut_financiador);
                log.audit("obtenerIdFinanciador - rut_financiador formateado", rut_financiador);
                if (rut_financiador && financiadores.hasOwnProperty(rut_financiador)) {
                    id_financiador = financiadores[rut_financiador];
                } else {
                    const financiador = dao_cliente.busquedaRegistroPorRut(rut_financiador);
                    //log.audit("obtenerIdFinanciador - financiador", financiador);
                    id_financiador = financiador[0].internalid;
                    financiadores[rut_financiador] = id_financiador;
                }

                return id_financiador;

            } catch (error) {
                throw {
                    name: "VALIDATION_ERROR",
                    message: "No se encontró el financiador con RUT " + rut_financiador,
                    code: 400,
                    notifyOff: true
                };
            }
        }

        function formatearRut(rut) {

            if (rut) {

                if (typeof rut !== "string") {
                    rut = String(rut);
                }

                if (rut.includes("-")) {
                    return rut;
                }

                if (rut.length >= 2) {
                    return rut.slice(0, rut.length - 1) + "-" + rut.slice(-1);
                }
            }

            return rut;
        }

        function validarRequestMensaje(request, tipoEsperado) {

            // Validar que request sea un objeto
            if (!request || typeof request !== "object") {
                log.error("crear - error", "Mensaje inválido o no es un objeto");
                throw {
                    name: "VALIDATION_ERROR",
                    message: "Mensaje inválido o no es un objeto",
                    code: 400,
                    notifyOff: true
                };
            }

            // Validar que tipoMensaje exista y sea igual al esperado
            if (!request.tipoMensaje || request.tipoMensaje !== tipoEsperado) {
                log.error("crear - error", "Tipo de mensaje inválido");
                throw {
                    name: "VALIDATION_ERROR",
                    message: "La clave tipoMensaje es inválida o no corresponde a una de tipo " + tipoEsperado,
                    code: 400,
                    notifyOff: true
                };
            }

            // Validar que data sea un array no vacío
            if (!request.data || !Array.isArray(request.data) || request.data.length === 0) {
                log.error("validarRequest - error", "Clave data no existe o no es un array en el mensaje");
                throw {
                    name: "VALIDATION_ERROR",
                    message: "Clave data no existe o no es un array en el mensaje",
                    code: 400,
                    notifyOff: true
                };
            }
        }

        function validarEventoEliminacion(data) {

            // Validar que prefactura sea un objeto
            if (!data.Prefactura || typeof data.Prefactura !== "object") {
                log.error("validarEventoCreaEdita - error", "Clave Prefactura no existe o no es un objeto en el JSON");
                throw {
                    name: "VALIDATION_ERROR",
                    message: "Clave Prefactura no existe o no es un objeto en el JSON",
                    code: 400,
                    notifyOff: true
                };
            }

            // Validar datos prefactura
            validarPrefactura(data.Prefactura);

        }

        function validarEventoCreaEdita(data, editar) {

            // Validar que prefactura sea un objeto
            if (!data.Prefactura || typeof data.Prefactura !== "object") {
                log.error("validarEventoCreaEdita - error", "Clave Prefactura no existe o no es un objeto en el JSON");
                throw {
                    name: "VALIDATION_ERROR",
                    message: "Clave Prefactura no existe o no es un objeto en el JSON",
                    code: 400,
                    notifyOff: true
                };
            }

            // Validar que detalle sea un array no vacío
            if (!data.detalle || !Array.isArray(data.detalle) || data.detalle.length === 0) {
                log.error("validarEventoCreaEdita - error", "Clave detalle no existe o no es un array en el JSON");
                throw {
                    name: "VALIDATION_ERROR",
                    message: "Clave detalle no existe o no es un array en el JSON",
                    code: 400,
                    notifyOff: true
                };
            }

            // Validar que cada item en detalle tenga la clave CargosAsociados como un array no vacío
            data.detalle.forEach(function (item) {

                const estado_detalle = String(item.Estado).trim();
                log.audit("validarEventoCreaEdita - estado_detalle", estado_detalle);

                if (estado_detalle === ID_ESTADO_ELIMINAR_DETALLE) {
                    // Si el detalle está marcado para eliminación, no es necesario validar CargosAsociados
                    return;
                }

                if (!item.CargosAsociados || !Array.isArray(item.CargosAsociados) || item.CargosAsociados.length === 0) {
                    log.error("validarEventoCreaEdita - error", "Clave CargosAsociados no existe o no es un array en el JSON");
                    throw {
                        name: "VALIDATION_ERROR",
                        message: "Clave CargosAsociados no existe o no es un array en el JSON",
                        code: 400,
                        notifyOff: true
                    };
                }
            });

            validarPrefactura(data.Prefactura);
            validarDetalle(data.detalle, editar);
            validarCargosAsociados(data.detalle[0].CargosAsociados);
        }

        function validarPrefactura(encabezado) {
            var camposObligatorios = [
                { nombre: "NumPrefactura", tipo: "string" },
                { nombre: "NumFicha", tipo: "string" },
                { nombre: "Ingreso", tipo: "string" },
                { nombre: "CuentaPaciente", tipo: "string" }
            ];
            validarCamposObligatorios(encabezado, camposObligatorios);
        }

        function validarDetalle(detalles, editar) {

            var camposObligatorios = [
                { nombre: "NumLinea", tipo: "string" },
                { nombre: "RutPrestador", tipo: "string" },
                { nombre: "RutFinanciador", tipo: "string" },
                { nombre: "Glosa", tipo: "string" },
                { nombre: "MontoNeto", tipo: "string" },
                { nombre: "MontoExento", tipo: "string" },
                { nombre: "MontoIva", tipo: "string" },
                { nombre: "MontoTotal", tipo: "string" }
            ];

            if (editar) {
                camposObligatorios.push({ nombre: "Estado", tipo: "string" });
            }

            detalles.forEach(function (detalle) {
                validarCamposObligatorios(detalle, camposObligatorios);
            });
        }

        function validarCargosAsociados(cargos) {
            var camposObligatorios = [
                { nombre: "CrgCorrel", tipo: "number" }
            ];

            cargos.forEach(function (cargo) {
                validarCamposObligatorios(cargo, camposObligatorios);
            });
        }

        function validarCamposObligatorios(item, campos) {

            var faltantes = [];

            campos.forEach(function (campo) {
                if (item[campo.nombre] === undefined || item[campo.nombre] === null || String(item[campo.nombre]).trim() === "") {
                    faltantes.push(campo.nombre);
                }
            });

            if (faltantes.length > 0) {
                log.error("validarCamposObligatorios - error", "Campos faltantes: " + faltantes.join(", ") + ".");
                throw {
                    name: "VALIDATION_ERROR",
                    message: "El mensaje no contiene los campos esperados o contiene valores inválidos. Campos faltantes: " + faltantes.join(", ") + ".",
                    code: 400,
                    notifyOff: true
                };
            }
        }

        function registrarAuditoria(id, etapa, estado, descripcion) {

            try {

                // Variable para almacenar de auditoria
                const auditoria = {
                    nombreProceso: "Interfaces andes salud",
                    scriptId: runtime.getCurrentScript().id,
                    etapa: etapa,
                    estado: estado,
                    tokenProceso: lib_auditoria.obtenerToken(),
                    descripcionResultado: descripcion,
                    tipoRegistroCreado: file.Type.JSON,
                    idRegistroCreado: id
                };

                lib_auditoria.crearReporteAuditoria(auditoria);

            } catch (error) {
                log.error("registrarAuditoria - error", error);
            }
        }

        function obtenerContenidoArchivoParseado(archivo_creacion_pf) {

            try {

                // Obtener archivo y parsear contenido
                const archivo_creacion_parsed = JSON.parse(archivo_creacion_pf);
                log.audit("obtenerArchivoParseado - archivo_creacion_parsed", archivo_creacion_parsed);

                // Obtener archivo y parsear contenido
                const contenido = dao_file.cargarArchivo(archivo_creacion_parsed.id).contenido;
                const contenido_parseado = JSON.parse(contenido);
                log.audit("obtenerArchivoParseado - contenido parseado", contenido_parseado);
                return contenido_parseado;

            } catch (error) {
                log.error("obtenerArchivoParseado - error", error);
                throw error;
            }
        }

        function notificarResultados(notificacion) {

            try {

                log.audit("notificarResultados - notificacion", notificacion);

                // Crear archivo con casos no procesados en caso de error
                if (notificacion.estado === "error") {
                    const archivo_no_procesados = crearArchivoNoProcesados(notificacion);
                    log.audit("notificarResultados - archivo_no_procesados", archivo_no_procesados);
                }

                // Obtener URL desde parametros estáticos
                const url = dao_params.getParam("interfaces_andessalud_hc_url_base").text + "/process-batch";
                log.debug("notificarResultados - url", url);

                // Utiliza la nueva función autenticada. El tipo de petición es PUT según el DOM.
                lib_peticion.ejecutarPeticionAutenticada("PUT", url, notificacion);

                // Crear registro auditoria
                registrarAuditoria(notificacion.id_proceso, notificacion.tipo_proceso, notificacion.estado === "success" ? "000" : "001", notificacion.mensaje);

            } catch (error) {
                log.error("notificarResultados - error", error);
                // Crear registro auditoria en caso de error
                registrarAuditoria(notificacion.id_proceso, notificacion.tipo_proceso, "001", error.message);
            }
        }

        function crearArchivoNoProcesados(notificacion) {

            try {

                const nombre_carpeta = dao_params.getParam("carpeta_resultados_proceso_prefactura").text;
                const id_carpeta = dao_file.buscarCarpetaPorNombre(nombre_carpeta);

                const contenido = {
                    tipoMensaje: notificacion.tipoMensaje,
                    data: notificacion.data
                }

                const request_archivo = {
                    nombre: `no_procesados_${notificacion.id_proceso}.json`,
                    contenido: JSON.stringify(contenido, null, 2),
                    folder: id_carpeta,
                    tipo: file.Type.JSON,
                    encoding: file.Encoding.UTF8
                };

                // Crear archivo con datos definidos en request_archivo
                return dao_file.crearArchivo(request_archivo);

            } catch (error) {
                log.error("crearArchivoNoProcesados - error", error);
            }
        }

        function crearArchivoProceso(request) {

            try {

                // Crear archivo con datos de entrada para MR que crea la prefactura
                const uuid = random.generateUUID();
                log.audit("crearArchivoProceso - uuid", uuid);

                const nombre_carpeta = dao_params.getParam("carpeta_resultados_proceso_prefactura").text;
                const id_carpeta = dao_file.buscarCarpetaPorNombre(nombre_carpeta);
                log.audit("crearArchivoProceso - id carpeta resultados", id_carpeta);

                const request_archivo = {
                    nombre: `${uuid}.json`,
                    contenido: JSON.stringify(request, null, 2),
                    folder: id_carpeta,
                    tipo: file.Type.JSON,
                    encoding: file.Encoding.UTF8
                };

                // Crear archivo con datos definidos en request_archivo
                const archivo_pf = dao_file.crearArchivo(request_archivo);
                archivo_pf.uuid = uuid;

                return archivo_pf;

            } catch (error) {
                throw error;
            }
        }

        function cargarTablaDetalles(id_prefactura, form) {

            try {

                var detalles = dao_prefactura.obtenerDetalles(id_prefactura);                

                if (detalles === null) detalles = [];
                log.audit("cargarTablaDetalles - detalles", detalles.length);

                // Add a custom tab
                form.addTab({
                    id: 'custpage_2win_pf_tab_detalle', // Internal ID for the tab
                    label: 'Detalles de Prefactura' // Label displayed on the tab
                });

                // Add a sublist to the custom tab
                var sublist = form.addSublist({
                    id: 'custpage_2win_pf_sublist_detalle',
                    type: serverWidget.SublistType.LIST,
                    label: 'Detalles de Prefactura',
                    tab: 'custpage_2win_pf_tab_detalle'
                });

                // Define the fields/columns for the sublist
                sublist.addField({ id: 'custpage_2win_dpf_num_linea', type: serverWidget.FieldType.TEXT, label: 'Número Línea' });
                sublist.addField({ id: 'custpage_2win_dpf_ov_origen', type: serverWidget.FieldType.TEXT, label: 'OV Origen' });
                sublist.addField({ id: 'custpage_2win_dpf_prestador', type: serverWidget.FieldType.TEXT, label: 'Prestador' });
                sublist.addField({ id: 'custpage_2win_dpf_financiador', type: serverWidget.FieldType.TEXT, label: 'Financiador' });
                sublist.addField({ id: 'custpage_2win_dpf_glosa', type: serverWidget.FieldType.TEXT, label: 'Glosa' });
                sublist.addField({ id: 'custpage_2win_dpf_monto_neto', type: serverWidget.FieldType.CURRENCY, label: 'Monto Neto' });
                sublist.addField({ id: 'custpage_2win_dpf_monto_exento', type: serverWidget.FieldType.CURRENCY, label: 'Monto Exento' });
                sublist.addField({ id: 'custpage_2win_dpf_monto_iva', type: serverWidget.FieldType.CURRENCY, label: 'Monto IVA' });
                sublist.addField({ id: 'custpage_2win_dpf_monto_total', type: serverWidget.FieldType.CURRENCY, label: 'Monto Total' });
                sublist.addField({ id: 'custpage_2win_dpf_action', type: serverWidget.FieldType.TEXT, label: 'Acciones' });

                // Populate the sublist with data
                let monto_neto_total = 0;
                let monto_exento_total = 0;
                let monto_iva_total = 0;
                let monto_total_total = 0;
                detalles.forEach(function (detalle, index) {

                    // Acumular totales
                    monto_neto_total += Number(detalle.monto_neto);
                    monto_exento_total += Number(detalle.monto_exento);
                    monto_iva_total += Number(detalle.monto_iva);
                    monto_total_total += Number(detalle.monto_total);

                    const random_ov = getRandomNumber();
                    const random_financiador = getRandomNumber();

                    sublist.setSublistValue({ id: 'custpage_2win_dpf_num_linea', line: index, value: detalle.numlinea });
                    sublist.setSublistValue({ id: 'custpage_2win_dpf_ov_origen', line: index, value: "<a href='/app/accounting/transactions/salesord.nl?id=" + detalle.ov_origen + "' target='_blank' id='qsTarget_" + random_ov + "' class='dottedlink uir-hoverable-anchor' onmouseover=\"var tip = NS.UI.Tooltip.createRecordTooltip('qsTarget_" + random_ov + "', 'transaction', 'TRAN_TEMPLATE', " + detalle.ov_origen + ",null);\">" + detalle.ov_nombre + "</a>" });
                    sublist.setSublistValue({ id: 'custpage_2win_dpf_prestador', line: index, value: detalle.nombre_prestador });
                    sublist.setSublistValue({ id: 'custpage_2win_dpf_financiador', line: index, value: "<a href='/app/common/entity/custjob.nl?id=" + detalle.id_financiador + "' target='_blank' id='qsTarget_" + random_financiador + "' class='dottedlink uir-hoverable-anchor' onmouseover=\"var tip = NS.UI.Tooltip.createRecordTooltip('qsTarget_" + random_financiador + "', 'CUSTOMER', 'DEFAULT_TEMPLATE', " + detalle.id_financiador + ", null);\">" + detalle.nombre_financiador + "</a>" });
                    sublist.setSublistValue({ id: 'custpage_2win_dpf_glosa', line: index, value: detalle.glosa });
                    sublist.setSublistValue({ id: 'custpage_2win_dpf_monto_neto', line: index, value: detalle.monto_neto });
                    sublist.setSublistValue({ id: 'custpage_2win_dpf_monto_exento', line: index, value: detalle.monto_exento });
                    sublist.setSublistValue({ id: 'custpage_2win_dpf_monto_iva', line: index, value: detalle.monto_iva });
                    sublist.setSublistValue({ id: 'custpage_2win_dpf_monto_total', line: index, value: detalle.monto_total });
                    sublist.setSublistValue({ id: 'custpage_2win_dpf_action', line: index, value: "<a href='#' class='dottedlink' style='align-items:center;justify-content:center;display:flex;' onclick=\"verDatelleOV('" + detalle.ov_origen + "', '" + detalle.id + "')\">Ver Detalle</a>" });
                });

                // Agregar fila vacía al final para mejorar visualización
                let index = detalles.length;
                sublist.setSublistValue({ id: 'custpage_2win_dpf_num_linea', line: index, value: "Total" });
                sublist.setSublistValue({ id: 'custpage_2win_dpf_ov_origen', line: index, value: "&nbsp;" });
                sublist.setSublistValue({ id: 'custpage_2win_dpf_prestador', line: index, value: "&nbsp;" });
                sublist.setSublistValue({ id: 'custpage_2win_dpf_financiador', line: index, value: "&nbsp;" });
                sublist.setSublistValue({ id: 'custpage_2win_dpf_glosa', line: index, value: "&nbsp;" });
                sublist.setSublistValue({ id: 'custpage_2win_dpf_monto_neto', line: index, value: monto_neto_total });
                sublist.setSublistValue({ id: 'custpage_2win_dpf_monto_exento', line: index, value: monto_exento_total });
                sublist.setSublistValue({ id: 'custpage_2win_dpf_monto_iva', line: index, value: monto_iva_total });
                sublist.setSublistValue({ id: 'custpage_2win_dpf_monto_total', line: index, value: monto_total_total });
                sublist.setSublistValue({ id: 'custpage_2win_dpf_action', line: index, value: "&nbsp;" });

                // Agregar script para resaltar la última fila (totales)
                var fieldScript = form.addField({
                    id: 'custpage_2win_dpf_script',
                    type: serverWidget.FieldType.INLINEHTML,
                    label: '2Win HTML Script'
                });
                fieldScript.defaultValue =
                    '<script>' +
                    'document.addEventListener("DOMContentLoaded", function() {' +
                    '   var pf_sublist_detalle = document.getElementById("custpage_2win_pf_sublist_detalle_splits");' +
                    '   if (pf_sublist_detalle) {' +
                    '       var last_row = pf_sublist_detalle.rows[pf_sublist_detalle.rows.length - 1];' +
                    '       last_row.style.fontWeight = "bold";' +
                    '       for (const child of last_row.children) {' +
                    '           child.style.setProperty("background-color", "#FEFEEE", "important");' +
                    '       }' +
                    '   }' +
                    '})' +
                    '</script>';

            } catch (error) {
                throw error;
            }
        }

        function getRandomNumber() {
            const min = 1000; // Smallest 9-digit number
            const max = 9999; // Largest 9-digit number
            return Math.floor(Math.random() * (max - min + 1)) + min;
        }

        return {
            agendarTareaCrear: agendarTareaCrear,
            agendarTareaEditar: agendarTareaEditar,
            agendarTareaEliminar: agendarTareaEliminar,
            crear: crear,
            editar: editar,
            eliminar: eliminar,
            obtenerContenidoArchivoParseado: obtenerContenidoArchivoParseado,
            notificarResultados: notificarResultados,
            cargarTablaDetalles: cargarTablaDetalles
        }
    }
);
