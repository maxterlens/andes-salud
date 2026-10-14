/**
 * @NApiVersion 2.1
 * @NScriptType ClientScript
 * @NModuleScope SameAccount
 *
 * AS_NSP_029 - Client Script del Suitelet de Impresión de Cheques.
 * - Máximo 4 pagos seleccionados; al marcar uno se le asigna la primera posición libre.
 * - No se permiten posiciones repetidas.
 * - Cada pago seleccionado necesita su N° de cheque físico (distinto entre sí).
 * - Buscar: recarga el Suitelet con los filtros.
 * - Imprimir: registra la impresión en los pagos (POST al Suitelet: AS Cheque Impreso?,
 *   AS Ultima Fecha Impresión, AS Numero Cheque Fisico) y, si todo se actualizó, abre el
 *   PDF de la API global ImpresionPDF y recarga la lista.
 *
 * Nota: en una sublista LIST los valores escritos por script (selectLine +
 * setCurrentSublistValue) no siempre se reflejan al leer con getSublistValue.
 * Por eso la selección y las posiciones se llevan en un estado interno (_estado),
 * que es la única fuente para validar e imprimir; la sublista solo lo muestra.
 */
define([
    'N/currentRecord',
    'N/url',
    'N/format',
    'N/https',
    './constants/ImpresionChequesConstants'
], (currentRecord, url, format, https, Constants) => {

    const { SCRIPT, API_IMPRESION, CAMPOS, SUBLISTA, MAX_CHEQUES, MAX_LARGO_NUM_CHEQUE } = Constants;

    /** line → { id, seleccionado, posicion, numCheque } */
    let _estado = {};

    // ─── Estado interno ──────────────────────────────────────────────────────

    const _lineas = (rec) => rec.getLineCount({ sublistId: SUBLISTA.ID });

    const _leer = (rec, fieldId, line) => rec.getSublistValue({ sublistId: SUBLISTA.ID, fieldId, line });

    const _esVerdadero = (v) => v === true || v === 'T';

    const _inicializarEstado = (rec) => {
        _estado = {};
        for (let line = 0; line < _lineas(rec); line++) {
            _estado[line] = {
                id:           String(_leer(rec, SUBLISTA.ID_PAGO, line) || ''),
                seleccionado: _esVerdadero(_leer(rec, SUBLISTA.SELECCIONAR, line)),
                posicion:     String(_leer(rec, SUBLISTA.POSICION, line) || ''),
                numCheque:    String(_leer(rec, SUBLISTA.NUM_CHEQUE, line) || '').trim()
            };
        }
    };

    const _seleccionados = (excluirLinea) => Object.keys(_estado)
        .map(Number)
        .filter(line => line !== excluirLinea && _estado[line].seleccionado)
        .map(line => ({ line, ..._estado[line] }));

    const _posicionOcupada = (posicion, excluirLinea) =>
        _seleccionados(excluirLinea).some(s => s.posicion === String(posicion));

    const _primeraPosicionLibre = (line) => {
        for (let p = 1; p <= MAX_CHEQUES; p++) {
            if (!_posicionOcupada(p, line)) return String(p);
        }
        return '';
    };

    /** Refleja un valor en pantalla sin disparar fieldChanged. */
    const _mostrar = (rec, fieldId, line, value) => {
        try {
            rec.selectLine({ sublistId: SUBLISTA.ID, line });
            rec.setCurrentSublistValue({ sublistId: SUBLISTA.ID, fieldId, value, ignoreFieldChange: true });
        } catch (e) {
            console.error('AS_ImpresionCheques_CS | _mostrar', fieldId, line, e);
        }
    };

    /** Línea del evento: context.line o, si no viene, la línea actual de la sublista. */
    const _lineaEvento = (rec, context) => {
        const line = context.line;
        if (line !== undefined && line !== null && line >= 0) return Number(line);
        return rec.getCurrentSublistIndex({ sublistId: SUBLISTA.ID });
    };

    /** Valor que el usuario acaba de ingresar en la línea del evento. */
    const _valorIngresado = (rec, fieldId, line) => {
        try {
            return rec.getCurrentSublistValue({ sublistId: SUBLISTA.ID, fieldId });
        } catch (e) {
            return _leer(rec, fieldId, line);
        }
    };

    // ─── Reglas de selección ─────────────────────────────────────────────────

    const _alMarcar = (rec, line, marcado) => {
        const linea = _estado[line];

        if (!marcado) {
            linea.seleccionado = false;
            linea.posicion     = '';
            _mostrar(rec, SUBLISTA.POSICION, line, '');
            return;
        }

        if (_seleccionados(line).length >= MAX_CHEQUES) {
            alert(`Solo se pueden imprimir ${MAX_CHEQUES} cheques por hoja.`);
            linea.seleccionado = false;
            _mostrar(rec, SUBLISTA.SELECCIONAR, line, false);
            return;
        }

        linea.seleccionado = true;
        if (!linea.posicion || _posicionOcupada(linea.posicion, line)) {
            linea.posicion = _primeraPosicionLibre(line);
            _mostrar(rec, SUBLISTA.POSICION, line, linea.posicion);
        }
    };

    const _alCambiarPosicion = (rec, line, posicion) => {
        const linea    = _estado[line];
        const anterior = linea.posicion;
        posicion = posicion ? String(posicion) : '';

        if (!posicion) {
            linea.posicion = '';
            if (linea.seleccionado) {
                linea.seleccionado = false;
                _mostrar(rec, SUBLISTA.SELECCIONAR, line, false);
            }
            return;
        }

        if (_posicionOcupada(posicion, line)) {
            alert(`La posición ${posicion} ya está asignada a otro pago.`);
            _mostrar(rec, SUBLISTA.POSICION, line, anterior);
            return;
        }

        if (!linea.seleccionado) {
            if (_seleccionados(line).length >= MAX_CHEQUES) {
                alert(`Solo se pueden imprimir ${MAX_CHEQUES} cheques por hoja.`);
                _mostrar(rec, SUBLISTA.POSICION, line, anterior);
                return;
            }
            linea.seleccionado = true;
            _mostrar(rec, SUBLISTA.SELECCIONAR, line, true);
        }

        linea.posicion = posicion;
    };

    // ─── Eventos ─────────────────────────────────────────────────────────────

    const pageInit = (context) => {
        _inicializarEstado(context.currentRecord);
    };

    const fieldChanged = (context) => {
        const rec = context.currentRecord;

        // Cambio de subsidiaria: recarga para traer sus cuentas bancarias
        if (!context.sublistId && context.fieldId === CAMPOS.SUBSIDIARIA) {
            buscar();
            return;
        }

        if (context.sublistId !== SUBLISTA.ID) return;

        const line = _lineaEvento(rec, context);
        if (line < 0 || !_estado[line]) return;

        if (context.fieldId === SUBLISTA.SELECCIONAR) {
            _alMarcar(rec, line, _esVerdadero(_valorIngresado(rec, SUBLISTA.SELECCIONAR, line)));
        } else if (context.fieldId === SUBLISTA.POSICION) {
            _alCambiarPosicion(rec, line, _valorIngresado(rec, SUBLISTA.POSICION, line));
        } else if (context.fieldId === SUBLISTA.NUM_CHEQUE) {
            _estado[line].numCheque = String(_valorIngresado(rec, SUBLISTA.NUM_CHEQUE, line) || '').trim();
        }
    };

    // ─── Acciones de botones ─────────────────────────────────────────────────

    const _fechaTexto = (rec, fieldId) => {
        const valor = rec.getValue({ fieldId });
        return valor ? format.format({ value: valor, type: format.Type.DATE }) : '';
    };

    /**
     * Recarga el Suitelet con los filtros actuales.
     * @param {boolean} [silencioso] - true tras imprimir: si faltan filtros, recarga la página sin alertas
     */
    const buscar = (silencioso) => {
        silencioso = silencioso === true;
        const rec = currentRecord.get();
        const params = {};
        params[CAMPOS.SUBSIDIARIA] = rec.getValue({ fieldId: CAMPOS.SUBSIDIARIA }) || '';
        params[CAMPOS.CUENTA]      = rec.getValue({ fieldId: CAMPOS.CUENTA }) || '';
        params[CAMPOS.IMPRESORA]   = rec.getValue({ fieldId: CAMPOS.IMPRESORA }) || '';
        params[CAMPOS.PROVEEDOR]   = rec.getValue({ fieldId: CAMPOS.PROVEEDOR }) || '';
        params[CAMPOS.FECHA_DESDE] = _fechaTexto(rec, CAMPOS.FECHA_DESDE);
        params[CAMPOS.FECHA_HASTA] = _fechaTexto(rec, CAMPOS.FECHA_HASTA);
        params[CAMPOS.INCLUIR_IMPRESOS] = rec.getValue({ fieldId: CAMPOS.INCLUIR_IMPRESOS }) ? 'T' : 'F';

        const faltaFiltro = !params[CAMPOS.SUBSIDIARIA]
            ? 'Seleccione una subsidiaria.'
            : (!params[CAMPOS.FECHA_DESDE] || !params[CAMPOS.FECHA_HASTA]) ? 'Indique el rango de fechas.' : '';
        if (faltaFiltro) {
            if (silencioso) {
                window.onbeforeunload = null;
                window.location.reload();
            } else {
                alert(faltaFiltro);
            }
            return;
        }

        const destino = url.resolveScript({
            scriptId: SCRIPT.SUITELET_ID, deploymentId: SCRIPT.DEPLOYMENT_ID, params
        });
        window.onbeforeunload = null;
        window.location.href = destino;
    };

    /** Impresora seleccionada (id de la configuración de calibración) o '' si no hay. */
    const _impresoraSeleccionada = () => currentRecord.get().getValue({ fieldId: CAMPOS.IMPRESORA }) || '';

    /** La impresora es obligatoria para imprimir: define la calibración del PDF. */
    const _validarImpresora = () => {
        if (_impresoraSeleccionada()) return true;
        alert('Seleccione una impresora. Si la lista está vacía, la subsidiaria no tiene impresoras configuradas en "AS Configuración Impresión Cheque".');
        return false;
    };

    const _urlImpresion = (ids, customData) => {
        customData = Object.assign({}, customData, { configuracion: _impresoraSeleccionada() });
        return url.resolveScript({
            scriptId:     API_IMPRESION.SCRIPT_ID,
            deploymentId: API_IMPRESION.DEPLOYMENT_ID,
            params: {
                id:         ids.join(','),
                recordtype: API_IMPRESION.RECORD_TYPE,
                reportname: API_IMPRESION.REPORT_NAME,
                filetype:   API_IMPRESION.FILE_TYPE,
                mode:       API_IMPRESION.MODE,
                customdata: JSON.stringify(customData)
            }
        });
    };

    const _abrirImpresion = (ids, customData) => {
        window.open(_urlImpresion(ids, customData), '_blank');
    };

    /** Registra la impresión en los pagos (POST síncrono al Suitelet). */
    const _registrarImpresion = (seleccionados) => {
        const destino = url.resolveScript({ scriptId: SCRIPT.SUITELET_ID, deploymentId: SCRIPT.DEPLOYMENT_ID });
        const respuesta = https.post({
            url:     destino,
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({
                accion: 'registrarImpresion',
                pagos:  seleccionados.map(s => ({ id: s.id, numCheque: s.numCheque }))
            })
        });
        try {
            return JSON.parse(respuesta.body);
        } catch (e) {
            return { ok: false, mensaje: `Respuesta inesperada del servidor (${respuesta.code}).` };
        }
    };

    /**
     * Valida, registra la impresión en los pagos y abre el PDF.
     * La pestaña del PDF se abre en el mismo clic (evita el bloqueo de ventanas emergentes)
     * y se carga solo si todos los pagos se actualizaron.
     */
    const imprimirCheques = () => {
        let ventana = null;
        try {
            if (!_validarImpresora()) return;
            const seleccionados = _seleccionados();

            if (!seleccionados.length) {
                alert('Seleccione al menos un pago de factura.');
                return;
            }
            if (seleccionados.length > MAX_CHEQUES) {
                alert(`Solo se pueden imprimir ${MAX_CHEQUES} cheques por hoja.`);
                return;
            }
            if (seleccionados.some(s => !s.posicion)) {
                alert('Indique la posición de todos los pagos seleccionados.');
                return;
            }
            const posiciones = seleccionados.map(s => s.posicion);
            if (new Set(posiciones).size !== posiciones.length) {
                alert('Hay posiciones repetidas. Cada cheque debe ir en una posición distinta.');
                return;
            }
            if (seleccionados.some(s => !s.numCheque)) {
                alert('Indique el AS Numero Cheque Fisico de todos los pagos seleccionados.');
                return;
            }
            if (seleccionados.some(s => s.numCheque.length > MAX_LARGO_NUM_CHEQUE)) {
                alert(`El AS Numero Cheque Fisico admite como máximo ${MAX_LARGO_NUM_CHEQUE} caracteres.`);
                return;
            }
            const numeros = seleccionados.map(s => s.numCheque);
            if (new Set(numeros).size !== numeros.length) {
                alert('Hay N° de cheque físico repetidos entre los pagos seleccionados.');
                return;
            }

            const mapa = {};
            seleccionados.forEach(s => { mapa[s.id] = Number(s.posicion); });
            const urlPdf = _urlImpresion(seleccionados.map(s => s.id), { posiciones: mapa });

            ventana = window.open('', '_blank');
            if (ventana && ventana.document) {
                ventana.document.write('<p style="font-family:sans-serif">Registrando la impresión de los cheques...</p>');
            }

            const resultado = _registrarImpresion(seleccionados);
            if (!resultado.ok) {
                if (ventana) ventana.close();
                alert(`No se imprimieron los cheques.\n\n${resultado.mensaje}`);
                if ((resultado.resultados || []).some(r => r.ok)) buscar(true);   // hubo actualizaciones parciales
                return;
            }

            if (ventana) {
                ventana.location.href = urlPdf;
            } else {
                window.open(urlPdf, '_blank');
            }
            buscar(true);   // recarga la lista con el estado actualizado
        } catch (e) {
            if (ventana) ventana.close();
            console.error('AS_ImpresionCheques_CS | imprimirCheques', e);
            alert(`No se pudo generar la impresión: ${e.message || e}`);
        }
    };

    /** Hoja de calibración: el primer pago seleccionado (o el primero de la lista) en las 4 posiciones. */
    const imprimirCalibracion = () => {
        try {
            if (!_validarImpresora()) return;
            const lineas = Object.keys(_estado);
            if (!lineas.length) {
                alert('Busque al menos un pago de factura para generar la hoja de calibración.');
                return;
            }
            const seleccionado = _seleccionados()[0];
            const id = seleccionado ? seleccionado.id : _estado[lineas[0]].id;
            _abrirImpresion([id], { calibracion: true });
        } catch (e) {
            console.error('AS_ImpresionCheques_CS | imprimirCalibracion', e);
            alert(`No se pudo generar la hoja de calibración: ${e.message || e}`);
        }
    };

    return {
        pageInit,
        fieldChanged,
        buscar,
        imprimirCheques,
        imprimirCalibracion
    };
});
