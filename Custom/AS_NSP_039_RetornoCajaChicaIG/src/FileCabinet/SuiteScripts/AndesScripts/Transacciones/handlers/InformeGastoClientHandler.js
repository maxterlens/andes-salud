/**
 * @NApiVersion 2.1
 * @NModuleScope SameAccount
 * @file InformeGastoClientHandler.js
 * @description Lógica cliente del informe de gastos — AS_NSP_039 Retorno Caja Chica.
 */
define([], () => {

    const CAMPO_CON_REPOSICION     = 'custbody_2w_as_con_reposicion';
    const CAMPO_ASIENTO_CAJA_CHICA = 'custbody_as_asiento_caja_chica';

    // Anticipo con el que se abrió el informe (para detectar cambios al guardar)
    let anticipoInicial = 0;

    const getAnticipo = (currentRecord) => Number(currentRecord.getValue({ fieldId: 'advance' })) || 0;

    // 'entity': al seleccionar el empleado. 'advance': cuando NetSuite llena (o el usuario cambia) el anticipo.
    const CAMPOS_DISPARADORES = ['entity', 'advance'];

    const bloquearCheck = (currentRecord) => {
        const campo = currentRecord.getField({ fieldId: CAMPO_CON_REPOSICION });
        if (campo) campo.isDisabled = true;
    };

    const sincronizarCheck = (currentRecord) => {
        const anticipo = Number(currentRecord.getValue({ fieldId: 'advance' })) || 0;
        currentRecord.setValue({
            fieldId          : CAMPO_CON_REPOSICION,
            value            : anticipo > 0,
            ignoreFieldChange: true
        });
    };

    function pageInit(scriptContext) {
        bloquearCheck(scriptContext.currentRecord);
        anticipoInicial = getAnticipo(scriptContext.currentRecord);
    }

    /**
     * Si el informe ya tiene asiento de caja chica y cambió el anticipo,
     * avisa que el asiento se modificará o eliminará y pide confirmación.
     */
    function saveRecord(scriptContext) {
        const { currentRecord } = scriptContext;

        const asientoId = currentRecord.getValue({ fieldId: CAMPO_ASIENTO_CAJA_CHICA });
        if (!asientoId) return true;

        const anticipoNuevo = getAnticipo(currentRecord);
        if (anticipoNuevo === anticipoInicial) return true;

        const asiento = currentRecord.getText({ fieldId: CAMPO_ASIENTO_CAJA_CHICA }) || asientoId;
        const formato = (n) => n.toLocaleString('es-CL');

        const mensaje = anticipoNuevo > 0
            ? `Este informe tiene el asiento de caja chica ${asiento}.\n\n` +
              `Se modificará su importe de ${formato(anticipoInicial)} a ${formato(anticipoNuevo)}.\n\n` +
              '¿Desea continuar?'
            : `Este informe tiene el asiento de caja chica ${asiento}.\n\n` +
              'Al quedar sin anticipo a aplicar, el asiento será ELIMINADO.\n\n' +
              '¿Desea continuar?';

        return window.confirm(mensaje);
    }

    function fieldChanged(scriptContext) {
        const { currentRecord, fieldId } = scriptContext;
        if (!CAMPOS_DISPARADORES.includes(fieldId)) return;
        sincronizarCheck(currentRecord);
    }

    return { pageInit, fieldChanged, saveRecord };
});
