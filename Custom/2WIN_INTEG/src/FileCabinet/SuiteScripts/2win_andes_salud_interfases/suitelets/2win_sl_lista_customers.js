/* eslint-disable no-useless-concat */
/* eslint-disable no-mixed-operators */
/**
 * @NApiVersion 2.1
 * @NScriptType Suitelet
 * @description Suitelet para listar customers con paginación optimizada para grandes volúmenes
 * @author 2Win
 * @version 1.2.0
 *
 * CHANGELOG v1.2.0:
 * - [FIX]  altname no disponible en el ambiente. Columna "Nombre" ahora se construye
 *          combinando firstname + lastname (persona física) o companyname (empresa).
 *
 * CHANGELOG v1.1.0:
 * - [FIX]  Columna "Nombre" usaba 'entityid' en COLUMNS en vez de 'altname', dejando todos
 *          los nombres vacíos. Corregido a altname con join: 'customer'.
 * - [FIX]  suiteletUrl almacenada como variable global causaba condiciones de carrera en
 *          ejecuciones concurrentes. Ahora se pasa por parámetro en cada función.
 * - [FIX]  pageIndex podía quedar en NaN si el parámetro no era numérico. Añadida guarda.
 * - [FEAT] Campo "Ir a página" para saltar directamente a cualquier página.
 * - [FEAT] Mensaje de error visible en el formulario cuando la búsqueda falla.
 * - [FEAT] Información de página más clara: "Registros X – Y de Z".
 * - [REFAC] buildUrl recibe suiteletUrl como argumento en vez de leer variable global.
 * - [REFAC] addResultsSublist retorna también suiteletUrl para que addPaginationControls
 *           no dependa de estado global.
 */
