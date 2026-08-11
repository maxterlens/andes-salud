/**
 * @NApiVersion 2.1
 * @NModuleScope SameAccount
 */
define([
    'N/runtime',
], (runtime) => {

    function agregarPopupRechazo(scriptContext) {

        // Obtener el newRecord y type
        let { form, newRecord } = scriptContext;

        let statusRef = newRecord.getValue('statusRef');

        if (!['pendingSupApproval', 'pendingAcctApproval'].includes(statusRef)) return;

        /****************** Agregar Campo Lógica HTML Cerrar Transacción ******************/
        let htmlField = form.addField({
            id: 'custpage_field_html_popup_rechazo',
            label: 'Rechazo',
            type: 'inlinehtml'
        });

        htmlField.defaultValue = '<script>' + rejectTransactionPopup + ' rejectTransactionPopup();' + '</script>';
    }

    function rejectTransactionPopup() {

        require(['N/record', 'N/currentRecord', 'N/search', 'N/record'], function (record, currentRecord, search, record) {

            var rec       = currentRecord.get();
            var recordId  = rec.id;
            var tranId    = search.lookupFields({ type: 'expensereport', id: recordId, columns: ['tranid'] }).tranid;

            // ── 1. Localizar el botón Rechazar del workflow ───────────────────────
            // Se busca por data-nsps-label ya que el id (custpageworkflowXXXX) es dinámico.
            var rejectBtn = document.querySelector('input[data-nsps-label="Rechazar"]');

            if (!rejectBtn) {
                console.error('[AS] Botón "Rechazar" no encontrado en el formulario.');
                return;
            }

            // Guardar el onclick original para restaurarlo después
            var originalOnClick = rejectBtn.getAttribute('onclick');

            // ── 2. Construir el popup ─────────────────────────────────────────────
            // Diseño basado en el modal nativo de NetSuite (estructura UIF).
            var overlay = document.createElement('div');
            overlay.id  = 'as_reject_overlay';
            overlay.style.cssText = [
                'position:fixed', 'top:0', 'left:0', 'width:100%', 'height:100%',
                'background:rgba(0,0,0,0.4)', 'z-index:1100',
                'display:flex', 'align-items:center', 'justify-content:center',
                'font-family:font-family: "Open Sans", Helvetica, sans-serif'
            ].join(';');

            overlay.innerHTML = [

                // ── Contenedor del diálogo (replica .uif1353 / role="dialog") ──────
                '<div role="dialog" aria-modal="true"',
                ' style="position:relative;background:#fff;border-radius:4px;',
                'width:440px;box-shadow:0 8px 32px rgba(0,0,0,0.28);',
                'display:flex;flex-direction:column;overflow:hidden;">',

                  // ── Barra de título (replica .uif1385) ──────────────────────────
                  '<div style="display:flex;align-items:center;justify-content:space-between;',
                  'padding:3px 12px;background:#607799;',
                  'cursor:move;" id="as_reject_titlebar">',

                    '<span style="font-size:13px;font-weight:600;color:rgb(255,255,255);',
                    'white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">',
                      'Rechazar Informe de gasto ' + tranId,
                    '</span>',

                    // Botón X (replica el SVG close de NetSuite)
                    '<button id="as_reject_close" type="button"',
                    ' style="background:none;border:none;cursor:pointer;padding:4px;',
                    'display:flex;align-items:center;border-radius:3px;color:rgb(255,255,255);"',
                    ' aria-label="Cerrar">',
                      '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"',
                      ' style="width:20px;height:20px;fill:currentColor;">',
                        '<path d="M19 17.59 13.41 12 19 6.41 17.59 5 12 10.59 ',
                        '6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19z"/>',
                      '</svg>',
                    '</button>',

                  '</div>',

                  // ── Cuerpo del diálogo ───────────────────────────────────────────
                  '<div style="padding:20px 20px 8px 20px;flex:1;">',

                    // Label
                    '<label for="as_reject_motivo"',
                    ' style="display:block;font-size:12px;font-weight:700;color:#6D6D6D;',
                    'text-transform:uppercase;letter-spacing:0.3px;margin-bottom:5px;">',
                      'Motivo de Rechazo&nbsp;',
                      '<span style="color:#c00;">*</span>',
                    '</label>',

                    // Textarea
                    '<textarea id="as_reject_motivo" rows="4"',
                    ' style="width:100%;padding:6px 8px;border:1px solid #b0b7c3;',
                    'border-radius:3px;font-size:13px;color:#1f2d3d;',
                    'box-sizing:border-box;resize:vertical;outline:none;',
                    'background:#fff;line-height:1.4;"',
                    ' placeholder=""></textarea>',

                    // Mensaje de error
                    '<div id="as_reject_error"',
                    ' style="color:#c00;font-size:11px;margin-top:4px;display:none;">',
                      'El motivo de rechazo es requerido.',
                    '</div>',

                    // Nota informativa (replica el texto de aviso del popup nativo)
                    '<div style="margin-top:12px;font-size:13px;color:#555;line-height:1.5;',
                    'border-top:1px solid #e8eaed;padding-top:10px;">',
                      'La operación de rechazo no puede deshacerse una vez confirmada.',
                    '</div>',

                  '</div>',

                  // ── Pie de botones ───────────────────────────────────────────────
                  '<div class="uir-buttons-top uir-header-buttons" data-alignment="left"',
                  ' style="background:#ffffff;padding:20px 20px;">',
                    '<table role="presentation" cellpadding="0" cellspacing="0">',
                    '<tbody><tr class="uir-buttons">',

                      // Botón Rechazar (primary: pgBntG pgBntB)
                      '<td>',
                      '<table id="tbl_as_reject_confirm" cellpadding="0" cellspacing="0" border="0"',
                      ' class="uir-button" style="margin-right:6px;" role="presentation">',
                      '<tbody><tr id="tr_as_reject_confirm" class="pgBntG pgBntB">',
                        '<td><img src="/images/nav/ns_x.gif" class="bntLT" border="0" height="50%" width="3" alt="">',
                        '<img src="/images/nav/ns_x.gif" class="bntLB" border="0" height="50%" width="3" alt=""></td>',
                        '<td height="20" valign="top" nowrap="" class="bntBgB">',
                          '<input type="button" class="rndbuttoninpt bntBgT"',
                          ' value="Rechazar" id="as_reject_confirm" name="as_reject_confirm">',
                        '</td>',
                        '<td><img src="/images/nav/ns_x.gif" height="50%" class="bntRT" border="0" width="3" alt="">',
                        '<img src="/images/nav/ns_x.gif" height="50%" class="bntRB" border="0" width="3" alt=""></td>',
                      '</tr></tbody></table>',
                      '</td>',

                      // Botón Cancelar (secondary: pgBntG)
                      '<td>',
                      '<table id="tbl_as_reject_cancel" cellpadding="0" cellspacing="0" border="0"',
                      ' class="uir-button" style="margin-right:6px;" role="presentation">',
                      '<tbody><tr id="tr_as_reject_cancel" class="pgBntG">',
                        '<td><img src="/images/nav/ns_x.gif" class="bntLT" border="0" height="50%" width="3" alt="">',
                        '<img src="/images/nav/ns_x.gif" class="bntLB" border="0" height="50%" width="3" alt=""></td>',
                        '<td height="20" valign="top" nowrap="" class="bntBgB">',
                          '<input type="button" class="rndbuttoninpt bntBgT"',
                          ' value="Cancelar" id="as_reject_cancel" name="as_reject_cancel">',
                        '</td>',
                        '<td><img src="/images/nav/ns_x.gif" height="50%" class="bntRT" border="0" width="3" alt="">',
                        '<img src="/images/nav/ns_x.gif" height="50%" class="bntRB" border="0" width="3" alt=""></td>',
                      '</tr></tbody></table>',
                      '</td>',

                    '</tr></tbody></table>',
                  '</div>',

                  // ── Esquina de redimensión (replica .uif1391) ────────────────────
                  '<div style="position:absolute;bottom:0;right:0;',
                  'width:16px;height:16px;cursor:se-resize;pointer-events:none;">',
                    '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"',
                    ' style="width:16px;height:16px;fill:#aaa;">',
                      '<path d="m11 23 12-12v2.5L13.5 23zm5 0h2.5l4.5-4.5V16z"/>',
                    '</svg>',
                  '</div>',

                '</div>'

            ].join('');

            // ── 3. Lógica del popup ───────────────────────────────────────────────
            var closePopup = function () {
                var el = document.getElementById('as_reject_overlay');
                if (el && el.parentNode) el.parentNode.removeChild(el);
            };

            var openPopup = function () {
                // Resetear estado antes de mostrar
                var motivo     = overlay.querySelector('#as_reject_motivo');
                var error      = overlay.querySelector('#as_reject_error');
                var confirmBtn = overlay.querySelector('#as_reject_confirm');

                motivo.value            = '';
                error.style.display     = 'none';
                confirmBtn.disabled     = false;
                confirmBtn.textContent  = 'Rechazar';
                confirmBtn.style.opacity = '1';

                document.body.appendChild(overlay);
                motivo.focus();
            };

            // Cerrar con X y botón Cancelar
            overlay.querySelector('#as_reject_close').addEventListener('click', closePopup);
            overlay.querySelector('#as_reject_cancel').addEventListener('click', closePopup);

            // Confirmar rechazo
            overlay.querySelector('#as_reject_confirm').addEventListener('click', function () {

                var motivo     = overlay.querySelector('#as_reject_motivo').value.trim();
                var errorEl    = overlay.querySelector('#as_reject_error');
                var confirmBtn = overlay.querySelector('#as_reject_confirm');

                // Validar campo requerido
                if (!motivo) {
                    errorEl.style.display = 'block';
                    return;
                }
                errorEl.style.display = 'none';

                // Deshabilitar botón para evitar doble envío
                confirmBtn.disabled      = true;
                confirmBtn.textContent   = 'Procesando...';
                confirmBtn.style.opacity = '0.7';

                // ── 4. Guardar motivo via submitFields ────────────────────────────
                record.submitFields.promise({
                    type:    record.Type.EXPENSE_REPORT,
                    id:      recordId,
                    values:  { custbody_as_motivo_rechazo: motivo },
                    options: { enableSourcing: false, ignoreMandatoryFields: true }
                }).then(function () {

                    closePopup();

                    // ── 5. Disparar el botón Rechazar original del workflow ────────
                    rejectBtn.setAttribute('onclick', originalOnClick);
                    rejectBtn.click();

                }).catch(function (e) {
                    console.error('[AS] Error al guardar motivo de rechazo:', e);
                    errorEl.textContent    = 'Error al guardar el motivo. Intente nuevamente.';
                    errorEl.style.display  = 'block';
                    confirmBtn.disabled    = false;
                    confirmBtn.textContent = 'Rechazar';
                    confirmBtn.style.opacity = '1';
                });
            });

            // ── 6. Reemplazar onclick del botón con apertura del popup ────────────
            rejectBtn.removeAttribute('onclick');
            rejectBtn.onclick = openPopup;
        });
    }

    return {
        agregarPopupRechazo
    };
});
