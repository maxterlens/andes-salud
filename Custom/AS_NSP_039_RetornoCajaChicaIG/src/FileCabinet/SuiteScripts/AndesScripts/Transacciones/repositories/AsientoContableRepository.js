/**
 * @NApiVersion 2.1
 * @NModuleScope SameAccount
 * @file AsientoContableRepository.js
 * @description Acceso a datos del asiento contable de rendición de caja chica (AS_NSP_039).
 */
define(['N/record', 'N/search'], (record, search) => {

    const ESTADO_APROBADO = '2';

    const MESES = [
        'ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO',
        'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'
    ];

    const CAMPOS_LINEA = {
        FOLIO            : 'custcol_2w_folio',
        FECHA_DOCUMENTO  : 'custcol8',
        FECHA_VENCIMIENTO: 'custcol2',
        INFORME_ORIGEN   : 'custcol_as_informe_gasto_origen'
    };

    const pad = (n) => String(n).padStart(2, '0');

    /** Último día del mes de la fecha en formato DDMMYYYY. */
    const getFolio = (fecha) => {
        const ultimoDia = new Date(fecha.getFullYear(), fecha.getMonth() + 1, 0);
        return `${pad(ultimoDia.getDate())}${pad(ultimoDia.getMonth() + 1)}${ultimoDia.getFullYear()}`;
    };

    /** CONTAB. DE RENDICION CAJA CHICA <MES> <AÑO> - <tranid del informe de gastos> */
    const getNota = (fecha, informeTranId) => {
        const base = `CONTAB. DE RENDICION CAJA CHICA ${MESES[fecha.getMonth()]} ${fecha.getFullYear()}`;
        return informeTranId ? `${base} - ${informeTranId}` : base;
    };

    /**
     * Crea el asiento aprobado: Debe cuenta de anticipo / Haber cuenta de cabecera del informe.
     * La fecha queda por defecto en la fecha actual (fecha de aprobación del informe).
     * @returns {number} id del asiento
     */
    const crear = ({ informeId, informeTranId, empleado, subsidiaria, moneda, tipoCambio, cuentaDebe, cuentaHaber, importe }) => {
        const asiento = record.create({ type: record.Type.JOURNAL_ENTRY, isDynamic: false });

        asiento.setValue({ fieldId: 'subsidiary', value: subsidiaria });
        if (moneda) asiento.setValue({ fieldId: 'currency', value: moneda });
        if (tipoCambio) asiento.setValue({ fieldId: 'exchangerate', value: tipoCambio });

        const fecha = asiento.getValue({ fieldId: 'trandate' }) || new Date();
        asiento.setValue({ fieldId: 'trandate', value: fecha });

        const nota  = getNota(fecha, informeTranId);
        const folio = getFolio(fecha);

        asiento.setValue({ fieldId: 'memo', value: nota });
        asiento.setValue({ fieldId: 'approvalstatus', value: ESTADO_APROBADO });

        const lineas = [
            { account: cuentaDebe,  debit : importe },
            { account: cuentaHaber, credit: importe }
        ];

        lineas.forEach((linea, line) => {
            const set = (fieldId, value) => asiento.setSublistValue({ sublistId: 'line', fieldId, line, value });
            set('account', linea.account);
            if (linea.debit)  set('debit', linea.debit);
            if (linea.credit) set('credit', linea.credit);
            set('entity', empleado);
            set('memo', nota);
            set(CAMPOS_LINEA.FOLIO, folio);
            set(CAMPOS_LINEA.FECHA_DOCUMENTO, fecha);
            set(CAMPOS_LINEA.FECHA_VENCIMIENTO, fecha);
            set(CAMPOS_LINEA.INFORME_ORIGEN, informeId);
        });

        return asiento.save({ enableSourcing: true, ignoreMandatoryFields: false });
    };

    /**
     * Importe actual del asiento (débito de la línea de anticipo).
     * @returns {number|null} null si el asiento ya no existe
     */
    const getImporte = (id) => {
        try {
            const asiento = record.load({ type: record.Type.JOURNAL_ENTRY, id });
            const lineas  = asiento.getLineCount({ sublistId: 'line' });
            for (let line = 0; line < lineas; line++) {
                const debito = Number(asiento.getSublistValue({ sublistId: 'line', fieldId: 'debit', line })) || 0;
                if (debito > 0) return debito;
            }
            return 0;
        } catch (e) {
            if (e.name === 'RCRD_DSNT_EXIST') return null;
            throw e;
        }
    };

    /** Actualiza el importe de las líneas de débito y crédito. */
    const actualizarImporte = (id, importe) => {
        const asiento = record.load({ type: record.Type.JOURNAL_ENTRY, id });
        const lineas  = asiento.getLineCount({ sublistId: 'line' });

        for (let line = 0; line < lineas; line++) {
            const debito = Number(asiento.getSublistValue({ sublistId: 'line', fieldId: 'debit', line })) || 0;
            const campo  = debito > 0 ? 'debit' : 'credit';
            asiento.setSublistValue({ sublistId: 'line', fieldId: campo, line, value: importe });
        }
        return asiento.save({ enableSourcing: true, ignoreMandatoryFields: false });
    };

    const eliminar = (id) => record.delete({ type: record.Type.JOURNAL_ENTRY, id });

    /** true si el asiento tiene transacciones que lo aplican (pagos). */
    const estaPagado = (id) => search.create({
        type   : search.Type.JOURNAL_ENTRY,
        filters: [
            ['internalid', 'anyof', id], 'AND',
            ['applyingtransaction', 'noneof', '@NONE@']
        ],
        columns: ['internalid']
    }).runPaged().count > 0;

    const getTranId = (id) => {
        try {
            return search.lookupFields({ type: search.Type.JOURNAL_ENTRY, id, columns: ['tranid'] }).tranid || id;
        } catch (e) {
            return id;
        }
    };

    return { crear, getImporte, actualizarImporte, eliminar, estaPagado, getTranId };
});
