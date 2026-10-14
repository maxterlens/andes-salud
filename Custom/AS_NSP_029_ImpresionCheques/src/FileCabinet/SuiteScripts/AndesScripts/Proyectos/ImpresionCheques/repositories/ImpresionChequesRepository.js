/**
 * @NApiVersion 2.1
 * Repository: Impresión de Cheques.
 *
 * Responsabilidad única: consultar NetSuite y devolver objetos planos.
 * Las fechas de filtro llegan en el formato de fecha del usuario (como las envía el formulario).
 */
define(['N/search', 'N/record', '../constants/ImpresionChequesConstants'], (search, record, Constants) => {

    /** Subsidiarias activas, sin las de eliminación. */
    const getSubsidiarias = () => {
        const resultado = [];
        search.create({
            type: search.Type.SUBSIDIARY,
            filters: [
                ['isinactive', 'is', 'F'], 'AND',
                ['iselimination', 'is', 'F']
            ],
            columns: [search.createColumn({ name: 'name', sort: search.Sort.ASC })]
        }).run().each((r) => {
            resultado.push({ id: r.id, nombre: r.getValue('name') });
            return true;
        });
        return resultado;
    };

    /**
     * Cuentas bancarias activas, opcionalmente filtradas por subsidiaria.
     * @param {string} subsidiaria
     */
    const getCuentasBancarias = (subsidiaria) => {
        const filtros = [['type', 'anyof', 'Bank'], 'AND', ['isinactive', 'is', 'F']];
        if (subsidiaria) filtros.push('AND', ['subsidiary', 'anyof', subsidiaria]);

        const resultado = [];
        search.create({
            type: search.Type.ACCOUNT,
            filters: filtros,
            columns: [search.createColumn({ name: 'name', sort: search.Sort.ASC })]
        }).run().each((r) => {
            resultado.push({ id: r.id, nombre: r.getValue('name') });
            return true;
        });
        return resultado;
    };

    /**
     * Impresoras configuradas (customrecord_as_config_cheque) activas de una subsidiaria.
     * @param {string} subsidiaria
     * @returns {{ id: string, nombre: string, predeterminada: boolean }[]}
     */
    const getImpresoras = (subsidiaria) => {
        if (!subsidiaria) return [];
        const { RECORD_TYPE, SUBSIDIARIA, PREDETERMINADA } = Constants.CONFIG_CHEQUE;

        const resultado = [];
        search.create({
            type: RECORD_TYPE,
            filters: [
                ['isinactive', 'is', 'F'], 'AND',
                [SUBSIDIARIA, 'anyof', subsidiaria]
            ],
            columns: [
                search.createColumn({ name: 'name', sort: search.Sort.ASC }),
                search.createColumn({ name: PREDETERMINADA })
            ]
        }).run().each((r) => {
            const pred = r.getValue(PREDETERMINADA);
            resultado.push({ id: r.id, nombre: r.getValue('name'), predeterminada: pred === true || pred === 'T' });
            return true;
        });
        return resultado;
    };

    /**
     * Id interno del valor "Cheque" de la lista AS Metodo de Pago ('' si no existe).
     * Se busca por nombre porque el id interno depende de la cuenta.
     */
    const getIdMetodoPagoCheque = () => {
        const { LISTA, VALOR_CHEQUE } = Constants.METODO_PAGO;
        const filas = search.create({
            type:    LISTA,
            filters: [['name', 'is', VALOR_CHEQUE], 'AND', ['isinactive', 'is', 'F']],
            columns: ['name']
        }).run().getRange({ start: 0, end: 1 });
        return filas.length ? String(filas[0].id) : '';
    };

    /** Condiciones comunes: pagos de factura no anulados, con método Cheque y en período abierto. */
    const _condicionesBase = (idMetodoCheque) => [
        ['type', 'anyof', 'VendPymt'], 'AND',
        ['mainline', 'is', 'T'], 'AND',
        ['voided', 'is', 'F'], 'AND',
        [Constants.PAGO.METODO_PAGO, 'anyof', idMetodoCheque], 'AND',
        ['accountingperiod.closed', 'is', 'F'], 'AND',
        ['accountingperiod.aplocked', 'is', 'F']
    ];

    /**
     * Pagos de factura imprimibles según filtros: método Cheque, no anulados y en período
     * abierto (ni cerrado ni bloqueado para cuentas por pagar). Trae como máximo `limite` filas.
     *
     * @param {{ subsidiaria: string, cuenta?: string, proveedor?: string, fechaDesde: string,
     *           fechaHasta: string, incluirImpresos: boolean }} filtros
     * @param {string} idMetodoCheque - id del valor "Cheque" de AS Metodo de Pago
     * @param {number} limite
     * @returns {{ id: string, documento: string, fecha: string, beneficiario: string,
     *             monto: number, nota: string, ultFechaImpresion: string, numCheque: string }[]}
     */
    const getPagosFactura = (filtros, idMetodoCheque, limite) => {
        const { PAGO } = Constants;
        const condiciones = _condicionesBase(idMetodoCheque).concat([
            'AND', ['subsidiary', 'anyof', filtros.subsidiaria],
            'AND', ['trandate', 'within', filtros.fechaDesde, filtros.fechaHasta]
        ]);
        if (filtros.cuenta)           condiciones.push('AND', ['account', 'anyof', filtros.cuenta]);
        if (filtros.proveedor)        condiciones.push('AND', ['entity', 'anyof', filtros.proveedor]);
        if (!filtros.incluirImpresos) condiciones.push('AND', [PAGO.CHEQUE_IMPRESO, 'is', 'F']);

        const filas = search.create({
            type: search.Type.VENDOR_PAYMENT,
            filters: condiciones,
            columns: [
                search.createColumn({ name: 'trandate', sort: search.Sort.DESC }),
                search.createColumn({ name: 'tranid' }),
                search.createColumn({ name: 'entity' }),
                search.createColumn({ name: 'fxamount' }),
                search.createColumn({ name: 'memo' }),
                search.createColumn({ name: PAGO.ULT_FECHA_IMPRESION }),
                search.createColumn({ name: PAGO.NUM_CHEQUE_FISICO })
            ]
        }).run().getRange({ start: 0, end: limite });

        return filas.map(r => ({
            id:                r.id,
            documento:         r.getValue('tranid') || '',
            fecha:             r.getValue('trandate'),
            beneficiario:      r.getText('entity'),
            monto:             Math.abs(Number(r.getValue('fxamount')) || 0),
            nota:              r.getValue('memo') || '',
            ultFechaImpresion: r.getValue(PAGO.ULT_FECHA_IMPRESION) || '',
            numCheque:         r.getValue(PAGO.NUM_CHEQUE_FISICO) || ''
        }));
    };

    /**
     * De los ids indicados, devuelve los que siguen siendo imprimibles (método Cheque,
     * no anulados, período abierto) con su subsidiaria.
     * @returns {{ id: string, subsidiaria: string, documento: string }[]}
     */
    const getPagosImprimibles = (ids, idMetodoCheque) => {
        if (!ids.length) return [];
        const filas = search.create({
            type: search.Type.VENDOR_PAYMENT,
            filters: _condicionesBase(idMetodoCheque).concat(['AND', ['internalid', 'anyof', ids]]),
            columns: ['subsidiary', 'tranid']
        }).run().getRange({ start: 0, end: 100 });

        return filas.map(r => ({ id: String(r.id), subsidiaria: String(r.getValue('subsidiary')), documento: r.getValue('tranid') || String(r.id) }));
    };

    /**
     * Pagos de la subsidiaria que ya tienen alguno de los números de cheque indicados,
     * excluyendo los pagos que se están imprimiendo.
     * @returns {{ id: string, documento: string, numCheque: string }[]}
     */
    const getPagosConNumeroCheque = (numeros, subsidiaria, excluirIds) => {
        if (!numeros.length) return [];
        const { PAGO } = Constants;

        const porNumero = [];
        numeros.forEach((n, i) => {
            if (i > 0) porNumero.push('OR');
            porNumero.push([PAGO.NUM_CHEQUE_FISICO, 'is', n]);
        });

        const filtros = [
            ['type', 'anyof', 'VendPymt'], 'AND',
            ['mainline', 'is', 'T'], 'AND',
            ['subsidiary', 'anyof', subsidiaria], 'AND',
            porNumero
        ];
        if (excluirIds.length) filtros.push('AND', ['internalid', 'noneof', excluirIds]);

        return search.create({
            type: search.Type.VENDOR_PAYMENT,
            filters: filtros,
            columns: ['tranid', PAGO.NUM_CHEQUE_FISICO]
        }).run().getRange({ start: 0, end: 100 }).map(r => ({
            id:        String(r.id),
            documento: r.getValue('tranid') || String(r.id),
            numCheque: r.getValue(PAGO.NUM_CHEQUE_FISICO)
        }));
    };

    /**
     * Marca el pago como impreso con el número de cheque y la fecha/hora indicados.
     * Solo actualiza campos de cabecera sin impacto contable.
     */
    const marcarImpreso = (id, numCheque, fechaHora) => {
        const { PAGO } = Constants;
        const valores = {};
        valores[PAGO.CHEQUE_IMPRESO]      = true;
        valores[PAGO.ULT_FECHA_IMPRESION] = fechaHora;
        valores[PAGO.NUM_CHEQUE_FISICO]   = numCheque;

        record.submitFields({
            type:    PAGO.RECORD_TYPE,
            id,
            values:  valores,
            options: { enableSourcing: false, ignoreMandatoryFields: true }
        });
    };

    /**
     * Configuraciones predeterminadas activas que comparten alguna de las subsidiarias.
     * @param {string[]} subsidiarias
     * @param {string}   [excluirId] - id de la configuración que se está guardando
     * @returns {{ id: string, nombre: string, subsidiarias: string }[]}
     */
    const getPredeterminadas = (subsidiarias, excluirId) => {
        if (!subsidiarias || !subsidiarias.length) return [];
        const { RECORD_TYPE, SUBSIDIARIA, PREDETERMINADA } = Constants.CONFIG_CHEQUE;

        const filtros = [
            ['isinactive', 'is', 'F'], 'AND',
            [PREDETERMINADA, 'is', 'T'], 'AND',
            [SUBSIDIARIA, 'anyof', subsidiarias]
        ];
        if (excluirId) filtros.push('AND', ['internalid', 'noneof', excluirId]);

        const resultado = [];
        search.create({
            type: RECORD_TYPE,
            filters: filtros,
            columns: [search.createColumn({ name: 'name' }), search.createColumn({ name: SUBSIDIARIA })]
        }).run().each((r) => {
            resultado.push({ id: r.id, nombre: r.getValue('name'), subsidiarias: r.getText(SUBSIDIARIA) });
            return true;
        });
        return resultado;
    };

    return {
        getSubsidiarias, getCuentasBancarias, getImpresoras, getPredeterminadas,
        getIdMetodoPagoCheque, getPagosFactura, getPagosImprimibles, getPagosConNumeroCheque, marcarImpreso
    };
});
