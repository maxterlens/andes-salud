/**
 * @NApiVersion 2.1
 * @NModuleScope SameAccount
 *
 * @description AS_NSP_037 - Service fachada de FixArticuloOrdenVenta.
 *              Reglas de negocio de las pantallas del Suitelet y cierre del Map/Reduce
 *              (mismo rol que EnsamblajeService de R003). El handler solo lee el request,
 *              llama a este service y responde.
 *
 *               - leerCarga / registrarValidacion     → pantalla de Carga (POST validar)
 *               - getDatosValidacion / procesar         → pantalla de Validación (POST procesar)
 *               - revalidar / anular                    → pantalla de Validación (POST revalidar / anular)
 *               - getHistorial                          → pantalla de Historial
 *               - getDatosDetalle                       → pantalla de Detalle
 *               - getDescargaValidacion / getDescargaResultado → descargas en Excel
 *               - finalizar                             → summarize del Map/Reduce
 */
define([
    "N/url",
    "N/runtime",
    "N/task",
    "N/format",
    "N/search",
    "N/log",
    "../constants/FixArticuloOrdenVentaConstants",
    "../repositories/ProcesoRepository",
    "../repositories/ArchivoRepository",
    "./CargaCsvService",
    "./ValidacionService",
    "../utils/FormatoUtils"
], (url, runtime, task, format, search, nLog, CONST, procesoRepo, archivoRepo, cargaCsvService, validacionService, formato) => {
    const { SCRIPTS, PARAMS, PANTALLAS, CAMPOS_CARGA: CC, PROCESO, ESTADO_PROCESO, ESTADO_LINEA, ACCIONES_LINEA, LIMITES } = CONST;
    const P = PROCESO.CAMPOS;

    const mensajeError = (e) => (e && (e.message || e.name)) || String(e);

    /** URL del Suitelet con pantalla y proceso. */
    const urlPantalla = (pantalla, procesoId, extra = {}) =>
        url.resolveScript({
            scriptId: SCRIPTS.SUITELET.ID,
            deploymentId: SCRIPTS.SUITELET.DEPLOY,
            params: { [PARAMS.PANTALLA]: pantalla, ...(procesoId ? { [PARAMS.PROCESO_ID]: procesoId } : {}), ...extra }
        });

    /** Carpeta de archivos (parámetro obligatorio del deployment del Suitelet). */
    const carpetaId = () => {
        try {
            return runtime.getCurrentScript().getParameter({ name: SCRIPTS.SUITELET.PARAM_CARPETA }) || null;
        } catch (e) {
            return null;
        }
    };

    const nombreSubsidiaria = (id) => {
        try {
            return search.lookupFields({ type: search.Type.SUBSIDIARY, id: Number(id), columns: ["name"] }).name || String(id);
        } catch (e) {
            return String(id);
        }
    };

    // ═══════════════════════════════════════════════════════════════════
    // Carga
    // ═══════════════════════════════════════════════════════════════════

    /** Valores de la pantalla de Carga. */
    const leerCarga = (request) => ({
        archivo: request.files[CC.ARCHIVO] || null,
        subsidiaria: request.parameters[CC.SUBSIDIARIA] || "",
        observacion: request.parameters[CC.OBSERVACION] || ""
    });

    /**
     * Valida el CSV contra NetSuite y registra el proceso en estado Validado.
     * @returns {{ procesoId: number|null, errores: string[] }}
     */
    const registrarValidacion = ({ archivo, subsidiaria, observacion }) => {
        const errores = [];
        const carpeta = carpetaId();
        if (!carpeta) errores.push("No está configurada la carpeta de archivos en el deployment del Suitelet (parámetro Carpeta de archivos).");
        if (!archivo) errores.push("Seleccione un archivo CSV.");
        if (!subsidiaria) errores.push("Seleccione la subsidiaria.");
        if (errores.length) return { procesoId: null, errores };

        const contenido = archivo.getContents();
        const lectura = cargaCsvService.parsearCsv(contenido);
        if (lectura.errores.length) return { procesoId: null, errores: lectura.errores };

        const { lineas, resumen } = validacionService.validar({ subsidiaria: Number(subsidiaria), filas: lectura.filas });

        const nombreSeguro = String(archivo.name || "archivo.csv").replace(/[^\w.\-]+/g, "_").substring(0, 120);
        const idOrigen = archivoRepo.crearCsv(`FAOV_${formato.marcaTiempo()}_${nombreSeguro}`, contenido, carpeta);
        const datos = {
            version: 2,
            subsidiaria: Number(subsidiaria),
            subsidiariaNombre: nombreSubsidiaria(subsidiaria),
            nombreArchivo: archivo.name,
            separador: lectura.separador,
            resumen,
            lineas
        };
        const idDatos = archivoRepo.crearJson(`FAOV_${formato.marcaTiempo()}_datos.json`, datos, carpeta);
        const proceso = procesoRepo.crear({
            subsidiaria,
            usuario: runtime.getCurrentUser().id,
            observacion,
            archivoOrigen: idOrigen,
            archivoDatos: idDatos,
            totales: { lineas: resumen.lineas, procesar: resumen.procesar },
            resumen: JSON.stringify(resumen)
        });
        nLog.audit({ title: `AS_NSP_037 - Validación ${proceso.nombre}`, details: JSON.stringify(resumen) });
        return { procesoId: proceso.id, errores: [] };
    };

    // ═══════════════════════════════════════════════════════════════════
    // Validación
    // ═══════════════════════════════════════════════════════════════════

    /** Separa las líneas validadas en los grupos de las pestañas. */
    const agruparValidacion = (lineas) => ({
        porProcesar: lineas.filter((l) => l.procesable && !l.requiereConfirmacion),
        reemplazos: lineas.filter((l) => l.requiereConfirmacion),
        sinCambio: lineas.filter((l) => l.accion === ACCIONES_LINEA.SIN_CAMBIO.codigo),
        noProcesables: lineas.filter((l) => l.accion === ACCIONES_LINEA.NO_PROCESABLE.codigo)
    });

    /** Datos de la pantalla de Validación. */
    const getDatosValidacion = (procesoId) => {
        const proceso = procesoRepo.obtener(procesoId);
        if (!proceso) return null;
        const datos = archivoRepo.leerJson(proceso.archivoDatos);
        return {
            proceso,
            datos,
            grupos: agruparValidacion(datos.lineas),
            esValidado: proceso.estado === "VALIDADO",
            esAnulado: proceso.estado === "ANULADO",
            urlOrigen: archivoRepo.getUrl(proceso.archivoOrigen),
            urlDescarga: urlPantalla(PANTALLAS.DESCARGAR_VALIDACION, proceso.id)
        };
    };

    /**
     * Vuelve a validar el CSV ya cargado contra los datos actuales de NetSuite, en el mismo proceso.
     * Reemplaza el JSON de la validación (los reemplazos confirmados se reinician) y los totales.
     * @returns {string[]} errores (vacío si se revalidó)
     */
    const revalidar = (procesoId) => {
        const proceso = procesoRepo.obtener(procesoId);
        if (!proceso) return ["No se encontró el proceso."];
        if (proceso.estado !== "VALIDADO") return [`El proceso ${proceso.nombre} no está en estado Validado; no se puede revalidar.`];
        if (!proceso.archivoOrigen || !proceso.archivoDatos) return ["El proceso no tiene el CSV de origen o los datos de la validación."];

        const lectura = cargaCsvService.parsearCsv(archivoRepo.leer(proceso.archivoOrigen));
        if (lectura.errores.length) return lectura.errores;

        const anterior = archivoRepo.leerJson(proceso.archivoDatos);
        const { lineas, resumen } = validacionService.validar({ subsidiaria: Number(proceso.subsidiaria), filas: lectura.filas });
        const datos = { ...anterior, version: 2, separador: lectura.separador, resumen, lineas, revalidadoEl: new Date().toISOString() };
        const idDatos = archivoRepo.actualizarJson(proceso.archivoDatos, datos);
        procesoRepo.actualizar(procesoId, {
            [P.ARCHIVO_DATOS]: idDatos,
            [P.TOTAL_LINEAS]: resumen.lineas,
            [P.TOTAL_PROCESAR]: resumen.procesar,
            [P.RESUMEN]: JSON.stringify(resumen)
        });
        nLog.audit({ title: `AS_NSP_037 - Revalidación ${proceso.nombre}`, details: JSON.stringify(resumen) });
        return [];
    };

    /**
     * Anula un proceso Validado que no se va a procesar. Deja la nota en la observación.
     * @returns {string[]} errores (vacío si se anuló)
     */
    const anular = (procesoId) => {
        const proceso = procesoRepo.obtener(procesoId);
        if (!proceso) return ["No se encontró el proceso."];
        if (proceso.estado !== "VALIDADO") return [`El proceso ${proceso.nombre} no está en estado Validado; no se puede anular.`];
        const usuario = runtime.getCurrentUser();
        const ahora = new Date();
        const p = (n) => String(n).padStart(2, "0");
        const nota = `[Anulado por ${usuario.name || usuario.id} el ${p(ahora.getDate())}/${p(ahora.getMonth() + 1)}/${ahora.getFullYear()} ${p(ahora.getHours())}:${p(ahora.getMinutes())}]`;
        procesoRepo.actualizar(procesoId, { [P.OBSERVACION]: `${proceso.observacion ? `${proceso.observacion} ` : ""}${nota}`.substring(0, LIMITES.TEXTO), [P.FECHA_FIN]: ahora }, "ANULADO");
        nLog.audit({ title: `AS_NSP_037 - Proceso ${proceso.nombre} anulado`, details: nota });
        return [];
    };

    /** Revisa los procesos En proceso; si su tarea terminó con error sin cerrar el proceso, lo marca como Error. */
    const procesosActivos = (excluir) => {
        const activos = [];
        for (const p of procesoRepo.obtenerEnProceso()) {
            if (Number(p.id) === Number(excluir)) continue;
            let estadoTarea = null;
            try {
                estadoTarea = p.taskid ? task.checkStatus({ taskId: p.taskid }).status : null;
            } catch (e) {
                estadoTarea = null;
            }
            if (estadoTarea === task.TaskStatus.FAILED) {
                procesoRepo.actualizar(p.id, { [P.ERROR]: "La tarea del Map/Reduce terminó con error.", [P.FECHA_FIN]: new Date() }, "ERROR");
            } else if (estadoTarea !== task.TaskStatus.COMPLETE) {
                activos.push(p);
            }
        }
        return activos;
    };

    /**
     * Guarda los reemplazos confirmados y lanza el Map/Reduce.
     * @param {number} procesoId
     * @param {Set<string>} confirmados - claves (cuenta|CRG_CORREL) marcadas en la pestaña de reemplazos
     * @returns {string[]} errores (vacío si el proceso se inició)
     */
    const procesar = (procesoId, confirmados) => {
        const proceso = procesoRepo.obtener(procesoId);
        if (!proceso) return ["No se encontró el proceso."];
        if (proceso.estado !== "VALIDADO") return [`El proceso ${proceso.nombre} ya no está en estado Validado.`];

        const activos = procesosActivos(procesoId);
        if (activos.length) return [`Hay otro proceso en ejecución (${activos.map((a) => a.nombre).join(", ")}). Espere a que termine.`];

        const datos = archivoRepo.leerJson(proceso.archivoDatos);
        let reemplazos = 0;
        datos.lineas.forEach((l) => {
            l.confirmado = !!(l.requiereConfirmacion && confirmados.has(l.clave));
            if (l.confirmado) reemplazos++;
        });
        datos.resumen.confirmados = reemplazos;
        const totalProcesar = datos.resumen.procesar + reemplazos;
        if (totalProcesar === 0) return ["No hay líneas para procesar. Marque los reemplazos que desea aplicar."];
        const idDatos = archivoRepo.actualizarJson(proceso.archivoDatos, datos);

        // El proceso pasa a En proceso ANTES de lanzar la tarea (getInputData lo exige)
        procesoRepo.actualizar(
            procesoId,
            { [P.ARCHIVO_DATOS]: idDatos, [P.TOTAL_PROCESAR]: totalProcesar, [P.FECHA_INICIO]: new Date(), [P.RESUMEN]: JSON.stringify(datos.resumen) },
            "EN_PROCESO"
        );
        try {
            const taskId = task
                .create({
                    taskType: task.TaskType.MAP_REDUCE,
                    scriptId: SCRIPTS.MAP_REDUCE.ID,
                    deploymentId: SCRIPTS.MAP_REDUCE.DEPLOY,
                    params: { [SCRIPTS.MAP_REDUCE.PARAM_PROCESO]: Number(procesoId) }
                })
                .submit();
            procesoRepo.actualizar(procesoId, { [P.TASK_ID]: String(taskId) });
            nLog.audit({ title: `AS_NSP_037 - Proceso ${proceso.nombre} enviado`, details: `Tarea ${taskId}: ${totalProcesar} línea(s), ${reemplazos} reemplazo(s)` });
            return [];
        } catch (e) {
            nLog.error({ title: "AS_NSP_037 - No se pudo iniciar el Map/Reduce", details: mensajeError(e) });
            procesoRepo.actualizar(procesoId, { [P.FECHA_INICIO]: null }, "VALIDADO");
            return [`No se pudo iniciar el proceso: ${mensajeError(e)}`];
        }
    };

    // ═══════════════════════════════════════════════════════════════════
    // Historial
    // ═══════════════════════════════════════════════════════════════════

    /** Texto de fecha del usuario → 'YYYY-MM-DD' (vacío si no es válida). */
    const fechaFiltro = (texto) => {
        if (!texto) return "";
        try {
            return formato.fechaIso(format.parse({ value: texto, type: format.Type.DATE }));
        } catch (e) {
            return "";
        }
    };

    /**
     * Procesos del historial. Los Validados y Anulados abren la Validación; los demás, el Detalle.
     * @param {{ estado?: string, subsidiaria?: string, desde?: string, hasta?: string }} filtros - desde/hasta en formato del usuario
     */
    const getHistorial = (filtros) =>
        procesoRepo
            .listar({ estado: filtros.estado, subsidiaria: filtros.subsidiaria, desde: fechaFiltro(filtros.desde), hasta: fechaFiltro(filtros.hasta) })
            .map((p) => ({ ...p, url: urlPantalla(["VALIDADO", "ANULADO"].includes(p.estado) ? PANTALLAS.VALIDACION : PANTALLAS.DETALLE, p.id) }));

    /** Opciones del filtro de estado: [{ valor: clave, texto }] */
    const getEstadosProceso = () => Object.keys(ESTADO_PROCESO).map((k) => ({ valor: k, texto: ESTADO_PROCESO[k].texto }));

    // ═══════════════════════════════════════════════════════════════════
    // Detalle
    // ═══════════════════════════════════════════════════════════════════

    const parsearJson = (texto, porDefecto) => {
        try {
            return texto ? JSON.parse(texto) : porDefecto;
        } catch (e) {
            return porDefecto;
        }
    };

    /** Línea del detalle (registro) con la misma forma que una línea de validación. */
    const lineaDesdeDetalle = (d) => ({
        filas: [d.fila],
        cuenta: d.cuenta,
        crg: d.crg,
        ovId: d.ovid,
        ovNumero: d.ov,
        articuloOvNombre: d.articuloov,
        articuloCsvNombre: d.articulocsv,
        cantidadOv: d.cantov,
        despachada: d.despachada,
        cantidadFinal: d.cantfinal,
        precioOv: d.precioov,
        precioNuevo: d.precionuevo,
        accionTexto: d.accion,
        estado: d.estado,
        estadoTexto: d.estadotexto,
        cantidadResultante: d.cantresultante,
        ejecucionesAfectadas: parsearJson(d.ejecucionesjson, d.ejecuciones ? [{ id: null, texto: d.ejecuciones }] : []),
        lotes: d.lotes,
        mensaje: d.mensaje
    });

    /** Datos de la pantalla de Detalle. */
    const getDatosDetalle = (procesoId) => {
        let proceso = procesoRepo.obtener(procesoId);
        if (!proceso) return null;

        let estadoTarea = null;
        if (proceso.estado === "EN_PROCESO" && proceso.taskId) {
            try {
                const estado = task.checkStatus({ taskId: proceso.taskId });
                estadoTarea = `${estado.status}${estado.stage ? ` / ${estado.stage}` : ""}`;
                if (estado.status === task.TaskStatus.FAILED) {
                    procesoRepo.actualizar(proceso.id, { [P.ERROR]: "La tarea del Map/Reduce terminó con error.", [P.FECHA_FIN]: new Date() }, "ERROR");
                    proceso = procesoRepo.obtener(proceso.id);
                }
            } catch (e) {
                estadoTarea = null;
            }
        }

        const lineas = procesoRepo.listarDetalle(proceso.id).map(lineaDesdeDetalle);
        const grupos = {};
        Object.keys(ESTADO_LINEA).forEach((k) => {
            grupos[k] = lineas.filter((l) => l.estado === k);
        });
        return {
            proceso,
            grupos,
            resumen: parsearJson(proceso.resumen, null),
            enCurso: proceso.estado === "EN_PROCESO",
            estadoTarea,
            urlOrigen: archivoRepo.getUrl(proceso.archivoOrigen),
            urlDescargaValidacion: proceso.archivoDatos ? urlPantalla(PANTALLAS.DESCARGAR_VALIDACION, proceso.id) : null,
            urlDescargaResultado: lineas.length ? urlPantalla(PANTALLAS.DESCARGAR_RESULTADO, proceso.id) : null
        };
    };

    // ═══════════════════════════════════════════════════════════════════
    // Descargas en Excel
    // ═══════════════════════════════════════════════════════════════════

    const nombreArchivo = (proceso, sufijo) => `${String(proceso.nombre).replace(/[^\w\-]+/g, "_")}_${sufijo}.xls`;

    /** Excel con la validación (todas las casuísticas antes de procesar). */
    const getDescargaValidacion = (procesoId) => {
        const proceso = procesoRepo.obtener(procesoId);
        if (!proceso) throw new Error("No se encontró el proceso.");
        const datos = archivoRepo.leerJson(proceso.archivoDatos);
        const columnas = [
            { titulo: "Fila" },
            { titulo: "Cuenta", tipo: "text" },
            { titulo: "CRG_CORREL", tipo: "text" },
            { titulo: "OV", tipo: "text" },
            { titulo: "Estado OV" },
            { titulo: "Artículo OV (ID)" },
            { titulo: "Artículo OV" },
            { titulo: "Artículo CSV (ID)" },
            { titulo: "Artículo CSV" },
            { titulo: "Ubicación" },
            { titulo: "Cantidad OV" },
            { titulo: "Despachada" },
            { titulo: "Cantidad final" },
            { titulo: "Precio actual" },
            { titulo: "Precio nuevo" },
            { titulo: "Monto resultante" },
            { titulo: "Acción" },
            { titulo: "Ejecución" },
            { titulo: "Reemplazo confirmado" },
            { titulo: "Mensaje" }
        ];
        const filas = datos.lineas.map((l) => [
            (l.filas || []).join(" "),
            l.cuenta,
            l.crg,
            l.ovNumero,
            l.ovEstadoTexto,
            l.articuloOvId,
            l.articuloOvNombre,
            l.idArticuloCsv,
            l.articuloCsvNombre,
            l.ubicacionNombre,
            l.cantidadOv,
            l.despachada,
            l.cantidadFinal,
            l.precioOv,
            l.precioNuevo,
            l.montoNuevo,
            l.accionTexto,
            l.ajusteEjecucionTexto,
            l.requiereConfirmacion ? (l.confirmado ? "Sí" : "No") : "",
            l.mensaje
        ]);
        return { carpetaId: carpetaId(), nombre: nombreArchivo(proceso, "validacion"), hojas: [{ nombre: "Validación", columnas, filas }] };
    };

    /** Excel con el resultado por línea (todas las casuísticas después de procesar). */
    const getDescargaResultado = (procesoId) => {
        const proceso = procesoRepo.obtener(procesoId);
        if (!proceso) throw new Error("No se encontró el proceso.");
        const lineas = procesoRepo.listarDetalle(proceso.id).map(lineaDesdeDetalle);
        const columnas = [
            { titulo: "Fila" },
            { titulo: "Cuenta", tipo: "text" },
            { titulo: "CRG_CORREL", tipo: "text" },
            { titulo: "OV", tipo: "text" },
            { titulo: "Artículo OV" },
            { titulo: "Artículo CSV" },
            { titulo: "Acción" },
            { titulo: "Estado" },
            { titulo: "Cantidad OV" },
            { titulo: "Despachada" },
            { titulo: "Cantidad final" },
            { titulo: "Cantidad resultante" },
            { titulo: "Precio OV" },
            { titulo: "Precio nuevo" },
            { titulo: "Ejecuciones" },
            { titulo: "Lotes" },
            { titulo: "Mensaje" }
        ];
        const filas = lineas.map((l) => [
            (l.filas || []).join(" "),
            l.cuenta,
            l.crg,
            l.ovNumero,
            l.articuloOvNombre,
            l.articuloCsvNombre,
            l.accionTexto,
            l.estadoTexto,
            l.cantidadOv,
            l.despachada,
            l.cantidadFinal,
            l.cantidadResultante,
            l.precioOv,
            l.precioNuevo,
            (l.ejecucionesAfectadas || []).map((e) => e.texto).join(", "),
            l.lotes,
            l.mensaje
        ]);
        return { carpetaId: carpetaId(), nombre: nombreArchivo(proceso, "resultado"), hojas: [{ nombre: "Resultado", columnas, filas }] };
    };

    // ═══════════════════════════════════════════════════════════════════
    // Map/Reduce
    // ═══════════════════════════════════════════════════════════════════

    /**
     * Cierra el proceso al terminar el Map/Reduce.
     * @param {number} procesoId
     * @param {{ conteo: object, errores: string[], erroresEtapas: number, errorEntrada: boolean }} resultado
     *        conteo = líneas por clave de ESTADO_LINEA
     */
    const finalizar = (procesoId, { conteo, errores, erroresEtapas, errorEntrada }) => {
        const proceso = procesoRepo.obtener(procesoId);
        const procesadas = conteo.PROCESADA || 0;
        const omitidas = (conteo.OMITIDA || 0) + (conteo.NO_PROCESABLE || 0) + (conteo.SIN_CAMBIO || 0);
        // Un error de etapa (map/reduce) deja líneas sin detalle: se suma como error
        const conError = (conteo.ERROR || 0) + (erroresEtapas || 0);
        let estado = "COMPLETADO";
        if (errorEntrada) estado = "ERROR";
        else if (conError > 0) estado = "COMPLETADO_ERRORES";
        procesoRepo.actualizar(
            procesoId,
            {
                [P.TOTAL_PROCESADAS]: procesadas,
                [P.TOTAL_OMITIDAS]: omitidas,
                [P.TOTAL_ERRORES]: conError,
                [P.FECHA_FIN]: new Date(),
                [P.RESUMEN]: JSON.stringify({ ...parsearJson(proceso && proceso.resumen, {}), resultado: conteo }).substring(0, LIMITES.CLOB),
                [P.ERROR]: (errores || []).join("\n").substring(0, LIMITES.CLOB)
            },
            estado
        );
    };

    /** Proceso para el getInputData del Map/Reduce: líneas del JSON con su subsidiaria. */
    const prepararProceso = (procesoId) => {
        const proceso = procesoId ? procesoRepo.obtener(procesoId) : null;
        if (!proceso) throw new Error(`No se encontró el proceso ${procesoId}`);
        if (proceso.estado !== "EN_PROCESO") {
            nLog.audit({ title: "AS_NSP_037 - Proceso no está En proceso", details: `${proceso.nombre}: ${proceso.estadoTexto}` });
            return [];
        }
        const datos = archivoRepo.leerJson(proceso.archivoDatos);
        nLog.audit({ title: `AS_NSP_037 - Inicio ${proceso.nombre}`, details: `${datos.lineas.length} líneas` });
        return datos.lineas.map((l) => ({ ...l, subsidiaria: datos.subsidiaria }));
    };

    return {
        leerCarga,
        registrarValidacion,
        getDatosValidacion,
        procesar,
        revalidar,
        anular,
        getHistorial,
        getEstadosProceso,
        getDatosDetalle,
        getDescargaValidacion,
        getDescargaResultado,
        prepararProceso,
        finalizar,
        urlPantalla,
        plantilla: cargaCsvService.plantilla
    };
});
