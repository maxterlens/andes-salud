/**
 * @NApiVersion 2.1
 * @NModuleScope SameAccount
 *
 * @description AS_NSP_037 - Formularios del Suitelet FixArticuloOrdenVenta (N/ui/serverWidget):
 *               1. Carga: archivo CSV, subsidiaria y observación → botón Validar.
 *               2. Validación: resumen por acción + grilla con check "Reemplazar" → botón Procesar.
 *               3. Historial: procesos ejecutados; el nombre abre el detalle.
 *               4. Detalle: cabecera, archivos (origen / validación / resultado) y líneas con su estado.
 *              Los banners y tarjetas de resumen son INLINEHTML con el mismo estilo de AS_NSP_005.
 */
define(["N/ui/serverWidget", "../../constants/FixArticuloOrdenVentaConstants"], (serverWidget, CONST) => {
    const { UI, ACCIONES, DETALLE, PROCESO, COLUMNAS_CSV } = CONST;
    const CLIENT_SCRIPT_PATH = "../AS_FixArticuloOrdenVenta_CS_2.1.js";
    const TITULO = "Ajuste de Artículos en Órdenes de Venta";

    const _CSS = `
        <style>
          .asfaov-root{
            --asfaov-ok:#1e7b34; --asfaov-ok-bg:#eaf6ec; --asfaov-warn:#c23a2b; --asfaov-warn-bg:#fdecea;
            --asfaov-info:#6b4b06; --asfaov-info-bg:#fff7e6; --asfaov-border:#d8d8d8; --asfaov-text2:#444;
            font-family:-apple-system,"Segoe UI",Helvetica,Arial,sans-serif; color:#111;
          }
          .asfaov-root *{box-sizing:border-box;}
          .asfaov-banner{font-size:13px;padding:10px 14px;border-radius:3px;margin-bottom:14px;line-height:1.5;}
          .asfaov-banner.info{background:var(--asfaov-info-bg);border:1px solid #f0c36d;color:var(--asfaov-info);}
          .asfaov-banner.ok{background:var(--asfaov-ok-bg);border:1px solid #a9d9b3;color:var(--asfaov-ok);}
          .asfaov-banner.error{background:var(--asfaov-warn-bg);border:1px solid #f0b4ac;color:var(--asfaov-warn);}
          .asfaov-cards{border:1px solid var(--asfaov-border);background:#fff;border-radius:6px;padding:14px 18px;margin-bottom:16px;display:flex;gap:26px;flex-wrap:wrap;}
          .asfaov-stat .num{font-size:20px;font-weight:700;}
          .asfaov-stat .lbl{font-size:12px;color:var(--asfaov-text2);margin-top:2px;}
          .asfaov-stat.destacado .num{color:#2b7ea5;}
          .asfaov-help{font-size:12.5px;color:var(--asfaov-text2);line-height:1.6;max-width:900px;}
          .asfaov-help code{background:#f2f4f5;border:1px solid #e1e5e8;border-radius:3px;padding:0 4px;font-size:12px;}
          .asfaov-links a{margin-right:18px;font-size:13px;}
        </style>
    `;

    const esc = (v) =>
        String(v === null || v === undefined ? "" : v)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;");

    const num = (v) => (v === null || v === undefined || v === "" || !Number.isFinite(Number(v)) ? "" : String(Math.round(Number(v) * 100000) / 100000));

    const html = (form, id, contenido, contenedor) => {
        const f = form.addField({ id, type: serverWidget.FieldType.INLINEHTML, label: " ", container: contenedor });
        f.defaultValue = `${_CSS}<div class="asfaov-root">${contenido}</div>`;
        return f;
    };

    const banner = (mensaje, tipo = "info") => (mensaje ? `<div class="asfaov-banner ${tipo}">${esc(mensaje)}</div>` : "");

    const oculto = (form, id, valor) => {
        const f = form.addField({ id, type: serverWidget.FieldType.TEXT, label: id });
        f.updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN });
        f.defaultValue = valor === null || valor === undefined ? "" : String(valor);
        return f;
    };

    /** URLs de navegación que usan los botones del client script. */
    const urls = (form, { urlCarga, urlHistorial, urlValidacion, urlFiltro } = {}) => {
        if (urlCarga) oculto(form, "custpage_url_carga", urlCarga);
        if (urlHistorial) oculto(form, "custpage_url_historial", urlHistorial);
        if (urlValidacion) oculto(form, "custpage_url_validacion", urlValidacion);
        if (urlFiltro) oculto(form, "custpage_url_filtro", urlFiltro);
    };

    const tarjetas = (items) =>
        `<div class="asfaov-cards">${items
            .filter((i) => i && (i.siempre || Number(i.valor) > 0))
            .map((i) => `<div class="asfaov-stat${i.destacado ? " destacado" : ""}"><div class="num">${esc(i.valor)}</div><div class="lbl">${esc(i.etiqueta)}</div></div>`)
            .join("")}</div>`;

    const tarjetasResumen = (resumen) => {
        const pa = (resumen && resumen.porAccion) || {};
        return tarjetas([
            { etiqueta: "Líneas", valor: resumen ? resumen.lineas : 0, siempre: true },
            { etiqueta: "A procesar", valor: resumen ? resumen.procesar : 0, siempre: true, destacado: true },
            { etiqueta: "Reemplazos por confirmar", valor: resumen ? resumen.porConfirmar : 0 },
            ...Object.values(ACCIONES).map((a) => ({ etiqueta: a.texto, valor: pa[a.codigo] || 0 }))
        ]);
    };

    // ═══════════════════════════════════════════════════════════════════
    // 1. Carga
    // ═══════════════════════════════════════════════════════════════════
    function buildCarga({ mensaje, esError, urlHistorial, urlPlantilla }) {
        const form = serverWidget.createForm({ title: TITULO });
        form.clientScriptModulePath = CLIENT_SCRIPT_PATH;
        oculto(form, UI.CAMPOS.ACCION, UI.ACCIONES.VALIDAR);
        urls(form, { urlHistorial });

        // Agrupa el texto de ayuda, la subsidiaria y la observación.
        // El campo de archivo queda fuera: NetSuite no permite campos FILE dentro de un grupo de campos.
        const GRUPO = "custpage_grp_carga";
        form.addFieldGroup({ id: GRUPO, label: "Datos de la carga" });

        const columnas = Object.values(COLUMNAS_CSV)
            .map((c) => `<code>${esc(c.oficial)}</code>${c.obligatoria ? "" : " (opcional)"}`)
            .join(", ");
        html(
            form,
            "custpage_html_intro",
            `${banner(mensaje, esError ? "error" : "ok")}
             <div class="asfaov-help">
               Cargue un archivo <b>CSV</b> (separado por <code>;</code> o <code>,</code>) con las columnas ${columnas}.<br>
               También se aceptan los nombres <code>LINEA (CRG_CORREL)</code> e <code>ID_NETSUIT</code>.
               Si <code>VALOR_UNITARIO</code> trae valor, se reemplaza el precio de la línea; si viene vacío se mantiene el actual.<br>
               Al validar se muestra qué se hará con cada línea. Nada se modifica hasta presionar <b>Procesar</b>.
             </div>
             <div class="asfaov-links" style="margin-top:10px;"><a href="${esc(urlPlantilla)}">Descargar plantilla</a><a href="${esc(urlHistorial)}">Ver historial de procesos</a></div>`,
            GRUPO
        );

        const archivo = form.addField({ id: UI.CAMPOS.ARCHIVO, type: serverWidget.FieldType.FILE, label: "Archivo CSV" });
        archivo.isMandatory = true;
        const subsidiaria = form.addField({ id: UI.CAMPOS.SUBSIDIARIA, type: serverWidget.FieldType.SELECT, label: "Subsidiaria", source: "subsidiary", container: GRUPO });
        subsidiaria.isMandatory = true;
        subsidiaria.setHelpText({ help: "Subsidiaria de las OV. La cuenta del paciente se busca dentro de esta subsidiaria." });
        const obs = form.addField({ id: UI.CAMPOS.OBSERVACION, type: serverWidget.FieldType.TEXTAREA, label: "Observación (opcional)", container: GRUPO });
        obs.updateDisplaySize({ height: 3, width: 60 });

        form.addSubmitButton({ label: "Validar" });
        form.addButton({ id: "custpage_btn_historial", label: "Historial", functionName: "irAHistorial" });
        return form;
    }

    // ═══════════════════════════════════════════════════════════════════
    // Grilla de líneas (validación y detalle)
    // ═══════════════════════════════════════════════════════════════════
    const COLUMNAS_LINEA = [
        ["custpage_col_fila", "Fila", (l) => (l.filas || [l.fila]).filter(Boolean).join(", ")],
        ["custpage_col_cuenta", "Cuenta", (l) => l.cuenta],
        ["custpage_col_crg", "CRG_CORREL", (l) => l.crg],
        ["custpage_col_ov", "OV", (l, ctx) => (l.ovId && ctx.urlOv ? `<a href="${esc(ctx.urlOv(l.ovId))}" target="_blank">${esc(l.ovNumero || l.ovId)}</a>` : esc(l.ovNumero || ""))],
        ["custpage_col_art_ov", "Artículo OV", (l) => esc(l.articuloOvNombre)],
        ["custpage_col_art_csv", "Artículo CSV", (l) => esc(l.articuloCsvNombre || l.idArticuloCsv)],
        ["custpage_col_cant_ov", "Cant. OV", (l) => num(l.cantidadOv)],
        ["custpage_col_desp", "Despachada", (l) => num(l.despachada)],
        ["custpage_col_final", "Cant. final", (l) => num(l.cantidadFinal)],
        ["custpage_col_precio_ov", "Precio actual", (l) => num(l.precioOv)],
        ["custpage_col_precio_nuevo", "Precio nuevo", (l) => num(l.precioNuevo)],
        ["custpage_col_monto", "Monto resultante", (l) => num(l.montoNuevo)],
        ["custpage_col_accion", "Acción", (l) => esc(l.accionTexto)],
        ["custpage_col_ajuste", "Ejecución", (l) => esc(l.ajusteEjecucionTexto)]
    ];

    function agregarGrilla(form, { lineas, conCheck, conResultado, urlOv, etiqueta }) {
        const sublista = form.addSublist({ id: UI.SUBLISTA_LINEAS, type: serverWidget.SublistType.LIST, label: etiqueta || `Líneas (${lineas.length})` });
        if (conCheck) {
            sublista.addField({ id: UI.COLUMNAS.REEMPLAZAR, type: serverWidget.FieldType.CHECKBOX, label: "Reemplazar" });
            const clave = sublista.addField({ id: UI.COLUMNAS.CLAVE, type: serverWidget.FieldType.TEXT, label: "Clave" });
            clave.updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN });
            const codigo = sublista.addField({ id: UI.COLUMNAS.CODIGO_ACCION, type: serverWidget.FieldType.TEXT, label: "Código acción" });
            codigo.updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN });
        }
        if (conResultado) sublista.addField({ id: "custpage_col_estado", type: serverWidget.FieldType.TEXT, label: "Estado" });
        COLUMNAS_LINEA.forEach(([id, etiquetaCol]) => sublista.addField({ id, type: serverWidget.FieldType.TEXT, label: etiquetaCol }));
        if (conResultado) {
            sublista.addField({ id: "custpage_col_cant_result", type: serverWidget.FieldType.TEXT, label: "Cant. resultante" });
            sublista.addField({ id: "custpage_col_ejecuciones", type: serverWidget.FieldType.TEXT, label: "Ejecuciones afectadas" });
            sublista.addField({ id: "custpage_col_lotes", type: serverWidget.FieldType.TEXTAREA, label: "Lotes" });
        }
        sublista.addField({ id: "custpage_col_mensaje", type: serverWidget.FieldType.TEXTAREA, label: "Mensaje" });

        const ctx = { urlOv };
        const set = (id, line, valor) => {
            const v = valor === null || valor === undefined ? "" : String(valor);
            if (v !== "") sublista.setSublistValue({ id, line, value: v.substring(0, 3999) });
        };
        lineas.forEach((l, i) => {
            if (conCheck) {
                set(UI.COLUMNAS.REEMPLAZAR, i, l.confirmado ? "T" : "F");
                set(UI.COLUMNAS.CLAVE, i, l.clave);
                set(UI.COLUMNAS.CODIGO_ACCION, i, l.accion);
            }
            if (conResultado) set("custpage_col_estado", i, esc(l.estado));
            COLUMNAS_LINEA.forEach(([id, , fn]) => set(id, i, fn(l, ctx)));
            if (conResultado) {
                set("custpage_col_cant_result", i, num(l.cantidadResultante));
                set("custpage_col_ejecuciones", i, esc((l.ejecucionesAfectadas || []).join(", ") || l.ejecucionesTexto || ""));
                set("custpage_col_lotes", i, esc(l.lotes));
            }
            set("custpage_col_mensaje", i, esc(l.mensaje));
        });
        return sublista;
    }

    // ═══════════════════════════════════════════════════════════════════
    // 2. Validación
    // ═══════════════════════════════════════════════════════════════════
    function buildValidacion({ proceso, datos, mensaje, esError, urlCarga, urlHistorial, urlOv }) {
        const form = serverWidget.createForm({ title: `${TITULO} - Validación ${proceso.nombre}` });
        form.clientScriptModulePath = CLIENT_SCRIPT_PATH;
        oculto(form, UI.CAMPOS.ACCION, UI.ACCIONES.PROCESAR);
        oculto(form, UI.CAMPOS.PROCESO, proceso.id);
        urls(form, { urlCarga, urlHistorial });

        const resumen = datos.resumen;
        const hayTrabajo = resumen.procesar > 0 || resumen.porConfirmar > 0;
        const aviso = hayTrabajo
            ? `Revise cada línea. Las líneas con artículo distinto solo se reemplazan si marca <b>Reemplazar</b>. Al presionar <b>Procesar</b> se modificarán las OV y sus Ejecuciones en segundo plano.`
            : "No hay líneas para procesar en este archivo.";
        html(
            form,
            "custpage_html_resumen",
            `${banner(mensaje, esError ? "error" : "ok")}
             <div class="asfaov-help" style="margin-bottom:10px;">Subsidiaria: <b>${esc(datos.subsidiariaNombre || datos.subsidiaria)}</b> · Archivo: <b>${esc(datos.nombreArchivo || "")}</b></div>
             ${tarjetasResumen(resumen)}
             <div class="asfaov-banner info">${aviso}</div>`
        );

        agregarGrilla(form, { lineas: datos.lineas, conCheck: true, conResultado: false, urlOv });
        const sublista = form.getSublist({ id: UI.SUBLISTA_LINEAS });
        if (resumen.porConfirmar > 0) sublista.addMarkAllButtons();

        if (hayTrabajo) form.addSubmitButton({ label: "Procesar" });
        form.addButton({ id: "custpage_btn_nueva", label: "Nueva carga", functionName: "irACarga" });
        form.addButton({ id: "custpage_btn_historial", label: "Historial", functionName: "irAHistorial" });
        return form;
    }

    // ═══════════════════════════════════════════════════════════════════
    // 3. Historial
    // ═══════════════════════════════════════════════════════════════════
    function buildHistorial({ procesos, mensaje, esError, urlCarga, urlDetalle }) {
        const form = serverWidget.createForm({ title: `${TITULO} - Historial` });
        form.clientScriptModulePath = CLIENT_SCRIPT_PATH;
        urls(form, { urlCarga });
        html(form, "custpage_html_historial", `${banner(mensaje, esError ? "error" : "ok")}<div class="asfaov-help">Haga clic en el nombre del proceso para ver su detalle. Los procesos <b>En proceso</b> se actualizan al terminar; use <b>Actualizar</b> para refrescar.</div>`);

        const sublista = form.addSublist({ id: "custpage_procesos", type: serverWidget.SublistType.LIST, label: `Procesos (${procesos.length})` });
        const columnas = [
            ["custpage_h_nombre", "Proceso"],
            ["custpage_h_fecha", "Fecha"],
            ["custpage_h_usuario", "Usuario"],
            ["custpage_h_subsidiaria", "Subsidiaria"],
            ["custpage_h_estado", "Estado"],
            ["custpage_h_lineas", "Líneas"],
            ["custpage_h_procesar", "A procesar"],
            ["custpage_h_procesadas", "Procesadas"],
            ["custpage_h_omitidas", "Omitidas / sin cambio"],
            ["custpage_h_errores", "Errores"],
            ["custpage_h_obs", "Observación"]
        ];
        columnas.forEach(([id, etiqueta]) => sublista.addField({ id, type: serverWidget.FieldType.TEXT, label: etiqueta }));
        procesos.forEach((p, i) => {
            const valores = [
                `<a href="${esc(urlDetalle(p.id))}">${esc(p.nombre)}</a>`,
                p.creado,
                p.usuario,
                p.subsidiaria,
                p.estado,
                p.totallineas,
                p.totalprocesar,
                p.totalprocesadas,
                p.totalomitidas,
                p.totalerrores,
                esc(p.observacion)
            ];
            valores.forEach((v, c) => {
                if (v !== null && v !== undefined && String(v) !== "") sublista.setSublistValue({ id: columnas[c][0], line: i, value: String(v).substring(0, 3999) });
            });
        });

        form.addButton({ id: "custpage_btn_nueva", label: "Nueva carga", functionName: "irACarga" });
        form.addButton({ id: "custpage_btn_actualizar", label: "Actualizar", functionName: "actualizar" });
        return form;
    }

    // ═══════════════════════════════════════════════════════════════════
    // 4. Detalle
    // ═══════════════════════════════════════════════════════════════════
    function buildDetalle({ proceso, lineas, archivos, estadoTarea, filtroEstado, mensaje, esError, urlCarga, urlHistorial, urlValidacion, urlOv, urlFiltro }) {
        const form = serverWidget.createForm({ title: `${TITULO} - ${proceso.nombre}` });
        form.clientScriptModulePath = CLIENT_SCRIPT_PATH;
        urls(form, { urlCarga, urlHistorial, urlValidacion, urlFiltro });

        let resumen = null;
        try {
            resumen = proceso.resumen ? JSON.parse(proceso.resumen) : null;
        } catch (e) {
            resumen = null;
        }

        const enlaces = [
            archivos.origen ? `<a href="${esc(archivos.origen)}" target="_blank">CSV de origen</a>` : "",
            archivos.validacion ? `<a href="${esc(archivos.validacion)}" target="_blank">CSV de validación</a>` : "",
            archivos.resultado ? `<a href="${esc(archivos.resultado)}" target="_blank">CSV de resultado</a>` : ""
        ].join("");

        const avisoEstado =
            proceso.estado === PROCESO.ESTADOS.EN_PROCESO
                ? banner(`El proceso se está ejecutando${estadoTarea ? ` (tarea: ${estadoTarea})` : ""}. Use Actualizar para ver el avance.`, "info")
                : proceso.estado === PROCESO.ESTADOS.VALIDADO
                ? banner("El proceso está validado pero aún no se ha procesado.", "info")
                : "";

        html(
            form,
            "custpage_html_detalle",
            `${banner(mensaje, esError ? "error" : "ok")}${avisoEstado}
             <div class="asfaov-help" style="margin-bottom:10px;">
               Estado: <b>${esc(proceso.estado)}</b> · Subsidiaria: <b>${esc(proceso.subsidiariaNombre)}</b> · Usuario: <b>${esc(proceso.usuario)}</b> ·
               Creado: <b>${esc(proceso.creado)}</b>${proceso.fechaInicio ? ` · Inicio: <b>${esc(proceso.fechaInicio)}</b>` : ""}${proceso.fechaFin ? ` · Fin: <b>${esc(proceso.fechaFin)}</b>` : ""}
               ${proceso.observacion ? `<br>Observación: ${esc(proceso.observacion)}` : ""}
             </div>
             ${tarjetas([
                 { etiqueta: "Líneas", valor: proceso.totalLineas, siempre: true },
                 { etiqueta: "A procesar", valor: proceso.totalProcesar, siempre: true, destacado: true },
                 { etiqueta: "Procesadas", valor: proceso.totalProcesadas, siempre: true },
                 { etiqueta: "Omitidas / sin cambio", valor: proceso.totalOmitidas, siempre: true },
                 { etiqueta: "Errores", valor: proceso.totalErrores, siempre: true }
             ])}
             ${resumen && !proceso.totalProcesadas && !proceso.totalErrores && proceso.estado === PROCESO.ESTADOS.VALIDADO ? tarjetasResumen(resumen) : ""}
             ${proceso.error ? `<div class="asfaov-banner error">${esc(proceso.error).replace(/\n/g, "<br>")}</div>` : ""}
             <div class="asfaov-links" style="margin-bottom:6px;">${enlaces}</div>`
        );

        const filtro = form.addField({ id: UI.CAMPOS.FILTRO_ESTADO, type: serverWidget.FieldType.SELECT, label: "Filtrar por estado" });
        filtro.addSelectOption({ value: "", text: "Todos" });
        Object.values(DETALLE.ESTADOS).forEach((e) => filtro.addSelectOption({ value: e, text: e }));
        filtro.defaultValue = filtroEstado || "";

        agregarGrilla(form, { lineas, conCheck: false, conResultado: proceso.estado !== PROCESO.ESTADOS.VALIDADO, urlOv });

        if (proceso.estado === PROCESO.ESTADOS.VALIDADO && urlValidacion) {
            form.addButton({ id: "custpage_btn_validacion", label: "Ir a la validación", functionName: "irAValidacion" });
        }
        form.addButton({ id: "custpage_btn_actualizar", label: "Actualizar", functionName: "actualizar" });
        form.addButton({ id: "custpage_btn_historial", label: "Historial", functionName: "irAHistorial" });
        form.addButton({ id: "custpage_btn_nueva", label: "Nueva carga", functionName: "irACarga" });
        return form;
    }

    return { buildCarga, buildValidacion, buildHistorial, buildDetalle };
});
