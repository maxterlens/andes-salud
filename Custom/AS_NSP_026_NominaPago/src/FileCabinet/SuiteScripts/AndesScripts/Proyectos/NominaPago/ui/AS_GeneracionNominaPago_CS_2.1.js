/**
 * AS_NSP_026 — Nomina de Pago (generacion con seleccion manual de transacciones)
 * @description Client Script adjunto al formulario del Suitelet de Generacion de
 *              Nomina de Pago.
 *
 *              - Cuenta Banco se puebla en el cliente, sin recargar la pagina: apenas
 *                Subsidiaria Y Banco tienen ambos un valor, se hace un fetch() al mismo
 *                Suitelet (parametro custpage_ajax=cuentasbancarias) que responde solo
 *                JSON (ver GeneracionNominaPagoHandler.handleGet) con las cuentas cuyo
 *                custrecord_2w_acc_banco = Banco y custrecord_2w_empresa_de_cuenta_banco
 *                = Subsidiaria. Las opciones del select se repueblan con
 *                field.removeSelectOption/insertSelectOption.
 *              - Auto-refresco (el unico que queda en todo el flujo): al completar
 *                ademas Cuenta Banco, navega al mismo Suitelet pasando los 3 valores
 *                como parametro GET, lo que hace que el Handler busque las
 *                transacciones candidatas y el Form habilite Fecha/Descripcion/checkbox
 *                Incluir y muestre la sublist ya cargada.
 *              - La sublist de transacciones (form.addSublist, tipo LIST) permite
 *                que el checkbox de cada fila sea interactivo aunque el resto de
 *                columnas sean solo de lectura — por eso el checkbox SI dispara
 *                fieldChanged con sublistId/line, a diferencia del caso de
 *                AS_NSP_005 (que usaba un bloque HTML embebido, no una sublist nativa).
 *
 * @NApiVersion 2.1
 * @NScriptType ClientScript
 * @NModuleScope Public
 */
