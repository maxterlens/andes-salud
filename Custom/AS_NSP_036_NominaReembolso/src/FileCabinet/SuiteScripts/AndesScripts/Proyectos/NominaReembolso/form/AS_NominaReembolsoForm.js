/**
 * AS_NSP_036 — Nomina de Reembolso al Cliente
 * @description Dibuja la pantalla Generar Nomina de Reembolso. No busca ni
 *              guarda records.
 *
 *              construirFormulario se lee como indice: formulario, cabecera,
 *              datos adicionales, la lista de reembolsos y los botones.
 *
 *              Cuenta Banco no usa source: depende de la Subsidiaria y del
 *              Banco. El form agrega solo las cuentas de la cabecera y la lista
 *              completa viaja en un LONGTEXT oculto en JSON para que el client
 *              script la vuelva a filtrar al cambiar cualquiera de los dos.
 *
 * CHANGELOG v1.1.0 (2026-11-11):
 * - [FEAT] El select Banco toma la lista de CONSTANTES.BANCOS_CHILE.
 *
 * CHANGELOG v1.0.0 (2026-11-10):
 * - [FEAT] Pantalla con cabecera, datos adicionales y reembolsos pendientes.
 *
 * @NApiVersion 2.1
 * @NModuleScope Public
 * @author Andes Salud
 * @version 1.1.0
 *
 */
