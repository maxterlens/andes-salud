/**
 * AS_NSP_027 — Facturas DTE Rechazadas
 * @description Arma la pantalla de la bandeja con N/ui/serverWidget: filtros, aviso de
 *              sin resultados, el boton para registrar el aviso al proveedor, las sublistas de
 *              pendientes y avisados, y la paginacion. Recibe los datos ya consultados
 *              por el handler; no consulta ni escribe registros.
 *
 *              Si el filtro "Mostrar" pide Avisadas, esa sublista va primero y la
 *              paginacion la recorre; en cualquier otro caso manda Pendientes.
 * @NApiVersion 2.1
 * @NModuleScope Public
 */
define(['N/ui/serverWidget', '../lib/AS_FacturasDTERechazadasConstants'],
    (serverWidget, CONSTANTES) => {

    const RUTA_CLIENT_SCRIPT = '../AS_FacturasDTERechazados_CS_2.1.js';

    function construirBandeja(datos) {
        const filtros        = datos.filtros;
        const verAvisados    = filtros.seguimiento === CONSTANTES.SEGUIMIENTO.AVISADO;
        const totalRegistros = datos.resultadoPendientes.totalRegistros + datos.resultadoAvisados.totalRegistros;

        const form = serverWidget.createForm({ title: 'Facturas DTE Rechazadas' });
        form.clientScriptModulePath = RUTA_CLIENT_SCRIPT;

        agregarEstilos(form);
        agregarFiltros(form, filtros);
        agregarAvisoSinResultados(form, totalRegistros, filtros);
        agregarRegistroAviso(form, datos.resultadoPendientes);
        agregarSublistResultados(form, datos.resultadoPendientes, datos.resultadoAvisados, verAvisados);
        agregarPaginacion(form, verAvisados ? datos.resultadoAvisados : datos.resultadoPendientes,
            filtros, datos.suiteletUrl);

        return form;
    }

    function agregarEstilos(form) {
        const campoEstilos = form.addField({ id: 'custpage_estilos', type: serverWidget.FieldType.INLINEHTML, label: 'Estilos' });
        campoEstilos.defaultValue = '<style>'
            + '  input[type="text"], input[type="date"], select {'
            + '    padding: 5px 8px; border: 1px solid #c9ccd1; border-radius: 5px;'
            + '    font-size: 12px; font-family: Arial, sans-serif; color: #333;'
            + '  }'
            + '  input[type="text"]:focus, input[type="date"]:focus, select:focus {'
            + '    outline: none; border-color: #7c98b6;'
            + '  }'
            + '</style>';
    }

    function agregarFiltros(form, filtros) {
        form.addFieldGroup({ id: 'custpage_grp_filtros', label: 'Buscar facturas rechazadas' });

        agregarCampoSeguimiento(form, filtros.seguimiento);
        agregarCampoTexto(form, 'custpage_folio', serverWidget.FieldType.TEXT, 'Folio', filtros.folio);
        agregarCampoTexto(form, 'custpage_rut_emisor', serverWidget.FieldType.TEXT, 'RUT proveedor', filtros.rutEmisor);
        agregarCampoTexto(form, 'custpage_codigo_error', serverWidget.FieldType.TEXT, CONSTANTES.ETIQUETAS_COLUMNA.COD_ERROR, filtros.codigoError);

        const campoSubsidiaria = agregarCampoSubsidiaria(form, filtros.subsidiaria);
        campoSubsidiaria.updateBreakType({ breakType: serverWidget.FieldBreakType.STARTCOL });

        agregarCampoTipoDocumento(form, filtros.tipoDocumento);
        agregarCampoTexto(form, 'custpage_fecha_desde', serverWidget.FieldType.DATE, 'Rechazo desde', filtros.fechaDesde);
        agregarCampoTexto(form, 'custpage_fecha_hasta', serverWidget.FieldType.DATE, 'Rechazo hasta', filtros.fechaHasta);

        form.addButton({
            id          : 'custpage_btn_buscar',
            label       : 'Buscar',
            functionName: 'buscarConFiltrosActuales',
        });
        form.addButton({
            id          : 'custpage_btn_limpiar',
            label       : 'Limpiar filtros',
            functionName: 'limpiarFiltros',
        });

        const campoPagina = form.addField({ id: 'custpage_pagina', type: serverWidget.FieldType.INTEGER, label: 'Pagina' });
        campoPagina.defaultValue = String(filtros.pagina);
        campoPagina.updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN });
    }

    function agregarCampoSeguimiento(form, valorElegido) {
        const campo = form.addField({ id: 'custpage_seguimiento', type: serverWidget.FieldType.SELECT, label: 'Mostrar', container: 'custpage_grp_filtros' });
        campo.addSelectOption({ value: '', text: 'Todas las filas' });
        campo.addSelectOption({ value: CONSTANTES.SEGUIMIENTO.PENDIENTE, text: 'Pendientes de aviso' });
        campo.addSelectOption({ value: CONSTANTES.SEGUIMIENTO.AVISADO, text: 'Avisadas' });
        campo.defaultValue = valorElegido;
        return campo;
    }

    function agregarCampoTexto(form, id, tipo, etiqueta, valor) {
        const campo = form.addField({ id: id, type: tipo, label: etiqueta, container: 'custpage_grp_filtros' });
        campo.defaultValue = valor;
        return campo;
    }

    function agregarCampoSubsidiaria(form, valorElegido) {
        const campo = form.addField({ id: 'custpage_subsidiaria', type: serverWidget.FieldType.SELECT, label: CONSTANTES.ETIQUETAS_COLUMNA.SUBSIDIARIA, source: 'subsidiary', container: 'custpage_grp_filtros' });
        campo.defaultValue = valorElegido;
        return campo;
    }

    /**
     * El valor y el texto de cada opcion son el nombre, porque eso es lo que el sync
     * guarda en custrecord_as_dterc_codigo_dte. Las opciones salen en el orden del
     * codigo del SII (33, 34, 39...).
     */
    function agregarCampoTipoDocumento(form, valorElegido) {
        const campo = form.addField({ id: 'custpage_tipo_documento', type: serverWidget.FieldType.SELECT, label: CONSTANTES.ETIQUETAS_COLUMNA.TIPO_DOCUMENTO, container: 'custpage_grp_filtros' });
        campo.addSelectOption({ value: '', text: '' });
        Object.keys(CONSTANTES.TIPOS_DTE).forEach((codigo) => {
            campo.addSelectOption({ value: CONSTANTES.TIPOS_DTE[codigo], text: CONSTANTES.TIPOS_DTE[codigo] });
        });
        campo.defaultValue = valorElegido;
        return campo;
    }

    function agregarAvisoSinResultados(form, totalRegistros, filtros) {
        if (totalRegistros !== 0) {
            return;
        }

        const campo = form.addField({ id: 'custpage_sin_resultados', type: serverWidget.FieldType.INLINEHTML, label: 'Sin resultados' });
        campo.updateBreakType({ breakType: serverWidget.FieldBreakType.STARTROW });
        const hayFiltros = filtros.fechaDesde || filtros.fechaHasta || filtros.folio || filtros.rutEmisor
                        || filtros.subsidiaria || filtros.tipoDocumento || filtros.codigoError || filtros.seguimiento;
        campo.defaultValue = '<p style="color:#8a4b00;font-weight:bold;">'
            + (hayFiltros ? 'No hay rechazos con estos filtros. Revisa las fechas o usa Limpiar filtros.'
                          : 'No hay rechazos para mostrar.')
            + '</p>';
    }

    function agregarRegistroAviso(form, resultadoPendientes) {
        if (!resultadoPendientes.filas.length) {
            return;
        }

        form.addSubmitButton({ label: 'Registrar aviso en seleccionados' });
    }

    function agregarSublistResultados(form, resultadoPendientes, resultadoAvisados, verAvisados) {
        if (verAvisados) {
            agregarSublistRechazos(form, 'custpage_sl_avisados',
                'Avisados (' + resultadoAvisados.totalRegistros + ')', resultadoAvisados.filas, false);
        }

        agregarSublistRechazos(form, 'custpage_sl_rechazos',
            'Pendientes de aviso (' + resultadoPendientes.totalRegistros + ')', resultadoPendientes.filas, true);

        if (!verAvisados) {
            agregarSublistRechazos(form, 'custpage_sl_avisados',
                'Avisados (' + resultadoAvisados.totalRegistros + ')', resultadoAvisados.filas, false);
        }
    }

    function agregarSublistRechazos(form, idSublist, etiqueta, filas, permiteSeleccionar) {
        const sublist = form.addSublist({
            id   : idSublist,
            type : serverWidget.SublistType.LIST,
            label: etiqueta,
        });

        const prefijo = permiteSeleccionar ? 'custpage_col_' : 'custpage_hist_';
        if (permiteSeleccionar) {
            const campoSeleccionar = sublist.addField({ id: 'custpage_col_seleccionar', type: serverWidget.FieldType.CHECKBOX, label: 'Seleccionar' });
            campoSeleccionar.updateDisplayType({ displayType: serverWidget.FieldDisplayType.ENTRY });
        }

        const campoId = sublist.addField({ id: prefijo + 'id', type: serverWidget.FieldType.TEXT, label: 'ID' });
        campoId.updateDisplaySize({ height: 10, width: 60 });

        agregarColumna(sublist, prefijo + 'fecha', CONSTANTES.ETIQUETAS_COLUMNA.FECHA, 80);
        agregarColumna(sublist, prefijo + 'folio', CONSTANTES.ETIQUETAS_COLUMNA.FOLIO, 80);
        agregarColumna(sublist, prefijo + 'tipo', CONSTANTES.ETIQUETAS_COLUMNA.TIPO, 90);
        agregarColumna(sublist, prefijo + 'tipo_documento', CONSTANTES.ETIQUETAS_COLUMNA.TIPO_DOCUMENTO, 200);
        agregarColumna(sublist, prefijo + 'rut', CONSTANTES.ETIQUETAS_COLUMNA.RUT_EMISOR, 100);
        agregarColumna(sublist, prefijo + 'proveedor', CONSTANTES.ETIQUETAS_COLUMNA.PROVEEDOR, 220);
        agregarColumna(sublist, prefijo + 'subsidiaria', CONSTANTES.ETIQUETAS_COLUMNA.SUBSIDIARIA, 220);
        agregarColumna(sublist, prefijo + 'estado', CONSTANTES.ETIQUETAS_COLUMNA.ESTADO_DTE, 90);
        agregarColumna(sublist, prefijo + 'cod_error', CONSTANTES.ETIQUETAS_COLUMNA.COD_ERROR, 80);
        agregarColumna(sublist, prefijo + 'desc_error', CONSTANTES.ETIQUETAS_COLUMNA.DESC_ERROR, 480);
        agregarColumna(sublist, prefijo + 'aviso', CONSTANTES.ETIQUETAS_COLUMNA.AVISO, 140);
        agregarColumna(sublist, prefijo + 'fecha_aviso', CONSTANTES.ETIQUETAS_COLUMNA.FECHA_AVISO, 130);
        agregarColumna(sublist, prefijo + 'usuario_aviso', CONSTANTES.ETIQUETAS_COLUMNA.USUARIO_AVISO, 160);

        filas.forEach((fila, indice) => {
            if (permiteSeleccionar) {
                sublist.setSublistValue({ id: 'custpage_col_seleccionar', line: indice, value: 'F' });
            }
            sublist.setSublistValue({ id: prefijo + 'id', line: indice, value: String(fila.id) });
            sublist.setSublistValue({ id: prefijo + 'fecha', line: indice, value: fila.fecha || ' ' });
            sublist.setSublistValue({ id: prefijo + 'folio', line: indice, value: fila.folio || ' ' });
            sublist.setSublistValue({ id: prefijo + 'tipo', line: indice, value: fila.tipodte || ' ' });
            sublist.setSublistValue({ id: prefijo + 'tipo_documento', line: indice, value: fila.tipodocumento || ' ' });
            sublist.setSublistValue({ id: prefijo + 'rut', line: indice, value: fila.rutemisor || ' ' });
            sublist.setSublistValue({ id: prefijo + 'proveedor', line: indice, value: fila.proveedor || ' ' });
            sublist.setSublistValue({ id: prefijo + 'subsidiaria', line: indice, value: fila.subsidiaria || ' ' });
            sublist.setSublistValue({ id: prefijo + 'estado', line: indice, value: fila.estadodte || ' ' });
            sublist.setSublistValue({ id: prefijo + 'cod_error', line: indice, value: fila.codigoerror || ' ' });
            sublist.setSublistValue({ id: prefijo + 'desc_error', line: indice, value: fila.descripcionerror || ' ' });
            sublist.setSublistValue({ id: prefijo + 'aviso', line: indice, value: fila.avisado === 'T' ? 'Avisado' : 'Pendiente' });
            sublist.setSublistValue({ id: prefijo + 'fecha_aviso', line: indice, value: fila.fechaaviso || ' ' });
            sublist.setSublistValue({ id: prefijo + 'usuario_aviso', line: indice, value: fila.usuarioaviso || ' ' });
        });
    }

    function agregarColumna(sublist, id, etiqueta, ancho) {
        const columna = sublist.addField({ id: id, type: serverWidget.FieldType.TEXT, label: etiqueta });
        columna.updateDisplaySize({ height: 10, width: ancho });
        return columna;
    }

    function agregarPaginacion(form, resultado, filtros, suiteletUrl) {
        const queryFiltros = construirQueryStringFiltros(filtros);

        const hayAnterior  = resultado.paginaActual > 0;
        const haySiguiente = resultado.paginaActual < resultado.totalPaginas - 1;

        const urlAnterior  = suiteletUrl + '&' + queryFiltros + '&custpage_pagina=' + (resultado.paginaActual - 1);
        const urlSiguiente = suiteletUrl + '&' + queryFiltros + '&custpage_pagina=' + (resultado.paginaActual + 1);

        const campoInfo = form.addField({ id: 'custpage_paginacion', type: serverWidget.FieldType.INLINEHTML, label: 'Paginacion' });
        campoInfo.updateBreakType({ breakType: serverWidget.FieldBreakType.STARTROW });
        campoInfo.defaultValue = '<div style="margin-top:12px;display:flex;align-items:center;gap:10px;'
            + 'flex-wrap:wrap;justify-content:flex-end;font-family:Arial,sans-serif;">'
            + construirBotonPagina(hayAnterior, urlAnterior, '&laquo; Anterior')
            + '<span style="background:#eef1f4;color:#3a4a5a;border-radius:14px;'
            + 'padding:6px 14px;font-size:12px;font-weight:bold;white-space:nowrap;">'
            + 'Pagina ' + (resultado.paginaActual + 1) + ' de ' + resultado.totalPaginas
            + '</span>'
            + construirBotonPagina(haySiguiente, urlSiguiente, 'Siguiente &raquo;')
            + '<span style="font-size:12px;color:#8a929a;">' + resultado.totalRegistros + ' registros en total</span>'
            + '</div>';
    }

    function construirQueryStringFiltros(filtros) {
        return 'custpage_fecha_desde=' + encodeURIComponent(filtros.fechaDesde)
            + '&custpage_fecha_hasta=' + encodeURIComponent(filtros.fechaHasta)
            + '&custpage_folio=' + encodeURIComponent(filtros.folio)
            + '&custpage_rut_emisor=' + encodeURIComponent(filtros.rutEmisor)
            + '&custpage_subsidiaria=' + encodeURIComponent(filtros.subsidiaria)
            + '&custpage_tipo_documento=' + encodeURIComponent(filtros.tipoDocumento)
            + '&custpage_codigo_error=' + encodeURIComponent(filtros.codigoError)
            + '&custpage_seguimiento=' + encodeURIComponent(filtros.seguimiento);
    }

    function construirBotonPagina(habilitado, destino, etiqueta) {
        if (habilitado) {
            return '<a href="' + destino + '" style="display:inline-block;padding:6px 14px;'
                + 'background:#3a6ea5;color:#fff;text-decoration:none;border-radius:14px;'
                + 'font-size:12px;font-weight:bold;">' + etiqueta + '</a>';
        }

        return '<span style="display:inline-block;padding:6px 14px;background:#eef1f4;'
            + 'color:#b5bcc3;border-radius:14px;font-size:12px;font-weight:bold;">' + etiqueta + '</span>';
    }

    return {
        construirBandeja: construirBandeja,
    };
});
