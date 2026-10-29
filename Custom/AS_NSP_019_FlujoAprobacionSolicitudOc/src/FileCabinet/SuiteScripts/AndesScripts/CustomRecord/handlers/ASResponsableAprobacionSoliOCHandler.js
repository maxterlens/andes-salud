/**
 * @NApiVersion 2.1
 * @NModuleScope SameAccount
 *
 * Handler de customrecord_as_respon_aprob_soli_oc (AS_NSP_019).
 * Usado por el User Event y por el Client Script del registro.
 *
 * No importa N/ui/serverWidget (solo servidor) ni N/ui/dialog (solo cliente):
 * cada script de entrada inyecta el módulo que corresponde.
 *
 * Funcionalidades:
 *  - agregarCampoDepartamento   (UE beforeLoad)
 *  - repoblarDepartamentos      (CS fieldChanged - Subsidiaria)
 *  - sincronizarDepartamento    (CS fieldChanged - Departamento / saveRecord)
 *  - validarCamposObligatorios  (CS saveRecord)
 *  - validarCombinacionDuplicada (CS saveRecord)
 */
define([
    '../services/DepartamentoService',
    '../repositories/ASResponsableAprobacionSoliOCRepository'
], (DepartamentoService, ASResponsableAprobacionSoliOCRepository) => {

    const CAMPOS = Object.freeze({
        SUBSIDIARIA: 'custrecord_as_resp_apb_sol_oc_subsidiari',
        DEPARTAMENTO: 'custrecord_as_resp_apb_sol_oc_departamen',
        RESPONSABLE: 'custrecord_as_resp_apb_sol_oc_responsabl',
        DEPARTAMENTO_UI: 'custpage_as_departamento',
        INACTIVO: 'isinactive'
    });

    const TITULO_ALERTA = 'Responsable de Aprobación';

    /** Texto de la opción vacía: Departamento vacío = aprobador por defecto de la subsidiaria. */
    const TEXTO_POR_DEFECTO = '— Por defecto (todos los departamentos) —';

    const esVerdadero = (valor) => valor === true || valor === 'T';

    const alertar = (dialog, message) => dialog.alert({ title: TITULO_ALERTA, message });

    // ─────────────────────────────────────────────────────────────────────
    // Servidor (User Event)
    // ─────────────────────────────────────────────────────────────────────

    /**
     * En creación / edición / copia oculta el campo Departamento real y agrega
     * un campo custpage con los departamentos disponibles para la subsidiaria.
     *
     * @param {Object} context      - Contexto beforeLoad del User Event
     * @param {Object} serverWidget - Módulo N/ui/serverWidget
     */
    const agregarCampoDepartamento = (context, serverWidget) => {
        const { form, newRecord, type, UserEventType } = context;

        if (![UserEventType.CREATE, UserEventType.EDIT, UserEventType.COPY].includes(type)) return;
        if (!form) return;

        const campoReal = form.getField({ id: CAMPOS.DEPARTAMENTO });
        if (campoReal) {
            campoReal.updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN });
        }

        const campo = form.addField({
            id: CAMPOS.DEPARTAMENTO_UI,
            type: serverWidget.FieldType.SELECT,
            label: 'Departamento'
        });
        campo.setHelpText({
            help: 'Departamentos disponibles para la subsidiaria seleccionada. ' +
                'Déjelo en "Por defecto" para definir el aprobador de la subsidiaria cuando la ' +
                'solicitud no tenga departamento o su departamento no tenga configuración específica.'
        });

        if (form.getField({ id: CAMPOS.RESPONSABLE })) {
            form.insertField({ field: campo, nextfield: CAMPOS.RESPONSABLE });
        }

        campo.addSelectOption({ value: '', text: TEXTO_POR_DEFECTO });

        const subsidiaria = newRecord.getValue({ fieldId: CAMPOS.SUBSIDIARIA });
        const departamentoActual = String(newRecord.getValue({ fieldId: CAMPOS.DEPARTAMENTO }) || '');

        if (!subsidiaria) return;

        let actualEncontrado = false;

        DepartamentoService.obtenerDepartamentosPorSubsidiaria(subsidiaria).forEach(({ id, nombre }) => {
            const seleccionado = id === departamentoActual;
            if (seleccionado) actualEncontrado = true;
            campo.addSelectOption({ value: id, text: nombre, isSelected: seleccionado });
        });

        // Conserva el valor guardado aunque ya no esté disponible para la
        // subsidiaria (inactivo o desasignado), para no perderlo al editar.
        if (departamentoActual && !actualEncontrado) {
            const texto = newRecord.getText({ fieldId: CAMPOS.DEPARTAMENTO }) || departamentoActual;
            campo.addSelectOption({
                value: departamentoActual,
                text: `${texto} (no disponible para la subsidiaria)`,
                isSelected: true
            });
        }
    };

    // ─────────────────────────────────────────────────────────────────────
    // Cliente (Client Script)
    // ─────────────────────────────────────────────────────────────────────

    /**
     * Repuebla el listado custpage de Departamentos según la Subsidiaria
     * actual y limpia el departamento seleccionado.
     *
     * @param {Object} context - Contexto del Client Script (currentRecord)
     */
    const repoblarDepartamentos = (context) => {
        const { currentRecord } = context;
        const campo = currentRecord.getField({ fieldId: CAMPOS.DEPARTAMENTO_UI });
        if (!campo) return;

        campo.removeSelectOption({ value: null });
        campo.insertSelectOption({ value: '', text: TEXTO_POR_DEFECTO });

        const subsidiaria = currentRecord.getValue({ fieldId: CAMPOS.SUBSIDIARIA });
        if (subsidiaria) {
            DepartamentoService.obtenerDepartamentosPorSubsidiaria(subsidiaria)
                .forEach(({ id, nombre }) => campo.insertSelectOption({ value: id, text: nombre }));
        }

        currentRecord.setValue({ fieldId: CAMPOS.DEPARTAMENTO_UI, value: '', ignoreFieldChange: true });
        currentRecord.setValue({ fieldId: CAMPOS.DEPARTAMENTO, value: '', ignoreFieldChange: true });
    };

    /**
     * Copia el departamento elegido en el campo custpage al campo real.
     *
     * @param {Object} context - Contexto del Client Script (currentRecord)
     */
    const sincronizarDepartamento = (context) => {
        const { currentRecord } = context;
        if (!currentRecord.getField({ fieldId: CAMPOS.DEPARTAMENTO_UI })) return;

        currentRecord.setValue({
            fieldId: CAMPOS.DEPARTAMENTO,
            value: currentRecord.getValue({ fieldId: CAMPOS.DEPARTAMENTO_UI }) || '',
            ignoreFieldChange: true
        });
    };

    /**
     * Valida que Subsidiaria y Responsable estén informados.
     * Departamento es opcional: vacío = aprobador por defecto de la subsidiaria.
     *
     * @param {Object} context - Contexto saveRecord
     * @param {Object} dialog  - Módulo N/ui/dialog
     * @returns {boolean}
     */
    const validarCamposObligatorios = (context, dialog) => {
        const { currentRecord } = context;

        const subsidiaria = currentRecord.getValue({ fieldId: CAMPOS.SUBSIDIARIA });
        const responsable = currentRecord.getValue({ fieldId: CAMPOS.RESPONSABLE });

        if (!subsidiaria) { alertar(dialog, 'Debe seleccionar una Subsidiaria.'); return false; }
        if (!responsable || (Array.isArray(responsable) && !responsable.length)) {
            alertar(dialog, 'Debe seleccionar un Responsable.');
            return false;
        }

        return true;
    };

    /**
     * Valida que no exista otro registro activo con la misma combinación
     * Subsidiaria + Departamento (o otro aprobador por defecto activo para la
     * subsidiaria, si Departamento está vacío). No aplica si el registro está inactivo.
     *
     * @param {Object} context - Contexto saveRecord
     * @param {Object} dialog  - Módulo N/ui/dialog
     * @returns {boolean}
     */
    const validarCombinacionDuplicada = (context, dialog) => {
        const { currentRecord } = context;

        if (esVerdadero(currentRecord.getValue({ fieldId: CAMPOS.INACTIVO }))) return true;

        const departamento = currentRecord.getValue({ fieldId: CAMPOS.DEPARTAMENTO });

        const duplicadoId = ASResponsableAprobacionSoliOCRepository.buscarCombinacionExistente(
            currentRecord.getValue({ fieldId: CAMPOS.SUBSIDIARIA }),
            departamento,
            currentRecord.id || null
        );

        if (duplicadoId) {
            const detalle = departamento
                ? 'Ya existe un registro activo para la misma Subsidiaria y Departamento'
                : 'Ya existe un aprobador por defecto activo para esta Subsidiaria';
            alertar(dialog, `${detalle} (ID interno: ${duplicadoId}). ` +
                'Edite ese registro o inactívelo antes de crear uno nuevo.');
            return false;
        }

        return true;
    };

    return {
        CAMPOS,
        agregarCampoDepartamento,
        repoblarDepartamentos,
        sincronizarDepartamento,
        validarCamposObligatorios,
        validarCombinacionDuplicada
    };
});
