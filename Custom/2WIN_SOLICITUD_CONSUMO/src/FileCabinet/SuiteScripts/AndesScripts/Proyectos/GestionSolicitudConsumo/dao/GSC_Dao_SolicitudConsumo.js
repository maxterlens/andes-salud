/**
 * @NApiVersion 2.1
 * @NModuleScope Public
 *
 * GSC_Dao_SolicitudConsumo — DAO del registro header Solicitud de Consumo.
 *
 * Responsabilidades:
 *  - Cargar el registro customrecord_2win_solicitud_consumo con todos sus valores y textos.
 *  - Guardar (crear o actualizar) el header y sus líneas de detalle en un único record.save,
 *    escribiendo sobre la sublista nativa recmachcustrecord_2win_consumo_det_ref.
 *  - Auto-poblar campos de creación (solicitante, fecha, cuenta de consumo).
 *
 * No contiene lógica de presentación ni de negocio de flujo de trabajo.
 */
define(['N/log', 'N/record', 'N/runtime', 'N/search', './GSC_Dao_Config'], function (
    nLog, record, runtime, search, daoConfig
) {

    const RECORD_TYPE    = 'customrecord_2win_solicitud_consumo';
    const NATIVE_SUBLIST = 'recmachcustrecord_2win_consumo_det_ref';
    const FORM_SUBLIST   = 'custpage_sublist_detalle';

    /**
     * Carga el registro header y devuelve un objeto plano con valores y textos de todos los campos.
     * @param {string|number} id - Internal ID del registro
     * @returns {object}
     */
    function cargar(id) {
        try {
            nLog.debug('GSC_Dao_SolicitudConsumo.cargar', { id: id });

            const reg = record.load({ type: RECORD_TYPE, id: id, isDynamic: false });

            return {
                id                                         : reg.id,
                name                                       : reg.getValue('name'),
                custrecord_2win_consumo_solicitante        : reg.getValue('custrecord_2win_consumo_solicitante'),
                custrecord_2win_consumo_solicitante_text   : reg.getText('custrecord_2win_consumo_solicitante'),
                custrecord_2win_consumo_fecha              : reg.getValue('custrecord_2win_consumo_fecha'),
                custrecord_2win_consumo_nota               : reg.getValue('custrecord_2win_consumo_nota'),
                custrecord_2win_consumo_estado             : reg.getValue('custrecord_2win_consumo_estado'),
                custrecord_2win_consumo_estado_text        : reg.getText('custrecord_2win_consumo_estado'),
                custrecord_2win_consumo_cuenta_consumo     : reg.getValue('custrecord_2win_consumo_cuenta_consumo'),
                custrecord_2win_consumo_cuenta_consumo_text: reg.getText('custrecord_2win_consumo_cuenta_consumo'),
                custrecord_2win_consumo_subsidiaria        : reg.getValue('custrecord_2win_consumo_subsidiaria'),
                custrecord_2win_consumo_subsidiaria_text   : reg.getText('custrecord_2win_consumo_subsidiaria'),
                custrecord_2win_consumo_departamento       : reg.getValue('custrecord_2win_consumo_departamento'),
                custrecord_2win_consumo_departamento_text  : reg.getText('custrecord_2win_consumo_departamento'),
                custrecord_2win_consumo_clase              : reg.getValue('custrecord_2win_consumo_clase'),
                custrecord_2win_consumo_clase_text         : reg.getText('custrecord_2win_consumo_clase'),
                custrecord_2win_consumo_ubicacion          : reg.getValue('custrecord_2win_consumo_ubicacion'),
                custrecord_2win_consumo_ubicacion_text     : reg.getText('custrecord_2win_consumo_ubicacion'),
                custrecord_2win_consumo_comentarios        : reg.getValue('custrecord_2win_consumo_comentarios'),
                custrecord_2win_consumo_ajustes_ids        : reg.getValue('custrecord_2win_consumo_ajustes_ids')
            };
        } catch (e) {
            nLog.error('GSC_Dao_SolicitudConsumo.cargar - error', e);
            throw e;
        }
    }

    /**
     * Crea o actualiza el header junto con sus líneas de detalle en un único record.save.
     *
     * Flujo:
     *  1. Crea o carga el header en modo dinámico (isDynamic: true).
     *  2. Auto-pobla campos de creación si es nuevo.
     *  3. Setea los campos del header desde request.parameters.
     *  4. Elimina todas las líneas existentes de la sublista nativa.
     *  5. Agrega las líneas del formulario (custpage_sublist_detalle) a la sublista nativa.
     *  6. Guarda el record una sola vez.
     *
     * @param {ServerRequest} request - context.request del Suitelet
     * @param {string|null}   id      - Internal ID para edición; null para creación
     * @returns {number} - Internal ID del registro guardado
     */
    function guardar(request, id) {
        try {
            const params  = request.parameters;
            nLog.error('params guardar', params);
            nLog.error('id', { id: id });

            const esNuevo = !id;
            let reg;

            if (esNuevo) {
                reg = record.create({ type: RECORD_TYPE, isDynamic: true });
                _autoPopularCreacion(reg);
            } else {
                reg = record.load({ type: RECORD_TYPE, id: id, isDynamic: true });
            }

            // ── Campos del header ─────────────────────────────────────────────
            const fecha = params.custpage_fecha;
            if (fecha) reg.setText({ fieldId: 'custrecord_2win_consumo_fecha', text: fecha });

            reg.setValue({ fieldId: 'custrecord_2win_consumo_nota',         value: params.custpage_nota         || '' });
            reg.setValue({ fieldId: 'custrecord_2win_consumo_comentarios',  value: params.custpage_comentarios  || '' });

            if (params.custpage_subsidiaria)  reg.setValue({ fieldId: 'custrecord_2win_consumo_subsidiaria',  value: params.custpage_subsidiaria  });
            if (params.custpage_departamento) reg.setValue({ fieldId: 'custrecord_2win_consumo_departamento', value: params.custpage_departamento });
            if (params.custpage_clase)        reg.setValue({ fieldId: 'custrecord_2win_consumo_clase',        value: params.custpage_clase        });
            if (params.custpage_ubicacion)    reg.setValue({ fieldId: 'custrecord_2win_consumo_ubicacion',    value: params.custpage_ubicacion    });

            nLog.error('_sincronizarSublistaDetalle before', '_sincronizarSublistaDetalle');
            // ── Sublista de detalle ───────────────────────────────────────────
            _sincronizarSublistaDetalle(reg, request, params);

            nLog.error('save', 'save');
            return reg.save({ ignoreMandatoryFields: true });
        } catch (e) {
            nLog.error('ERROR GSC_Dao_SolicitudConsumo.guardar - error', e);

            throw e;
        }
    }

    /**
     * Cambia el estado del registro a "Enviada" (8).
     * @param {string|number} id
     */
    function enviarABodega(id) {
        try {
            nLog.debug('GSC_Dao_SolicitudConsumo.enviarABodega', { id: id });
            record.submitFields({
                type  : RECORD_TYPE,
                id    : id,
                values: { custrecord_2win_consumo_estado: '8' }
            });
        } catch (e) {
            nLog.error('GSC_Dao_SolicitudConsumo.enviarABodega - error', e);
            throw e;
        }
    }

    /* ── privado ── */

    /**
     * Sincroniza la sublista nativa con las líneas enviadas desde el formulario,
     * preservando los registros hijo existentes cuando sea posible:
     *  - Actualiza las líneas que ya existen (tienen custpage_det_id).
     *  - Elimina solo las líneas que fueron removidas en el formulario.
     *  - Inserta únicamente las líneas nuevas (sin custpage_det_id).
     *
     * El parámetro request.parameters[FORM_SUBLISTdata] llega como string codificado:
     *   /\u0002/ separa líneas  |  /\u0001/ separa columnas
     *
     * Orden de columnas (igual al orden de addField en GSC_Form_Detalle.js):
     *  [0] custpage_det_id          ← internalid del registro hijo (vacío = línea nueva)
     *  [1] custpage_det_articulo
     *  [2] custpage_det_articulo_id * 
     *  [3] custpage_det_unidad
     *  [4] custpage_det_unidad_id
     *  [5] custpage_det_ubicacion
     *  [6] custpage_det_ubicacion * 
     *  [7] custpage_det_disponible * 
     *  [8] custpage_det_cantidad
     *  [9] custpage_det_departamento
     * 
     *
     * @param {Record}  reg    - Registro header en modo dinámico
     * @param {object}  params - request.parameters
     */
    function _sincronizarSublistaDetalle(reg, request, params) {
        nLog.error('_sincronizarSublistaDetalle - inicio', {});

        const ubicacionHeader = params.custpage_ubicacion    || '';
        const departHeader    = params.custpage_departamento || '';

        // ── 1. Parsear líneas del formulario ──────────────────────────────────
        const sublistRaw = params[`${FORM_SUBLIST}data`] || '';
        nLog.error('sublistRaw', sublistRaw);

        const BREAK_LINE   = /\u0002/;
        const BREAK_COLUMN = /\u0001/;

        const lineasExistentes = {};   // { internalid: datosLinea }
        const lineasNuevas     = [];   // datosLinea[]

        if (sublistRaw) {
            const rawLines = sublistRaw.split(BREAK_LINE);
            for (var i = 0; i < rawLines.length; i++) {
                if (!rawLines[i]) continue;
                const cols     = rawLines[i].split(BREAK_COLUMN);
                log.error('cols', cols);
                const detId    = cols[0] || '';   // [0] internalid línea existente
                const articulo = cols[2] || '';   // [1] artículo — obligatorio
                if (!articulo) continue;

                const datos = {};
                if (cols.length == 9 ) {
                    datos.articulo = articulo,
                    datos.unidadId = cols[4] || '',
                    datos.ubicacionId = cols[5] || ubicacionHeader,
                    datos.disponible = cols[6] || '0',
                    datos.cantidad = cols[7] || '1',
                    datos.departId = cols[8] || departHeader
                }
                if (cols.length == 10 ) {
                    datos.articulo = articulo,
                    datos.unidadId = cols[4] || '',
                    datos.ubicacionId = cols[6] || ubicacionHeader,
                    datos.disponible = cols[7] || '0',
                    datos.cantidad = cols[8] || '1',
                    datos.departId = cols[9] || departHeader
                }

                if (detId) {
                    lineasExistentes[detId] = datos;
                } else {
                    lineasNuevas.push(datos);
                }
            }
        }

        nLog.error('lineasExistentes', lineasExistentes);
        nLog.error('lineasNuevas',     lineasNuevas);

        // ── 2. Recorrer sublista nativa: actualizar o marcar para eliminar ────
        const nativeCount     = reg.getLineCount({ sublistId: NATIVE_SUBLIST });
        const indicesToRemove = [];

        for (var j = 0; j < nativeCount; j++) {
            reg.selectLine({ sublistId: NATIVE_SUBLIST, line: j });
            const nativeId = String(reg.getCurrentSublistValue({ sublistId: NATIVE_SUBLIST, fieldId: 'id' }) || '');

            if (lineasExistentes[nativeId]) {
                // La línea sigue en el formulario → actualizar campos
                _setearCamposLinea(reg, lineasExistentes[nativeId]);
                reg.commitLine({ sublistId: NATIVE_SUBLIST });
            } else {
                // La línea fue eliminada en el formulario → marcar para remoción
                indicesToRemove.push(j);
            }
        }

        // ── 3. Eliminar líneas removidas (de última a primera) ────────────────
        for (var k = indicesToRemove.length - 1; k >= 0; k--) {
            reg.removeLine({ sublistId: NATIVE_SUBLIST, line: indicesToRemove[k], ignoreRecalc: true });
        }

        // ── 4. Insertar líneas nuevas ─────────────────────────────────────────
        for (var n = 0; n < lineasNuevas.length; n++) {
            reg.selectNewLine({ sublistId: NATIVE_SUBLIST });
            _setearCamposLinea(reg, lineasNuevas[n]);
            reg.commitLine({ sublistId: NATIVE_SUBLIST });
        }

        nLog.error('_sincronizarSublistaDetalle - fin', {
            actualizadas: Object.keys(lineasExistentes).length,
            eliminadas  : indicesToRemove.length,
            nuevas      : lineasNuevas.length
        });
    }

    /**
     * Setea los campos de la línea activa en la sublista nativa.
     * Se invoca tanto para actualizaciones como para inserciones nuevas.
     *
     * @param {Record} reg   - Registro header en modo dinámico (con línea seleccionada)
     * @param {object} datos - { articulo, unidadId, disponible, ubicacionId, cantidad, departId }
     */
    function _setearCamposLinea(reg, datos) {
        reg.setCurrentSublistValue({ sublistId: NATIVE_SUBLIST, fieldId: 'custrecord_2win_consumo_det_articulo',   value: datos.articulo                      });
        reg.setCurrentSublistValue({ sublistId: NATIVE_SUBLIST, fieldId: 'custrecord_2win_consumo_det_cantidad',   value: parseInt(datos.cantidad,   10) || 1 });
        reg.setCurrentSublistValue({ sublistId: NATIVE_SUBLIST, fieldId: 'custrecord_2win_consumo_det_disponible', value: parseFloat(datos.disponible)  || 0  });

        if (datos.unidadId)    reg.setCurrentSublistValue({ sublistId: NATIVE_SUBLIST, fieldId: 'custrecord_2win_consumo_det_unidad',       value: datos.unidadId    });
        if (datos.ubicacionId) reg.setCurrentSublistValue({ sublistId: NATIVE_SUBLIST, fieldId: 'custrecord_2win_consumo_det_ubicacion',    value: datos.ubicacionId });
        if (datos.departId)    reg.setCurrentSublistValue({ sublistId: NATIVE_SUBLIST, fieldId: 'custrecord_2win_consumo_det_departamento', value: datos.departId    });
    }

    function _autoPopularCreacion(reg) {
        const currentUser = runtime.getCurrentUser();

        reg.setValue({ fieldId: 'custrecord_2win_consumo_solicitante', value: currentUser.id });
        reg.setValue({ fieldId: 'custrecord_2win_consumo_fecha',       value: new Date()     });

        try {
            const empleadoData = search.lookupFields({
                type   : search.Type.EMPLOYEE,
                id     : currentUser.id,
                columns: ['subsidiary']
            });
            if (empleadoData.subsidiary && empleadoData.subsidiary.length > 0) {
                reg.setValue({ fieldId: 'custrecord_2win_consumo_subsidiaria', value: empleadoData.subsidiary[0].value });
            }
        } catch (eSub) {
            nLog.error('GSC_Dao_SolicitudConsumo._autoPopularCreacion - subsidiaria', eSub);
        }

        try {
            const cuentaConsumo = daoConfig.recuperarCuentaConsumo();
            reg.setValue({ fieldId: 'custrecord_2win_consumo_cuenta_consumo', value: cuentaConsumo });
        } catch (eConf) {
            nLog.error('GSC_Dao_SolicitudConsumo._autoPopularCreacion - cuenta consumo', eConf);
        }
    }

    return {
        cargar,
        guardar,
        enviarABodega
    };
});
