/**
 * @NApiVersion 2.1
 * @NModuleScope Public
 *
 * GSC_Dao_SolicitudConsumoDetalle — DAO del registro detalle Solicitud de Consumo.
 *
 * Responsabilidades:
 *  - Buscar las líneas de detalle asociadas a un header (customrecord_2win_solicitud_consumo_det).
 *  - Sincronizar las líneas del POST escribiendo directamente sobre la sublista nativa
 *    recmachcustrecord_2win_consumo_det_ref del header: elimina todas las líneas existentes
 *    y reinserta las enviadas desde el formulario.
 *
 * No contiene lógica de presentación ni de negocio de flujo de trabajo.
 */
define(['N/log', 'N/record', 'N/search'], function (nLog, record, search) {

    const RECORD_TYPE_HEADER  = 'customrecord_2win_solicitud_consumo';
    const RECORD_TYPE_DETALLE = 'customrecord_2win_solicitud_consumo_det';
    const NATIVE_SUBLIST      = 'recmachcustrecord_2win_consumo_det_ref';
    const FORM_SUBLIST        = 'custpage_sublist_detalle';

    /**
     * Busca todas las líneas de detalle de una solicitud de consumo via N/search.
     * Utilizado en los renders GET (view / edit) para poblar la sublista del formulario.
     *
     * @param {string|number} solicitudId - Internal ID del header
     * @returns {object[]}
     */
    function buscarLineas(solicitudId) {
        try {
            nLog.debug('GSC_Dao_SolicitudConsumoDetalle.buscarLineas', { solicitudId: solicitudId });

            const resultados = search.create({
                type   : RECORD_TYPE_DETALLE,
                filters: [['custrecord_2win_consumo_det_ref', 'anyof', solicitudId]],
                columns: [
                    search.createColumn({ name: 'internalid' }),
                    search.createColumn({ name: 'custrecord_2win_consumo_det_articulo' }),
                    search.createColumn({ name: 'custrecord_2win_consumo_det_unidad' }),
                    search.createColumn({ name: 'custrecord_2win_consumo_det_disponible' }),
                    search.createColumn({ name: 'custrecord_2win_consumo_det_cantidad' }),
                    search.createColumn({ name: 'custrecord_2win_consumo_det_departamento' }),
                    search.createColumn({ name: 'custrecord_2win_consumo_det_ubicacion' })
                ]
            }).run().getRange({ start: 0, end: 1000 });

            return resultados.map(function (r) {
                return {
                    internalid                                   : r.getValue('internalid'),
                    custrecord_2win_consumo_det_articulo         : r.getValue('custrecord_2win_consumo_det_articulo'),
                    custrecord_2win_consumo_det_articulo_text    : r.getText('custrecord_2win_consumo_det_articulo'),
                    custrecord_2win_consumo_det_unidad           : r.getValue('custrecord_2win_consumo_det_unidad'),
                    custrecord_2win_consumo_det_unidad_text      : r.getText('custrecord_2win_consumo_det_unidad'),
                    custrecord_2win_consumo_det_disponible       : r.getValue('custrecord_2win_consumo_det_disponible'),
                    custrecord_2win_consumo_det_cantidad         : r.getValue('custrecord_2win_consumo_det_cantidad'),
                    custrecord_2win_consumo_det_departamento     : r.getValue('custrecord_2win_consumo_det_departamento'),
                    custrecord_2win_consumo_det_departamento_text: r.getText('custrecord_2win_consumo_det_departamento'),
                    custrecord_2win_consumo_det_ubicacion        : r.getValue('custrecord_2win_consumo_det_ubicacion')
                };
            });
        } catch (e) {
            nLog.error('GSC_Dao_SolicitudConsumoDetalle.buscarLineas - error', e);
            return [];
        }
    }

    /**
     * Sincroniza las líneas de detalle escribiendo sobre la sublista nativa del header.
     *
     * Algoritmo:
     *  1. Carga el header en modo dinámico.
     *  2. Elimina todas las líneas existentes de la sublista nativa.
     *  3. Lee las líneas del POST desde custpage_sublist_detalle.
     *  4. Agrega cada línea válida (con artículo) a la sublista nativa y guarda el record.
     *
     * @param {ServerRequest} request     - context.request del Suitelet
     * @param {string|number} solicitudId - Internal ID del header ya guardado
     */
    function sincronizarLineas(request, solicitudId) {
        try {
            nLog.debug('GSC_Dao_SolicitudConsumoDetalle.sincronizarLineas', { solicitudId: solicitudId });

            // Parámetros del header como fallback
            const ubicacionHeader = request.parameters.custpage_ubicacion    || '';
            const departHeader    = request.parameters.custpage_departamento  || '';

            // 1. Cargar header en modo dinámico para manipular la sublista nativa
            const reg = record.load({
                type     : RECORD_TYPE_HEADER,
                id       : solicitudId,
                isDynamic: true
            });

            // 2. Eliminar todas las líneas existentes (de la última a la primera)
            const existingCount = reg.getLineCount({ sublistId: NATIVE_SUBLIST });
            for (var j = existingCount - 1; j >= 0; j--) {
                reg.removeLine({ sublistId: NATIVE_SUBLIST, line: j, ignoreRecalc: true });
            }

            // 3. Leer líneas del form y agregar a la sublista nativa
            const lineCount = request.getSublistLineCount({ group: FORM_SUBLIST });

            for (var i = 0; i < lineCount; i++) {
                var articulo    = request.getSublistValue({ group: FORM_SUBLIST, name: 'custpage_det_articulo',    line: i }) || '';
                if (!articulo) continue;

                var cantStr     = request.getSublistValue({ group: FORM_SUBLIST, name: 'custpage_det_cantidad',    line: i }) || '1';
                var unidadId    = request.getSublistValue({ group: FORM_SUBLIST, name: 'custpage_det_unidad_id',   line: i }) || '';
                var dispStr     = request.getSublistValue({ group: FORM_SUBLIST, name: 'custpage_det_disponible',  line: i }) || '0';
                var ubicacionId = request.getSublistValue({ group: FORM_SUBLIST, name: 'custpage_det_ubicacion',   line: i }) || ubicacionHeader;
                var departId    = request.getSublistValue({ group: FORM_SUBLIST, name: 'custpage_det_departamento',line: i }) || departHeader;

                reg.selectNewLine({ sublistId: NATIVE_SUBLIST });

                reg.setCurrentSublistValue({ sublistId: NATIVE_SUBLIST, fieldId: 'custrecord_2win_consumo_det_articulo', value: articulo });
                reg.setCurrentSublistValue({ sublistId: NATIVE_SUBLIST, fieldId: 'custrecord_2win_consumo_det_cantidad', value: parseInt(cantStr, 10) || 1 });
                reg.setCurrentSublistValue({ sublistId: NATIVE_SUBLIST, fieldId: 'custrecord_2win_consumo_det_disponible', value: parseFloat(dispStr) || 0 });

                if (unidadId)    reg.setCurrentSublistValue({ sublistId: NATIVE_SUBLIST, fieldId: 'custrecord_2win_consumo_det_unidad',        value: unidadId    });
                if (ubicacionId) reg.setCurrentSublistValue({ sublistId: NATIVE_SUBLIST, fieldId: 'custrecord_2win_consumo_det_ubicacion',     value: ubicacionId });
                if (departId)    reg.setCurrentSublistValue({ sublistId: NATIVE_SUBLIST, fieldId: 'custrecord_2win_consumo_det_departamento',  value: departId    });

                reg.commitLine({ sublistId: NATIVE_SUBLIST });
            }

            // 4. Guardar el header con las líneas actualizadas
            reg.save({ ignoreMandatoryFields: true });

        } catch (e) {
            nLog.error('GSC_Dao_SolicitudConsumoDetalle.sincronizarLineas - error', e);
            throw e;
        }
    }

    return {
        buscarLineas,
        sincronizarLineas
    };
});
