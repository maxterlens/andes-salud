/**
 * AS_NSP_026 — Nomina de Pago (generacion con seleccion manual de transacciones)
 * @description Construccion del formulario (N/ui/serverWidget) del Suitelet de
 *              Generacion de Nomina de Pago. Solo arma UI — no ejecuta busquedas ni
 *              crea registros (eso vive en Handler / Service / Repository).
 *
 *              El formulario es uno solo (no hay pantallas separadas). Todos los
 *              campos/botones/sublist se agregan siempre, para que la pantalla nunca
 *              se vea vacia; lo que cambia segun el estado ("listo" = ya se completaron
 *              Banco + Cuenta Banco y el Handler corrio la busqueda de candidatas) es
 *              si Fecha, Descripcion y el checkbox Incluir de la sublist estan
 *              habilitados o en displaytype DISABLED:
 *                - Subsidiaria/Banco/Cuenta Banco: siempre editables. Cuenta Banco se
 *                  puebla en el cliente (fetch, sin refresco) apenas Subsidiaria+Banco
 *                  tienen valor — ver AS_GeneracionNominaPago_CS_2.1.js.
 *                - Fecha/Descripcion/columna Incluir: visibles desde el inicio pero
 *                  deshabilitados hasta que "listo" sea true.
 *                - El unico refresco de pagina que queda ocurre cuando, ademas de
 *                  Subsidiaria y Banco, tambien se completa Cuenta Banco: ahi el
 *                  Client Script navega para que el Handler busque las transacciones
 *                  candidatas y este Form las renderice ya habilitado.
 *                - Marcar Todo / Desmarcar Todo / Generar Nomina de Pago: siempre
 *                  visibles (NetSuite no permite un boton visible-pero-deshabilitado
 *                  en un Suitelet); un click prematuro no hace dano porque la
 *                  validacion real (banco/cuenta/fecha/seleccion) sucede en el
 *                  Handler al hacer POST.
 *
 * @NApiVersion 2.1
 * @NModuleScope Public
 */