define(['N/ui/serverWidget', 'N/ui/message', 'N/format', '../constants/AS_NominaReembolsoConstants'],
    (serverWidget, message, format, CONSTANTES) => {

    // ─────────────────────────────────────────────────────────────────────────
    // Principales
    // ─────────────────────────────────────────────────────────────────────────

    function construirFormulario(cabecera, cuentas, reembolsos, marcados, total, alerta) {
        const form = serverWidget.createForm({ title: CONSTANTES.FORMULARIO.TITULO });

        form.clientScriptModulePath = CONSTANTES.FORMULARIO.CLIENT_SCRIPT;
        if (alerta) form.addPageInitMessage({ type: message.Type.ERROR, title: CONSTANTES.FORMULARIO.ALERTA_TITULO, message: alerta });
        if (reembolsos && !reembolsos.length) {
            form.addPageInitMessage({ type: message.Type.INFORMATION, title: CONSTANTES.FORMULARIO.SIN_REEMBOLSOS, message: CONSTANTES.FORMULARIO.SIN_REEMBOLSOS_TEXTO });
        }
        agregarCabecera(form, cabecera, cuentas);
        agregarAdicional(form, cabecera, total);
        agregarReembolsos(form, reembolsos || [], marcados);
        agregarOperacion(form);
        form.addSubmitButton({ label: CONSTANTES.FORMULARIO.BOTON_GENERAR });
        form.addButton({ id: CONSTANTES.BOTONES.MARCAR,    label: CONSTANTES.FORMULARIO.BOTON_MARCAR,    functionName: 'marcarTodo' });
        form.addButton({ id: CONSTANTES.BOTONES.DESMARCAR, label: CONSTANTES.FORMULARIO.BOTON_DESMARCAR, functionName: 'desmarcarTodo' });

        return form;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Secundarias
    // ─────────────────────────────────────────────────────────────────────────

    function agregarCabecera(form, cabecera, cuentas) {
        const grupo = CONSTANTES.GRUPOS.CABECERA;

        form.addFieldGroup({ id: grupo, label: '1. Datos de la Nomina' });

        const campoSubsidiaria = form.addField({
            id       : CONSTANTES.CAMPOS.SUBSIDIARIA,
            type     : serverWidget.FieldType.SELECT,
            label    : 'Subsidiaria',
            source   : 'subsidiary',
            container: grupo,
        });
        campoSubsidiaria.isMandatory  = true;
        campoSubsidiaria.defaultValue = cabecera.subsidiaria || '';
        const campoBanco = form.addField({
            id       : CONSTANTES.CAMPOS.BANCO,
            type     : serverWidget.FieldType.SELECT,
            label    : 'Banco',
            source   : CONSTANTES.BANCOS_CHILE.TIPO,
            container: grupo,
        });
        campoBanco.isMandatory  = true;
        campoBanco.defaultValue = cabecera.banco || '';
        const campoCuentaBanco = form.addField({
            id       : CONSTANTES.CAMPOS.CUENTA_BANCO,
            type     : serverWidget.FieldType.SELECT,
            label    : 'Cuenta Banco',
            container: grupo,
        });
        campoCuentaBanco.isMandatory = true;
        campoCuentaBanco.addSelectOption({ value: '', text: '' });
        cuentas.forEach((cuenta) => {
            if (cuenta.subsidiaria !== cabecera.subsidiaria || cuenta.banco !== cabecera.banco) return;
            campoCuentaBanco.addSelectOption({ value: cuenta.id, text: cuenta.nombre });
        });
        campoCuentaBanco.defaultValue = cabecera.cuentaBanco || '';
        const campoCuentasData = form.addField({
            id   : CONSTANTES.CAMPOS.CUENTAS_DATA,
            type : serverWidget.FieldType.LONGTEXT,
            label: 'Cuentas',
        });
        campoCuentasData.defaultValue = JSON.stringify(cuentas);
        campoCuentasData.updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN });
    }

    /**
     * El total llega con lo que ya venia marcado (al volver con un error) y el
     * client script lo recalcula con cada marca.
     */
    function agregarAdicional(form, cabecera, total) {
        const grupo = CONSTANTES.GRUPOS.ADICIONAL;

        form.addFieldGroup({ id: grupo, label: '2. Datos Adicionales' });

        const campoFecha = form.addField({
            id       : CONSTANTES.CAMPOS.FECHA,
            type     : serverWidget.FieldType.DATE,
            label    : 'Fecha',
            container: grupo,
        });
        campoFecha.isMandatory  = true;
        campoFecha.defaultValue = cabecera.fecha || format.format({ value: new Date(), type: format.Type.DATE });
        const campoDescripcion = form.addField({
            id       : CONSTANTES.CAMPOS.DESCRIPCION,
            type     : serverWidget.FieldType.TEXTAREA,
            label    : 'Descripcion',
            container: grupo,
        });
        campoDescripcion.defaultValue = cabecera.descripcion || '';
        const campoTotal = form.addField({
            id       : CONSTANTES.CAMPOS.TOTAL,
            type     : serverWidget.FieldType.CURRENCY,
            label    : 'Importe Total a Pagar',
            container: grupo,
        });
        campoTotal.defaultValue = String(total);
        campoTotal.updateDisplayType({ displayType: serverWidget.FieldDisplayType.INLINE });
    }

    /**
     * La fecha va como enlace al reembolso, para revisarlo sin salir de la
     * pantalla. NetSuite no acepta un valor vacio en setSublistValue: el
     * cliente se escribe solo si el reembolso lo tiene.
     */
    function agregarReembolsos(form, reembolsos, marcados) {
        const columnas = CONSTANTES.SUBLISTA.COLUMNAS;

        const sublista = form.addSublist({
            id   : CONSTANTES.SUBLISTA.ID,
            type : serverWidget.SublistType.LIST,
            label: CONSTANTES.SUBLISTA.LABEL + ' (' + reembolsos.length + ')',
        });
        sublista.addField({ id: columnas.INCLUIR, type: serverWidget.FieldType.CHECKBOX, label: 'Incluir' });
        sublista.addField({ id: columnas.FECHA,   type: serverWidget.FieldType.TEXT,     label: 'Fecha' });
        sublista.addField({ id: columnas.CLIENTE, type: serverWidget.FieldType.TEXT,     label: 'Cliente' });
        sublista.addField({ id: columnas.NUMERO,  type: serverWidget.FieldType.TEXT,     label: 'N Transaccion' });
        sublista.addField({ id: columnas.MONTO,   type: serverWidget.FieldType.CURRENCY, label: 'Monto' });
        sublista.addField({ id: columnas.ID,      type: serverWidget.FieldType.TEXT,     label: 'Id' })
            .updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN });

        reembolsos.forEach((reembolso, fila) => {
            sublista.setSublistValue({ id: columnas.ID,     line: fila, value: reembolso.id });
            sublista.setSublistValue({ id: columnas.FECHA,  line: fila, value: '<a href="/app/accounting/transactions/transaction.nl?id=' + reembolso.id + '" target="_blank">' + reembolso.fecha + '</a>' });
            sublista.setSublistValue({ id: columnas.NUMERO, line: fila, value: reembolso.numero });
            sublista.setSublistValue({ id: columnas.MONTO,  line: fila, value: String(reembolso.monto) });
            if (reembolso.cliente) sublista.setSublistValue({ id: columnas.CLIENTE, line: fila, value: reembolso.cliente });
            if (marcados.indexOf(reembolso.id) >= 0) sublista.setSublistValue({ id: columnas.INCLUIR, line: fila, value: 'T' });
        });
    }

    /**
     * El boton Generar envia con la operacion por defecto; al elegir la Cuenta
     * Banco el client script la cambia a buscar y envia el formulario.
     */
    function agregarOperacion(form) {
        const campoOperacion = form.addField({
            id   : CONSTANTES.CAMPOS.OPERACION,
            type : serverWidget.FieldType.TEXT,
            label: 'Operacion',
        });
        campoOperacion.defaultValue = CONSTANTES.OPERACIONES.GENERAR;
        campoOperacion.updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN });
    }

    return {
        construirFormulario: construirFormulario,
    };
});
