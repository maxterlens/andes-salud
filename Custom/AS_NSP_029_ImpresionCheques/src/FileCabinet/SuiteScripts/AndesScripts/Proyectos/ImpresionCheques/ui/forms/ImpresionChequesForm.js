/**
 * @NApiVersion 2.1
 * Form: construcción de la interfaz con N/ui/serverWidget.
 *
 * Responsabilidad única: armar campos, sublista, botones y mensajes.
 * No consulta datos ni aplica reglas de negocio.
 */
define([
    'N/ui/serverWidget',
    'N/ui/message',
    '../../constants/ImpresionChequesConstants'
], (serverWidget, message, Constants) => {

    const { SCRIPT, CAMPOS, SUBLISTA, BOTONES, MAX_CHEQUES, LIMITE_TEXTO_SUBLISTA, MAX_LARGO_NUM_CHEQUE } = Constants;

    /** Escapa HTML: los campos TEXT de una sublista LIST se renderizan como HTML. */
    const _escaparHtml = (texto) => String(texto)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

    /**
     * Texto plano apto para la sublista: una sola línea, escapado y dentro del límite
     * de caracteres. Si se corta, termina en "..." (el límite se mide sobre el texto final).
     */
    const _textoSublista = (texto) => {
        const limpio = String(texto || '').replace(/\s+/g, ' ').trim();
        let escapado = _escaparHtml(limpio);
        if (escapado.length <= LIMITE_TEXTO_SUBLISTA) return escapado;

        let corte = limpio.length;
        do {
            corte -= 1;
            escapado = `${_escaparHtml(limpio.slice(0, corte).trimEnd())}...`;
        } while (escapado.length > LIMITE_TEXTO_SUBLISTA && corte > 0);
        return escapado;
    };

    const _agregarSelect = (form, { id, label, opciones, valor, vacio = true }) => {
        const campo = form.addField({ id, label, type: serverWidget.FieldType.SELECT, container: CAMPOS.GRUPO_FILTROS });
        if (vacio) campo.addSelectOption({ value: '', text: '' });
        opciones.forEach(o => campo.addSelectOption({ value: o.id, text: o.nombre, isSelected: String(o.id) === String(valor) }));
        return campo;
    };

    const _construirFiltros = (form, filtros, opciones) => {
        form.addFieldGroup({ id: CAMPOS.GRUPO_FILTROS, label: 'Filtros' });

        const subsidiaria = _agregarSelect(form, {
            id: CAMPOS.SUBSIDIARIA, label: 'Subsidiaria', opciones: opciones.subsidiarias, valor: filtros.subsidiaria
        });
        subsidiaria.isMandatory = true;

        _agregarSelect(form, {
            id: CAMPOS.CUENTA, label: 'Cuenta bancaria', opciones: opciones.cuentas, valor: filtros.cuenta
        });

        const impresora = _agregarSelect(form, {
            id: CAMPOS.IMPRESORA, label: 'Impresora',
            opciones: opciones.impresoras.map(i => ({ id: i.id, nombre: i.predeterminada ? `${i.nombre} (predeterminada)` : i.nombre })),
            valor: filtros.impresora
        });
        impresora.isMandatory = true;
        impresora.setHelpText({ help: 'Impresora en la que se imprimirán los cheques. Define la calibración del PDF (AS Configuración Impresión Cheque). Solo se listan las impresoras de la subsidiaria seleccionada; por defecto, la predeterminada.' });

        const proveedor = form.addField({
            id: CAMPOS.PROVEEDOR, label: 'Proveedor', type: serverWidget.FieldType.SELECT,
            source: 'vendor', container: CAMPOS.GRUPO_FILTROS
        });
        if (filtros.proveedor) proveedor.defaultValue = filtros.proveedor;

        const desde = form.addField({ id: CAMPOS.FECHA_DESDE, label: 'Fecha desde', type: serverWidget.FieldType.DATE, container: CAMPOS.GRUPO_FILTROS });
        desde.defaultValue = filtros.fechaDesde;
        desde.isMandatory  = true;

        const hasta = form.addField({ id: CAMPOS.FECHA_HASTA, label: 'Fecha hasta', type: serverWidget.FieldType.DATE, container: CAMPOS.GRUPO_FILTROS });
        hasta.defaultValue = filtros.fechaHasta;
        hasta.isMandatory  = true;

        const incluirImpresos = form.addField({
            id: CAMPOS.INCLUIR_IMPRESOS, label: 'Incluir Impresos?', type: serverWidget.FieldType.CHECKBOX, container: CAMPOS.GRUPO_FILTROS
        });
        incluirImpresos.defaultValue = filtros.incluirImpresos ? 'T' : 'F';
        incluirImpresos.setHelpText({ help: 'Marque para listar también los pagos con AS Cheque Impreso? marcado (reimpresión). Al reimprimir se reemplazan el N° de cheque físico y la fecha de impresión.' });
    };

    const _construirSublista = (form, pagos) => {
        const sublista = form.addSublist({
            id:    SUBLISTA.ID,
            label: `Pagos de factura (${pagos.length})`,
            type:  serverWidget.SublistType.LIST
        });

        sublista.addField({ id: SUBLISTA.SELECCIONAR, label: 'Seleccionar', type: serverWidget.FieldType.CHECKBOX });

        const posicion = sublista.addField({ id: SUBLISTA.POSICION, label: 'Posición', type: serverWidget.FieldType.SELECT });
        posicion.addSelectOption({ value: '', text: '' });
        for (let p = 1; p <= MAX_CHEQUES; p++) {
            posicion.addSelectOption({ value: String(p), text: String(p) });
        }
        posicion.updateDisplayType({ displayType: serverWidget.FieldDisplayType.ENTRY });

        sublista.addField({ id: SUBLISTA.ID_PAGO, label: 'ID', type: serverWidget.FieldType.TEXT })
            .updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN });
        sublista.addField({ id: SUBLISTA.FECHA,        label: 'Fecha',           type: serverWidget.FieldType.TEXT });
        sublista.addField({ id: SUBLISTA.DOCUMENTO,    label: 'N° documento',    type: serverWidget.FieldType.TEXT });
        sublista.addField({ id: SUBLISTA.BENEFICIARIO, label: 'Beneficiario',    type: serverWidget.FieldType.TEXT });
        sublista.addField({ id: SUBLISTA.NOTA,         label: 'Nota',            type: serverWidget.FieldType.TEXT });
        sublista.addField({ id: SUBLISTA.MONTO,        label: 'Monto',           type: serverWidget.FieldType.CURRENCY });
        sublista.addField({ id: SUBLISTA.ULT_FECHA,    label: 'AS Ultima Fecha Impresión', type: serverWidget.FieldType.TEXT });

        const numCheque = sublista.addField({ id: SUBLISTA.NUM_CHEQUE, label: 'AS Numero Cheque Fisico', type: serverWidget.FieldType.TEXT });
        numCheque.updateDisplayType({ displayType: serverWidget.FieldDisplayType.ENTRY });
        numCheque.maxLength = MAX_LARGO_NUM_CHEQUE;

        pagos.forEach((pago, line) => {
            const set = (id, value) => {
                if (value !== '' && value !== null && value !== undefined) {
                    sublista.setSublistValue({ id, line, value: String(value) });
                }
            };
            set(SUBLISTA.ID_PAGO,      pago.id);
            // Enlace a la transacción en la fecha (siempre presente); el N° documento es opcional
            set(SUBLISTA.FECHA,        pago.urlRegistro
                ? `<a href="${pago.urlRegistro}" target="_blank">${pago.fecha}</a>`
                : pago.fecha);
            set(SUBLISTA.DOCUMENTO,    _textoSublista(pago.documento));
            set(SUBLISTA.BENEFICIARIO, _textoSublista(pago.beneficiario));
            set(SUBLISTA.MONTO,        pago.monto);
            set(SUBLISTA.NOTA,         _textoSublista(pago.nota));
            set(SUBLISTA.ULT_FECHA,    _textoSublista(pago.ultFechaImpresion));
            set(SUBLISTA.NUM_CHEQUE,   pago.numCheque);   // campo editable: valor plano, sin escapar
        });
    };

    const _agregarMensajes = (form, mensajes) => {
        const tipos = { info: message.Type.INFORMATION, aviso: message.Type.WARNING, error: message.Type.ERROR };
        mensajes.forEach(m => form.addPageInitMessage({ type: tipos[m.tipo] || message.Type.INFORMATION, message: m.texto }));
    };

    /**
     * @param {{ filtros: Object, opciones: Object, pagos: Object[], mensajes: Object[] }} datos
     * @returns {serverWidget.Form}
     */
    const construir = ({ filtros, opciones, pagos, mensajes }) => {
        const form = serverWidget.createForm({ title: 'Impresión de Cheques - Pagos de Factura' });
        form.clientScriptModulePath = SCRIPT.CLIENT_PATH;

        _construirFiltros(form, filtros, opciones);
        _construirSublista(form, pagos);
        _agregarMensajes(form, mensajes);

        form.addButton({ id: BOTONES.BUSCAR.id,      label: BOTONES.BUSCAR.label,      functionName: BOTONES.BUSCAR.fn });
        form.addButton({ id: BOTONES.IMPRIMIR.id,    label: BOTONES.IMPRIMIR.label,    functionName: BOTONES.IMPRIMIR.fn });
        form.addButton({ id: BOTONES.CALIBRACION.id, label: BOTONES.CALIBRACION.label, functionName: BOTONES.CALIBRACION.fn });

        return form;
    };

    return { construir };
});
