/**
 * @NApiVersion 2.1
 * @NModuleScope SameAccount
 *
 * @description AS_NSP_038 - Service fachada de ActualizarDescuentoFarmaciaVP.
 *              Reglas de negocio de las pantallas del Suitelet y cierre del Map/Reduce.
 *              El handler solo lee el request, llama a este service y responde.
 *
 *               - leerParametros / buscar                  → pantalla de Parámetros (POST buscar): la búsqueda
 *                                                            queda en un JSON temporal del usuario, sin crear registro
 *               - getDatosValidacion / revalidar           → pantalla de Validación (GET / POST revalidar)
 *               - procesar                                 → pantalla de Validación (POST procesar): crea el registro
 *                                                            del proceso y lanza el Map/Reduce
 *               - getHistorial                             → pantalla de Historial
 *               - getDatosDetalle                          → pantalla de Detalle
 *               - getDescargaValidacion / getDescargaResultado → descargas en Excel
 *               - prepararProceso / finalizar              → getInputData y summarize del Map/Reduce
 */
define([
    "N/url",
    "N/runtime",
    "N/task",
    "N/format",
    "N/search",
    "N/log",
    "../constants/ActualizarDescuentoFarmaciaVPConstants",
    "../repositories/ProcesoRepository",
    "../repositories/ArchivoRepository",
    "./ValidacionService",
    "../utils/FormatoUtils"
], (url, runtime, task, format, search, nLog, CONST, procesoRepo, archivoRepo, validacionService, formato) => {
    const { SCRIPTS, PARAMETROS_DEFECTO, PARAMS, PANTALLAS, CAMPOS_PARAMETROS: CP, BUSQUEDA_TEMPORAL, PROCESO, ESTADO_PROCESO, ESTADO_LINEA, CLASIFICACION, LIMITES } = CONST;
    const P = PROCESO.CAMPOS;

    const mensajeError = (e) => (e && (e.message || e.name)) || String(e);

    /** URL del Suitelet con pantalla y proceso. */
    const urlPantalla = (pantalla, procesoId, extra = {}) =>
        url.resolveScript({
            scriptId: SCRIPTS.SUITELET.ID,
            deploymentId: SCRIPTS.SUITELET.DEPLOY,
            params: { [PARAMS.PANTALLA]: pantalla, ...(procesoId ? { [PARAMS.PROCESO_ID]: procesoId } : {}), ...extra }
        });

    const _parametro = (nombre) => {
        try {
            return runtime.getCurrentScript().getParameter({ name: nombre });
        } catch (e) {
            return null;
        }
    };

    const _numero = (valor, porDefecto) => (valor !== null && valor !== undefined && valor !== "" && Number.isFinite(Number(valor)) ? Number(valor) : porDefecto);

    /** Carpeta de archivos (parámetro obligatorio del deployment del Suitelet). */
    const carpetaId = () => _parametro(SCRIPTS.SUITELET.PARAM_CARPETA) || null;

    /** Filtros y reglas configurables en el deployment del Suitelet. */
    const config = () => ({
        departamentos: String(_parametro(SCRIPTS.SUITELET.PARAM_DEPARTAMENTOS) || PARAMETROS_DEFECTO.DEPARTAMENTOS),
        ubicacionesExcluidas: String(_parametro(SCRIPTS.SUITELET.PARAM_UBICACIONES_EXCLUIDAS) || PARAMETROS_DEFECTO.UBICACIONES_EXCLUIDAS),
        restanteMinimo: _numero(_parametro(SCRIPTS.SUITELET.PARAM_RESTANTE_MINIMO), PARAMETROS_DEFECTO.RESTANTE_MINIMO),
        tolerancia: _numero(_parametro(SCRIPTS.SUITELET.PARAM_TOLERANCIA), PARAMETROS_DEFECTO.TOLERANCIA),
        iva: _numero(_parametro(SCRIPTS.SUITELET.PARAM_IVA), PARAMETROS_DEFECTO.IVA)
    });

    const nombreSubsidiaria = (id) => {
        try {
            return search.lookupFields({ type: search.Type.SUBSIDIARY, id: Number(id), columns: ["name"] }).name || String(id);
        } catch (e) {
            return String(id);
        }
    };

    /** Texto de fecha del usuario → 'YYYY-MM-DD' (vacío si no es válida). */
    const fechaIso = (texto) => {
        if (!texto) return "";
        try {
            return formato.fechaIso(format.parse({ value: texto, type: format.Type.DATE }));
        } catch (e) {
            return "";
        }
    };

    const parsearJson = (texto, porDefecto) => {
        try {
            return texto ? JSON.parse(texto) : porDefecto;
        } catch (e) {
            return porDefecto;
        }
    };

    // ═══════════════════════════════════════════════════════════════════
    // Parámetros
    // ═══════════════════════════════════════════════════════════════════

    /** Valores de la pantalla de Parámetros (fechas en texto del usuario). */
    const leerParametros = (request) => ({
        subsidiaria: request.parameters[CP.SUBSIDIARIA] || "",
        desde: request.parameters[CP.DESDE] || "",
        hasta: request.parameters[CP.HASTA] || "",
        observacion: request.parameters[CP.OBSERVACION] || ""
    });

    /** Busca y valida las facturas. @returns {{ datos: object, resumen: object }} */
    const _validar = ({ subsidiaria, desde, hasta, observacion }) => {
        const cfg = config();
        const { facturas, resumen } = validacionService.validar({ subsidiaria: Number(subsidiaria), desde, hasta, config: cfg });
        // Todas las facturas que se pueden procesar quedan marcadas por defecto
        facturas.forEach((f) => {
            f.seleccionada = f.clasificacion === CLASIFICACION.POR_PROCESAR.codigo;
        });
        const usuario = runtime.getCurrentUser();
        return {
            resumen,
            datos: {
                version: 1,
                token: nuevoToken(),
                usuarioId: Number(usuario.id),
                usuarioNombre: usuario.name || String(usuario.id),
                buscadoEl: new Date().toISOString(),
                subsidiaria: Number(subsidiaria),
                subsidiariaNombre: nombreSubsidiaria(subsidiaria),
                desde: desde || "",
                hasta: hasta || "",
                observacion: observacion || "",
                config: cfg,
                resumen,
                facturas
            }
        };
    };

    /** Identificador de cada búsqueda: la pantalla de Validación solo procesa la búsqueda que muestra. */
    const nuevoToken = () => `${Date.now().toString(36)}${Math.random().toString(36).substring(2, 10)}`;

    /** Nombre del JSON temporal de la búsqueda del usuario actual. */
    const nombreTemporal = () => `${BUSQUEDA_TEMPORAL.PREFIJO}${runtime.getCurrentUser().id}.json`;

    /**
     * Carga la búsqueda temporal y comprueba que sea del usuario actual, de la carpeta configurada,
     * la misma que muestra la pantalla (token) y que todavía no se haya procesado.
     * @returns {{ datos: object|null, error: string|null }}
     */
    const cargarBusqueda = (archivoId, token) => {
        const carpeta = carpetaId();
        const archivo = archivoId && carpeta ? archivoRepo.leerJsonConInfo(archivoId) : null;
        if (!archivo || archivo.nombre !== nombreTemporal() || archivo.carpeta !== Number(carpeta)) return { datos: null, error: "No se encontró la búsqueda." };
        if (!token || archivo.datos.token !== token) return { datos: null, error: "La búsqueda fue reemplazada por otra más reciente." };
        if (archivo.datos.procesoId) return { datos: null, error: `Esta búsqueda ya se procesó (${archivo.datos.procesoNombre || archivo.datos.procesoId}).` };
        return { datos: archivo.datos, error: null };
    };

    /**
     * Busca y valida las facturas y guarda el resultado en el JSON temporal del usuario.
     * No crea el registro del proceso: eso ocurre recién al presionar Procesar.
     * @returns {{ archivoId: number|null, token: string|null, errores: string[] }}
     */
    const buscar = ({ subsidiaria, desde, hasta, observacion }) => {
        const errores = [];
        const carpeta = carpetaId();
        if (!carpeta) errores.push("No está configurada la carpeta de archivos en el deployment del Suitelet (parámetro Carpeta de archivos).");
        if (!subsidiaria) errores.push("Seleccione la subsidiaria.");
        const desdeIso = fechaIso(desde);
        const hastaIso = fechaIso(hasta);
        if (desde && !desdeIso) errores.push("La fecha desde no es válida.");
        if (hasta && !hastaIso) errores.push("La fecha hasta no es válida.");
        if (desdeIso && hastaIso && desdeIso > hastaIso) errores.push("La fecha desde no puede ser mayor que la fecha hasta.");
        if (errores.length) return { archivoId: null, token: null, errores };

        const { datos, resumen } = _validar({ subsidiaria, desde: desdeIso, hasta: hastaIso, observacion });
        const archivoId = archivoRepo.crearJson(nombreTemporal(), datos, carpeta);
        nLog.audit({ title: "AS_NSP_038 - Búsqueda", details: JSON.stringify(resumen) });
        return { archivoId, token: datos.token, errores: [] };
    };

    // ═══════════════════════════════════════════════════════════════════
    // Validación
    // ═══════════════════════════════════════════════════════════════════

    /** Separa las facturas en los grupos de las pestañas. */
    const agruparValidacion = (facturas) => ({
        porProcesar: facturas.filter((f) => f.clasificacion === CLASIFICACION.POR_PROCESAR.codigo),
        noProcesables: facturas.filter((f) => f.clasificacion === CLASIFICACION.NO_PROCESABLE.codigo),
        sinDiferencia: facturas.filter((f) => f.clasificacion === CLASIFICACION.SIN_DIFERENCIA.codigo)
    });

    /** Datos de la pantalla de Validación; null si la búsqueda no está vigente. */
    const getDatosValidacion = (archivoId, token) => {
        const { datos } = cargarBusqueda(archivoId, token);
        if (!datos) return null;
        return {
            datos,
            grupos: agruparValidacion(datos.facturas),
            archivoId: Number(archivoId),
            token,
            urlDescarga: urlPantalla(PANTALLAS.DESCARGAR_VALIDACION, null, { [PARAMS.ARCHIVO]: archivoId, [PARAMS.TOKEN]: token })
        };
    };

    /**
     * Vuelve a buscar y validar con los mismos parámetros (reemplaza la búsqueda temporal).
     * @returns {{ archivoId: number|null, token: string|null, errores: string[] }}
     */
    const revalidar = (archivoId, token) => {
        const { datos, error } = cargarBusqueda(archivoId, token);
        if (!datos) return { archivoId: null, token: null, errores: [error] };
        const nueva = _validar({ subsidiaria: datos.subsidiaria, desde: datos.desde, hasta: datos.hasta, observacion: datos.observacion });
        const id = archivoRepo.crearJson(nombreTemporal(), { ...nueva.datos, revalidadoEl: new Date().toISOString() }, carpetaId());
        nLog.audit({ title: "AS_NSP_038 - Revalidación", details: JSON.stringify(nueva.resumen) });
        return { archivoId: id, token: nueva.datos.token, errores: [] };
    };

    /** Revisa los procesos En proceso; si su tarea terminó con error sin cerrar el proceso, lo marca como Error. */
    const procesosActivos = () => {
        const activos = [];
        for (const p of procesoRepo.obtenerEnProceso()) {
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
     * Crea el proceso con las facturas marcadas y lanza el Map/Reduce.
     *  1. Guarda el JSON definitivo del proceso (con la selección).
     *  2. Crea el registro customrecord_as_adfv_proceso en estado En proceso.
     *  3. Lanza el Map/Reduce y marca la búsqueda temporal como procesada (evita procesarla dos veces).
     * @param {number} archivoId - JSON temporal de la búsqueda
     * @param {string} token
     * @param {Set<string>} seleccionadas - IDs de factura marcados en la pestaña Por procesar
     * @returns {{ procesoId: number|null, errores: string[] }}
     */
    const procesar = (archivoId, token, seleccionadas) => {
        const { datos, error } = cargarBusqueda(archivoId, token);
        if (!datos) return { procesoId: null, errores: [error] };

        const activos = procesosActivos();
        if (activos.length) return { procesoId: null, errores: [`Hay otro proceso en ejecución (${activos.map((a) => a.nombre).join(", ")}). Espere a que termine.`] };

        let total = 0;
        datos.facturas.forEach((f) => {
            f.seleccionada = f.clasificacion === CLASIFICACION.POR_PROCESAR.codigo && seleccionadas.has(String(f.id));
            if (f.seleccionada) total++;
        });
        if (total === 0) return { procesoId: null, errores: ["No hay facturas marcadas para procesar."] };
        datos.resumen.seleccionadas = total;

        const carpeta = carpetaId();
        const idDatos = archivoRepo.crearJson(`ADFV_${formato.marcaTiempo()}_${datos.usuarioId}_datos.json`, datos, carpeta);
        const proceso = procesoRepo.crear({
            subsidiaria: datos.subsidiaria,
            desde: datos.desde,
            hasta: datos.hasta,
            usuario: datos.usuarioId,
            observacion: datos.observacion,
            archivoDatos: idDatos,
            totales: { revisadas: datos.resumen.revisadas, conDiferencia: datos.resumen.conDiferencia, procesables: datos.resumen.procesables, seleccionadas: total },
            resumen: JSON.stringify(datos.resumen)
        });

        try {
            const taskId = task
                .create({
                    taskType: task.TaskType.MAP_REDUCE,
                    scriptId: SCRIPTS.MAP_REDUCE.ID,
                    deploymentId: SCRIPTS.MAP_REDUCE.DEPLOY,
                    params: { [SCRIPTS.MAP_REDUCE.PARAM_PROCESO]: Number(proceso.id) }
                })
                .submit();
            procesoRepo.actualizar(proceso.id, { [P.TASK_ID]: String(taskId) });
        } catch (e) {
            nLog.error({ title: "AS_NSP_038 - No se pudo iniciar el Map/Reduce", details: mensajeError(e) });
            procesoRepo.actualizar(proceso.id, { [P.ERROR]: `No se pudo iniciar el Map/Reduce: ${mensajeError(e)}`, [P.FECHA_FIN]: new Date() }, "ERROR");
            return { procesoId: null, errores: [`No se pudo iniciar el proceso ${proceso.nombre}: ${mensajeError(e)}`] };
        }

        // La búsqueda temporal queda marcada: un segundo Procesar (doble clic, volver atrás) no crea otro proceso
        archivoRepo.crearJson(nombreTemporal(), { ...datos, procesoId: proceso.id, procesoNombre: proceso.nombre }, carpeta);
        nLog.audit({ title: `AS_NSP_038 - Proceso ${proceso.nombre} enviado`, details: `${total} factura(s)` });
        return { procesoId: proceso.id, errores: [] };
    };

    // ═══════════════════════════════════════════════════════════════════
    // Historial
    // ═══════════════════════════════════════════════════════════════════

    /**
     * Procesos del historial; cada uno abre su Detalle.
     * @param {{ estado?: string, subsidiaria?: string, desde?: string, hasta?: string }} filtros - desde/hasta en formato del usuario
     */
    const getHistorial = (filtros) =>
        procesoRepo
            .listar({ estado: filtros.estado, subsidiaria: filtros.subsidiaria, desde: fechaIso(filtros.desde), hasta: fechaIso(filtros.hasta) })
            .map((p) => ({ ...p, url: urlPantalla(PANTALLAS.DETALLE, p.id) }));

    /** Opciones del filtro de estado: [{ valor: clave, texto }] */
    const getEstadosProceso = () => Object.keys(ESTADO_PROCESO).map((k) => ({ valor: k, texto: ESTADO_PROCESO[k].texto }));

    // ═══════════════════════════════════════════════════════════════════
    // Detalle
    // ═══════════════════════════════════════════════════════════════════

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

        const filas = procesoRepo.listarDetalle(proceso.id);
        const grupos = {};
        Object.keys(ESTADO_LINEA).forEach((k) => {
            grupos[k] = filas.filter((d) => d.estado === k);
        });
        return {
            proceso,
            grupos,
            resumen: parsearJson(proceso.resumen, null),
            enCurso: proceso.estado === "EN_PROCESO",
            estadoTarea,
            urlDescargaValidacion: proceso.archivoDatos ? urlPantalla(PANTALLAS.DESCARGAR_VALIDACION, proceso.id) : null,
            urlDescargaResultado: filas.length ? urlPantalla(PANTALLAS.DESCARGAR_RESULTADO, proceso.id) : null
        };
    };

    // ═══════════════════════════════════════════════════════════════════
    // Descargas en Excel
    // ═══════════════════════════════════════════════════════════════════

    const nombreArchivo = (proceso, sufijo) => `${String(proceso.nombre).replace(/[^\w\-]+/g, "_")}_${sufijo}.xls`;

    const textoClasificacion = (codigo) => (CLASIFICACION[codigo] || {}).texto || codigo;

    /**
     * Excel con la validación: una fila por línea de descuento con diferencia (o por factura si no tiene).
     * Desde un proceso (Detalle) o desde la búsqueda temporal (Validación).
     * @param {{ procesoId?: number, archivoId?: number, token?: string }} origen
     */
    const getDescargaValidacion = ({ procesoId, archivoId, token }) => {
        let datos;
        let nombre;
        if (procesoId) {
            const proceso = procesoRepo.obtener(procesoId);
            if (!proceso || !proceso.archivoDatos) throw new Error("No se encontró el proceso.");
            datos = archivoRepo.leerJson(proceso.archivoDatos);
            nombre = nombreArchivo(proceso, "validacion");
        } else {
            const busqueda = cargarBusqueda(archivoId, token);
            if (!busqueda.datos) throw new Error(busqueda.error);
            datos = busqueda.datos;
            nombre = `ADFV_validacion_${formato.marcaTiempo()}.xls`;
        }
        const columnas = [
            { titulo: "ID factura" },
            { titulo: "Factura", tipo: "text" },
            { titulo: "Fecha" },
            { titulo: "Cliente" },
            { titulo: "Ubicación" },
            { titulo: "Importe" },
            { titulo: "Importe restante" },
            { titulo: "Clasificación" },
            { titulo: "Seleccionada" },
            { titulo: "Línea artículo" },
            { titulo: "Artículo" },
            { titulo: "Cant. artículo" },
            { titulo: "Línea descuento" },
            { titulo: "Descuento" },
            { titulo: "Cant. descuento actual" },
            { titulo: "Cant. descuento nueva" },
            { titulo: "Tarifa descuento" },
            { titulo: "Importe descuento actual" },
            { titulo: "Importe descuento nuevo" },
            { titulo: "IVA descuento actual" },
            { titulo: "IVA descuento nuevo" },
            { titulo: "Ajuste con IVA línea" },
            { titulo: "Ajuste neto factura" },
            { titulo: "Ajuste con IVA factura" },
            { titulo: "Diferencia de cuadre" },
            { titulo: "Restante esperado" },
            { titulo: "Motivo" }
        ];
        const filas = [];
        datos.facturas.forEach((f) => {
            const cabecera = [
                f.id,
                f.numero,
                f.fecha,
                f.cliente,
                f.ubicacion,
                f.total,
                f.restante,
                textoClasificacion(f.clasificacion),
                f.clasificacion === CLASIFICACION.POR_PROCESAR.codigo ? (f.seleccionada ? "Sí" : "No") : ""
            ];
            const pie = [f.netoAdicional, f.importeEsperado, f.diferenciaCuadre, f.restanteEsperado, f.motivo];
            const lineas = f.lineas && f.lineas.length ? f.lineas : [null];
            lineas.forEach((l) =>
                filas.push([
                    ...cabecera,
                    ...(l
                        ? [l.lineaArticulo, l.articuloNombre, l.cantArticulo, l.lineaDescuento, l.descuentoNombre, l.cantDescuento, l.cantDescuentoNueva, l.tarifaDescuento, l.importeDescuento, l.importeDescuentoNuevo, l.ivaDescuento, l.ivaDescuentoNuevo, l.ajusteConIva]
                        : ["", "", "", "", "", "", "", "", "", "", "", "", ""]),
                    ...pie
                ])
            );
        });
        return { carpetaId: carpetaId(), nombre, hojas: [{ nombre: "Validación", columnas, filas }] };
    };

    /** Excel con el resultado por línea de descuento. */
    const getDescargaResultado = ({ procesoId }) => {
        const proceso = procesoRepo.obtener(procesoId);
        if (!proceso) throw new Error("No se encontró el proceso.");
        const columnas = [
            { titulo: "ID factura" },
            { titulo: "Factura", tipo: "text" },
            { titulo: "Estado" },
            { titulo: "Línea artículo" },
            { titulo: "Artículo" },
            { titulo: "Cant. artículo" },
            { titulo: "Línea descuento" },
            { titulo: "Descuento" },
            { titulo: "Cant. descuento antes" },
            { titulo: "Cant. descuento después" },
            { titulo: "Tarifa descuento" },
            { titulo: "Importe descuento antes" },
            { titulo: "Importe descuento después" },
            { titulo: "Restante antes" },
            { titulo: "Restante esperado" },
            { titulo: "Restante después" },
            { titulo: "Mensaje" }
        ];
        const filas = procesoRepo
            .listarDetalle(proceso.id)
            .map((d) => [
                d.facturaid,
                d.factura,
                d.estadotexto,
                d.lineaarticulo,
                d.articulo,
                d.cantarticulo,
                d.lineadescuento,
                d.descuento,
                d.cantdescantes,
                d.cantdescdespues,
                d.tarifadesc,
                d.impdescantes,
                d.impdescdespues,
                d.restanteantes,
                d.restanteesperado,
                d.restantedespues,
                d.mensaje
            ]);
        return { carpetaId: carpetaId(), nombre: nombreArchivo(proceso, "resultado"), hojas: [{ nombre: "Resultado", columnas, filas }] };
    };

    // ═══════════════════════════════════════════════════════════════════
    // Map/Reduce
    // ═══════════════════════════════════════════════════════════════════

    /** Facturas para el getInputData: las que tienen diferencia (procesables y no procesables), con la tolerancia. */
    const prepararProceso = (procesoId) => {
        const proceso = procesoId ? procesoRepo.obtener(procesoId) : null;
        if (!proceso) throw new Error(`No se encontró el proceso ${procesoId}`);
        if (proceso.estado !== "EN_PROCESO") {
            nLog.audit({ title: "AS_NSP_038 - Proceso no está En proceso", details: `${proceso.nombre}: ${proceso.estadoTexto}` });
            return [];
        }
        const datos = archivoRepo.leerJson(proceso.archivoDatos);
        const tolerancia = (datos.config || {}).tolerancia;
        const facturas = datos.facturas.filter((f) => f.clasificacion !== CLASIFICACION.SIN_DIFERENCIA.codigo).map((f) => ({ ...f, tolerancia }));
        nLog.audit({ title: `AS_NSP_038 - Inicio ${proceso.nombre}`, details: `${facturas.length} factura(s) con diferencia` });
        return facturas;
    };

    /**
     * Cierra el proceso al terminar el Map/Reduce.
     * @param {number} procesoId
     * @param {{ conteo: object, errores: string[], erroresEtapas: number, errorEntrada: boolean }} resultado
     *        conteo = facturas por clave de ESTADO_LINEA
     */
    const finalizar = (procesoId, { conteo, errores, erroresEtapas, errorEntrada }) => {
        const proceso = procesoRepo.obtener(procesoId);
        const procesadas = conteo.PROCESADA || 0;
        const omitidas = (conteo.OMITIDA || 0) + (conteo.NO_PROCESABLE || 0) + (conteo.SIN_CAMBIO || 0);
        // Un error de etapa (map/reduce) deja facturas sin detalle: se suma como error
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

    return {
        config,
        leerParametros,
        buscar,
        getDatosValidacion,
        procesar,
        revalidar,
        getHistorial,
        getEstadosProceso,
        getDatosDetalle,
        getDescargaValidacion,
        getDescargaResultado,
        prepararProceso,
        finalizar,
        urlPantalla
    };
});
