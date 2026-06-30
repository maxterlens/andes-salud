/**
 * @NApiVersion 2.1
 * @NModuleScope SameAccount
 *
 * Handler de eventos para el record Empleado.
 * Contiene la lógica de los eventos beforeLoad, beforeSubmit y afterSubmit
 * del UserEventScript AS_Empleado_UE_2.1.js.
 */
define([
    'N/ui/serverWidget',
    'N/log',
    '../services/EmpleadoService'
], (serverWidget, log, EmpleadoService) => {

    const FIELD_NIVEL_APROBACION = 'custentity_as_nivel_aprobacion';
    const FIELD_ISINACTIVE       = 'isinactive';

    const SUBLIST_ID        = 'custpage_as_sublst_niveles_aprob';
    const COL_SUBSIDIARIA   = 'custpage_as_col_subsidiaria';
    const COL_SUBSIDIARIA_ID = 'custpage_as_col_sub_id';
    const COL_GRUPO         = 'custpage_as_col_grupo_aprob';

    // ─────────────────────────────────────────────────────────────────────────
    // beforeLoad
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Agrega la sublista de niveles de aprobación por subsidiaria al formulario
     * del empleado. En modo VIEW es de solo lectura; en CREATE/EDIT es editable.
     *
     * @param {Object} context
     * @param {N/ui/serverWidget.Form} context.form
     * @param {N/record.Record}        context.newRecord
     * @param {string}                 context.type
     */
    const renderizarSublistaDeNivelesAprobacion = (context) => {
        try {
            const { form, newRecord, type, UserEventType } = context;

            if (type === UserEventType.DELETE) return;

            const esEditable = type === UserEventType.CREATE || type === UserEventType.EDIT;

            // ── 1. Crear sublista ────────────────────────────────────────────
            const sublist = form.addSublist({
                id:    SUBLIST_ID,
                type:  esEditable ? serverWidget.SublistType.INLINEEDITOR : serverWidget.SublistType.LIST,
                label: 'Niveles de Aprobación OC por Subsidiaria',
                tab: 'custom'
            });

            // ── 2. Columnas ──────────────────────────────────────────────────
            const colSubsidiaria = sublist.addField({
                id:    COL_SUBSIDIARIA,
                type:  serverWidget.FieldType.TEXT,
                label: 'Subsidiaria'
            });
            colSubsidiaria.updateDisplayType({
                displayType: serverWidget.FieldDisplayType.DISABLED
            });

            const colSubsidiariaId = sublist.addField({
                id:    COL_SUBSIDIARIA_ID,
                type:  serverWidget.FieldType.TEXT,
                label: 'ID Subsidiaria'
            });
            colSubsidiariaId.updateDisplayType({
                displayType: serverWidget.FieldDisplayType.HIDDEN
            });

            const colGrupo = sublist.addField({
                id:    COL_GRUPO,
                type:  serverWidget.FieldType.SELECT,
                label: 'Nivel de Aprobación'
            });

            if (!esEditable) {
                colGrupo.updateDisplayType({
                    displayType: serverWidget.FieldDisplayType.DISABLED
                });
            }

            // ── 3. Obtener estructura de niveles ─────────────────────────────
            const estructura = EmpleadoService.obtenerEstructuraNivelesPorSubsidiaria();

            // Opción vacía + opciones del customlist
            colGrupo.addSelectOption({ value: '', text: '' });
            for (const opt of estructura.grupoOptions) {
                colGrupo.addSelectOption({ value: opt.id, text: opt.text });
            }

            // ── 4. Niveles actuales del empleado (para pre-poblar) ───────────
            const nivelesActuales = newRecord.getValue({ fieldId: FIELD_NIVEL_APROBACION }) || [];

            // Mapa nivelRecordId → {subsidiariaId, grupoId}
            const nivelIdASubsidiariaGrupo = {};
            for (const sub of estructura.subsidiarias) {
                for (const [grupoId, nivelRecordId] of Object.entries(sub.nivelIdPorGrupo)) {
                    nivelIdASubsidiariaGrupo[String(nivelRecordId)] = { subsidiariaId: sub.id, grupoId };
                }
            }

            // Mapa subsidiariaId → grupoId seleccionado actualmente
            const subsidiariaAGrupoSeleccionado = {};
            for (const nivelId of nivelesActuales) {
                const entrada = nivelIdASubsidiariaGrupo[String(nivelId)];
                if (entrada) subsidiariaAGrupoSeleccionado[entrada.subsidiariaId] = entrada.grupoId;
            }

            // ── 5. Poblar filas (una por subsidiaria activa, ordenadas por nombre) ─
            const subsidiariasOrdenadas = estructura.subsidiarias
                .slice()
                .sort((a, b) => a.text.localeCompare(b.text, undefined, { sensitivity: 'base' }));

            subsidiariasOrdenadas.forEach((sub, i) => {
                sublist.setSublistValue({ id: COL_SUBSIDIARIA,    line: i, value: sub.text });
                sublist.setSublistValue({ id: COL_SUBSIDIARIA_ID, line: i, value: String(sub.id) });
                if (subsidiariaAGrupoSeleccionado[sub.id]) {
                    sublist.setSublistValue({
                        id:    COL_GRUPO,
                        line:  i,
                        value: subsidiariaAGrupoSeleccionado[sub.id] || ''
                    });
                }
            });

        } catch (e) {
            log.error({
                title: 'EmpleadoHandler.renderizarSublistaDeNivelesAprobacion',
                details: JSON.stringify({ message: e.message, stack: e.stack })
            });
        }
    };

    // ─────────────────────────────────────────────────────────────────────────
    // beforeSubmit
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Lee la sublista de niveles por subsidiaria, resuelve los IDs de
     * customrecord_as_niveles_aprobacion y actualiza custentity_as_nivel_aprobacion
     * en el record antes de guardar.
     *
     * Si el empleado está siendo inactivado, limpia el campo en lugar de
     * procesar la sublista.
     *
     * @param {Object} context
     * @param {N/record.Record} context.newRecord
     * @param {N/record.Record} context.oldRecord
     * @param {string}          context.type
     */
    const procesarNivelesAprobacionAntesDeGuardar = (context) => {
        try {
            const { newRecord, oldRecord, type, UserEventType } = context;

            if (type === UserEventType.DELETE) return;

            // ── Caso inactivación: limpiar campo ─────────────────────────────
            const esInactivo = newRecord.getValue({ fieldId: FIELD_ISINACTIVE }) === true;
            const seEstaInactivando =
                type === UserEventType.CREATE || type === UserEventType.COPY
                    ? esInactivo
                    : esInactivo && oldRecord.getValue({ fieldId: FIELD_ISINACTIVE }) === false;

            if (seEstaInactivando) {
                newRecord.setValue({ fieldId: FIELD_NIVEL_APROBACION, value: [] });
                log.debug({
                    title: 'EmpleadoHandler.procesarNivelesAprobacionAntesDeGuardar',
                    details: `Empleado ${newRecord.id} inactivado. Campo ${FIELD_NIVEL_APROBACION} limpiado.`
                });
                return;
            }

            // ── Caso normal: leer sublista y resolver IDs ────────────────────
            const lineCount = newRecord.getLineCount({ sublistId: SUBLIST_ID });
            const selecciones = [];

            for (let i = 0; i < lineCount; i++) {
                const subsidiariaId = newRecord.getSublistValue({
                    sublistId: SUBLIST_ID, fieldId: COL_SUBSIDIARIA_ID, line: i
                });
                const grupoId = newRecord.getSublistValue({
                    sublistId: SUBLIST_ID, fieldId: COL_GRUPO, line: i
                });

                if (subsidiariaId && grupoId) {
                    selecciones.push({ subsidiariaId, grupoId });
                }
            }

            const nuevosNivelIds = EmpleadoService.resolverNivelIdsPorSelecciones(selecciones);
            newRecord.setValue({ fieldId: FIELD_NIVEL_APROBACION, value: nuevosNivelIds });

        } catch (e) {
            log.error({
                title: 'EmpleadoHandler.procesarNivelesAprobacionAntesDeGuardar',
                details: JSON.stringify({ message: e.message, stack: e.stack })
            });
            throw e;
        }
    };

    // ─────────────────────────────────────────────────────────────────────────
    // afterSubmit
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Compara el estado anterior y nuevo de custentity_as_nivel_aprobacion y
     * actualiza custrecord_as_nivel_aprb_aprobadores en los registros de nivel
     * que hayan cambiado (add/remove del empleado).
     *
     * @param {Object} context
     * @param {N/record.Record} context.newRecord
     * @param {N/record.Record} context.oldRecord
     * @param {string}          context.type
     */
    const sincronizarAprobadoresEnNivelesAprobacion = (context) => {
        try {
            const { newRecord, oldRecord, type, UserEventType } = context;

            if (type === UserEventType.DELETE) return;

            const nuevosIds     = (newRecord.getValue({ fieldId: FIELD_NIVEL_APROBACION }) || []).map(String);
            const anterioresIds = (oldRecord ? oldRecord.getValue({ fieldId: FIELD_NIVEL_APROBACION }) || [] : []).map(String);

            const mismoContenido =
                nuevosIds.slice().sort().join(',') === anterioresIds.slice().sort().join(',');

            if (mismoContenido) return;

            EmpleadoService.actualizarAprobadoresPorCambioDeNiveles(newRecord.id, anterioresIds, nuevosIds);

        } catch (e) {
            log.error({
                title: 'EmpleadoHandler.sincronizarAprobadoresEnNivelesAprobacion',
                details: JSON.stringify({ message: e.message, stack: e.stack })
            });
            throw e;
        }
    };

    return {
        renderizarSublistaDeNivelesAprobacion,
        procesarNivelesAprobacionAntesDeGuardar,
        sincronizarAprobadoresEnNivelesAprobacion
    };
});
