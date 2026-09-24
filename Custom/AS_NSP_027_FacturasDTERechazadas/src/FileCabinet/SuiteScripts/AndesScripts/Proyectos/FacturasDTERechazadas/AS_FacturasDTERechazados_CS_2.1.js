/**
 * AS_NSP_027 — Facturas DTE Rechazadas
 * @description Los filtros se aplican al cambiar desplegables o fechas y luego
 *              de una pausa al escribir texto. Buscar permite aplicar al instante;
 *              Limpiar filtros vuelve a la bandeja completa.
 *
 *              El boton Buscar la referencia por nombre via form.addButton({
 *              functionName: 'buscarConFiltrosActuales' }): asi es como
 *              NetSuite espera que funcione un boton de Suitelet cuando el
 *              formulario ya tiene un Client Script propio (form.clientScriptModulePath)
 *              -busca la funcion por ese nombre entre los exports de este archivo,
 *              no ejecuta un string de codigo suelto-. Pasarle un bloque de codigo
 *              como si fuera el nombre de una funcion se probo primero y no hace
 *              nada: NetSuite no encuentra ninguna funcion con ese "nombre" y no
 *              tira error visible.
 *
 *              Los campos se leen con nlapiGetFieldValue: es la API que NetSuite
 *              garantiza que devuelve el valor real sin importar el tipo de campo
 *              (un SELECT no siempre expone su valor igual que un TEXT en el DOM).
 *              document.getElementById(...).value queda solo de respaldo por si esa
 *              funcion global no estuviera cargada en la pagina.
 *
 *              Solo se adjunta a este Suitelet via form.clientScriptModulePath
 *              (ui/AS_FacturasDTERechazadasBandejaForm.js): no tiene scriptdeployment
 *              propio ni aparece en Objects/.
 * @NApiVersion 2.1
 * @NScriptType ClientScript
 * @NModuleScope Public
 */
