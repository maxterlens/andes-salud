/**
 * @NApiVersion 2.1
 * @NModuleScope SameAccount
 *
 * @description AS_NSP_037 - Handler del Suitelet FixArticuloOrdenVenta.
 *              Responsabilidad: leer el request, delegar en ProcesoFixService y responder.
 *                GET  → muestra la pantalla indicada en el parámetro "pantalla".
 *                POST → ejecuta la acción indicada en custpage_accion (validar / procesar / revalidar / anular).
 *              El Suitelet no modifica OV ni Ejecuciones: eso lo hace solo el Map/Reduce.
 */
define([
    "N/http",
    "N/file",
    "N/log",
    "../forms/CargaForm",
    "../forms/ValidacionForm",
    "../forms/HistorialForm",
    "../forms/DetalleForm",
    "../../services/ProcesoFixService",
    "../../utils/ExcelUtils",
    "../../constants/FixArticuloOrdenVentaConstants"
], (http, file, nLog, CargaForm, ValidacionForm, HistorialForm, DetalleForm, ProcesoFixService, ExcelUtils, CONST) => {
    const { SCRIPTS, PARAMS, PANTALLAS, ACCIONES, CAMPOS_CARGA: CC, CAMPOS_VALIDACION: CV, FILTROS_HISTORIAL: F, SUBLISTAS, COLUMNAS_REEMPLAZO: CR, MENSAJES } = CONST;

    const _redirigir = (context, parametros) => {
        context.response.sendRedirect({ type: http.RedirectType.SUITELET, identifier: SCRIPTS.SUITELET.ID, id: SCRIPTS.SUITELET.DEPLOY, parameters: parametros });
    };

    const _procesoId = (context) => context.request.parameters[PARAMS.PROCESO_ID] || context.request.parameters[CV.PROCESO_ID];
    const _mensajeUrl = (context) => MENSAJES[context.request.parameters[PARAMS.MSG]] || null;
    const _error = (titulo, errores) => ({ tipo: "ERROR", titulo, texto: errores.join("<br>") });

    // ── Pantallas ─────────────────────────────────────────────────────────────

    const _mostrarCarga = (context, { valores, mensaje } = {}) => {
        context.response.writePage(CargaForm.construir({ valores, mensaje: mensaje || _mensajeUrl(context), urlPlantilla: ProcesoFixService.urlPantalla(PANTALLAS.PLANTILLA) }));
    };

    const _mostrarValidacion = (context, mensaje = null) => {
        const datos = ProcesoFixService.getDatosValidacion(_procesoId(context));
        if (!datos) return _mostrarCarga(context, { mensaje: MENSAJES.no_encontrado });
        // Los procesos Validados y Anulados se ven en esta pantalla (los Anulados en solo lectura)
        if (!datos.esValidado && !datos.esAnulado && !mensaje) return _redirigir(context, { [PARAMS.PANTALLA]: PANTALLAS.DETALLE, [PARAMS.PROCESO_ID]: datos.proceso.id, [PARAMS.MSG]: "ya_enviado" });
        return context.response.writePage(ValidacionForm.construir(datos, mensaje || _mensajeUrl(context)));
    };

    const _mostrarHistorial = (context) => {
        const p = context.request.parameters;
        const filtros = { estado: p[F.ESTADO] || "", subsidiaria: p[F.SUBSIDIARIA] || "", desde: p[F.DESDE] || "", hasta: p[F.HASTA] || "" };
        context.response.writePage(
            HistorialForm.construir({ procesos: ProcesoFixService.getHistorial(filtros), estados: ProcesoFixService.getEstadosProceso(), filtros, mensaje: _mensajeUrl(context) })
        );
    };

    const _mostrarDetalle = (context, mensaje = null) => {
        const datos = ProcesoFixService.getDatosDetalle(_procesoId(context));
        if (!datos) return _mostrarCarga(context, { mensaje: MENSAJES.no_encontrado });
        if (["VALIDADO", "ANULADO"].includes(datos.proceso.estado)) return _redirigir(context, { [PARAMS.PANTALLA]: PANTALLAS.VALIDACION, [PARAMS.PROCESO_ID]: datos.proceso.id });
        return context.response.writePage(DetalleForm.construir(datos, mensaje || _mensajeUrl(context)));
    };

    const _descargarPlantilla = (context) => {
        const plantilla = file.create({ name: "plantilla_fix_articulo_orden_venta.csv", fileType: file.Type.CSV, contents: ProcesoFixService.plantilla() });
        context.response.writeFile({ file: plantilla, isInline: false });
    };

    /** Descargas en Excel (validación o resultado). */
    const _descargar = (context, obtener) => {
        try {
            const datos = obtener(_procesoId(context));
            if (!datos.carpetaId) throw new Error("No está configurada la carpeta de archivos en el deployment del Suitelet.");
            ExcelUtils.descargar({ response: context.response, ...datos });
        } catch (e) {
            nLog.error({ title: "AS_NSP_037 - Handler descargar", details: e });
            context.response.write(`No se pudo generar el Excel: ${(e && e.message) || e}`);
        }
    };

    const _handleGet = (context) => {
        switch (context.request.parameters[PARAMS.PANTALLA] || PANTALLAS.CARGA) {
            case PANTALLAS.VALIDACION:
                return _mostrarValidacion(context);
            case PANTALLAS.HISTORIAL:
                return _mostrarHistorial(context);
            case PANTALLAS.DETALLE:
                return _mostrarDetalle(context);
            case PANTALLAS.PLANTILLA:
                return _descargarPlantilla(context);
            case PANTALLAS.DESCARGAR_VALIDACION:
                return _descargar(context, ProcesoFixService.getDescargaValidacion);
            case PANTALLAS.DESCARGAR_RESULTADO:
                return _descargar(context, ProcesoFixService.getDescargaResultado);
            default:
                return _mostrarCarga(context);
        }
    };

    // ── Acciones ──────────────────────────────────────────────────────────────

    /** VALIDAR: valida el archivo, registra el proceso y muestra la Validación; con error vuelve a la Carga conservando los valores. */
    const _handleValidar = (context) => {
        const carga = ProcesoFixService.leerCarga(context.request);
        const { procesoId, errores } = ProcesoFixService.registrarValidacion(carga);
        if (errores.length) {
            nLog.audit({ title: "AS_NSP_037 - Validación con errores", details: errores });
            return _mostrarCarga(context, { valores: { subsidiaria: carga.subsidiaria, observacion: carga.observacion }, mensaje: _error("Revise la carga", errores) });
        }
        return _redirigir(context, { [PARAMS.PANTALLA]: PANTALLAS.VALIDACION, [PARAMS.PROCESO_ID]: procesoId, [PARAMS.MSG]: "validado" });
    };

    /** Claves de los reemplazos marcados en la pestaña de reemplazos. */
    const _reemplazosConfirmados = (request) => {
        const confirmados = new Set();
        const total = request.getLineCount({ group: SUBLISTAS.REEMPLAZOS });
        for (let i = 0; i < total; i++) {
            if (request.getSublistValue({ group: SUBLISTAS.REEMPLAZOS, name: CR.REEMPLAZAR, line: i }) === "T") {
                confirmados.add(request.getSublistValue({ group: SUBLISTAS.REEMPLAZOS, name: CR.CLAVE, line: i }));
            }
        }
        return confirmados;
    };

    /** PROCESAR: inicia el Map/Reduce y redirige al Historial; si no se puede, vuelve a la Validación. */
    const _handleProcesar = (context) => {
        const errores = ProcesoFixService.procesar(_procesoId(context), _reemplazosConfirmados(context.request));
        if (errores.length) return _mostrarValidacion(context, _error("No se pudo procesar", errores));
        return _redirigir(context, { [PARAMS.PANTALLA]: PANTALLAS.HISTORIAL, [PARAMS.MSG]: "procesando" });
    };

    /** REVALIDAR: vuelve a validar el CSV cargado en el mismo proceso y muestra la Validación. */
    const _handleRevalidar = (context) => {
        const procesoId = _procesoId(context);
        const errores = ProcesoFixService.revalidar(procesoId);
        if (errores.length) return _mostrarValidacion(context, _error("No se pudo revalidar", errores));
        return _redirigir(context, { [PARAMS.PANTALLA]: PANTALLAS.VALIDACION, [PARAMS.PROCESO_ID]: procesoId, [PARAMS.MSG]: "revalidado" });
    };

    /** ANULAR: anula el proceso Validado y vuelve a su Validación (solo lectura). */
    const _handleAnular = (context) => {
        const procesoId = _procesoId(context);
        const errores = ProcesoFixService.anular(procesoId);
        if (errores.length) return _mostrarValidacion(context, _error("No se pudo anular", errores));
        return _redirigir(context, { [PARAMS.PANTALLA]: PANTALLAS.VALIDACION, [PARAMS.PROCESO_ID]: procesoId, [PARAMS.MSG]: "anulado" });
    };

    const _handlePost = (context) => {
        const accion = context.request.parameters[CC.ACCION];
        switch (accion) {
            case ACCIONES.VALIDAR:
                return _handleValidar(context);
            case ACCIONES.PROCESAR:
                return _handleProcesar(context);
            case ACCIONES.REVALIDAR:
                return _handleRevalidar(context);
            case ACCIONES.ANULAR:
                return _handleAnular(context);
            default:
                throw new Error(`Acción no soportada: ${accion}`);
        }
    };

    const handleRequest = (context) => (context.request.method === "GET" ? _handleGet(context) : _handlePost(context));

    return { handleRequest };
});