define(["N/ui/serverWidget", "N/search", "N/log", "N/url"], function (serverWidget, search, nLog, url) {
    /** Registros por página (máximo permitido por runPaged: 1000) */
    const PAGE_SIZE = 100;

    /**
     * Definición de columnas de la sublist.
     * Cada entrada indica el campo NS y la etiqueta visible.
     * IMPORTANTE: si se necesita un join, agregar la propiedad `join`.
     *
     * @type {Array<{name: string, label: string, join?: string}>}
     */
    const COLUMNS = [
        { name: "internalid", label: "ID Interno" },
        { name: "entityid", label: "ID Cliente" },
        // "Nombre" se construye en tiempo de fetch desde firstname/lastname/companyname (ver EXTRA_FIELDS)
        { name: "entityid", label: "Nombre" },
        { name: "custentity_2wrut", label: "RUT" },
        { name: "phone", label: "Teléfono" },
        { name: "email", label: "Email" },
        { name: "isinactive", label: "Inactivo" }
    ];

    /**
     * Campos adicionales traídos en cada fetch pero sin columna propia en la sublist.
     * Se usan para componer valores calculados (ej. _nombre).
     */
    const EXTRA_FIELDS = [{ name: "firstname" }, { name: "lastname" }, { name: "companyname" }];
    let urlHost = "";
    // ─────────────────────────────────────────────────────────────────────────────
    //  ENTRY POINT
    // ─────────────────────────────────────────────────────────────────────────────

    /**
     * Punto de entrada del Suitelet.
     * @param {Object} context
     * @param {import("N/https").ServerRequest}  context.request
     * @param {import("N/https").ServerResponse} context.response
     */
    function onRequest(context) {
        const { request, response } = context;
        urlHost = url
            .resolveScript({
                scriptId: "customscript2876",
                deploymentId: "customdeploy1",
                returnExternalUrl: false
            })
        // Solo se atienden peticiones GET; cualquier POST recibe 405
        if (request.method !== "GET") {
            response.setHeader({ name: "Allow", value: "GET" });
            response.write("405 Method Not Allowed – este Suitelet solo acepta GET.");
            return;
        }

        const searchText = request.parameters.search || "";
        const searchField = request.parameters.searchfield || "entityid";
        // FIX: isNaN guard para cuando el parámetro llega vacío o malformado
        const rawPage = parseInt(request.parameters.page, 10);
        const pageIndex = isNaN(rawPage) ? 0 : Math.max(0, rawPage);

        // FIX: URL resuelta de forma segura, sin variable global compartida
        const suiteletUrl = urlHost;

        const form = serverWidget.createForm({ title: "Lista de Clientes" });

        addSearchFields(form, searchText, searchField);

        const results = addResultsSublist(form, searchText, searchField, pageIndex);

        addPaginationControls(form, results, pageIndex, searchText, searchField, suiteletUrl);

        response.writePage(form);
    }

    // ─────────────────────────────────────────────────────────────────────────────
    //  SECCIÓN: FILTROS
    // ─────────────────────────────────────────────────────────────────────────────

    /**
     * Agrega el grupo de filtros al formulario.
     * @param {import("N/ui/serverWidget").Form} form
     * @param {string} searchText  - Valor actual del campo de texto.
     * @param {string} searchField - Campo NS seleccionado para filtrar.
     */
    function addSearchFields(form, searchText, searchField) {
        form.addFieldGroup({
            id: "filter_group",
            label: "Filtros de Búsqueda"
        });

        // Selector de campo
        const selectField = form.addField({
            id: "searchfield",
            type: serverWidget.FieldType.SELECT,
            label: "Buscar por",
            container: "filter_group"
        });
        [
            { value: "entityid", text: "ID Cliente / Nombre" },
            { value: "custentity_2wrut", text: "RUT" },
            { value: "email", text: "Email" },
            { value: "phone", text: "Teléfono" },
            { value: "internalid", text: "ID Interno" }
        ].forEach((opt) => selectField.addSelectOption(opt));
        selectField.defaultValue = searchField;

        // Texto libre
        const textField = form.addField({
            id: "search",
            type: serverWidget.FieldType.TEXT,
            label: "Texto de búsqueda",
            container: "filter_group"
        });
        textField.defaultValue = searchText;
        textField.helpText = "Deje vacío para ver todos los registros.";

        // Redirige vía GET leyendo los campos del formulario en cliente
        form.addButton({
            id: "btn_search",
            label: "🔍 Buscar",
            functionName: `(function(){
                var field = nlapiGetFieldValue('searchfield');
                var text  = nlapiGetFieldValue('search');
                var sf    = field ? field : 'entityid';
                var st    = text  ? encodeURIComponent(text.trim()) : '';
                var url   = '${urlHost}' + '&searchfield=' + sf;
                if (st) url += '&search=' + st;
                url += '&page=0';
                setWindowChanged(window, false);
                window.location.href = url;
            })()`
        });
    }

    // ─────────────────────────────────────────────────────────────────────────────
    //  SECCIÓN: SUBLIST DE RESULTADOS
    // ─────────────────────────────────────────────────────────────────────────────

    /**
     * Crea la sublist, ejecuta la búsqueda paginada y la puebla con datos.
     * @param {import("N/ui/serverWidget").Form} form
     * @param {string} searchText
     * @param {string} searchField
     * @param {number} pageIndex
     * @returns {import("./SL_CustomerList").SearchResult} Metadata de paginación + datos.
     */
    function addResultsSublist(form, searchText, searchField, pageIndex) {
        const sublist = form.addSublist({
            id: "customer_list",
            type: serverWidget.SublistType.LIST,
            label: "Resultados"
        });

        // Columnas de datos
        COLUMNS.forEach((col, idx) => {
            sublist.addField({
                id: `col_${idx}`,
                type: serverWidget.FieldType.TEXT,
                label: col.label
            });
        });

        // Columna de enlace al registro
        const linkField = sublist.addField({
            id: "col_link",
            type: serverWidget.FieldType.URL,
            label: "Ver Registro"
        });
        linkField.linkText = "Abrir";

        // Búsqueda
        const results = executePagedSearch(searchText, searchField, pageIndex);

        // Mostrar error si existe
        if (results.error) {
            const errField = form.addField({
                id: "search_error",
                type: serverWidget.FieldType.INLINEHTML,
                label: "Error"
            });
            errField.defaultValue = `
                <div style="padding:12px 16px; background:#fff3f3; border-left:4px solid #dc3545;
                            border-radius:4px; color:#721c24; font-family:sans-serif; margin-bottom:10px;">
                    ⚠️ <strong>Error al ejecutar la búsqueda:</strong> ${escapeHtml(results.error)}
                </div>`;
        }

        // Poblar filas
        (results.data || []).forEach((row, idx) => {
            sublist.setSublistValue({ id: "col_0", line: idx, value: row.internalid || " " });
            sublist.setSublistValue({ id: "col_1", line: idx, value: truncateText(row.entityid, 300) });
            sublist.setSublistValue({ id: "col_2", line: idx, value: truncateText(row._nombre, 300) });
            sublist.setSublistValue({ id: "col_3", line: idx, value: row.custentity_2wrut || " " });
            sublist.setSublistValue({ id: "col_4", line: idx, value: row.phone || " " });
            sublist.setSublistValue({ id: "col_5", line: idx, value: truncateText(row.email || " ", 100) });
            sublist.setSublistValue({ id: "col_6", line: idx, value: row.isinactive === "T" ? "Sí" : "No" });
            sublist.setSublistValue({
                id: "col_link",
                line: idx,
                value: `/app/common/entity/custjob.nl?id=${row.internalid}`
            });
        });

        return results;
    }

    // ─────────────────────────────────────────────────────────────────────────────
    //  SECCIÓN: BÚSQUEDA
    // ─────────────────────────────────────────────────────────────────────────────

    /**
     * Ejecuta una búsqueda paginada de clientes y devuelve los datos de la página solicitada.
     * @param {string} searchText
     * @param {string} searchField  - Campo NS a filtrar.
     * @param {number} pageIndex    - Índice base-0.
     * @returns {{data: Object[], totalResults: number, totalPages: number,
     *            currentPage: number, pageSize: number, error?: string}}
     */
    function executePagedSearch(searchText, searchField, pageIndex) {
        try {
            // Filtros
            const filters = [];
            if (searchText.trim()) {
                const operator = searchField === "internalid" ? "anyof" : "contains";
                filters.push([searchField, operator, searchText.trim()]);
            }

            // Columnas de búsqueda (mapeo 1-a-1 con COLUMNS)
            const searchColumns = [
                ...COLUMNS.filter((col) => col.name) // skip comment-only placeholders
                    .map((col) => search.createColumn({ name: col.name, ...(col.join ? { join: col.join } : {}) })),
                ...EXTRA_FIELDS.map((col) => search.createColumn({ name: col.name }))
            ];

            const pagedResults = search
                .create({
                    type: search.Type.CUSTOMER,
                    filters: filters,
                    columns: searchColumns
                })
                .runPaged({ pageSize: PAGE_SIZE });

            const totalResults = pagedResults.count;
            const totalPages = pagedResults.pageRanges.length;

            // Clamp página dentro de rango válido
            const safeIndex = totalPages > 0 ? Math.min(Math.max(0, pageIndex), totalPages - 1) : 0;

            let pageData = [];
            if (totalResults > 0) {
                const page = pagedResults.fetch({ index: safeIndex });
                page.data.forEach((result) => {
                    const row = {};
                    COLUMNS.filter((col) => col.name).forEach((col) => {
                        row[col.name] =
                            result.getValue({
                                name: col.name,
                                ...(col.join ? { join: col.join } : {})
                            }) || "";
                    });
                    // Campos extra para componer _nombre
                    EXTRA_FIELDS.forEach((col) => {
                        row[col.name] = result.getValue({ name: col.name }) || "";
                    });
                    // Nombre visible: empresa o persona física
                    const company = row.companyname.trim();
                    const person = [row.firstname, row.lastname].filter(Boolean).join(" ").trim();
                    row._nombre = company || person || " ";
                    pageData.push(row);
                });
            }

            return {
                data: pageData,
                totalResults: totalResults,
                totalPages: totalPages,
                currentPage: safeIndex + 1, // base-1 para mostrar al usuario
                safeIndex: safeIndex, // base-0 para construir URLs
                pageSize: PAGE_SIZE
            };
        } catch (error) {
            nLog.error({ title: "executePagedSearch", details: error });
            return {
                data: [],
                totalResults: 0,
                totalPages: 0,
                currentPage: 0,
                safeIndex: 0,
                pageSize: PAGE_SIZE,
                error: error.message
            };
        }
    }

    // ─────────────────────────────────────────────────────────────────────────────
    //  SECCIÓN: PAGINACIÓN
    // ─────────────────────────────────────────────────────────────────────────────

    /**
     * Agrega el bloque HTML de paginación y los botones de navegación al formulario.
     * @param {import("N/ui/serverWidget").Form} form
     * @param {Object} results       - Resultado de executePagedSearch.
     * @param {number} pageIndex     - Índice base-0 actual.
     * @param {string} searchText
     * @param {string} searchField
     * @param {string} suiteletUrl   - URL base del suitelet (sin query string). FIX: parámetro explícito.
     */
    function addPaginationControls(form, results, pageIndex, searchText, searchField, suiteletUrl) {
        const { totalResults, totalPages, currentPage, safeIndex } = results;
        const currentIndex = safeIndex !== undefined ? safeIndex : pageIndex;

        const startRecord = totalResults > 0 ? currentIndex * PAGE_SIZE + 1 : 0;
        const endRecord = Math.min((currentIndex + 1) * PAGE_SIZE, totalResults);
        const hasPrev = currentIndex > 0;
        const hasNext = currentIndex < totalPages - 1;

        // ── HTML de paginación ─────────────────────────────────────────────────
        const prevUrl = hasPrev ? buildUrl(searchText, searchField, currentIndex - 1, suiteletUrl) : "#";
        const nextUrl = hasNext ? buildUrl(searchText, searchField, currentIndex + 1, suiteletUrl) : "#";
        const firstUrl = buildUrl(searchText, searchField, 0, suiteletUrl);
        const lastUrl = buildUrl(searchText, searchField, totalPages - 1, suiteletUrl);

        // Ventana de páginas: máx 5 visibles alrededor de la actual
        const winStart = Math.max(0, currentIndex - 2);
        const winEnd = Math.min(totalPages - 1, currentIndex + 2);
        let pageNumbers = "";
        for (let i = winStart; i <= winEnd; i++) {
            const isActive = i === currentIndex;
            pageNumbers += `<a href="${buildUrl(searchText, searchField, i, suiteletUrl)}"
                               style="${isActive ? STYLE_PAGE_ACTIVE : STYLE_PAGE}">${i + 1}</a>`;
        }

        // FEAT: campo "Ir a página"
        const goToPageInput =
            totalPages > 1
                ? `
            <span style="margin-left:12px; font-size:13px; color:#555;">
                Ir a página:
                <input type="number" id="goto_page"
                       min="1" max="${totalPages}" value="${currentPage}"
                       style="width:60px; padding:3px 6px; border:1px solid #ccc; border-radius:3px; margin:0 4px;"
                       onkeydown="if(event.key==='Enter'){
                           var p=parseInt(this.value,10)-1;
                           if(!isNaN(p)&&p>=0&&p<${totalPages}){
                           setWindowChanged(window, false);
                            window.location.href='${buildUrl(searchText, searchField, 0, suiteletUrl)}'.replace(/page=\\d+/,'page='+p);
                           }
                       }" />
                <button onclick="
                    var p=parseInt(document.getElementById('goto_page').value,10)-1;
                    if(!isNaN(p)&&p>=0&&p<${totalPages}){
                    setWindowChanged(window, false);
                    window.location.href='${buildUrl(searchText, searchField, 0, suiteletUrl)}'.replace(/page=\\d+/,'page='+p);"
                    }
                    style="${STYLE_BTN_GOTO}">Ir</button>
            </span>`
                : "";

        const infoHtml = `
            <div style="padding:14px 18px; background:#f8f9fa; border:1px solid #dee2e6;
                        border-radius:6px; margin-top:12px; font-family:sans-serif;">
                <!-- Contador de registros -->
                <div style="margin-bottom:10px; font-size:13px; color:#333;">
                    📊 <strong>${totalResults.toLocaleString("es-CL")}</strong> registros encontrados &nbsp;|&nbsp;
                    Página <strong>${currentPage}</strong> de <strong>${totalPages || 1}</strong> &nbsp;|&nbsp;
                    Mostrando <strong>${startRecord}–${endRecord}</strong>
                </div>
                <!-- Controles de paginación -->
                <div style="display:flex; align-items:center; flex-wrap:wrap; gap:4px;">
                    <a href="${firstUrl}" title="Primera página"
                       style="${hasPrev ? STYLE_BTN_NAV : STYLE_BTN_NAV_DISABLED}">⏮</a>
                    <a href="${prevUrl}" title="Página anterior"
                       style="${hasPrev ? STYLE_BTN_NAV : STYLE_BTN_NAV_DISABLED}">◀</a>

                    ${pageNumbers}

                    <a href="${nextUrl}" title="Página siguiente"
                       style="${hasNext ? STYLE_BTN_NAV : STYLE_BTN_NAV_DISABLED}">▶</a>
                    <a href="${lastUrl}" title="Última página"
                       style="${hasNext ? STYLE_BTN_NAV : STYLE_BTN_NAV_DISABLED}">⏭</a>

                    ${goToPageInput}
                </div>
            </div>`;

        const infoField = form.addField({
            id: "page_info",
            type: serverWidget.FieldType.INLINEHTML,
            label: "Paginación"
        });
        infoField.defaultValue = infoHtml;
        // OUTSIDEBELOW + STARTCOL hace que el campo ocupe el ancho completo (2 columnas)
        infoField.updateLayoutType({
            layoutType: serverWidget.FieldLayoutType.OUTSIDEBELOW
            // breakType:  serverWidget.FieldBreakType.STARTCOL
        });

        // ── Botones del formulario (accesibilidad / teclado) ───────────────────
        if (hasPrev) {
            form.addButton({
                id: "btn_prev",
                label: "◀ Página Anterior",
                functionName: `(function (){
                setWindowChanged(window, false);
                window.location.href='${prevUrl}'})()`
            });
        }
        if (hasNext) {
            form.addButton({
                id: "btn_next",
                label: "Página Siguiente ▶",
                functionName: `(function (){setWindowChanged(window, false);
                window.location.href='${nextUrl}'})()`
            });
        }
        form.addButton({
            id: "btn_first",
            label: "⏮ Primera Página",
            functionName: `(function (){setWindowChanged(window, false);
            window.location.href='${firstUrl}'})()`
        });
        if (totalPages > 1) {
            form.addButton({
                id: "btn_last",
                label: "Última Página ⏭",
                functionName: `(function (){setWindowChanged(window, false);
                window.location.href='${lastUrl}'})()`
            });
        }
    }

    // ─────────────────────────────────────────────────────────────────────────────
    //  UTILIDADES
    // ─────────────────────────────────────────────────────────────────────────────

    /**
     * Construye la URL del suitelet con los parámetros dados.
     * FIX: recibe suiteletUrl como argumento; ya no depende de variable global.
     * @param {string} searchText
     * @param {string} searchField
     * @param {number} page        - Índice base-0.
     * @param {string} suiteletUrl - URL base sin query string.
     * @returns {string}
     */
    function buildUrl(searchText, searchField, page, suiteletUrl) {
        const params = new Array();
        if (searchText) params.push(`search=${encodeURIComponent(searchText)}`);
        if (searchField) params.push(`searchfield=${encodeURIComponent(searchField)}`);
        params.push(`page=${page}`);
        return `${suiteletUrl}&${params.join("&")}`;
    }

    /**
     * Trunca un texto a una longitud máxima, agregando "…" si es necesario.
     * @param {string} text
     * @param {number} maxLength
     * @returns {string}
     */
    function truncateText(text, maxLength) {
        if (!text) return " ";
        return text.length <= maxLength ? text : `${text.substring(0, maxLength - 1)}…`;
    }

    /**
     * Escapa caracteres HTML para evitar XSS en mensajes de error.
     * @param {string} str
     * @returns {string}
     */
    function escapeHtml(str) {
        return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    }

    // ─────────────────────────────────────────────────────────────────────────────
    //  CONSTANTES DE ESTILO (inline CSS reutilizable)
    // ─────────────────────────────────────────────────────────────────────────────

    const BASE_BTN = "display:inline-block; padding:5px 10px; border-radius:4px; " + "text-decoration:none; font-size:13px; font-weight:500; margin:1px;";

    const STYLE_BTN_NAV = `${BASE_BTN} background:#0070d2; color:#fff;`;
    const STYLE_BTN_NAV_DISABLED = `${BASE_BTN} background:#c9d0d9; color:#6b7280; pointer-events:none;`;
    const STYLE_PAGE = `${BASE_BTN} background:#6c757d; color:#fff;`;
    const STYLE_PAGE_ACTIVE = `${BASE_BTN} background:#28a745; color:#fff; font-weight:700;`;
    const STYLE_BTN_GOTO = "padding:3px 8px; background:#0070d2; color:#fff; border:none; " + "border-radius:3px; cursor:pointer; font-size:13px;";

    // ─────────────────────────────────────────────────────────────────────────────
    return { onRequest };
});
