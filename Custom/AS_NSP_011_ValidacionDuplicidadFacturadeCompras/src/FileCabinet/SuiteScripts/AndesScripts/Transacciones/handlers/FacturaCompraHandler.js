/**
 * @NApiVersion 2.1
 * @NModuleScope SameAccount
 */
define(['N/ui/message', 'N/log', 'N/search'], (message, log, search) => {

    const TIPOS_CUENTA_OBLIGAN_DEPTO_NOTA = [
        'FixedAsset', 'Income', 'COGS', 'Expense', 'OthIncome', 'OthExpense', 'DeferExpense'
    ];

    
    // ─── Funcionalidades beforeLoad ───────────────────────────────────────────

    /**
     * Muestra un aviso de advertencia cuando la factura de compra
     * está totalmente pagada y el usuario intenta editarla.
     *
     * - Banner superior: via addPageInitMessage (nativo, sin JS cliente).
     * - Banner inferior: via clientScriptModulePath — el CS inserta el aviso
     *   justo encima de los botones de guardado inferiores mediante DOM.
     *
     * @param {Object} context - Contexto del evento UserEvent
     */
    const manejarAlertaFacturaPagada = (context) => {
        const { newRecord, type, form, UserEventType} = context;
        if (type !== UserEventType.EDIT) return;

        const statusRef = newRecord.getValue({ fieldId: 'statusRef' });
        log.error('statusRef', statusRef);
        if (statusRef != 'paidInFull') return;

        // ── Banner superior (nativo N/ui/message) ────────────────────────────
        form.addPageInitMessage({
            type: message.Type.ERROR,
            title: '¡Atención! Factura Totalmente Pagada',
            message:
                'Modificar este documento reabrirá la factura y podría generar un doble pago por error. ' +
                'No realizar cambios sin la autorización previa del encargado de Tesorería.'
        });

        // ── Banner inferior (Client Script vía DOM) ──────────────────────────
        // El CS inserta el mismo aviso justo encima de los botones inferiores
        // del formulario, donde también existen controles de guardado.
        //form.clientScriptModulePath = '/SuiteScripts/AndesScripts/Transacciones/AS_FacturaCompra_CS_2.1.js';
    };

    // ─── Funcionalidades validateLine / saveRecord (Client Script) ─────────────

    /**
     * Determina, para una línea de Gastos, qué campos obligatorios faltan según
     * el tipo de cuenta. Devuelve null si no aplica o si está todo completo, o
     * un array con los nombres de los campos faltantes.
     */
    const camposFaltantesGastos = (accountId, departamento, nota) => {
        if (!accountId) return null;

        const resultado = search.lookupFields({
            type: 'account',
            id: accountId,
            columns: ['type']
        });
        const tipoCuenta = resultado.type && resultado.type[0] && resultado.type[0].value;

        if (!TIPOS_CUENTA_OBLIGAN_DEPTO_NOTA.includes(tipoCuenta)) return null;

        const faltantes = [];
        if (!departamento) faltantes.push('Departamento');
        if (!nota) faltantes.push('Nota');

        return faltantes.length ? faltantes : null;
    };

    /**
     * Exige Departamento y Nota en la línea de Gastos (sublist 'expense')
     * cuando la cuenta seleccionada es de un tipo contable sensible
     * (activo fijo, ingresos, COGS, gastos, otros ingresos/gastos, gastos
     * diferidos). Aplica solo al formulario Andes - Boleta de Honorarios
     * (customform 117); el CS es quien filtra por formulario antes de
     * llamar a esta función.
     *
     * @param {Object} context - Contexto validateLine del Client Script
     * @param {Object} dialog - Módulo N/ui/dialog, inyectado por el CS
     *                          (este handler no lo importa directamente
     *                          porque no está soportado server-side)
     * @returns {boolean} false si falta Departamento y/o Nota, true en caso contrario
     */
    const validarLineaGastos = (context, dialog) => {
        const { currentRecord, sublistId } = context;
        if (sublistId !== 'expense') return true;

        const accountId = currentRecord.getCurrentSublistValue({ sublistId: 'expense', fieldId: 'account' });
        const departamento = currentRecord.getCurrentSublistValue({ sublistId: 'expense', fieldId: 'department' });
        const nota = currentRecord.getCurrentSublistValue({ sublistId: 'expense', fieldId: 'memo' });

        const faltantes = camposFaltantesGastos(accountId, departamento, nota);
        if (!faltantes) return true;

        dialog.alert({
            title: 'Campos requeridos',
            message: 'Para el tipo de cuenta seleccionado, son obligatorios en la línea: ' + faltantes.join(', ') + '.'
        });
        return false;
    };

    /**
     * Resguardo para saveRecord: recorre todas las líneas de Gastos ya
     * confirmadas (no solo la que se está editando) y valida lo mismo que
     * validarLineaGastos. Cubre casos que no disparan validateLine (líneas
     * cargadas antes de este cambio, pegado de datos, etc).
     *
     * @param {Object} currentRecord
     * @param {Object} dialog - Módulo N/ui/dialog, inyectado por el CS
     * @returns {boolean} false si alguna línea tiene campos faltantes, true si no
     */
    const validarTodasLasLineasGastos = (currentRecord, dialog) => {
        const cantidad = currentRecord.getLineCount({ sublistId: 'expense' });
        const mensajes = [];

        for (let i = 0; i < cantidad; i++) {
            const accountId = currentRecord.getSublistValue({ sublistId: 'expense', fieldId: 'account', line: i });
            const departamento = currentRecord.getSublistValue({ sublistId: 'expense', fieldId: 'department', line: i });
            const nota = currentRecord.getSublistValue({ sublistId: 'expense', fieldId: 'memo', line: i });

            const faltantes = camposFaltantesGastos(accountId, departamento, nota);
            if (faltantes) {
                mensajes.push(`Línea ${i + 1}: Seleccione un valor para los campos de ${faltantes.join(', ')}.`);
            }
        }

        if (mensajes.length) {
            dialog.alert({
                title: 'Campos requeridos',
                message: mensajes.join('<br>')
            });
            return false;
        }

        return true;
    };


    return {
        manejarAlertaFacturaPagada,
        validarLineaGastos,
        validarTodasLasLineasGastos
    };
});