define(['N/url', 'N/currentRecord', 'N/runtime'], (url, currentRecord, runtime) => {

    // TODO: completar con el scriptid/deploymentid reales una vez creado el
    // script record + deployment del Suitelet en NetSuite.
    const SCRIPT_ID     = 'customscript_as_gen_nomina_pago_sl';
    const DEPLOYMENT_ID = 'customdeploy_as_gen_nomina_pago_sl';
    const SUBLIST_ID     = 'trxlist';

    /* --------------------------------------------------------------------- */
    function pageInit(scriptContext) {
        // No requiere inicializacion adicional: los valores por defecto y la
        // sublist ya vienen armados desde el Handler/Form.
    }

    /* --------------------------------------------------------------------- */
    function fieldChanged(scriptContext) {
        const rec = scriptContext.currentRecord;
        const fieldId = scriptContext.fieldId;

        if (!scriptContext.sublistId) {
            // Subsidiaria/Banco: repuebla Cuenta Banco en el cliente (sin refresco).
            if (fieldId === 'custpage_subsidiaria' || fieldId === 'custpage_banco') {
                actualizarCuentasBancarias(rec);
                return;
            }
            // Cuenta Banco: si con esto ya estan los 3 campos completos, recien ahi refresca.
            if (fieldId === 'custpage_cuentabanco') {
                intentarAutoRefresco(rec);
                return;
            }
        }

        // Recalculo del total al marcar/desmarcar una fila de la sublist.
        if (scriptContext.sublistId === SUBLIST_ID && fieldId === 'custpage_incluir') {
            recalcularTotal(rec);
        }
    }

    /* --------------------------------------------------------------------- */
    /*  Cuenta Banco — poblado client-side via fetch(), sin recargar pagina. */
    /*  Solo se ejecuta la consulta cuando Subsidiaria Y Banco estan ambos   */
    /*  completos; si falta alguno, simplemente se limpian las opciones.     */
    /* --------------------------------------------------------------------- */
    function actualizarCuentasBancarias(rec) {
        const subsidiaria = rec.getValue({ fieldId: 'custpage_subsidiaria' });
        const banco = rec.getValue({ fieldId: 'custpage_banco' });

        const fldCuenta = rec.getField({ fieldId: 'custpage_cuentabanco' });
        fldCuenta.removeSelectOption({ value: null });
        fldCuenta.insertSelectOption({ value: '', text: '', isSelected: true });
        rec.setValue({ fieldId: 'custpage_cuentabanco', value: '', ignoreFieldChange: true });

        if (!subsidiaria || !banco) return;

        const endpoint = 'https://' + getHostDomain() + url.resolveScript({
            scriptId    : SCRIPT_ID,
            deploymentId: DEPLOYMENT_ID,
            params      : {
                custpage_ajax       : 'cuentasbancarias',
                custpage_subsidiaria: subsidiaria,
                custpage_banco      : banco
            }
        });

        fetch(endpoint, { method: 'GET', headers: { 'Content-Type': 'application/json' } })
            .then((response) => response.json())
            .then((cuentas) => {
                (cuentas || []).forEach((cuenta) => {
                    fldCuenta.insertSelectOption({ value: cuenta.id, text: cuenta.nombre, isSelected: false });
                });
            })
            .catch((e) => {
                console.error('No se pudo obtener el listado de cuentas bancarias', e);
            });

            
    }

    /* --------------------------------------------------------------------- */
    function intentarAutoRefresco(rec) {
        const subsidiaria = rec.getValue({ fieldId: 'custpage_subsidiaria' });
        const banco = rec.getValue({ fieldId: 'custpage_banco' });
        const cuentaBanco = rec.getValue({ fieldId: 'custpage_cuentabanco' });

        if (subsidiaria && banco && cuentaBanco) {
            window.location.href = url.resolveScript({
                scriptId    : SCRIPT_ID,
                deploymentId: DEPLOYMENT_ID,
                params      : {
                    custpage_subsidiaria: subsidiaria,
                    custpage_banco      : banco,
                    custpage_cuentabanco: cuentaBanco
                }
            });
        }
    }

    /* --------------------------------------------------------------------- */
    function recalcularTotal(rec) {
        const lineCount = rec.getLineCount({ sublistId: SUBLIST_ID });
        let total = 0;
        for (let i = 0; i < lineCount; i++) {
            const incluida = rec.getSublistValue({ sublistId: SUBLIST_ID, fieldId: 'custpage_incluir', line: i });
            if (incluida === true || incluida === 'T') {
                total += parseFloat(rec.getSublistValue({ sublistId: SUBLIST_ID, fieldId: 'custpage_trx_monto', line: i })) || 0;
            }
        }
        rec.setValue({ fieldId: 'custpage_importetotal', value: total });
    }

    /* --------------------------------------------------------------------- */
    /*  Botones "Marcar Todo" / "Desmarcar Todo"                             */
    /* --------------------------------------------------------------------- */
    function marcarTodo() {
        aplicarATodasLasLineas(true);
    }

    function desmarcarTodo() {
        aplicarATodasLasLineas(false);
    }

    function aplicarATodasLasLineas(valor) {
        const rec = currentRecord.get();
        const lineCount = rec.getLineCount({ sublistId: SUBLIST_ID });
        for (let i = 0; i < lineCount; i++) {
            rec.selectLine({ sublistId: SUBLIST_ID, line: i });
            rec.setCurrentSublistValue({ sublistId: SUBLIST_ID, fieldId: 'custpage_incluir', value: valor });
            rec.commitLine({ sublistId: SUBLIST_ID });
        }
        recalcularTotal(rec);
    }

    /* --------------------------------------------------------------------- */
    /*  Validacion antes de enviar: al menos una transaccion marcada.        */
    /*  Duplica, del lado del cliente, la misma validacion que hace el       */
    /*  Handler en el servidor (ver GeneracionNominaPagoHandler.handlePost). */
    /*  Los botones ahora estan siempre visibles, asi que un click prematuro */
    /*  (sin transacciones cargadas todavia) simplemente no encuentra filas  */
    /*  marcadas y se bloquea aca — la validacion de Banco/Cuenta/Fecha la   */
    /*  hace igual el Handler al recibir el POST.                           */
    /* --------------------------------------------------------------------- */
    function saveRecord(scriptContext) {
        const rec = scriptContext.currentRecord;
        const lineCount = rec.getLineCount({ sublistId: SUBLIST_ID });

        if (lineCount === 0) {
            alert('No hay transacciones pendientes cargadas. Complete Subsidiaria, Banco y Cuenta Banco primero.');
            return false;
        }

        let algunaSeleccionada = false;
        for (let i = 0; i < lineCount; i++) {
            const incluida = rec.getSublistValue({ sublistId: SUBLIST_ID, fieldId: 'custpage_incluir', line: i });
            if (incluida === true || incluida === 'T') {
                algunaSeleccionada = true;
                break;
            }
        }

        if (!algunaSeleccionada) {
            alert('Debe seleccionar al menos una transaccion para generar la nomina de pago.');
            return false;
        }

        return true;
    }

    function getHostDomain() {
        return host = url.resolveDomain({
            hostType: url.HostType.APPLICATION,
            accountId: runtime.accountId
        });
    }

    return {
        pageInit,
        fieldChanged,
        marcarTodo,
        desmarcarTodo,
        saveRecord
    };
});
