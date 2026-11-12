/**
 * AS_NSP_036 — Nomina de Reembolso al Cliente
 * @description Lo que se agrega a la vista nativa de la nomina
 *              (customrecord_as_nom_reemb): la ficha Detalle con los
 *              reembolsos, con las columnas de la grilla del Suitelet, y el
 *              boton Descargar TXT con el client script que lo atiende. La
 *              ficha Detalle es la de AS_NSP_018.
 *
 * CHANGELOG v1.2.0 (2026-11-12):
 * - [FEAT] Oculta Inactivo: inactivar la nomina no libera sus reembolsos.
 *
 * CHANGELOG v1.1.0 (2026-11-11):
 * - [FEAT] ajustarVista y la ficha Detalle con los reembolsos.
 *
 * CHANGELOG v1.0.0 (2026-11-11):
 * - [FEAT] agregarBotonTxt.
 *
 * @NApiVersion 2.1
 * @NModuleScope Public
 * @author Andes Salud
 * @version 1.2.0
 *
 */
define(['N/ui/serverWidget', '../constants/AS_NominaReembolsoConstants'],
    (serverWidget, CONSTANTES) => {

    // ─────────────────────────────────────────────────────────────────────────
    // Principales
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Inactivo se oculta: inactivar la nomina no libera sus reembolsos (el
     * detalle sigue), asi que no sirve para anularla.
     */
    function ajustarVista(form, reembolsos) {
        form.getField({ id: 'isinactive' }).updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN });
        agregarDetalle(form, reembolsos);
        agregarBotonTxt(form);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Secundarias
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Las columnas de la grilla del Suitelet, sin el check. La fecha va como
     * enlace al reembolso. NetSuite no acepta un valor vacio en
     * setSublistValue: el cliente se escribe solo si el reembolso lo tiene.
     *
     * La ficha va primera, antes de la que NetSuite tenga primero (hoy Flujo
     * de trabajo). No se fija por id como el 018 con 'notes': la nomina no
     * muestra Notas (shownotes F) y un nexttab que no existe da "Error
     * inesperado" al abrir el registro.
     */
    function agregarDetalle(form, reembolsos) {
        const columnas = CONSTANTES.SUBLISTA.COLUMNAS;

        const primeraFicha = form.getTabs()[0];
        const tab          = form.addTab({ id: CONSTANTES.VISTA.TAB, label: CONSTANTES.VISTA.TAB_LABEL });
        if (primeraFicha) form.insertTab({ tab: tab, nexttab: primeraFicha });

        const sublista = form.addSublist({
            id   : CONSTANTES.VISTA.SUBLISTA,
            type : serverWidget.SublistType.STATICLIST,
            label: CONSTANTES.VISTA.LABEL + ' (' + reembolsos.length + ')',
            tab  : CONSTANTES.VISTA.TAB,
        });
        sublista.addField({ id: columnas.FECHA,   type: serverWidget.FieldType.TEXT,     label: 'Fecha' });
        sublista.addField({ id: columnas.CLIENTE, type: serverWidget.FieldType.TEXT,     label: 'Cliente' });
        sublista.addField({ id: columnas.NUMERO,  type: serverWidget.FieldType.TEXT,     label: 'N Transaccion' });
        sublista.addField({ id: columnas.MONTO,   type: serverWidget.FieldType.CURRENCY, label: 'Monto' });

        reembolsos.forEach((reembolso, fila) => {
            sublista.setSublistValue({ id: columnas.FECHA,  line: fila, value: '<a href="/app/accounting/transactions/transaction.nl?id=' + reembolso.id + '" target="_blank">' + reembolso.fecha + '</a>' });
            sublista.setSublistValue({ id: columnas.NUMERO, line: fila, value: reembolso.numero });
            sublista.setSublistValue({ id: columnas.MONTO,  line: fila, value: String(reembolso.monto) });
            if (reembolso.cliente) sublista.setSublistValue({ id: columnas.CLIENTE, line: fila, value: reembolso.cliente });
        });
    }

    function agregarBotonTxt(form) {
        form.clientScriptModulePath = CONSTANTES.FORMULARIO.CLIENT_SCRIPT;
        form.addButton({
            id          : CONSTANTES.BOTONES.TXT,
            label       : CONSTANTES.BOTONES.TXT_LABEL,
            functionName: 'descargarTxt',
        });
    }

    return {
        ajustarVista: ajustarVista,
    };
});
