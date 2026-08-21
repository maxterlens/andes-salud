/**
 * AS_NSP_014 — Reporte Analítico de Cuentas Consolidado
 * @description Servicio de construcción y persistencia del CSV del reporte.
 *              Encapsula:
 *                - Mapeo de resultado de búsqueda → fila CSV (lógica de folio y saldo)
 *                - Cálculo de Saldo Debe / Saldo Haber por tipo de registro
 *                - Creación y guardado del archivo CSV en el File Cabinet
 *
 *  Lógica de Folio:
 *    vendorbill   → tranid
 *    journalentry → custcol_2w_folio
 *    otros        → custbody_2winfolioacepta
 *
 *  Lógica de Saldo (por tipo de registro):
 *    Facturas y NC (mainline) : Saldo = amountremaining  (en Debe o Haber según signo original)
 *    Facturas y NC (detalle)  : Saldo = importe de la línea (debe / haber)
 *    Pagos, anticipos, AJ     : Saldo = |Debe - Haber| − amountpaid
 *
 * @NApiVersion 2.1
 * @NModuleScope Public
 */
define(['N/file'], function (file) {

    /* ─── Grupos de tipos de registro (valores internos Oracle) ──────── */
    const RT_FACTURA = ['invoice', 'vendorbill', 'creditmemo', 'vendorcredit'];
    const RT_PAGO    = ['customerdeposit', 'vendorprepayment', 'customerpayment', 'vendorpayment'];
    const RT_ASIENTO = 'journalentry';

    /* ─── Cabecera del CSV ────────────────────────────────────────────── */
    const CSV_HEADERS = [
        'Id Transaccion',
        'Id Cuenta Contable',
        'Subsidiaria',
        'Tipo de Transaccion',
        'Nombre',
        'Folio',
        'Numero Documento',
        'Glosa',
        'Fecha',
        'Periodo Contable',
        'Cuenta Contable',
        'Debe',
        'Haber',
        'Saldo Debe',
        'Saldo Haber',
    ];

    /* ──────────────────────────────────────────────────────────────────── */
    /**
     * Mapea un resultado de búsqueda al string de una línea CSV.
     * Recibe el objeto result ya parseado (JSON.parse(context.value) del map).
     *
     * @param   {Object} result - Resultado de búsqueda parseado
     * @returns {string}  Línea CSV con los 15 campos esperados
     */
    function buildCsvRow(result) {
        log.error('result', result);
        const vals       = result.values;
        const recordtype = _val(vals.recordtype);
        const isMainline = _val(vals.mainline) === '*';

        const debe    = _num(vals.debitamount);
        const haber   = _num(vals.creditamount);
        const amtRem  = _num(vals.amountremaining);
        const amtPaid = _num(vals.amountpaid);

        /* ── Folio según tipo de registro ────────────────────────────── */
        var folio = '';
        if (recordtype === 'vendorbill') {
            folio = _val(vals.tranid);
        } else if (recordtype === RT_ASIENTO) {
            folio = _val(vals['custcol_2w_folio']);
        } else {
            folio = _val(vals.custbody_2winfolioacepta);
        }

        /* ── Saldo Debe / Saldo Haber ────────────────────────────────── */
        const saldo = _calcSaldo(recordtype, isMainline, debe, haber, amtRem, amtPaid);

        return [
            result.id,
            _val(vals['account.internalid']),
            _txt(vals.subsidiarynohierarchy),
            _txt(vals.type),
            _txt(vals.entity),
            folio,
            _val(vals.tranid),
            _val(vals.memo),
            _val(vals.trandate),
            _txt(vals.postingperiod),
            _txt(vals.account),
            debe,
            haber,
            saldo.saldoDebe,
            saldo.saldoHaber,
        ].map(_escapeCsv).join(',');
    }

    /* ──────────────────────────────────────────────────────────────────── */
    /**
     * Crea el archivo CSV en el File Cabinet y devuelve su internal ID.
     * La cabecera (CSV_HEADERS) se agrega automáticamente como primera línea.
     *
     * @param   {Object}         opts
     * @param   {string[]}       opts.lines      Filas de datos (sin cabecera)
     * @param   {string}         opts.nombre     Nombre del archivo destino (con .csv)
     * @param   {string|number}  opts.folderId   ID de la carpeta en File Cabinet
     * @returns {number}  Internal ID del archivo creado
     */
    function crearArchivoCsv(opts) {
        const lines    = opts.lines    || [];
        const nombre   = opts.nombre   || 'reporte.csv';
        const folderId = opts.folderId || -15;   // -15 = raíz SuiteScripts como fallback

        const csvFile = file.create({
            name    : nombre,
            fileType: file.Type.CSV,
            contents: [CSV_HEADERS.join(',')].concat(lines).join('\n'),
            folder  : folderId,
            encoding: file.Encoding.UTF_8,
        });

        return csvFile.save();
    }

    /* ──────────────────────────────────────────────────────────────────── */
    /**
     * Genera el nombre de archivo estándar del reporte.
     *
     * @param   {string|null} subsidiariaId  Internal ID de la subsidiaria (o null para ALL)
     * @param   {string|null} fechaCorte     Fecha en formato NS (MM/DD/YYYY), o null
     * @returns {string}  Ej: "ReporteAnaliticoCuentas_3_01-31-2025.csv"
     */
    function generarNombreArchivo(subsidiariaId, fechaCorte) {
        const tag = fechaCorte ? fechaCorte.replace(/\//g, '-') : 'SFECHA';
        return 'ReporteAnaliticoCuentas_' + (subsidiariaId || 'ALL') + '_' + tag + '.csv';
    }

    /* ═══ Lógica de Saldo Debe / Saldo Haber ═══════════════════════════ */

    /**
     * @param {string}  recordtype
     * @param {boolean} isMainline  true cuando la línea es cabecera (*) de la transacción
     * @param {number}  debe        debitamount de la línea
     * @param {number}  haber       creditamount de la línea
     * @param {number}  amtRem      amountremaining (facturas / NC)
     * @param {number}  amtPaid     amountpaid (pagos / asientos)
     * @returns {{ saldoDebe: number, saldoHaber: number }}
     */
    function _calcSaldo(recordtype, isMainline, debe, haber, amtRem, amtPaid) {
        var saldoDebe = 0, saldoHaber = 0;

        if (RT_FACTURA.indexOf(recordtype) !== -1) {
            /* Facturas y notas de crédito
             *   Línea mainline → saldo total = amountremaining
             *   Líneas de detalle → se expone el importe directo de la línea */
            if (isMainline) {
                if (debe > 0)  saldoDebe  = amtRem;
                else           saldoHaber = amtRem;
            } else {
                saldoDebe  = debe;
                saldoHaber = haber;
            }

        } else if (RT_PAGO.indexOf(recordtype) !== -1 || recordtype === RT_ASIENTO) {
            /* Pagos, anticipos y asientos contables
             *   Saldo = |Debe - Haber| − amountpaid */
            var saldo = Math.abs(debe - haber) - amtPaid;
            if (debe > 0)  saldoDebe  = saldo;
            else           saldoHaber = saldo;
        }

        return { saldoDebe: saldoDebe, saldoHaber: saldoHaber };
    }

    /* ═══ Helpers de acceso a valores de columna ════════════════════════ */

    /** Devuelve el valor interno (.value) del campo; '' si es nulo/vacío */
    function _val(fieldVal) {
        if (fieldVal === null || fieldVal === undefined) return '';
        if (Array.isArray(fieldVal))
            return (fieldVal[0] && fieldVal[0].value != null) ? String(fieldVal[0].value) : '';
        if (typeof fieldVal === 'object')
            return fieldVal.value != null ? String(fieldVal.value) : '';
        return String(fieldVal);
    }

    /** Devuelve el texto de display (.text); cae a _val si no hay .text */
    function _txt(fieldVal) {
        if (fieldVal === null || fieldVal === undefined) return '';
        if (Array.isArray(fieldVal))
            return (fieldVal[0] && fieldVal[0].text != null) ? String(fieldVal[0].text) : _val(fieldVal);
        if (typeof fieldVal === 'object')
            return fieldVal.text != null ? String(fieldVal.text) : _val(fieldVal);
        return String(fieldVal);
    }

    /** Convierte a número; devuelve 0 si no es parseable */
    function _num(fieldVal) {
        var n = parseFloat(_val(fieldVal));
        return isNaN(n) ? 0 : n;
    }

    /** Escapa un valor para CSV: encierra en comillas si tiene coma, comilla o salto de línea */
    function _escapeCsv(val) {
        var str = (val === null || val === undefined) ? '' : String(val);
        return (str.indexOf(',') !== -1 || str.indexOf('"') !== -1 || str.indexOf('\n') !== -1)
            ? '"' + str.replace(/"/g, '""') + '"'
            : str;
    }

    return {
        CSV_HEADERS         : CSV_HEADERS,
        buildCsvRow         : buildCsvRow,
        crearArchivoCsv     : crearArchivoCsv,
        generarNombreArchivo: generarNombreArchivo,
    };
});
