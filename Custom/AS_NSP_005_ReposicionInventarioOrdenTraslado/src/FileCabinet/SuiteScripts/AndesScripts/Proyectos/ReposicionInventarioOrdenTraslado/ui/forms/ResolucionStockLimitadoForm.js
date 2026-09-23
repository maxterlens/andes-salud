/**
 * AS_NSP_005 — Reposición de Inventario por Orden de Traslado (módulo M2)
 * @description Construcción de los 3 formularios del Suitelet de Resolución de Stock
 *              Limitado, usando componentes nativos de N/ui/serverWidget siempre que
 *              es posible (título, botones, banner/summary/helptext y el listado de
 *              resultados se resuelven con serverWidget).
 *
 *              La ÚNICA excepción es la grilla de resolución de conflictos por ítem
 *              (agrupada por origen → ítem → destinos que compiten), que se construye
 *              como un solo campo addField({ type: INLINEHTML }): un sublist nativo de
 *              NetSuite tiene una lista fija de columnas y un único ID estático, por lo
 *              que no permite renderizar una tabla distinta por cada ítem en conflicto
 *              (la cantidad de ítems y de destinos por ítem varía en cada ejecución).
 *              Esta limitación y su solución fueron explicadas y aprobadas explícitamente.
 *
 *              Los <input> de cantidad dentro de ese bloque HTML viven dentro del mismo
 *              <form> nativo que genera NetSuite, por lo que via su atributo "name" se
 *              envían igual que cualquier otro campo al hacer POST. Convención de nombre:
 *
 *                custpage_cant__<subsidiaryId>__<locationFrom>__<itemInternalId>__<locationTo>
 *
 *              (ver ../handlers/ResolucionStockLimitadoHandler.js → _parseLineasFromParams)
 *
 * @NApiVersion 2.1
 * @NModuleScope SameAccount
 */
