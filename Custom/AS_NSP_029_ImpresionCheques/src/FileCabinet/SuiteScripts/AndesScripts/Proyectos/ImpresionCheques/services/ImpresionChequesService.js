/**
 * @NApiVersion 2.1
 * Service: Impresión de Cheques.
 *
 * Responsabilidad: normalizar filtros, aplicar reglas (filtros obligatorios,
 * tope de resultados) y preparar los datos que el formulario muestra.
 */
define([
    'N/format',
    'N/url',
    '../repositories/ImpresionChequesRepository',
    '../constants/ImpresionChequesConstants'
], (format, url, ImpresionChequesRepository, Constants) => {

    const { CAMPOS, LIMITE_RESULTADOS, MAX_CHEQUES, MAX_LARGO_NUM_CHEQUE } = Constants;

    const _formatearFecha = (fecha) => format.format({ value: fecha, type: format.Type.DATE });

    /** Primer y último día del mes actual, en el formato de fecha del usuario. */
    const _mesActual = () => {
        const hoy = new Date();
        return {
            desde: _formatearFecha(new Date(hoy.getFullYear(), hoy.getMonth(), 1)),
            hasta: _formatearFecha(new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0))
        };
    };

    /**
     * Lee los filtros del request (GET). Si no vienen fechas, usa el mes actual.
     * @param {Object} params - request.parameters
     */
    const normalizarFiltros = (params = {}) => {
        const mes = _mesActual();
        return {
            subsidiaria: params[CAMPOS.SUBSIDIARIA] || '',
            cuenta:      params[CAMPOS.CUENTA]      || '',
            impresora:   params[CAMPOS.IMPRESORA]   || '',
            proveedor:   params[CAMPOS.PROVEEDOR]   || '',
            fechaDesde:  params[CAMPOS.FECHA_DESDE] || mes.desde,
            fechaHasta:  params[CAMPOS.FECHA_HASTA] || mes.hasta,
            incluirImpresos: params[CAMPOS.INCLUIR_IMPRESOS] === 'T'
        };
    };

    /**
     * Arma opciones de filtros, resultados y mensajes para el formulario.
     * @param {Object} filtros - Resultado de normalizarFiltros
     * @returns {{ opciones: Object, pagos: Object[], mensajes: Object[] }}
     */
    const obtenerDatosFormulario = (filtros) => {
        const mensajes = [];
        const opciones = {
            subsidiarias: ImpresionChequesRepository.getSubsidiarias(),
            cuentas:      ImpresionChequesRepository.getCuentasBancarias(filtros.subsidiaria),
            impresoras:   ImpresionChequesRepository.getImpresoras(filtros.subsidiaria)
        };

        // Impresora: la indicada (si pertenece a la subsidiaria) o la predeterminada
        if (!opciones.impresoras.some(i => i.id === String(filtros.impresora))) {
            const predeterminada = opciones.impresoras.find(i => i.predeterminada);
            filtros.impresora = predeterminada ? predeterminada.id : '';
        }
        if (filtros.subsidiaria && !opciones.impresoras.length) {
            mensajes.push({
                tipo:  'aviso',
                texto: 'La subsidiaria no tiene impresoras configuradas. Cree una en "AS Configuración Impresión Cheque" para poder imprimir cheques.'
            });
        }

        if (!filtros.subsidiaria) {
            mensajes.push({ tipo: 'info', texto: 'Seleccione una subsidiaria y presione Buscar para ver los pagos de factura.' });
            return { opciones, pagos: [], mensajes };
        }

        const idMetodoCheque = ImpresionChequesRepository.getIdMetodoPagoCheque();
        if (!idMetodoCheque) {
            mensajes.push({ tipo: 'error', texto: 'No existe el valor "Cheque" en la lista AS Metodo de Pago. Revise la lista antes de imprimir.' });
            return { opciones, pagos: [], mensajes };
        }

        let pagos = [];
        try {
            pagos = ImpresionChequesRepository.getPagosFactura(filtros, idMetodoCheque, LIMITE_RESULTADOS + 1);
        } catch (e) {
            log.error('ImpresionChequesService | obtenerDatosFormulario', e);
            mensajes.push({ tipo: 'error', texto: `No se pudieron obtener los pagos de factura: ${e.message || e}` });
            return { opciones, pagos: [], mensajes };
        }

        if (pagos.length > LIMITE_RESULTADOS) {
            pagos = pagos.slice(0, LIMITE_RESULTADOS);
            mensajes.push({
                tipo:  'aviso',
                texto: `Se muestran los primeros ${LIMITE_RESULTADOS} pagos. Ajuste los filtros para acotar la búsqueda.`
            });
        } else if (!pagos.length) {
            mensajes.push({
                tipo:  'info',
                texto: 'No se encontraron pagos de factura con los filtros indicados. Solo se listan pagos con AS Metodo de Pago = Cheque, en período abierto' +
                       (filtros.incluirImpresos ? '.' : ' y sin imprimir (marque "Incluir Impresos?" para reimprimir).')
            });
        } else {
            mensajes.push({
                tipo:  'info',
                texto: `Seleccione hasta ${MAX_CHEQUES} pagos, indique la posición de cada cheque en la hoja (1 = superior) y su N° de cheque físico. Al imprimir, los pagos quedan marcados como impresos. Imprima a tamaño real (100%).`
            });
        }

        pagos = pagos.map(p => ({
            ...p,
            urlRegistro: url.resolveRecord({ recordType: 'vendorpayment', recordId: p.id })
        }));

        return { opciones, pagos, mensajes };
    };

    // ─── Registro de la impresión ────────────────────────────────────────────

    const _error = (mensaje) => ({ ok: false, mensaje, resultados: [] });

    /**
     * Valida y marca como impresos los pagos seleccionados: AS Cheque Impreso?,
     * AS Ultima Fecha Impresión (ahora) y AS Numero Cheque Fisico.
     *
     * Reglas:
     *  - 1 a 4 pagos, sin repetir, todos con N° de cheque (máx. MAX_LARGO_NUM_CHEQUE caracteres).
     *  - N° de cheque distinto entre los pagos seleccionados.
     *  - Pagos imprimibles: método Cheque, no anulados y en período abierto.
     *  - Todos de la misma subsidiaria.
     *  - El N° de cheque no puede estar en otro pago de la misma subsidiaria
     *    (sí puede repetirse en otra subsidiaria).
     *
     * @param {{ pagos: { id: string, numCheque: string }[] }} solicitud
     * @returns {{ ok: boolean, mensaje: string, resultados: { id: string, ok: boolean, error?: string }[] }}
     */
    const registrarImpresion = (solicitud = {}) => {
        const pagos = Array.isArray(solicitud.pagos) ? solicitud.pagos : [];
        if (!pagos.length)              return _error('No se recibieron pagos para registrar.');
        if (pagos.length > MAX_CHEQUES) return _error(`Se pueden imprimir como máximo ${MAX_CHEQUES} cheques por hoja.`);

        const normalizados = pagos.map(p => ({ id: String(p.id || '').trim(), numCheque: String(p.numCheque || '').trim() }));
        if (normalizados.some(p => !p.id))        return _error('Hay pagos sin identificador.');
        if (normalizados.some(p => !p.numCheque)) return _error('Indique el N° de cheque físico de todos los pagos seleccionados.');
        const largos = normalizados.filter(p => p.numCheque.length > MAX_LARGO_NUM_CHEQUE);
        if (largos.length) return _error(`El N° de cheque físico admite como máximo ${MAX_LARGO_NUM_CHEQUE} caracteres.`);

        const ids     = normalizados.map(p => p.id);
        const numeros = normalizados.map(p => p.numCheque);
        if (new Set(ids).size !== ids.length)         return _error('Hay pagos repetidos en la selección.');
        if (new Set(numeros).size !== numeros.length) return _error('Hay N° de cheque físico repetidos entre los pagos seleccionados.');

        const idMetodoCheque = ImpresionChequesRepository.getIdMetodoPagoCheque();
        if (!idMetodoCheque) return _error('No existe el valor "Cheque" en la lista AS Metodo de Pago.');

        const imprimibles = ImpresionChequesRepository.getPagosImprimibles(ids, idMetodoCheque);
        const porId = {};
        imprimibles.forEach(p => { porId[p.id] = p; });
        const noImprimibles = ids.filter(id => !porId[id]);
        if (noImprimibles.length) {
            return _error(`Los pagos ${noImprimibles.join(', ')} ya no se pueden imprimir: verifique que no estén anulados, ` +
                          'que su AS Metodo de Pago sea Cheque y que su período esté abierto.');
        }

        const subsidiarias = [...new Set(imprimibles.map(p => p.subsidiaria))];
        if (subsidiarias.length > 1) return _error('Todos los pagos de una hoja deben ser de la misma subsidiaria.');

        const conflictos = ImpresionChequesRepository.getPagosConNumeroCheque(numeros, subsidiarias[0], ids);
        if (conflictos.length) {
            const detalle = conflictos.map(c => `N° ${c.numCheque} en el pago ${c.documento}`).join('; ');
            return _error(`Los siguientes N° de cheque ya están registrados en otros pagos de la subsidiaria: ${detalle}.`);
        }

        const fechaHora  = new Date();
        const resultados = normalizados.map(({ id, numCheque }) => {
            try {
                ImpresionChequesRepository.marcarImpreso(id, numCheque, fechaHora);
                return { id, ok: true };
            } catch (e) {
                log.error('ImpresionChequesService | registrarImpresion', `Pago ${id}: ${e.message || e}`);
                return { id, ok: false, error: `Pago ${porId[id].documento}: ${e.message || e}` };
            }
        });

        const fallidos = resultados.filter(r => !r.ok);
        return {
            ok:        !fallidos.length,
            mensaje:   fallidos.length
                ? `No se pudieron actualizar algunos pagos: ${fallidos.map(f => f.error).join(' | ')}`
                : 'Pagos marcados como impresos.',
            resultados
        };
    };

    return { normalizarFiltros, obtenerDatosFormulario, registrarImpresion };
});
