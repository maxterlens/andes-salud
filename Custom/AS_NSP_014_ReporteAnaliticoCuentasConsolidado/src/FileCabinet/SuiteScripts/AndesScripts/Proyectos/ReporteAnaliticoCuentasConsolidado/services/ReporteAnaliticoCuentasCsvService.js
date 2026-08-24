/**
 * AS_NSP_014 — Reporte Analítico de Cuentas Consolidado
 * @description Servicio de construcción y persistencia del CSV y XLS del reporte.
 *              Encapsula:
 *                - Mapeo de resultado de búsqueda → array de valores crudos (buildRow)
 *                - Cálculo de Saldo Debe / Saldo Haber por tipo de registro
 *                - Creación del archivo CSV con appendLine (crearArchivoCsv)
 *                - Creación del archivo XLS (XML Spreadsheet 2003) con appendLine (crearArchivoXls)
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
 *  Lógica de Agrupación (XLS solamente):
 *    Se agrupan filas por (Id Cuenta Contable, Id Subsidiaria, Id Entidad, Folio).
 *    Por cada grupo se compensan Saldo Debe y Saldo Haber; solo se conserva la fila
 *    representativa (primera del grupo) con el saldo neto dominante.
 *
 * @NApiVersion 2.1
 * @NModuleScope Public
 */
