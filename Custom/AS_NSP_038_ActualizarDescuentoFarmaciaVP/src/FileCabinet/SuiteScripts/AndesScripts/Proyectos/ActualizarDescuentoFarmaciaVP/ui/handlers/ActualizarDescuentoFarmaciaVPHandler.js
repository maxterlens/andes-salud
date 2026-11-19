/**
 * @NApiVersion 2.1
 * @NModuleScope SameAccount
 *
 * @description AS_NSP_038 - Handler del Suitelet ActualizarDescuentoFarmaciaVP.
 *              Responsabilidad: leer el request, delegar en ProcesoDescuentoService y responder.
 *                GET  → muestra la pantalla indicada en el parámetro "pantalla".
 *                POST → ejecuta la acción indicada en custpage_accion (buscar / procesar / revalidar).
 *              Buscar no crea registros: deja la búsqueda en un JSON temporal del usuario (archivo + token en la URL).
 *              El registro del proceso se crea al presionar Procesar. El Suitelet no modifica facturas: eso lo hace
 *              solo el Map/Reduce.
 */
define([
    "N/http",
    "N/log",
    "../forms/ParametrosForm",
    "../forms/ValidacionForm",
    "../forms/HistorialForm",
    "../forms/DetalleForm",
    "../../services/ProcesoDescuentoService",
    "../../utils/ExcelUtils",
    "../../constants/ActualizarDescuentoFarmaciaVPConstants"
], (http, nLog, ParametrosForm, ValidacionForm, HistorialForm, DetalleForm, ProcesoService, ExcelUtils, CONST) => {
    const { SCRIPTS, PARAMS, PANTALLAS, ACCIONES, CAMPOS_PARAMETROS: CP, CAMPOS_VALIDACION: CV, FILTROS_HISTORIAL: F, SUBLISTAS, COLUMNAS_SELECCION: CS, MENSAJES } = CONST;

    const _redirigir = (context, parametros) => {
        context.response.sendRedirect({ type: http.RedirectType.SUITELET, identifier: SCRIPTS.SUITELET.ID, id: SCRIPTS.SUITELET.DEPLOY, parameters: parametros });
    };

    const _procesoId = (context) => context.request.parameters[PARAMS.PROCESO_ID];
    const _archivoId = (context) => context.request.parameters[PARAMS.ARCHIVO] || context.request.parameters[CV.ARCHIVO_ID];
    const _token = (context) => context.request.parameters[PARAMS.TOKEN] || context.request.parameters[CV.TOKEN];
    const _urlValidacion = (archivoId, token, msg) => ({ [PARAMS.PANTALLA]: PANTALLAS.VALIDACION, [PARAMS.ARCHIVO]: archivoId, [PARAMS.TOKEN]: token, [PARAMS.MSG]: msg });
    const _mensajeUrl = (context) => MENSAJES[context.request.parameters[PARAMS.MSG]] || null;
    const _error = (titulo, errores) => ({ tipo: "ERROR", titulo, texto: errores.join("<br>") });

    // ── Pantallas ─────────────────────────────────────────────────────────────

    const _mostrarParametros = (context, { valores, mensaje } = {}) => {
        context.response.writePage(ParametrosForm.construir({ valores, mensaje: mensaje || _mensajeUrl(context), config: ProcesoService.config() }));
    };

    /** Validación de la búsqueda temporal; si ya no está vigente vuelve a Parámetros. */
    const _mostrarValidacion = (context, mensaje = null) => {
        const datos = ProcesoService.getDatosValidacion(_archivoId(context), _token(context));
        if (!datos) return _mostrarParametros(context, { mensaje: mensaje || MENSAJES.busqueda_no_vigente });
        return context.response.writePage(ValidacionForm.construir(datos, mensaje || _mensajeUrl(context)));
    };

    const _mostrarHistorial = (context) => {
        const p = context.request.parameters;
        const filtros = { estado: p[F.ESTADO] || "", subsidiaria: p[F.SUBSIDIARIA] || "", desde: p[F.DESDE] || "", hasta: p[F.HASTA] || "" };
        context.response.writePage(HistorialForm.construir({ procesos: ProcesoService.getHistorial(filtros), estados: ProcesoService.getEstadosProceso(), filtros, mensaje: _mensajeUrl(context) }));
    };

    const _mostrarDetalle = (context, mensaje = null) => {
        const datos = ProcesoService.getDatosDetalle(_procesoId(context));
        if (!datos) return _mostrarParametros(context, { mensaje: MENSAJES.no_encontrado });
        return context.response.writePage(DetalleForm.construir(datos, mensaje || _mensajeUrl(context)));
    };

    /** Descargas en Excel (validación o resultado). */
    const _descargar = (context, obtener) => {
        try {
            const datos = obtener({ procesoId: _procesoId(context), archivoId: _archivoId(context), token: _token(context) });
            if (!datos.carpetaId) throw new Error("No está configurada la carpeta de archivos en el deployment del Suitelet.");
            ExcelUtils.descargar({ response: context.response, ...datos });
        } catch (e) {
            nLog.error({ title: "AS_NSP_038 - Handler descargar", details: e });
            context.response.write(`No se pudo generar el Excel: ${(e && e.message) || e}`);
        }
    };

    const _handleGet = (context) => {
        switch (context.request.parameters[PARAMS.PANTALLA] || PANTALLAS.PARAMETROS) {
            case PANTALLAS.VALIDACION:
                return _mostrarValidacion(context);
            case PANTALLAS.HISTORIAL:
                return _mostrarHistorial(context);
            case PANTALLAS.DETALLE:
                return _mostrarDetalle(context);
            case PANTALLAS.DESCARGAR_VALIDACION:
                return _descargar(context, ProcesoService.getDescargaValidacion);
            case PANTALLAS.DESCARGAR_RESULTADO:
                return _descargar(context, ProcesoService.getDescargaResultado);
            default:
                return _mostrarParametros(context);
        }
    };

    // ── Acciones ──────────────────────────────────────────────────────────────

    /** BUSCAR: busca y valida las facturas (sin crear registros) y muestra la Validación; con error vuelve a Parámetros. */
    const _handleBuscar = (context) => {
        const parametros = ProcesoService.leerParametros(context.request);
        const { archivoId, token, errores } = ProcesoService.buscar(parametros);
        if (errores.length) {
            nLog.audit({ title: "AS_NSP_038 - Búsqueda con errores", details: errores });
            return _mostrarParametros(context, { valores: parametros, mensaje: _error("Revise los parámetros", errores) });
        }
        return _redirigir(context, _urlValidacion(archivoId, token, "validado"));
    };

    /** IDs de las facturas marcadas en la pestaña Por procesar. */
    const _facturasSeleccionadas = (request) => {
        const seleccionadas = new Set();
        const total = request.getLineCount({ group: SUBLISTAS.POR_PROCESAR });
        for (let i = 0; i < total; i++) {
            if (request.getSublistValue({ group: SUBLISTAS.POR_PROCESAR, name: CS.PROCESAR, line: i }) === "T") {
                seleccionadas.add(String(request.getSublistValue({ group: SUBLISTAS.POR_PROCESAR, name: CS.FACTURA_ID, line: i })));
            }
        }
        return seleccionadas;
    };

    /** PROCESAR: crea el proceso, inicia el Map/Reduce y redirige al Historial; si no se puede, vuelve a la Validación. */
    const _handleProcesar = (context) => {
        const { errores } = ProcesoService.procesar(_archivoId(context), _token(context), _facturasSeleccionadas(context.request));
        if (errores.length) return _mostrarValidacion(context, _error("No se pudo procesar", errores));
        return _redirigir(context, { [PARAMS.PANTALLA]: PANTALLAS.HISTORIAL, [PARAMS.MSG]: "procesando" });
    };

    /** REVALIDAR: vuelve a buscar y validar con los mismos parámetros (reemplaza la búsqueda temporal). */
    const _handleRevalidar = (context) => {
        const { archivoId, token, errores } = ProcesoService.revalidar(_archivoId(context), _token(context));
        if (errores.length) return _mostrarValidacion(context, _error("No se pudo revalidar", errores));
        return _redirigir(context, _urlValidacion(archivoId, token, "revalidado"));
    };

    const _handlePost = (context) => {
        const accion = context.request.parameters[CP.ACCION];
        switch (accion) {
            case ACCIONES.BUSCAR:
                return _handleBuscar(context);
            case ACCIONES.PROCESAR:
                return _handleProcesar(context);
            case ACCIONES.REVALIDAR:
                return _handleRevalidar(context);
            default:
                throw new Error(`Acción no soportada: ${accion}`);
        }
    };

    const handleRequest = (context) => (context.request.method === "GET" ? _handleGet(context) : _handlePost(context));

    return { handleRequest };
});
