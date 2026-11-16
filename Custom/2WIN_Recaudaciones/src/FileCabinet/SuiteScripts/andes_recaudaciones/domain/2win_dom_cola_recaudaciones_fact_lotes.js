/**
 * @NApiVersion 2.1
 * @NModuleScope SameAccount
 */
define(["N/search", "N/runtime", "N/log", "../dao/2win_dao_cola", "../dao/2win_dao_estado_recaudaciones_fact_lotes",
    "../dao/2win_dao_file", "../dao/2win_dao_folder", "../libs/2win_lib_auditoria", "../libs/2win_lib_peticion",
    "../dao/2win_dao_static_params_operacion", "../libs/2win_lib_recaudaciones_fact_lotes"],
function (search, runtime, nLog, daoCola, daoEstado, daoFile, daoFolder, libAuditoria, libPeticion, daoParametros, libLotes) {
    const DEPLOYMENTS = ["customdeploy_2win_mr_recaudaciones_fac", "customdeploy_2win_mr_recaudaciones_nc",
        "customdeploy_2win_mr_recaudaciones_nd", libLotes.DEPLOYMENT_PROGRAMADO];

    function buscarCola(nombre) {
        const filas = search.create({ type: "customrecord_2w_as_cola_procesamiento",
            filters: [["custrecord_2w_as_nombre_archivo", "is", nombre], "AND", ["custrecord_2w_as_flujo", "is", daoCola.FLUJO.FACTURACION]],
            columns: ["internalid", "custrecord_2w_as_estado_cola", "custrecord_2w_as_intentos", "custrecord_2w_as_script_id_mr", "custrecord_2w_as_deployment_id_mr"]
        }).run().getRange({ start: 0, end: 2 });
        if (filas.length !== 1) throw new Error(`Se esperaba una entrada de cola para ${nombre}`);
        return { id: filas[0].getValue("internalid"), estado: Number(filas[0].getValue("custrecord_2w_as_estado_cola")),
            intentos: Number(filas[0].getValue("custrecord_2w_as_intentos") || 0),
            scriptId: filas[0].getValue("custrecord_2w_as_script_id_mr"),
            deploymentId: filas[0].getValue("custrecord_2w_as_deployment_id_mr") };
    }

    function despacharPendiente(desdeFinalizacion, soloProgramado) {
        const reserva = daoEstado.reservarDespacho();
        if (!reserva) return null;
        try {
            if (daoCola.hayFlujoEnProceso(daoCola.FLUJO.FACTURACION)) return null;
            const deploymentActual = runtime.getCurrentScript().deploymentId;
            const ocupado = DEPLOYMENTS.some((deployment) =>
                !(desdeFinalizacion && deployment === deploymentActual && deployment === libLotes.DEPLOYMENT_PROGRAMADO) &&
                daoCola.verificarMapReduceActivo(deployment));
            if (ocupado) return null;
            const siguiente = daoCola.obtenerSiguientePendiente(daoCola.FLUJO.FACTURACION);
            if (!siguiente) return null;
            if (soloProgramado) {
                if (siguiente.scriptId !== libLotes.SCRIPT_PROGRAMADO) return null;
                const padre = search.lookupFields({ type: "customrecord_2w_as_cola_procesamiento", id: siguiente.id,
                    columns: ["custrecord_2w_as_fplan_version"] });
                if (Number(padre.custrecord_2w_as_fplan_version) !== 2) return null;
            }
            daoCola.actualizarEstadoCola(siguiente.id, daoCola.ESTADO_COLA.EN_PROCESO);
            try {
                const taskId = daoCola.ejecutarMapReduce(siguiente);
                return { colaId: siguiente.id, taskId: taskId || null };
            } catch (error) {
                daoCola.actualizarEstadoCola(siguiente.id, daoCola.ESTADO_COLA.PENDIENTE);
                nLog.error("facturacion lotes - despacho pendiente", { colaId: siguiente.id, error: error.message });
                return null;
            }
        } finally {
            daoEstado.liberarDespacho(reserva);
        }
    }

    function recibir(contenido) {
        const documentos = libLotes.listarDocumentos(contenido);
        if (!documentos.length) return { tipoMensaje: "SEND^RECAUDACION^FACTURACION", estado: "success", codigo: 200,
            mensaje: "No hay datos para procesar - Arrays vacíos (facturasEmitidas, ncEmitidas, ndEmitidas)", data: {} };
        const configuracion = libLotes.leerConfiguracion();
        if (documentos.some(documento => documento.tipo === "NOTA_CREDITO")) {
            configuracion.ncRmaVersion = 1;
            if (documentos.some(documento => libLotes.usarRmaParaNc(documento.tipo, documento.lineas, configuracion))) {
                configuracion.formularioRma = libLotes.leerFormularioRma();
            }
        }
        const porLotes = documentos.some((documento) => documento.lineas > configuracion.umbral);
        const destino = { script: libLotes.SCRIPT_PROGRAMADO, deployment: libLotes.DEPLOYMENT_PROGRAMADO,
            parametro: libLotes.PARAMETRO_ARCHIVO_PROGRAMADO };
        const token = libAuditoria.obtenerToken();
        const folder = daoFolder.buscarOCrearCarpeta("Recaudaciones Facturacion", 693);
        const archivo = daoFile.crearArchivo({ nombre: `${token}.json`, folder: folder, tipo: "JSON",
            contenido: JSON.stringify(Object.assign({}, contenido, { tipoOperacion: "crear" })) });
        documentos.forEach(function (documento) {
            documento.processKey = libLotes.crearClave(archivo.id, documento.tipo, documento.indice);
            documento.paso = "PREPARAR";
        });
        // Estado y auditoría existen antes de hacer visible la entrada a ambos workers.
        daoEstado.crear(archivo, configuracion, documentos, porLotes ? "LOTES_PROGRAMADO" : "ACTUAL");
        const auditoriaId = libAuditoria.crearReporteAuditoria({ nombreProceso: "Recaudaciones Flujo Facturacion",
            scriptId: runtime.getCurrentScript().id, etapa: "procesar", estado: "000", tokenProceso: token,
            descripcionResultado: "Operación masiva encolada correctamente" });
        if (!auditoriaId) throw new Error("No se pudo registrar la auditoría de recepción");
        const colaId = daoCola.crearRegistroCola({ nombreArchivo: archivo.nombre, flujo: "FACTURACION", planVersion: porLotes ? 2 : null,
            scriptId: porLotes ? destino.script : "customscript_2win_mr_recaudaciones_fac",
            deploymentId: porLotes ? destino.deployment : "customdeploy_2win_mr_recaudaciones_fac",
            parameterName: porLotes ? destino.parametro : "custscript_2w_as_datos_recaudaciones_fac" });
        const envio = despacharPendiente(false);
        const iniciado = envio && String(envio.colaId) === String(colaId);
        return { tipoMensaje: "SEND^RECAUDACION^FACTURACION", estado: "success", codigo: 200,
            mensaje: iniciado ? "Operación masiva recibida correctamente" : "Operación masiva encolada correctamente",
            tipo_proceso: "Recaudaciones Flujo Facturacion", id_proceso: token, id_cola: colaId,
            id_tarea: iniciado ? envio.taskId : null, en_cola: !iniciado, data: {} };
    }

    function finalizar(control) {
        const estado = control.estado;
        const cola = buscarCola(estado.nombre);
        if (!estado.cierre.auditoria) {
            const auditorias = libAuditoria.busquedaDatosAuditoria(estado.nombre.replace(/\.json$/i, ""));
            if (!auditorias || !auditorias.length) throw new Error("No se encontró la auditoría de facturación");
            libAuditoria.actualizarCamposRegistro({ recordtype: "customrecord_2win_auditoria", internalid: auditorias[0].internalid,
                campos: { custrecord_2win_auditoria_id_script: runtime.getCurrentScript().id,
                    custrecord_2win_auditoria_etapa: estado.via === "LOTES_PROGRAMADO" ? "execute" : "summarize", custrecord_2win_auditoria_estado: estado.errores.length ? "001" : "000",
                    custrecord_2win_auditoria_descripcion: estado.errores.length ? estado.errores[0].errores[0].error : "Procesamiento completado exitosamente" } });
            estado.cierre.auditoria = true;
            daoEstado.guardar(control);
        }
        if (!control.estado.cierre.notificacion) {
            const payload = { tipoMensaje: "SEND^UPD", estado: estado.errores.length ? "error" : "success",
                codigo: estado.errores.length ? 400 : 200, tipo_proceso: "Recaudaciones Flujo Facturacion",
                idproceso: estado.nombre.replace(/\.json$/i, ""),
                mensaje: `La ejecucion del proceso de recaudaciones flujo facturacion finalizo ${estado.errores.length ? "con errores" : "correctamente"}.`,
                errores: estado.errores };
            // No repetir automáticamente una petición cuyo resultado puede ser incierto.
            control.estado.cierre.notificacion = "ENVIANDO";
            daoEstado.guardar(control);
            try {
                const urlBase = daoParametros.getParam("interfaces_andessalud_hc_url_base");
                const respuesta = libPeticion.ejecutarPeticionAutenticada("PUT", `${urlBase.text}/process-batch`, payload);
                if (!respuesta || Number(respuesta.code) < 200 || Number(respuesta.code) >= 300 || !Number.isFinite(Number(respuesta.code))) {
                    throw new Error(`No se confirmó la notificación: HTTP ${respuesta && respuesta.code}`);
                }
                control.estado.cierre.notificacion = "ENVIADA";
            } catch (error) {
                control.estado.cierre.notificacion = "ERROR";
                control.estado.cierre.errorNotificacion = error.message;
                nLog.error("facturacion lotes - notificación", error);
            }
            daoEstado.guardar(control);
        }
        daoCola.actualizarEstadoEIntentos(cola.id, estado.errores.length ? daoCola.ESTADO_COLA.ERROR : daoCola.ESTADO_COLA.COMPLETADO, cola.intentos);
        control.estado.finalizado = true;
        daoEstado.guardar(control);
        despacharPendiente(true);
    }

    return { recibir, buscarCola, despacharPendiente, finalizar };
});