define(['N/file'], function (file) {

    /* ─── Grupos de tipos de registro (valores internos Oracle) ──────── */
    const RT_FACTURA = ['invoice', 'vendorbill', 'creditmemo', 'vendorcredit'];
    const RT_PAGO    = ['customerdeposit', 'vendorprepayment', 'customerpayment', 'vendorpayment'];
    const RT_ASIENTO = 'journalentry';

    /* ─── Cabecera del XLS (15 columnas) ────────────────────────────── */
    const XLS_HEADERS = [
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

    /* ─── Cabecera del CSV (17 columnas: XLS + IDs de agrupación) ───── */
    const CSV_HEADERS = XLS_HEADERS.concat(['Id Subsidiaria', 'Id Entidad']);

    /* ──────────────────────────────────────────────────────────────────── */
    /**
     * Mapea un resultado de búsqueda a un array de 17 valores crudos (sin escapar).
     *
     * Índices:
     *   [0]  Id Transaccion
     *   [1]  Id Cuenta Contable
     *   [2]  Subsidiaria (texto display)
     *   [3]  Tipo de Transaccion
     *   [4]  Nombre (entidad, texto display)
     *   [5]  Folio
     *   [6]  Numero Documento
     *   [7]  Glosa
     *   [8]  Fecha
     *   [9]  Periodo Contable
     *   [10] Cuenta Contable
     *   [11] Debe
     *   [12] Haber
     *   [13] Saldo Debe
     *   [14] Saldo Haber
     *   [15] Id Subsidiaria  (valor interno — para CSV y clave de agrupación XLS)
     *   [16] Id Entidad      (valor interno — para CSV y clave de agrupación XLS)
     *
     * @param   {Object} result - Resultado de búsqueda parseado (JSON.parse(context.value))
     * @returns {Array}  Array con los 17 valores del reporte
     */
    function buildRow(result) {
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
            result.id,                              // [0]  Id Transaccion
            _val(vals.account),                      // [1]  Id Cuenta Contable
            _txt(vals.subsidiarynohierarchy),        // [2]  Subsidiaria (texto)
            _txt(vals.type),                        // [3]  Tipo de Transaccion
            _txt(vals.entity),                      // [4]  Nombre (entidad texto)
            folio,                                  // [5]  Folio
            _val(vals.tranid),                      // [6]  Numero Documento
            _val(vals.memo),                        // [7]  Glosa
            _val(vals.trandate),                    // [8]  Fecha
            _txt(vals.postingperiod),               // [9]  Periodo Contable
            _txt(vals.account),                     // [10] Cuenta Contable
            debe,                                   // [11] Debe
            haber,                                  // [12] Haber
            saldo.saldoDebe,                        // [13] Saldo Debe
            saldo.saldoHaber,                       // [14] Saldo Haber
            _val(vals.subsidiarynohierarchy),        // [15] Id Subsidiaria (valor interno)
            _val(vals.entity),                      // [16] Id Entidad (valor interno)
        ];
    }

    /* ──────────────────────────────────────────────────────────────────── */
    /**
     * Mapea los 21 campos de una línea CSV (exportada por SearchTask) a un array
     * de 17 valores crudos con la misma estructura que buildRow().
     *
     * Índices de entrada (cols[], 0-based):
     *   0  internalid            → Id Transaccion
     *   1  formulanumeric {subsidiary.internalid} → Id Subsidiaria
     *   2  subsidiarynohierarchy → Subsidiaria (texto)
     *   3  type (display)        → Tipo de Transaccion
     *   4  recordtype            → Tipo Registro (vendorbill, journalentry, …)
     *   5  formulanumeric {name.id} → Id Entidad
     *   6  entity (texto)        → Nombre
     *   7  postingperiod         → Periodo Contable
     *   8  trandate              → Fecha
     *   9  tranid                → Numero Documento / Folio vendorbill
     *   10 custbody_2winfolioacepta → Folio otros
     *   11 custcol_2w_folio      → Folio journalentry
     *   12 memo                  → Glosa
     *   13 account.internalid    → Id Cuenta Contable
     *   14 account (texto)       → Cuenta Contable
     *   15 accounttype           → (no se usa en el reporte)
     *   16 mainline              → Main Line ("Yes"/"No")
     *   17 debitamount           → Debe
     *   18 creditamount          → Haber
     *   19 amountremaining       → Importe Restante
     *   20 amountpaid            → Importe Pagado
     *
     * @param   {string[]} cols  21 campos del CSV ya parseados (sin comillas)
     * @returns {Array}          Array con los 17 valores del reporte
     */
    function buildRowFromCsv(cols) {
        var recordtype = _strCsv(cols[4]);
        var isMainline = _isMainlineCsv(cols[16]);

        var debe    = _numCsv(cols[17]);
        var haber   = _numCsv(cols[18]);
        var amtRem  = _numCsv(cols[19]);
        var amtPaid = _numCsv(cols[20]);

        /* ── Folio según tipo de registro ────────────────────────────── */
        var folio = '';
        if (recordtype === 'vendorbill') {
            folio = _strCsv(cols[9]);   // tranid
        } else if (recordtype === 'journalentry') {
            folio = _strCsv(cols[11]);  // custcol_2w_folio
        } else {
            folio = _strCsv(cols[10]);  // custbody_2winfolioacepta
        }

        /* ── Saldo Debe / Saldo Haber ────────────────────────────────── */
        var saldo = _calcSaldo(recordtype, isMainline, debe, haber, amtRem, amtPaid);

        return [
            _strCsv(cols[0]),           // [0]  Id Transaccion
            _strCsv(cols[13]),          // [1]  Id Cuenta Contable
            _strCsv(cols[2]),           // [2]  Subsidiaria (texto)
            _strCsv(cols[3]),           // [3]  Tipo de Transaccion
            _strCsv(cols[6]),           // [4]  Nombre (entidad)
            folio,                      // [5]  Folio
            _strCsv(cols[9]),           // [6]  Numero Documento (tranid)
            _strCsv(cols[12]),          // [7]  Glosa
            _strCsv(cols[8]),           // [8]  Fecha
            _strCsv(cols[7]),           // [9]  Periodo Contable
            _strCsv(cols[14]),          // [10] Cuenta Contable (texto)
            debe,                       // [11] Debe
            haber,                      // [12] Haber
            saldo.saldoDebe,            // [13] Saldo Debe
            saldo.saldoHaber,           // [14] Saldo Haber
            _strCsv(cols[1]),           // [15] Id Subsidiaria
            _strCsv(cols[5]),           // [16] Id Entidad
        ];
    }

    /* ──────────────────────────────────────────────────────────────────── */
    /**
     * Crea el archivo CSV en el File Cabinet y devuelve su internal ID.
     * Escribe las 17 columnas (15 del reporte + Id Subsidiaria + Id Entidad).
     *
     * @param   {Object}         opts
     * @param   {Array[]}        opts.rows      Arrays de 17 valores crudos (de buildRow)
     * @param   {string}         opts.nombre    Nombre del archivo (con extensión .csv)
     * @param   {string|number}  opts.folderId  ID de la carpeta en File Cabinet
     * @returns {number}  Internal ID del archivo creado
     */
    function crearArchivoCsv(opts) {
        const rows     = opts.rows     || [];
        const nombre   = opts.nombre   || 'reporte.csv';
        const folderId = opts.folderId || -15;

        const csvFile = file.create({
            name    : nombre,
            fileType: file.Type.CSV,
            contents: CSV_HEADERS.join(','),
            folder  : folderId,
            encoding: file.Encoding.UTF_8,
        });

        for (const row of rows) {
            const line = row.map(_escapeCsv).join(',');
            if (line === '') continue;
            csvFile.appendLine({ value: line });
        }

        return csvFile.save();
    }

    /* ──────────────────────────────────────────────────────────────────── */
    /**
     * Crea el archivo XLS (formato XML Spreadsheet 2003) en el File Cabinet
     * y devuelve su internal ID. Compatible con Excel sin librerías externas.
     *
     * Aplica agrupación/compensación (_compensarFilas) antes de escribir.
     * Solo escribe las 15 primeras columnas por fila (sin IDs de agrupación).
     *
     * @param   {Object}         opts
     * @param   {Array[]}        opts.rows      Arrays de 17 valores crudos (de buildRow)
     * @param   {string}         opts.nombre    Nombre del archivo (con extensión .xls)
     * @param   {string|number}  opts.folderId  ID de la carpeta en File Cabinet
     * @returns {number}  Internal ID del archivo creado
     */
    function crearArchivoXls(opts) {
        const rows     = opts.rows     || [];
        const nombre   = opts.nombre   || 'reporte.xls';
        const folderId = opts.folderId || -15;

        /* ── Agrupar y compensar filas antes de escribir ─────────────── */
        const rowsXls = _compensarFilas(rows);

        /* Encabezado XML + definición de estilos + primera fila de headers en negrita */
        const xmlInicio =
            '<?xml version="1.0" encoding="UTF-8"?>\n' +
            '<?mso-application progid="Excel.Sheet"?>\n' +
            '<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"\n' +
            ' xmlns:o="urn:schemas-microsoft-com:office:office"\n' +
            ' xmlns:x="urn:schemas-microsoft-com:office:excel"\n' +
            ' xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"\n' +
            ' xmlns:html="http://www.w3.org/TR/REC-html40">\n' +
            '<Styles>\n' +
            ' <Style ss:ID="Default" ss:Name="Normal">\n' +
            '  <Font ss:FontName="Arial" ss:Size="8"/>\n' +
            ' </Style>\n' +
            ' <Style ss:ID="sHeader">\n' +
            '  <Font ss:FontName="Arial" x:Family="Swiss" ss:Size="8" ss:Bold="1"/>\n' +
            '  <Interior ss:Color="#DBDBDB" ss:Pattern="Solid"/>\n' +
            ' </Style>\n' +
            '</Styles>\n' +
            '<Worksheet ss:Name="Reporte">\n' +
            '<Table>\n' +
            _buildXlsRow(XLS_HEADERS, true, 'sHeader');

        const xlsFile = file.create({
            name    : nombre,
            fileType: file.Type.PLAINTEXT,
            contents: xmlInicio,
            folder  : folderId,
            encoding: file.Encoding.UTF_8,
        });

        /* Filas de datos — solo las 15 primeras columnas */
        for (const row of rowsXls) {
            xlsFile.appendLine({ value: _buildXlsRow(row.slice(0, 15), false) });
        }

        /* Cierre del XML + WorksheetOptions para congelar la primera fila */
        xlsFile.appendLine({ value:
            '</Table>\n' +
            '<WorksheetOptions xmlns="urn:schemas-microsoft-com:office:excel">\n' +
            ' <FreezePanes/>\n' +
            ' <FrozenNoSplit/>\n' +
            ' <SplitHorizontal>1</SplitHorizontal>\n' +
            ' <TopRowBottomPane>1</TopRowBottomPane>\n' +
            ' <ActivePane>2</ActivePane>\n' +
            ' <Panes>\n' +
            '  <Pane><Number>3</Number></Pane>\n' +
            '  <Pane><Number>2</Number><ActiveRow>0</ActiveRow></Pane>\n' +
            ' </Panes>\n' +
            '</WorksheetOptions>\n' +
            '</Worksheet>\n</Workbook>'
        });

        return xlsFile.save();
    }

    /* ──────────────────────────────────────────────────────────────────── */
    /**
     * Genera el nombre de archivo estándar del reporte.
     *
     * @param   {string|null} subsidiariaId  Internal ID de la subsidiaria (o null para ALL)
     * @param   {string|null} fechaCorte     Fecha en formato NS (MM/DD/YYYY), o null
     * @param   {string}      [extension]    Extensión del archivo: 'csv' (default) | 'xls'
     * @returns {string}  Ej: "ReporteAnaliticoCuentas_3_01-31-2025.csv"
     */
    function generarNombreArchivo(subsidiariaId, fechaCorte, extension) {
        const ext = extension || 'csv';
        const tag = fechaCorte ? fechaCorte.replace(/\//g, '-') : 'SFECHA';
        return 'ReporteAnaliticoCuentas_' + (subsidiariaId || 'ALL') + '_' + tag + '.' + ext;
    }

    /* ═══ Lógica de Agrupación y Compensación (XLS) ════════════════════ */

    /**
     * Agrupa las filas por (Id Cuenta Contable, Id Subsidiaria, Id Entidad, Folio)
     * y aplica compensación de Saldo Debe vs Saldo Haber por grupo.
     *
     * Reglas:
     *   - Las filas SIN folio (row[5] = '') se excluyen de la agrupación y se
     *     escriben en el XLS tal cual, cada una como fila independiente.
     *   - Por cada grupo CON folio:
     *       · Se suman todos los Saldo Debe (row[13]) y Saldo Haber (row[14]).
     *       · neto = sumDebe − sumHaber.
     *       · Si neto ≥ 0 → saldoDebe = neto, saldoHaber = 0.
     *       · Si neto < 0 → saldoDebe = 0, saldoHaber = |neto|.
     *       · Solo se conserva la primera fila del grupo (representativa); las
     *         demás se descartan.
     *   - El orden de aparición original se preserva.
     *
     * Clave de grupo:  row[1] | row[15] | row[16] | row[5]
     *   row[1]  = Id Cuenta Contable
     *   row[15] = Id Subsidiaria (valor interno)
     *   row[16] = Id Entidad (valor interno)
     *   row[5]  = Folio
     *
     * @param   {Array[]} rows  Arrays de 17 valores (salida de buildRow)
     * @returns {Array[]}       Filas consolidadas (una por grupo), en orden de aparición
     */
    function _compensarFilas(rows) {
        /* ── Pasada 1: acumular saldos por grupo (solo filas CON folio) ── */
        var grupos = {};
        for (var i = 0; i < rows.length; i++) {
            var row = rows[i];
            if (!row[5]) continue; // sin folio → se excluye de la agrupación

            var key = row[1] + '|' + row[15] + '|' + row[16] + '|' + row[5];
            if (!grupos[key]) {
                grupos[key] = {
                    rep     : row.slice(), // primera fila del grupo (representativa)
                    sumDebe : 0,
                    sumHaber: 0,
                };
            }
            grupos[key].sumDebe  += Number(row[13]) || 0;
            grupos[key].sumHaber += Number(row[14]) || 0;
        }

        /* Calcular saldo neto para cada grupo */
        for (var gkey in grupos) {
            var g    = grupos[gkey];
            var neto = g.sumDebe - g.sumHaber;
            if (neto >= 0) { g.rep[13] = neto;  g.rep[14] = 0;     }
            else           { g.rep[13] = 0;      g.rep[14] = -neto; }
        }

        /* ── Pasada 2: emitir en orden de aparición original ─────────── */
        var resultado = [];
        var emitidos  = {};
        for (var j = 0; j < rows.length; j++) {
            var r = rows[j];
            if (!r[5]) {
                /* Sin folio: pasa sin agrupar (cada fila es independiente) */
                resultado.push(r.slice());
                continue;
            }
            var k = r[1] + '|' + r[15] + '|' + r[16] + '|' + r[5];
            if (!emitidos[k]) {
                resultado.push(grupos[k].rep); // representativa con saldo neto
                emitidos[k] = true;
                /* Las filas siguientes del mismo grupo se descartan (ya acumuladas) */
            }
        }

        return resultado;
    }

    /* ═══ Lógica de Saldo Debe / Saldo Haber ═══════════════════════════ */

    /**
     * @param {string}  recordtype
     * @param {boolean} isMainline
     * @param {number}  debe
     * @param {number}  haber
     * @param {number}  amtRem
     * @param {number}  amtPaid
     * @returns {{ saldoDebe: number, saldoHaber: number }}
     */
    function _calcSaldo(recordtype, isMainline, debe, haber, amtRem, amtPaid) {
        var saldoDebe = 0, saldoHaber = 0;

        if (RT_FACTURA.indexOf(recordtype) !== -1) {
            if (isMainline) {
                if (debe > 0)  saldoDebe  = amtRem;
                else           saldoHaber = amtRem;
            } else {
                saldoDebe  = debe;
                saldoHaber = haber;
            }
        } else if (RT_PAGO.indexOf(recordtype) !== -1 || recordtype === RT_ASIENTO) {
            var saldo = Math.abs(debe - haber) - amtPaid;
            if (debe > 0)  saldoDebe  = saldo;
            else           saldoHaber = saldo;
        }

        return { saldoDebe: saldoDebe, saldoHaber: saldoHaber };
    }

    /* ═══ Helpers XLS ═══════════════════════════════════════════════════ */

    /**
     * Construye el string XML de una fila para el XLS.
     * Los encabezados siempre son String; los valores numéricos se tipan como Number.
     * @param {Array}   cells     Valores de la fila
     * @param {boolean} isHeader  true → fuerza tipo String en todas las celdas
     * @param {string}  [styleId] ss:StyleID a aplicar en cada celda
     */
    function _buildXlsRow(cells, isHeader, styleId) {
        var styleAttr = styleId ? ' ss:StyleID="' + styleId + '"' : '';
        var cellsXml  = '';
        for (var i = 0; i < cells.length; i++) {
            var val  = (cells[i] === null || cells[i] === undefined) ? '' : String(cells[i]);
            var type = (isHeader || !_isNumeric(val)) ? 'String' : 'Number';
            cellsXml += '<Cell' + styleAttr + '><Data ss:Type="' + type + '">' + _escapeXml(val) + '</Data></Cell>';
        }
        return '<Row>' + cellsXml + '</Row>';
    }

    /** Retorna true si el valor puede representarse como número en Excel */
    function _isNumeric(val) {
        return val !== '' && !isNaN(Number(val));
    }

    /** Escapa caracteres especiales para XML */
    function _escapeXml(val) {
        return String(val)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
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

    /* ═══ Helpers CSV (para buildRowFromCsv) ═══════════════════════════ */

    /** Limpia y retorna el campo CSV como string; '' si nulo/undefined */
    function _strCsv(str) {
        return (str === null || str === undefined) ? '' : String(str).trim();
    }

    /**
     * Convierte un campo numérico del CSV a número.
     * Elimina separadores de miles (comas) antes de parsear.
     * Devuelve 0 si no es parseable.
     */
    function _numCsv(str) {
        var s = (str === null || str === undefined) ? '' : String(str).replace(/,/g, '').trim();
        var n = parseFloat(s);
        return isNaN(n) ? 0 : n;
    }

    /**
     * Interpreta el campo mainline del CSV como booleano.
     * Acepta: "Yes", "*", "T", "1", "true", "sí", "si" (case-insensitive).
     */
    function _isMainlineCsv(val) {
        if (val === null || val === undefined) return false;
        var s = String(val).trim().toLowerCase();
        return s === 'yes' || s === '*' || s === 't' || s === '1' || s === 'true' || s === 'sí' || s === 'si';
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
        XLS_HEADERS         : XLS_HEADERS,
        buildRow            : buildRow,
        buildRowFromCsv     : buildRowFromCsv,
        crearArchivoCsv     : crearArchivoCsv,
        crearArchivoXls     : crearArchivoXls,
        generarNombreArchivo: generarNombreArchivo,
    };
});