define(['N/ui/serverWidget'], (serverWidget) => {

    const CLIENT_SCRIPT_PATH = '../AS_ResolucionStockLimitado_CS_2.1.js';
    const FORM_TITLE         = 'Reposición de Inventario - Resolución de Stock Insuficiente';

    const FIELDS = {
        ACCION      : 'custpage_accion',
        SUBSIDIARIA : 'custpage_subsidiaria'
    };

    // Deben coincidir con ACCIONES en ../handlers/ResolucionStockLimitadoHandler.js
    const ACCIONES = {
        BUSCAR    : 'buscar',
        CONFIRMAR : 'confirmar'
    };

    /* ═══════════════════════════════════════════════════════════════════
     * CSS compartido por los 3 formularios (tokens de color NetSuite +
     * LatamReady). Todas las clases usan el prefijo "asrsl-" para no
     * chocar con las clases nativas de la página de NetSuite.
     * ═══════════════════════════════════════════════════════════════════ */
    const _CSS_BASE = `
        <style>
          .asrsl-root{
            --asrsl-ok:#1e7b34; --asrsl-ok-bg:#eaf6ec; --asrsl-warn:#c23a2b; --asrsl-warn-bg:#fdecea;
            --asrsl-field-border:#9f9f9f; --asrsl-table-border:#cfd8de; --asrsl-table-cell-border:#d9e2e8;
            --asrsl-table-active:#eef4f7; --asrsl-table-active-border:#2e86b0; --asrsl-section-bg:#f7f7f7;
            --asrsl-border-main:#d2d2d2; --asrsl-border-light:#d8d8d8; --asrsl-text-secondary:#444;
            --asrsl-field-label:#4b4b4b; --asrsl-tab-active:#2b7ea5;
            font-family:-apple-system,"Segoe UI",Helvetica,Arial,sans-serif;
            color:#111;
          }
          .asrsl-root *{box-sizing:border-box;}
          .asrsl-infobanner{background:#fff7e6;border:1px solid #f0c36d;color:#6b4b06;font-size:13px;padding:10px 14px;border-radius:3px;margin-bottom:18px;}
          .asrsl-okbanner{background:var(--asrsl-ok-bg);border:1px solid #a9d9b3;color:var(--asrsl-ok);font-size:13px;padding:10px 14px;border-radius:3px;margin-bottom:18px;}
          .asrsl-errorbanner{background:var(--asrsl-warn-bg);border:1px solid #f0b4ac;color:var(--asrsl-warn);font-size:13px;padding:10px 14px;border-radius:3px;margin-bottom:18px;}
          .asrsl-context{font-size:13px;color:var(--asrsl-text-secondary);margin-bottom:14px;}
          .asrsl-context b{color:#111;}
          .asrsl-landing{border:1px solid var(--asrsl-border-light);background:#fff;border-radius:6px;padding:24px 24px 30px 24px;text-align:center;margin-bottom:12px;}
          .asrsl-landing .asrsl-ico{font-size:30px;margin-bottom:8px;}
          .asrsl-landing h2{font-size:15px;font-weight:600;margin:0 0 8px;}
          .asrsl-landing p{font-size:13px;color:var(--asrsl-text-secondary);max-width:560px;margin:0 auto;line-height:1.5;}
          .asrsl-summarycard{border:1px solid var(--asrsl-border-light);background:#fff;border-radius:6px;padding:14px 18px;margin-bottom:20px;display:flex;gap:28px;flex-wrap:wrap;}
          .asrsl-summarycard .asrsl-stat .asrsl-num{font-size:20px;font-weight:700;color:#111;}
          .asrsl-summarycard .asrsl-stat .asrsl-lbl{font-size:12px;color:var(--asrsl-text-secondary);margin-top:2px;}
          .asrsl-section{border:1px solid var(--asrsl-border-main);border-radius:3px;background:#fff;margin-bottom:18px;overflow:hidden;}
          .asrsl-section-hdr{background:var(--asrsl-section-bg);border-bottom:1px solid var(--asrsl-border-main);padding:9px 14px;font-size:13.5px;font-weight:600;}
          .asrsl-item-block{border-bottom:1px solid var(--asrsl-table-border);}
          .asrsl-item-block:last-child{border-bottom:none;}
          .asrsl-item-hdr{display:flex;flex-wrap:wrap;align-items:center;gap:8px 22px;padding:11px 14px;background:#fbfcfd;}
          .asrsl-item-hdr .asrsl-item-name{font-size:13px;font-weight:600;}
          .asrsl-item-hdr .asrsl-item-code{color:var(--asrsl-text-secondary);font-weight:400;}
          .asrsl-item-hdr .asrsl-kv{font-size:11.5px;color:var(--asrsl-field-label);}
          .asrsl-item-hdr .asrsl-kv b{color:#111;font-size:12.5px;}
          .asrsl-item-hdr .asrsl-balance{margin-left:auto;font-size:12px;font-weight:600;padding:3px 9px;border-radius:12px;}
          .asrsl-balance.ok{color:var(--asrsl-ok);background:var(--asrsl-ok-bg);}
          .asrsl-balance.over{color:var(--asrsl-warn);background:var(--asrsl-warn-bg);}
          .asrsl-tablewrap{overflow-x:auto;}
          table.asrsl-linetable{width:100%;border-collapse:collapse;font-size:12.5px;}
          table.asrsl-linetable th{background:#f7f7f7;font-size:11px;font-weight:600;color:#222;text-align:left;padding:7px 10px;border-bottom:1px solid var(--asrsl-table-border);border-right:1px solid var(--asrsl-table-cell-border);white-space:nowrap;}
          table.asrsl-linetable th:last-child, table.asrsl-linetable td:last-child{border-right:none;}
          table.asrsl-linetable td{padding:6px 10px;border-bottom:1px solid var(--asrsl-table-cell-border);border-right:1px solid var(--asrsl-table-cell-border);vertical-align:middle;}
          table.asrsl-linetable tr.asrsl-editrow{background:var(--asrsl-table-active);}
          table.asrsl-linetable tr.asrsl-editrow td:first-child{border-left:2px solid var(--asrsl-table-active-border);}
          .asrsl-orden-chip{display:inline-block;min-width:16px;text-align:center;background:#e7edf1;border:1px solid #c7d4dc;border-radius:10px;padding:1px 7px;font-size:11px;font-weight:600;color:#345e78;}
          .asrsl-qty-input{width:78px;height:24px;border:1px solid var(--asrsl-field-border);background:#fff;border-radius:2px;padding:0 7px;font-size:12.5px;text-align:right;}
          .asrsl-qty-input:focus{outline:none;border-color:var(--asrsl-table-active-border);box-shadow:0 0 0 1px var(--asrsl-table-active-border);}
          .asrsl-qty-input.over{border-color:var(--asrsl-warn);background:#fff5f4;}
          .asrsl-muted{color:var(--asrsl-text-secondary);}
          .asrsl-helptext{font-size:11.5px;color:var(--asrsl-text-secondary);padding:10px 2px 0;}
          .asrsl-results-badge{font-size:11px;font-weight:600;padding:2px 8px;border-radius:10px;display:inline-block;}
          .asrsl-results-badge.exito{color:var(--asrsl-ok);background:var(--asrsl-ok-bg);}
          .asrsl-results-badge.error{color:var(--asrsl-warn);background:var(--asrsl-warn-bg);}
        </style>
    `;

    /* ═══════════════════════════════════════════════════════════════════
     * Helpers
     * ═══════════════════════════════════════════════════════════════════ */
    const _esc = (val) => String(val === null || val === undefined ? '' : val)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

    const _hiddenAccionField = (form, valorDefecto) => {
        const field = form.addField({ id: FIELDS.ACCION, type: serverWidget.FieldType.TEXT, label: 'Acción' });
        field.updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN });
        field.defaultValue = valorDefecto;
        return field;
    };

    const _addInlineHtml = (form, id, html) => {
        const field = form.addField({ id, type: serverWidget.FieldType.INLINEHTML, label: ' ' });
        field.defaultValue = html;
        return field;
    };

    /* ═══════════════════════════════════════════════════════════════════
     * Pantalla 1: LANDING
     * ═══════════════════════════════════════════════════════════════════ */
    const buildLandingForm = ({ mensaje, esError } = {}) => {
        const form = serverWidget.createForm({ title: FORM_TITLE });
        form.clientScriptModulePath = CLIENT_SCRIPT_PATH;

        _hiddenAccionField(form, ACCIONES.BUSCAR);

        const bannerClass = esError ? 'asrsl-errorbanner' : 'asrsl-okbanner';
        const bannerIcon  = esError ? '&#9888;' : '&#10003;';
        const bannerHtml = mensaje
            ? `<div class="asrsl-root"><div class="${bannerClass}">${bannerIcon} ${_esc(mensaje)}</div></div>`
            : '';

        if (bannerHtml) {
            _addInlineHtml(form, 'custpage_html_landing_banner', _CSS_BASE + bannerHtml);
        }

        // Subsidiaria: obligatoria — define bajo qué subsidiaria se filtran las
        // ubicaciones de origen a evaluar (cada config de reposición ya tiene su
        // propia subsidiaria, así que filtrar acá alcanza para acotar los orígenes).
        const subsidiariaField = form.addField({
            id: FIELDS.SUBSIDIARIA, type: serverWidget.FieldType.SELECT, label: 'Subsidiaria', source: 'subsidiary'
        });
        subsidiariaField.isMandatory = true;

        const landingHtml = `
            <div class="asrsl-root">
              <div class="asrsl-landing">
                <div class="asrsl-ico">&#128269;</div>
                <h2>Buscar artículos con stock limitado</h2>
                <p>
                  Seleccioná una <b>Subsidiaria</b> y presioná <b>Buscar</b> para revisar, al momento, qué artículos
                  tienen stock insuficiente en su ubicación de origen para cubrir a todos los destinos que compiten
                  por ellos dentro de esa subsidiaria. Los artículos con un solo destino solicitante, o donde el
                  origen alcanza para todos, ya se despachan automáticamente y no requieren tu intervención.
                </p>
              </div>
            </div>
        `;

        _addInlineHtml(form, 'custpage_html_landing', (bannerHtml ? '' : _CSS_BASE) + landingHtml);

        form.addSubmitButton({ label: 'Buscar' });

        return form;
    };

    /* ═══════════════════════════════════════════════════════════════════
     * Pantalla 2: RESOLUCIÓN
     * ═══════════════════════════════════════════════════════════════════ */
    const buildResolucionForm = ({ origenes, subsidiaryName }) => {
        const form = serverWidget.createForm({ title: FORM_TITLE });
        form.clientScriptModulePath = CLIENT_SCRIPT_PATH;

        _hiddenAccionField(form, ACCIONES.CONFIRMAR);

        const totalItems    = origenes.reduce((sum, o) => sum + o.conflictos.length, 0);
        const totalLineas   = origenes.reduce((sum, o) =>
            sum + o.conflictos.reduce((s2, c) => s2 + c.destinos.length, 0), 0);

        const contextBar = subsidiaryName
            ? `<div class="asrsl-context">Subsidiaria: <b>${_esc(subsidiaryName)}</b></div>`
            : '';

        const infoBanner = `
            <div class="asrsl-infobanner">
              &#9888; Estos artículos tienen stock insuficiente en origen para cubrir a <b>todos</b> los destinos
              que compiten por ellos. La columna <b>Sugerido</b> propone un reparto según el Orden de Prioridad
              configurado — podés ajustar <b>Cantidad a Enviar</b> antes de confirmar.
            </div>
        `;

        const summaryCard = `
            <div class="asrsl-summarycard">
              <div class="asrsl-stat"><div class="asrsl-num">${origenes.length}</div><div class="asrsl-lbl">Orígenes con conflictos</div></div>
              <div class="asrsl-stat"><div class="asrsl-num">${totalItems}</div><div class="asrsl-lbl">Artículos con stock limitado</div></div>
              <div class="asrsl-stat"><div class="asrsl-num">${totalLineas}</div><div class="asrsl-lbl">Líneas destino por resolver</div></div>
            </div>
        `;

        const seccionesHtml = origenes.map(origen => _origenSectionHtml(origen)).join('');

        const helptext = `
            <div class="asrsl-helptext">
              Al confirmar, se vuelve a validar el stock disponible en origen y se crea una Orden de Traslado
              por cada destino con cantidad asignada mayor a cero.
            </div>
        `;

        const script = `
            <script>
            (function(){
              function asrslRecalc(key){
                var inputs = document.querySelectorAll('input[data-asrsl-key="' + key + '"]');
                if(!inputs.length) return;
                var total = 0;
                inputs.forEach(function(inp){ total += parseFloat(inp.value) || 0; });
                var max = parseFloat(inputs[0].getAttribute('data-max')) || 0;
                var balEl = document.getElementById('asrsl-bal-' + key);
                if(!balEl) return;
                balEl.textContent = 'Asignado: ' + total + ' / ' + max;
                if(total > max){
                  balEl.className = 'asrsl-balance over';
                  inputs.forEach(function(inp){ inp.classList.add('over'); });
                } else {
                  balEl.className = 'asrsl-balance ok';
                  inputs.forEach(function(inp){ inp.classList.remove('over'); });
                }
              }
              document.querySelectorAll('.asrsl-qty-input').forEach(function(inp){
                inp.addEventListener('input', function(){ asrslRecalc(inp.getAttribute('data-asrsl-key')); });
              });
            })();
            </script>
        `;

        const fullHtml = `<div class="asrsl-root">${contextBar}${infoBanner}${summaryCard}${seccionesHtml}${helptext}</div>${script}`;

        _addInlineHtml(form, 'custpage_html_resolucion', _CSS_BASE + fullHtml);

        form.addSubmitButton({ label: 'Confirmar y Crear Órdenes de Traslado' });
        form.addButton({ id: 'custpage_btn_cancelar', label: 'Cancelar', functionName: 'cancelar' });

        return form;
    };

    /**
     * Construye la sección HTML de UN origen: su encabezado + un item-block
     * por cada ítem en conflicto que le pertenece, con su tabla de destinos.
     */
    const _origenSectionHtml = (origen) => {
        const nombreOrigen = _esc(origen.locationFromName || `Ubicación ${origen.locationFrom}`);

        const itemsHtml = origen.conflictos.map(conflicto => {
            const key = `${origen.locationFrom}__${conflicto.itemInternalId}`;
            const nombreItem = _esc(conflicto.itemDisplayName || '');
            const codigoItem = _esc(conflicto.itemCode || '');

            const filas = conflicto.destinos.map(destino => {
                const nombreDestino = _esc(destino.locationToName || `Ubicación ${destino.locationTo}`);
                const ordenTexto = (destino.orden === null || destino.orden === undefined) ? '—' : destino.orden;
                const inputName = `custpage_cant__${origen.subsidiaryId}__${origen.locationFrom}__${conflicto.itemInternalId}__${destino.locationTo}`;

                return `
                    <tr class="asrsl-editrow">
                      <td>${nombreDestino}</td>
                      <td><span class="asrsl-orden-chip">${ordenTexto}</span></td>
                      <td>${destino.necesidad}</td>
                      <td class="asrsl-muted">${destino.sugerido}</td>
                      <td>
                        <input
                          class="asrsl-qty-input"
                          type="number"
                          name="${inputName}"
                          value="${destino.sugerido}"
                          min="0"
                          max="${conflicto.disponibleOrigen}"
                          data-asrsl-key="${key}"
                          data-max="${conflicto.disponibleOrigen}"
                        >
                      </td>
                    </tr>
                `;
            }).join('');

            return `
                <div class="asrsl-item-block">
                  <div class="asrsl-item-hdr">
                    <div class="asrsl-item-name">[${codigoItem}] <span class="asrsl-item-code">${nombreItem}</span></div>
                    <div class="asrsl-kv">Stock disponible en origen: <b>${conflicto.disponibleOrigen}</b></div>
                    <div class="asrsl-kv">Necesidad total: <b>${conflicto.necesidadTotal}</b></div>
                    <div class="asrsl-balance ok" id="asrsl-bal-${key}">Asignado: ${conflicto.disponibleOrigen} / ${conflicto.disponibleOrigen}</div>
                  </div>
                  <div class="asrsl-tablewrap">
                    <table class="asrsl-linetable">
                      <thead>
                        <tr><th>Ubicación Destino</th><th>Orden</th><th>Necesidad</th><th>Sugerido</th><th>Cantidad a Enviar</th></tr>
                      </thead>
                      <tbody>${filas}</tbody>
                    </table>
                  </div>
                </div>
            `;
        }).join('');

        return `
            <div class="asrsl-section">
              <div class="asrsl-section-hdr">Origen: ${nombreOrigen}</div>
              ${itemsHtml}
            </div>
        `;
    };

    /* ═══════════════════════════════════════════════════════════════════
     * Pantalla 3: RESULTADOS
     * ═══════════════════════════════════════════════════════════════════ */
    const buildResultadosForm = ({ resultados }) => {
        const form = serverWidget.createForm({ title: FORM_TITLE });
        form.clientScriptModulePath = CLIENT_SCRIPT_PATH;

        const mensaje = resultados.length
            ? 'Se procesó la resolución. Se detallan los resultados por destino a continuación.'
            : 'La resolución se procesó, pero ninguna línea quedó con cantidad mayor a cero: no se creó ninguna Orden de Traslado.';

        _addInlineHtml(form, 'custpage_html_resultados_banner',
            _CSS_BASE + `<div class="asrsl-root"><div class="asrsl-okbanner">&#10003; ${_esc(mensaje)}</div></div>`
        );

        const sublist = form.addSublist({
            id: 'custpage_sub_resultados',
            type: serverWidget.SublistType.LIST,
            label: 'Resultados de la Última Resolución'
        });

        sublist.addField({ id: 'custpage_res_fecha',    type: serverWidget.FieldType.TEXT, label: 'Fecha' });
        sublist.addField({ id: 'custpage_res_origen',   type: serverWidget.FieldType.TEXT, label: 'Origen' });
        sublist.addField({ id: 'custpage_res_destino',  type: serverWidget.FieldType.TEXT, label: 'Destino' });
        sublist.addField({ id: 'custpage_res_estado',   type: serverWidget.FieldType.TEXT, label: 'Estado' });
        sublist.addField({ id: 'custpage_res_to',       type: serverWidget.FieldType.TEXT, label: 'Orden de Traslado' });
        sublist.addField({ id: 'custpage_res_mensaje',  type: serverWidget.FieldType.TEXT, label: 'Mensaje' });

        resultados.forEach((r, idx) => {
            sublist.setSublistValue({ id: 'custpage_res_fecha',   line: idx, value: r.date || '' });
            sublist.setSublistValue({ id: 'custpage_res_origen',  line: idx, value: r.locationFrom || '' });
            sublist.setSublistValue({ id: 'custpage_res_destino', line: idx, value: r.locationTo || '' });
            sublist.setSublistValue({ id: 'custpage_res_estado',  line: idx, value: r.status || '' });
            sublist.setSublistValue({ id: 'custpage_res_to',      line: idx, value: r.toId ? `OT-${r.toId}` : '—' });
            sublist.setSublistValue({ id: 'custpage_res_mensaje', line: idx, value: r.message || '' });
        });

        form.addButton({ id: 'custpage_btn_buscar_nuevamente', label: 'Buscar Nuevamente', functionName: 'buscarNuevamente' });

        return form;
    };

    return {
        FIELDS,
        ACCIONES,
        buildLandingForm,
        buildResolucionForm,
        buildResultadosForm
    };
});