define(['N/ui/serverWidget', 'N/ui/message', 'N/record'], (serverWidget, message, record) => {

    const SUBLIST_ID = 'trxlist';
    const CLIENT_SCRIPT_PATH = '../AS_GeneracionNominaPago_CS_2.1.js';

    /**
     * @param {Object} params
     * @param {string} [params.subsidiaria]
     * @param {string} [params.banco]
     * @param {string} [params.cuentaBanco]
     * @param {Array<Object>} [params.cuentasBancarias] - {id, nombre} — opciones para Cuenta Banco
     * @param {string} [params.fecha]
     * @param {string} [params.descripcion]
     * @param {Array<Object>} [params.transacciones] - presente solo cuando ya se buscaron
     *        candidatas (Banco + Cuenta Banco completos) — su sola presencia define "listo"
     * @param {Array<string>} [params.seleccionadas] - ids ya marcados (para re-render tras un error)
     * @param {string} [params.error] - mensaje de error a mostrar arriba del form
     * @returns {serverWidget.Form}
     */
    function buildForm(params) {
        params = params || {};
        const listo = !!params.transacciones;

        const form = serverWidget.createForm({ title: 'Generar Nomina de Pago' });
        form.clientScriptModulePath = CLIENT_SCRIPT_PATH;

        if (params.error) {
            form.addPageInitMessage({
                type: message.Type.ERROR,
                title: 'No se pudo generar la nomina de pago',
                message: params.error
            });
        }

        /* --- Fieldgroup 1: cabecera --------------------------------------- */
        form.addFieldGroup({ id: 'custpage_fg_cabecera', label: '1. Datos de la Nomina' });

        const fldSubsidiaria = form.addField({
            id: 'custpage_subsidiaria',
            type: serverWidget.FieldType.SELECT,
            label: 'Subsidiaria',
            source: record.Type.SUBSIDIARY,
            container: 'custpage_fg_cabecera'
        });
        fldSubsidiaria.isMandatory = true;
        if (params.subsidiaria) fldSubsidiaria.defaultValue = params.subsidiaria;

        const fldBanco = form.addField({
            id: 'custpage_banco',
            type: serverWidget.FieldType.SELECT,
            label: 'Banco',
            source: 'customrecord_2w_codigos_bancos_chile',
            container: 'custpage_fg_cabecera'
        });
        fldBanco.updateBreakType({ breakType : serverWidget.FieldBreakType.STARTCOL });
        fldBanco.isMandatory = true;

        if (params.banco) fldBanco.defaultValue = params.banco;

        // Cuenta Banco NO usa "source": se puebla manualmente (addSelectOption) con el
        // listado ya filtrado por Subsidiaria+Banco que trae el Handler. En el navegador,
        // el Client Script repuebla estas mismas opciones via fetch() cuando cambian
        // Subsidiaria/Banco, sin recargar la pagina.
        const fldCuenta = form.addField({
            id: 'custpage_cuentabanco',
            type: serverWidget.FieldType.SELECT,
            label: 'Cuenta Banco',
            container: 'custpage_fg_cabecera'
        });
        fldCuenta.updateBreakType({ breakType : serverWidget.FieldBreakType.STARTCOL });
        fldCuenta.isMandatory = true;
        
        fldCuenta.addSelectOption({ value: '', text: '' });
        (params.cuentasBancarias || []).forEach((cuenta) => {
            fldCuenta.addSelectOption({ value: cuenta.id, text: cuenta.nombre });
        });
        if (params.cuentaBanco) fldCuenta.defaultValue = params.cuentaBanco;

        /* --- Fieldgroup 2: datos adicionales — siempre presente ----------- */
        form.addFieldGroup({ id: 'custpage_fg_adicional', label: '2. Datos Adicionales' });

        const fldFecha = form.addField({
            id: 'custpage_fecha',
            type: serverWidget.FieldType.DATE,
            label: 'Fecha',
            container: 'custpage_fg_adicional'
        });
        fldFecha.isMandatory = listo;
        if (params.fecha) fldFecha.defaultValue = params.fecha;
        if (!listo) fldFecha.updateDisplayType({ displayType: serverWidget.FieldDisplayType.DISABLED });

        const fldDescripcion = form.addField({
            id: 'custpage_descripcion',
            type: serverWidget.FieldType.TEXTAREA,
            label: 'Descripción',
            container: 'custpage_fg_adicional'
        });
        if (params.descripcion) fldDescripcion.defaultValue = params.descripcion;
        if (!listo) fldDescripcion.updateDisplayType({ displayType: serverWidget.FieldDisplayType.DISABLED });

        const fldTotal = form.addField({
            id: 'custpage_importetotal',
            type: serverWidget.FieldType.CURRENCY,
            label: 'Importe Total a Pagar',
            container: 'custpage_fg_adicional'
        });
        fldTotal.updateDisplayType({ displayType: serverWidget.FieldDisplayType.INLINE });
        fldTotal.defaultValue = '0';

        if (listo && !params.transacciones.length) {
            form.addPageInitMessage({
                type: message.Type.INFORMATION,
                title: 'Sin transacciones pendientes',
                message: 'No se encontraron transacciones pendientes para esta combinacion de Subsidiaria/Banco/Cuenta Banco.'
            });
        }

        /* --- Botones — siempre visibles ------------------------------------ */
        form.addButton({ id: 'custpage_btn_marcartodo', label: 'Marcar Todo', functionName: 'marcarTodo' });
        form.addButton({ id: 'custpage_btn_desmarcartodo', label: 'Desmarcar Todo', functionName: 'desmarcarTodo' });

        /* --- Sublist — siempre presente (vacia hasta que "listo") --------- */
        const sublist = form.addSublist({
            id: SUBLIST_ID,
            type: serverWidget.SublistType.LIST,
            label: '3. Transacciones Pendientes'
        });

        const fldIncluir = sublist.addField({ id: 'custpage_incluir', type: serverWidget.FieldType.CHECKBOX, label: 'Incluir' });
        if (!listo) fldIncluir.updateDisplayType({ displayType: serverWidget.FieldDisplayType.DISABLED });
        sublist.addField({ id: 'custpage_trx_fecha', type: serverWidget.FieldType.TEXT, label: 'Fecha' });
        sublist.addField({ id: 'custpage_trx_entidad', type: serverWidget.FieldType.TEXT, label: 'Entidad' });
        sublist.addField({ id: 'custpage_trx_tipo', type: serverWidget.FieldType.TEXT, label: 'Tipo' });
        sublist.addField({ id: 'custpage_trx_numero', type: serverWidget.FieldType.TEXT, label: 'N Transaccion' });
        sublist.addField({ id: 'custpage_trx_monto', type: serverWidget.FieldType.CURRENCY, label: 'Monto' });
        const fldTrxId = sublist.addField({ id: 'custpage_trx_id', type: serverWidget.FieldType.TEXT, label: 'ID' });
        fldTrxId.updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN });

        if (listo && params.transacciones.length) {
            const seleccionadas = params.seleccionadas || [];
            params.transacciones.forEach((trx, i) => {
                log.error('trx', trx);
                const link = `<a href="/app/accounting/transactions/transaction.nl?id=${trx.id}" target="_blank">${trx.fecha}</a>`;
                log.error('link', link);
                if (trx.id) sublist.setSublistValue({ id: 'custpage_trx_id', line: i, value: String(trx.id) });
                if (link) sublist.setSublistValue({ id: 'custpage_trx_fecha', line: i, value: link });
                if (trx.entidad) sublist.setSublistValue({ id: 'custpage_trx_entidad', line: i, value: trx.entidad || '' });
                if (trx.tipo) sublist.setSublistValue({ id: 'custpage_trx_tipo', line: i, value: trx.tipo || '' });
                if (trx.numero) sublist.setSublistValue({ id: 'custpage_trx_numero', line: i, value: trx.numero || '' });
                if (trx.monto) sublist.setSublistValue({ id: 'custpage_trx_monto', line: i, value: String(trx.monto) });
                if (seleccionadas.indexOf(String(trx.id)) !== -1) {
                    sublist.setSublistValue({ id: 'custpage_incluir', line: i, value: 'T' });
                }
            });
        }

        form.addSubmitButton({ label: 'Generar Nomina de Pago' });

        return form;
    }

    return { buildForm };
});