define(['N/format', 'N/ui/message'],
    (format, message) => {

    const ESPERA_MS = 800;
    const FILTROS_TEXTO = ['custpage_folio', 'custpage_rut_emisor', 'custpage_codigo_error'];
    const FILTROS_CAMBIO = ['custpage_seguimiento', 'custpage_subsidiaria', 'custpage_fecha_desde', 'custpage_fecha_hasta'];

    let temporizadorFiltro = null;
    let avisoRangoFechas = null;

    function pageInit(context) {
        FILTROS_TEXTO.forEach((id) => {
            const campo = document.getElementById(id);
            if (campo) {
                campo.addEventListener('input', programarBusqueda);
            }
        });
    }

    function programarBusqueda() {
        if (temporizadorFiltro) {
            clearTimeout(temporizadorFiltro);
        }

        temporizadorFiltro = setTimeout(aplicarBusqueda, ESPERA_MS);
    }

    function aplicarBusqueda() {
        if (temporizadorFiltro) {
            clearTimeout(temporizadorFiltro);
            temporizadorFiltro = null;
        }

        if (!validarRangoFechas()) {
            mostrarAvisoRangoFechas();
            return;
        }

        navegarSinAlerta(construirUrlBusqueda());
    }

    function validarRangoFechas() {
        const valorDesde = leerValorCampo('custpage_fecha_desde');
        const valorHasta = leerValorCampo('custpage_fecha_hasta');
        if (!valorDesde || !valorHasta) {
            return true;
        }

        const fechaDesde = format.parse({ value: valorDesde, type: format.Type.DATE });
        const fechaHasta = format.parse({ value: valorHasta, type: format.Type.DATE });
        return !(fechaDesde instanceof Date && fechaHasta instanceof Date && fechaDesde > fechaHasta);
    }

    function leerValorCampo(id) {
        const campo = document.getElementById(id);
        if (campo && FILTROS_TEXTO.includes(id)) {
            return campo.value || '';
        }

        if (typeof nlapiGetFieldValue === 'function') {
            return nlapiGetFieldValue(id) || '';
        }

        return campo ? campo.value : '';
    }

    function mostrarAvisoRangoFechas() {
        if (avisoRangoFechas) {
            return;
        }

        avisoRangoFechas = message.create({
            title  : 'Rango de fechas',
            message: 'Rechazo desde debe ser igual o anterior a Rechazo hasta. Corrige las fechas para buscar.',
            type   : message.Type.WARNING,
        });
        avisoRangoFechas.show({ duration: 5000 });
        setTimeout(() => {
            avisoRangoFechas = null;
        }, 5000);
    }

    function navegarSinAlerta(destino) {
        window.onbeforeunload = null;
        window.location.href = destino;
    }

    function construirUrlBusqueda() {
        const parametrosActuales = new URLSearchParams(window.location.search);

        return window.location.pathname
             + '?script=' + encodeURIComponent(parametrosActuales.get('script'))
             + '&deploy=' + encodeURIComponent(parametrosActuales.get('deploy'))
             + '&custpage_fecha_desde=' + encodeURIComponent(leerValorCampo('custpage_fecha_desde'))
             + '&custpage_fecha_hasta=' + encodeURIComponent(leerValorCampo('custpage_fecha_hasta'))
             + '&custpage_folio=' + encodeURIComponent(leerValorCampo('custpage_folio'))
             + '&custpage_rut_emisor=' + encodeURIComponent(leerValorCampo('custpage_rut_emisor'))
             + '&custpage_subsidiaria=' + encodeURIComponent(leerValorCampo('custpage_subsidiaria'))
             + '&custpage_codigo_error=' + encodeURIComponent(leerValorCampo('custpage_codigo_error'))
             + '&custpage_seguimiento=' + encodeURIComponent(leerValorCampo('custpage_seguimiento'))
             + '&custpage_pagina=0';
    }

    function fieldChanged(context) {
        if (FILTROS_TEXTO.includes(context.fieldId)) {
            programarBusqueda();
        } else if (context.fieldId === 'custpage_fecha_desde' || context.fieldId === 'custpage_fecha_hasta') {
            if (!validarRangoFechas()) {
                context.currentRecord.setText({ fieldId: context.fieldId, text: '', ignoreFieldChange: true });
                mostrarAvisoRangoFechas();
                return;
            }
            aplicarBusqueda();
        } else if (FILTROS_CAMBIO.includes(context.fieldId)) {
            aplicarBusqueda();
        }
    }

    function saveRecord(context) {
        if (temporizadorFiltro) {
            clearTimeout(temporizadorFiltro);
            temporizadorFiltro = null;
        }

        const registro = context.currentRecord;
        const totalLineas = registro.getLineCount({ sublistId: 'custpage_sl_rechazos' });
        let totalSeleccionados = 0;

        for (let linea = 0; linea < totalLineas; linea++) {
            const seleccionado = registro.getSublistValue({
                sublistId: 'custpage_sl_rechazos',
                fieldId  : 'custpage_col_seleccionar',
                line     : linea,
            });
            if (seleccionado === true || seleccionado === 'T') {
                totalSeleccionados++;
            }
        }

        if (!totalSeleccionados) {
            alert('Selecciona al menos una factura pendiente.');
            return false;
        }

        return confirm('¿Registrar el aviso al proveedor para ' + totalSeleccionados
            + (totalSeleccionados === 1 ? ' factura seleccionada?' : ' facturas seleccionadas?')
            + '\nEsto registra un contacto ya realizado; no envia correos.');
    }

    function buscarConFiltrosActuales() {
        try {
            aplicarBusqueda();
        } catch (fallo) {
            alert('No se pudo armar la busqueda: ' + (fallo.message || fallo));
        }
    }

    function limpiarFiltros() {
        const parametrosActuales = new URLSearchParams(window.location.search);
        const destino = window.location.pathname
            + '?script=' + encodeURIComponent(parametrosActuales.get('script'))
            + '&deploy=' + encodeURIComponent(parametrosActuales.get('deploy'));
        navegarSinAlerta(destino);
    }

    return {
        pageInit                : pageInit,
        fieldChanged            : fieldChanged,
        saveRecord              : saveRecord,
        buscarConFiltrosActuales: buscarConFiltrosActuales,
        limpiarFiltros          : limpiarFiltros,
    };
});
