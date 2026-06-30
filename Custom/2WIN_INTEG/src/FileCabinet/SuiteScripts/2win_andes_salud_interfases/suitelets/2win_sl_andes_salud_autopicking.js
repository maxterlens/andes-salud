/**
 * @NApiVersion 2.1
 * @NScriptType Suitelet
 * @NModuleScope SameAccount
 * @author 2Win
 * @version 1.1.0
 * @description Suitelet para ejecutar el autopicking de una Orden de Venta on-demand.
 *
 * Parámetros soportados:
 *   - salesorderid (string|number) [requerido] ID interno de la Sales Order a procesar.
 *   - forcedowngrade (string)     [opcional, default "T"] Si vale "T", fuerza la degradación de estado
 *                                 Shipped → Packed para permitir saneamiento in-place.
 *
 * Métodos:
 *   GET sin params  → interfaz HTML con formulario vacío.
 *   GET con params  → ejecuta autopicking y muestra resultado en HTML.
 *   POST            → API JSON { success, salesOrderId, message, error? }.
 */
define(["../domain/2win_dom_autopicking", "N/record", "N/log"], function (AutoPickingManager, record, nLog) {

    // ─── Helpers ────────────────────────────────────────────────────────────────

    /**
     * Escribe una respuesta JSON estandarizada.
     */
    function writeJson(response, payload) {
        response.setHeader({ name: "Content-Type", value: "application/json" });
        response.write(JSON.stringify(payload));
    }

    /**
     * Escapa caracteres HTML para evitar XSS al interpolar en la plantilla.
     * @param {string} str
     * @returns {string}
     */
    function escHtml(str) {
        return String(str)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;");
    }

    // ─── Lógica de negocio ──────────────────────────────────────────────────────

    /**
     * Ejecuta el autopicking para una Sales Order individual.
     * @param {number} salesOrderId
     * @param {boolean} forceStatusDowngrade
     * @returns {{ success: boolean, message: string, error?: string }}
     */
    function ejecutarAutopicking(salesOrderId, forceStatusDowngrade) {
        try {
            nLog.audit("Suitelet Autopicking",
                "Iniciando autopicking para OV ID: " + salesOrderId +
                " | forceStatusDowngrade: " + forceStatusDowngrade);

            // isDynamic: true es crítico para la edición de subregistros Inventory Detail en el DAO.
            var salesOrderRecord = record.load({
                type: record.Type.SALES_ORDER,
                id: salesOrderId,
                isDynamic: true
            });

            var manager = new AutoPickingManager();

            // triggerContext afterSubmit + UPDATE para invocar el flujo completo de sync de IFs.
            manager.syncronize(salesOrderRecord, "afterSubmit", "UPDATE", forceStatusDowngrade);

            nLog.audit("Suitelet Autopicking", "OV " + salesOrderId + " procesada correctamente");
            return { success: true, message: "Autopicking ejecutado correctamente" };

        } catch (error) {
            var msg = error && error.message ? error.message : String(error);
            nLog.error("Suitelet Autopicking - Error", "Fallo en OV " + salesOrderId + ": " + msg);
            return { success: false, message: "Error al ejecutar el autopicking", error: msg };
        }
    }

    // ─── Renderizado HTML ────────────────────────────────────────────────────────

    /**
     * Construye el panel de resultado HTML.
     * @param {{ success: boolean, message: string, error?: string }} result
     * @param {string} salesOrderId
     * @returns {string}
     */
    function buildResultPanel(result, salesOrderId) {
        var success = result.success;
        var borderColor  = success ? "#22c55e" : "#ef4444";
        var bgColor      = success ? "#f0fdf4" : "#fff8f8";
        var labelColor   = success ? "#15803d" : "#b91c1c";
        var statusLabel  = success ? "Éxito" : "Error";
        var icon         = success ? "&#10003;" : "&#10007;";
        var errorBlock   = "";

        if (!success && result.error) {
            errorBlock =
                "<pre class=\"result-error\">" + escHtml(result.error) + "</pre>";
        }

        return (
            "<div class=\"result-panel\" style=\"border-left:4px solid " + borderColor + ";background:" + bgColor + ";\">" +
                "<div class=\"result-header\">" +
                    "<span class=\"result-icon\" style=\"color:" + labelColor + ";\">" + icon + "</span>" +
                    "<span class=\"result-label\" style=\"color:" + labelColor + ";\">" + statusLabel + "</span>" +
                    "<span class=\"result-ovid\">OV&nbsp;#" + escHtml(salesOrderId) + "</span>" +
                "</div>" +
                "<div class=\"result-message\">" + escHtml(result.message) + "</div>" +
                errorBlock +
            "</div>"
        );
    }

    /**
     * Renderiza la página HTML completa del Suitelet.
     * @param {{ success: boolean, message: string, error?: string }|null} result
     * @param {string|null} salesOrderId
     * @param {boolean} forceStatusDowngrade
     * @returns {string}
     */
    function renderPage(result, salesOrderId, forceStatusDowngrade) {
        var hasResult      = result !== null && result !== undefined;
        var checkedAttr    = (forceStatusDowngrade !== false) ? " checked" : "";
        var ovValue        = hasResult && salesOrderId ? escHtml(salesOrderId) : "";
        var forceHidden    = (forceStatusDowngrade !== false) ? "T" : "F";
        var resultHtml     = hasResult ? buildResultPanel(result, salesOrderId || "") : "";
        var divider        = hasResult ? "<div class=\"divider\"></div>" : "";

        return (
            "<!DOCTYPE html>" +
            "<html lang=\"es\">" +
            "<head>" +
                "<meta charset=\"UTF-8\">" +
                "<meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">" +
                "<title>Autopicking Manual · 2Win</title>" +
                "<style>" +
                    "*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}" +
                    "body{" +
                        "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif;" +
                        "background:#eef2f7;" +
                        "min-height:100vh;" +
                        "display:flex;align-items:center;justify-content:center;" +
                        "padding:24px;" +
                    "}" +
                    ".card{" +
                        "background:#fff;" +
                        "border-radius:14px;" +
                        "box-shadow:0 2px 4px rgba(0,0,0,.08),0 12px 32px rgba(0,0,0,.08);" +
                        "width:100%;max-width:460px;overflow:hidden;" +
                    "}" +
                    /* Header */
                    ".card-head{" +
                        "background:linear-gradient(135deg,#0f2544 0%,#1a4d9e 100%);" +
                        "padding:26px 28px 22px;" +
                        "color:#fff;" +
                    "}" +
                    ".card-head .eyebrow{" +
                        "font-size:10px;font-weight:700;letter-spacing:.12em;" +
                        "text-transform:uppercase;color:rgba(255,255,255,.55);margin-bottom:8px;" +
                    "}" +
                    ".card-head h1{font-size:21px;font-weight:700;letter-spacing:-.02em;}" +
                    ".card-head p{font-size:13px;color:rgba(255,255,255,.65);margin-top:5px;line-height:1.45;}" +
                    /* Body */
                    ".card-body{padding:26px 28px;}" +
                    ".field{margin-bottom:18px;}" +
                    ".field label{display:block;font-size:12px;font-weight:700;letter-spacing:.04em;color:#475569;text-transform:uppercase;margin-bottom:6px;}" +
                    ".field input[type=number]{" +
                        "width:100%;padding:11px 14px;" +
                        "border:1.5px solid #cbd5e1;border-radius:8px;" +
                        "font-size:16px;font-family:'Courier New',monospace;color:#0f172a;" +
                        "outline:none;transition:border-color .15s,box-shadow .15s;" +
                        "appearance:textfield;-moz-appearance:textfield;" +
                    "}" +
                    ".field input[type=number]::-webkit-inner-spin-button," +
                    ".field input[type=number]::-webkit-outer-spin-button{-webkit-appearance:none;margin:0;}" +
                    ".field input[type=number]:focus{border-color:#3b82f6;box-shadow:0 0 0 3px rgba(59,130,246,.18);}" +
                    ".field .hint{font-size:11px;color:#94a3b8;margin-top:5px;}" +
                    /* Toggle row */
                    ".toggle-row{" +
                        "display:flex;align-items:flex-start;gap:12px;" +
                        "padding:13px 14px;background:#f8fafc;" +
                        "border:1.5px solid #e2e8f0;border-radius:8px;" +
                        "cursor:pointer;margin-bottom:22px;user-select:none;" +
                    "}" +
                    ".toggle-row input[type=checkbox]{width:16px;height:16px;accent-color:#3b82f6;cursor:pointer;flex-shrink:0;margin-top:2px;}" +
                    ".toggle-label{font-size:13px;font-weight:600;color:#1e293b;}" +
                    ".toggle-desc{font-size:11px;color:#64748b;margin-top:2px;line-height:1.4;}" +
                    /* Button */
                    ".btn{" +
                        "width:100%;padding:13px;" +
                        "background:#2563eb;color:#fff;" +
                        "border:none;border-radius:9px;" +
                        "font-size:14px;font-weight:700;letter-spacing:.03em;cursor:pointer;" +
                        "transition:background .15s,transform .1s,box-shadow .15s;" +
                        "box-shadow:0 2px 8px rgba(37,99,235,.35);" +
                    "}" +
                    ".btn:hover{background:#1d4ed8;box-shadow:0 4px 12px rgba(37,99,235,.4);}" +
                    ".btn:active{transform:scale(.98);}" +
                    ".btn:disabled{background:#93c5fd;box-shadow:none;cursor:not-allowed;}" +
                    ".btn .lbl-default,.btn .lbl-loading{display:inline;}" +
                    ".btn.loading .lbl-default{display:none;}" +
                    ".btn.loading .lbl-loading{display:inline;}" +
                    ".lbl-loading{display:none;}" +
                    /* Divider */
                    ".divider{height:1px;background:#e2e8f0;margin:22px 0;}" +
                    /* Result panel */
                    ".result-panel{border-radius:8px;padding:14px 16px;}" +
                    ".result-header{display:flex;align-items:center;gap:8px;margin-bottom:7px;}" +
                    ".result-icon{font-size:16px;font-weight:900;}" +
                    ".result-label{font-size:14px;font-weight:700;}" +
                    ".result-ovid{margin-left:auto;font-size:11px;color:#94a3b8;font-family:'Courier New',monospace;}" +
                    ".result-message{font-size:13px;color:#334155;}" +
                    ".result-error{" +
                        "margin-top:10px;font-size:11px;" +
                        "font-family:'Courier New',monospace;color:#b91c1c;" +
                        "background:#fff1f1;border:1px solid #fecaca;" +
                        "border-radius:6px;padding:10px 12px;" +
                        "white-space:pre-wrap;word-break:break-word;line-height:1.5;" +
                    "}" +
                    /* Footer */
                    ".card-foot{" +
                        "border-top:1px solid #f1f5f9;padding:12px 28px;" +
                        "font-size:11px;color:#94a3b8;text-align:right;" +
                    "}" +
                "</style>" +
            "</head>" +
            "<body>" +
                "<div class=\"card\">" +
                    "<div class=\"card-head\">" +
                        "<div class=\"eyebrow\">2Win Consulting &middot; Andes Salud</div>" +
                        "<h1>Autopicking Manual</h1>" +
                        "<p>Ejecuta el autopicking on-demand de una Orden de Venta a partir de su ID interno.</p>" +
                    "</div>" +
                    "<div class=\"card-body\">" +
                        "<form method=\"GET\" id=\"apForm\">" +
                            "<div class=\"field\">" +
                                "<label for=\"salesorderid\">ID&nbsp;Interno&nbsp;(Sales&nbsp;Order)</label>" +
                                "<input type=\"number\" id=\"salesorderid\" name=\"salesorderid\"" +
                                    " placeholder=\"Ej: 12345\" min=\"1\" required" +
                                    " value=\"" + ovValue + "\" autocomplete=\"off\"/>" +
                                "<div class=\"hint\">Internal ID de la OV en NetSuite.</div>" +
                            "</div>" +
                            "<label class=\"toggle-row\" for=\"fd_check\">" +
                                "<input type=\"checkbox\" id=\"fd_check\"" + checkedAttr + ">" +
                                "<div>" +
                                    "<div class=\"toggle-label\">Forzar downgrade de estado</div>" +
                                    "<div class=\"toggle-desc\">Degrada&nbsp;Shipped&nbsp;&rarr;&nbsp;Packed para permitir saneamiento in-place.</div>" +
                                "</div>" +
                            "</label>" +
                            "<input type=\"hidden\" id=\"forcedowngrade\" name=\"forcedowngrade\" value=\"" + forceHidden + "\"/>" +
                            "<button type=\"submit\" class=\"btn\" id=\"submitBtn\">" +
                                "<span class=\"lbl-default\">&#9654;&nbsp;&nbsp;Ejecutar&nbsp;Autopicking</span>" +
                                "<span class=\"lbl-loading\">&#9203;&nbsp;&nbsp;Procesando&hellip;</span>" +
                            "</button>" +
                        "</form>" +
                        divider +
                        resultHtml +
                    "</div>" +
                    "<div class=\"card-foot\">v1.1.0</div>" +
                "</div>" +
                "<script>" +
                    "(function(){" +
                        // ── 1. Preservar parámetros de routing de NetSuite ──────────────────
                        // Al hacer submit GET el browser reemplaza TODO el query string,
                        // descartando "script", "deploy", etc. que NetSuite necesita para
                        // identificar el Suitelet → error "missing required parameter".
                        // Solución: leer los params del URL actual e inyectarlos como hidden.
                        "var NS_PARAMS=['script','deploy','scriptid','deployid','compid','whence','cmid','e'];" +
                        "var form=document.getElementById('apForm');" +
                        "var urlParams=new URLSearchParams(window.location.search);" +
                        "NS_PARAMS.forEach(function(key){" +
                            "if(urlParams.has(key)){" +
                                "var inp=document.createElement('input');" +
                                "inp.type='hidden';" +
                                "inp.name=key;" +
                                "inp.value=urlParams.get(key);" +
                                "form.appendChild(inp);" +
                            "}" +
                        "});" +
                        // ── 2. Sync checkbox → hidden forcedowngrade ─────────────────────────
                        "var cb=document.getElementById('fd_check');" +
                        "var hd=document.getElementById('forcedowngrade');" +
                        "cb.addEventListener('change',function(){hd.value=this.checked?'T':'F';});" +
                        // ── 3. Feedback visual al hacer submit ───────────────────────────────
                        "form.addEventListener('submit',function(){" +
                            "var btn=document.getElementById('submitBtn');" +
                            "btn.disabled=true;" +
                            "btn.classList.add('loading');" +
                        "});" +
                    "})();" +
                "</script>" +
            "</body>" +
            "</html>"
        );
    }

    // ─── Validación compartida ───────────────────────────────────────────────────

    /**
     * Valida y normaliza los parámetros de entrada.
     * @returns {{ salesOrderIdNum: number, forceStatusDowngrade: boolean }|{ error: string }}
     */
    function parseParams(salesOrderId, forceDowngradeRaw) {
        if (!salesOrderId) {
            return { error: "Parámetro 'salesorderid' es requerido." };
        }
        var num = Number(salesOrderId);
        if (isNaN(num) || num <= 0) {
            return { error: "Parámetro 'salesorderid' inválido: debe ser un número positivo. Recibido: " + salesOrderId };
        }
        // Default: true. Solo es false cuando se recibe explícitamente "F".
        var forceStatusDowngrade = !(String(forceDowngradeRaw).toUpperCase() === "F");
        return { salesOrderIdNum: num, forceStatusDowngrade: forceStatusDowngrade };
    }

    // ─── Entrada del Suitelet ────────────────────────────────────────────────────

    function onRequest(context) {
        var req  = context.request;
        var resp = context.response;
        var method = req.method;

        // ── POST → API JSON pura (sin cambios respecto a v1.0) ──────────────────
        if (method === "POST") {
            var salesOrderId, forceDowngradeRaw;
            try {
                if (req.body) {
                    var body = {};
                    try { body = JSON.parse(req.body); } catch (e) { body = {}; }
                    salesOrderId     = body.salesorderid   || req.parameters.salesorderid;
                    forceDowngradeRaw = body.forcedowngrade !== undefined
                        ? body.forcedowngrade
                        : req.parameters.forcedowngrade;
                } else {
                    salesOrderId      = req.parameters.salesorderid;
                    forceDowngradeRaw = req.parameters.forcedowngrade;
                }
            } catch (e) {
                writeJson(resp, { success: false, message: "Error al leer los parámetros de entrada", error: e.message });
                return;
            }

            var parsed = parseParams(salesOrderId, forceDowngradeRaw);
            if (parsed.error) {
                writeJson(resp, { success: false, message: parsed.error });
                return;
            }

            var resultado = ejecutarAutopicking(parsed.salesOrderIdNum, parsed.forceStatusDowngrade);
            writeJson(resp, Object.assign(
                { success: resultado.success, salesOrderId: String(parsed.salesOrderIdNum), message: resultado.message },
                resultado.error ? { error: resultado.error } : {}
            ));
            return;
        }

        // ── GET → Interfaz HTML ──────────────────────────────────────────────────
        if (method === "GET") {
            resp.setHeader({ name: "Content-Type", value: "text/html; charset=utf-8" });

            var ovParam    = req.parameters.salesorderid;
            var fdParam    = req.parameters.forcedowngrade;

            // Sin parámetros → formulario vacío
            if (!ovParam) {
                resp.write(renderPage(null, null, true));
                return;
            }

            // Con parámetros → validar, ejecutar y mostrar resultado
            var parsedGet = parseParams(ovParam, fdParam);
            if (parsedGet.error) {
                resp.write(renderPage({ success: false, message: parsedGet.error }, ovParam, fdParam !== "F"));
                return;
            }

            var res = ejecutarAutopicking(parsedGet.salesOrderIdNum, parsedGet.forceStatusDowngrade);
            resp.write(renderPage(res, String(parsedGet.salesOrderIdNum), parsedGet.forceStatusDowngrade));
            return;
        }

        // ── Método no permitido ─────────────────────────────────────────────────
        writeJson(resp, { success: false, message: "Método " + method + " no permitido. Use GET o POST." });
    }

    return { onRequest };
});