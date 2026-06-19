/**
 * @NApiVersion 2.1
 * @NScriptType ClientScript
 * @NModuleScope SameAccount
 * @file AS_ActionButtons_CLNT_2.1.js
 * @description Client Script para la Orden de Traslado.
 *              Maneja el botón "Asignar Lotes": overlay spinner → fetch al STLT → modal de resultados.
 */
define(['N/currentRecord', 'N/url'], (currentRecord, url) => {

    // ─────────────────────────────────────────────────────────────────────────
    // CONFIGURACIÓN — completar con los IDs del STLT tras el primer deploy
    // ─────────────────────────────────────────────────────────────────────────
    const STLT_SCRIPT_ID = 'customscript_as_action_execut_hdlr_stlt';
    const STLT_DEPLOY_ID = 'customdeploy_as_action_execut_hdlr_stlt';

    // ─────────────────────────────────────────────────────────────────────────
    // CONSTANTES DE UI
    // ─────────────────────────────────────────────────────────────────────────
    const OVERLAY_ID = 'as_asignar_overlay';
    const MODAL_ID   = 'as_asignar_modal';

    // ─────────────────────────────────────────────────────────────────────────
    // HOOK pageInit (requerido por NetSuite)
    // ─────────────────────────────────────────────────────────────────────────

    const pageInit = (_context) => {
        // Sin lógica en init; todo se resuelve en el click del botón
    };

    // ─────────────────────────────────────────────────────────────────────────
    // BOTÓN — asignarLotes
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Ejecuta el proceso de asignación de lotes en la Orden de Traslado actual.
     * Llamada por NetSuite al hacer clic en el botón "Asignar Lotes".
     */
    const asignarLotes = () => {
        const record           = currentRecord.get();
        const ordenTrasladoId  = record.id;

        if (!ordenTrasladoId) {
            alert('No se pudo obtener el ID de la Orden de Traslado. Recargue la página e intente nuevamente.');
            return;
        }

        const suiteletUrl = _resolverUrlSuitelet();
        if (!suiteletUrl) {
            alert('No se pudo resolver la URL del servicio. Verifique los IDs de script configurados.');
            return;
        }

        _mostrarOverlay();

        fetch(suiteletUrl, {
            method : 'POST',
            headers: {
                'Content-Type' : 'application/json',
                'X-Record-Type': 'transferOrder',
                'X-Operation'  : 'asign-inventory-detail'
            },
            body: JSON.stringify({ ordenTrasladoId })
        })
        .then(async (response) => {
            if (!response.ok) {
                const txt = await response.text();
                throw new Error(`HTTP ${response.status}: ${txt}`);
            }
            return response.json();
        })
        .then((resultado) => {
            _ocultarOverlay();
            _mostrarModalResultado(resultado);
        })
        .catch((err) => {
            _ocultarOverlay();
            _mostrarModalResultado({ ok: false, status: 'ERROR', error: err.message || String(err) });
        });
    };

    // ─────────────────────────────────────────────────────────────────────────
    // URL DEL SUITELET
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Construye la URL relativa del Suitelet usando N/url.
     * No requiere N/runtime — url.resolveScript funciona en client scripts.
     */
    const _resolverUrlSuitelet = () => {
        try {
            return url.resolveScript({
                scriptId    : STLT_SCRIPT_ID,
                deploymentId: STLT_DEPLOY_ID,
                returnExternalUrl: false
            });
        } catch (e) {
            log.error({ title: 'AS_ActionButtons_CLNT — _resolverUrlSuitelet', details: e.toString() });
            return null;
        }
    };

    // ─────────────────────────────────────────────────────────────────────────
    // OVERLAY — spinner de carga
    // ─────────────────────────────────────────────────────────────────────────

    const _mostrarOverlay = () => {
        if (document.getElementById(OVERLAY_ID)) return;

        const overlay = document.createElement('div');
        overlay.id    = OVERLAY_ID;
        Object.assign(overlay.style, {
            position      : 'fixed',
            top           : '0',
            left          : '0',
            width         : '100%',
            height        : '100%',
            background    : 'rgba(0,0,0,0.45)',
            display       : 'flex',
            alignItems    : 'center',
            justifyContent: 'center',
            zIndex        : '99999'
        });

        overlay.innerHTML = `
            <div style="
                background:#fff;border-radius:8px;padding:40px 48px;
                text-align:center;box-shadow:0 4px 24px rgba(0,0,0,0.2);min-width:260px;
            ">
                <div style="
                    width:48px;height:48px;
                    border:5px solid #e0e0e0;border-top-color:#0b74e8;
                    border-radius:50%;animation:as-spin 0.8s linear infinite;
                    margin:0 auto 20px;
                "></div>
                <p style="margin:0;font-size:15px;color:#333;font-family:Arial,sans-serif;">
                    Asignando lotes…
                </p>
            </div>
            <style>
                @keyframes as-spin {
                    from { transform: rotate(0deg); }
                    to   { transform: rotate(360deg); }
                }
            </style>
        `;

        document.body.appendChild(overlay);
    };

    const _ocultarOverlay = () => {
        const el = document.getElementById(OVERLAY_ID);
        if (el) el.remove();
    };

    // ─────────────────────────────────────────────────────────────────────────
    // MODAL DE RESULTADO
    // ─────────────────────────────────────────────────────────────────────────

    const _mostrarModalResultado = (resultado) => {
        const prev = document.getElementById(MODAL_ID);
        if (prev) prev.remove();

        const { ok, status, counters, detalle, lineasConProblema, error } = resultado;
        const titulo   = ok ? 'Asignación completada' : 'Error en la asignación';
        const secciones = ok ? _construirSecciones(counters, detalle, lineasConProblema) : _construirSeccionError(error);

        const modal = document.createElement('div');
        modal.id    = MODAL_ID;
        Object.assign(modal.style, {
            position      : 'fixed',
            top           : '0',
            left          : '0',
            width         : '100%',
            height        : '100%',
            background    : 'rgba(0,0,0,0.45)',
            display       : 'flex',
            alignItems    : 'center',
            justifyContent: 'center',
            zIndex        : '99999'
        });

        modal.innerHTML = `
            <div style="
                background:#fff;border-radius:8px;padding:32px 36px;
                box-shadow:0 4px 24px rgba(0,0,0,0.2);
                max-width:560px;width:90%;font-family:Arial,sans-serif;
                max-height:80vh;overflow-y:auto;
            ">
                <h2 style="margin:0 0 20px;font-size:18px;color:#222;">${titulo}</h2>
                ${secciones}
                <div style="text-align:right;margin-top:24px;">
                    <button onclick="document.getElementById('${MODAL_ID}').remove();location.reload();"
                        style="background:#0b74e8;color:#fff;border:none;padding:9px 22px;
                               border-radius:5px;font-size:14px;cursor:pointer;">
                        Aceptar y recargar
                    </button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);
    };

    const _construirSecciones = (counters, detalle, lineasConProblema) => {
        if (!counters) return '<p style="color:#666;">Sin datos de resultado.</p>';

        let html = `
            <table style="width:100%;border-collapse:collapse;margin-bottom:16px;font-size:13px;">
                <tr style="background:#f5f5f5;">
                    <td style="padding:6px 10px;font-weight:bold;">Total líneas</td>
                    <td style="padding:6px 10px;">${counters.total}</td>
                </tr>
                <tr>
                    <td style="padding:6px 10px;">✅ Completadas</td>
                    <td style="padding:6px 10px;color:#1a7f37;">${counters.complete}</td>
                </tr>
                <tr style="background:#f5f5f5;">
                    <td style="padding:6px 10px;">⚠️ Parciales</td>
                    <td style="padding:6px 10px;color:#b08800;">${counters.partial}</td>
                </tr>
                <tr>
                    <td style="padding:6px 10px;">❌ Sin stock</td>
                    <td style="padding:6px 10px;color:#c0392b;">${counters.noStock}</td>
                </tr>
                <tr style="background:#f5f5f5;">
                    <td style="padding:6px 10px;">— Omitidas</td>
                    <td style="padding:6px 10px;color:#888;">${counters.skipped}</td>
                </tr>
            </table>
        `;

        if (lineasConProblema && lineasConProblema.length > 0) {
            const filas = lineasConProblema.map(l => `
                <tr>
                    <td style="padding:5px 8px;">${_escaparHtml(l.itemName)}</td>
                    <td style="padding:5px 8px;text-align:right;white-space:nowrap;color:#7a3c00;">
                        Req: ${l.qtyRequired} &nbsp;|&nbsp; Asig: ${l.qtyTotal} &nbsp;|&nbsp;
                        <strong>Faltante: ${l.qtyFaltante}</strong>
                    </td>
                </tr>
            `).join('');

            html += `
                <div style="
                    margin-bottom:16px;background:#fff8e1;
                    border:1px solid #ffe082;border-radius:4px;
                    padding:12px 14px;
                ">
                    <p style="margin:0 0 8px;font-size:13px;font-weight:bold;color:#7a5c00;">
                        ⚠️ Artículos con stock insuficiente
                    </p>
                    <table style="width:100%;border-collapse:collapse;font-size:12px;">
                        ${filas}
                    </table>
                </div>
            `;
        }

        if (false && detalle) {
            html += `
                <details style="margin-top:8px;">
                    <summary style="cursor:pointer;font-size:13px;color:#555;margin-bottom:6px;">
                        Ver detalle por línea
                    </summary>
                    <pre style="
                        background:#f9f9f9;border:1px solid #ddd;border-radius:4px;
                        padding:10px;font-size:11px;white-space:pre-wrap;
                        max-height:200px;overflow-y:auto;
                    ">${_escaparHtml(detalle)}</pre>
                </details>
            `;
        }

        return html;
    };

    const _construirSeccionError = (error) => `
        <div style="background:#fff0f0;border:1px solid #f5c6c6;border-radius:4px;
                    padding:12px 16px;font-size:13px;color:#c0392b;">
            ❌ ${_escaparHtml(error || 'Error desconocido')}
        </div>
    `;

    const _escaparHtml = (str) =>
        String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');

    // ─────────────────────────────────────────────────────────────────────────
    // EXPORTS
    // ─────────────────────────────────────────────────────────────────────────

    return { pageInit, asignarLotes };
});
