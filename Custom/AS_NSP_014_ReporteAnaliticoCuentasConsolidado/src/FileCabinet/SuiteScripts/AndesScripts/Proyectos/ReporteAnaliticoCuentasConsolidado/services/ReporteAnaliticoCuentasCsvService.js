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
    const RT_ASIENTO = ['journalentry','advintercompanyjournalentry'];

    /* ─── Cuentas que usan ficha paciente como folio en facturas de venta ─
     *  Para invoice cuyo account.number (cols[15]) esté en esta lista,
     *  el folio se toma de custbody_2w_as_ficha_paciente (cols[25])
     *  en lugar de custbody_2winfolioacepta (cols[11]).
     * ─────────────────────────────────────────────────────────────────── */
    const CUENTAS_FICHA_PACIENTE = ['1140001'];

    /* ─── Cabecera del XLS (17 columnas) ────────────────────────────── */
    const XLS_HEADERS = [
        'Id Transaccion',
        'Id Cuenta Contable',
        'Subsidiaria',
        'Tipo de Transaccion',
        'RUT',
        'Nombre',
        'Folio',
        'Numero Documento',
        'Glosa',
        'Fecha',
        'Periodo Contable',
        'Numero de Cuenta',
        'Nombre Cuenta',
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
        } else if (RT_ASIENTO.indexOf(recordtype) !== -1) {
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
     * Mapea los 24 campos de una línea CSV (exportada por SearchTask) a un array
     * de 19 valores crudos con la misma estructura que buildRow() más Nombre Cuenta y la fecha YYYYMMDD.
     *
     * Índices de entrada (cols[], 0-based):
     *   0  internalid            → Id Transaccion
     *   1  formulanumeric {subsidiary.internalid} → Id Subsidiaria
     *   2  subsidiarynohierarchy → Subsidiaria (texto)
     *   3  type (display)        → Tipo de Transaccion
     *   4  recordtype            → Tipo Registro (vendorbill, journalentry, …)
     *   5  formulanumeric {entity.id} → Id Entidad
     *   6  entity (texto)        → Nombre
     *   7  custentity_2wrut      → RUT (para rutsPorEntidad en el SS)
     *   8  postingperiod         → Periodo Contable
     *   9  trandate              → Fecha (formato DD/MM/YYYY del entorno)
     *   10 tranid                → Numero Documento / Folio vendorbill
     *   11 custbody_2winfolioacepta → Folio otros
     *   12 custcol_2w_folio      → Folio journalentry
     *   13 memo                  → Glosa
     *   14 account.internalid    → Id Cuenta Contable
     *   15 account.number (join)  → Numero de Cuenta
     *   16 formulatext displayname → Nombre Cuenta
     *   17 accounttype           → (no se usa en el reporte)
     *   18 mainline              → Main Line ("Yes"/"No")
     *   19 debitamount           → Debe
     *   20 creditamount          → Haber
     *   21 amountremaining       → Importe Restante
     *   22 amountpaid            → Importe Pagado
     *   23 Fecha YYYYMMDD        → Entero numérico para comparación de fechaInicio
     *
     * @param   {string[]} cols  24 campos del CSV ya parseados (sin comillas)
     * @returns {Array}          Array con 19 valores: [0..18]
     */
    function buildRowFromCsv(cols) {
        var recordtype = _strCsv(cols[4]);
        var isMainline = _isMainlineCsv(cols[18]);

        var debe    = _numCsv(cols[19]);
        var haber   = _numCsv(cols[20]);
        var amtRem  = _numCsv(cols[21]);
        var amtPaid = _numCsv(cols[22]);

        /* ── Folio según tipo de registro ────────────────────────────── */
        var folio = '';
        if (recordtype === 'vendorbill') {
            folio = _strCsv(cols[10]);   // tranid
        } else if (recordtype === 'journalentry' || recordtype === 'advintercompanyjournalentry') {
            folio = _strCsv(cols[12]);   // custcol_2w_folio
        } else if (recordtype === 'invoice'
                && CUENTAS_FICHA_PACIENTE.indexOf(_strCsv(cols[15])) !== -1) {
            folio = _strCsv(cols[25]);   // custbody_2w_as_ficha_paciente
        } else {
            folio = _strCsv(cols[11]);   // custbody_2winfolioacepta
        }

        /* ── Saldo Debe / Saldo Haber ────────────────────────────────── */
        var saldo = _calcSaldo(recordtype, isMainline, debe, haber, amtRem, amtPaid);

        return [
            _strCsv(cols[0]),                          // [0]  Id Transaccion
            _strCsv(cols[14]),                         // [1]  Id Cuenta Contable
            _strCsv(cols[2]),                          // [2]  Subsidiaria (texto)
            _strCsv(cols[3]),                          // [3]  Tipo de Transaccion
            _strCsv(cols[6]),                          // [4]  Nombre (entidad)
            folio,                                     // [5]  Folio
            _strCsv(cols[10]),                         // [6]  Numero Documento (tranid)
            _strCsv(cols[13]),                         // [7]  Glosa
            _strCsv(cols[9]),                          // [8]  Fecha (DD/MM/YYYY)
            _strCsv(cols[8]),                          // [9]  Periodo Contable
            _strCsv(cols[15]),                         // [10] Numero de Cuenta
            _strCsv(cols[16]),                         // [11] Nombre Cuenta
            debe,                                      // [12] Debe
            haber,                                     // [13] Haber
            saldo.saldoDebe,                           // [14] Saldo Debe
            saldo.saldoHaber,                          // [15] Saldo Haber
            _strCsv(cols[1]),                          // [16] Id Subsidiaria
            _strCsv(cols[5]),                          // [17] Id Entidad
            parseInt(_strCsv(cols[23]), 10) || 0,      // [18] Fecha YYYYMMDD — solo para filtro
            _strCsv(cols[7]),                          // [19] RUT
            _strCsv(cols[24]),                         // [20] Id Departamento — solo para filtro
        ];
    }

    /* ──────────────────────────────────────────────────────────────────── */
    /**
     * Mapea los 26 campos de una línea CSV (exportada por SuiteQLTask) a un array
     * de 21 valores crudos con la misma estructura que buildRowFromCsv().
     *
     * Índices de entrada (cols[], 0-based):
     *   0  id (t.id)                               → Id Transaccion
     *   1  idSubsidiaria (tl.subsidiary)            → Id Subsidiaria
     *   2  subsidiaria (s.name)                     → Subsidiaria (texto)
     *   3  tipo (t.type)                            → Tipo de Transaccion
     *   4  tipoRegistro (t.recordtype)              → recordtype
     *   5  idEntidad (tl.entity)                    → Id Entidad
     *   6  entidad (BUILTIN.DF(tl.entity))          → Nombre (entidad texto)
     *   7  rut (e.custentity_2wrut)                 → RUT (para rutsPorEntidad en el SS)
     *   8  periodo (BUILTIN.DF(t.postingperiod))    → Periodo Contable
     *   9  fecha (t.trandate)                       → Fecha (DD/MM/YYYY)
     *   10 numeroDocumento (t.tranid)               → Numero Documento / Folio vendorbill
     *   11 folio (t.custbody_2winfolioacepta)       → Folio otros
     *   12 folioColumna (tl.custcol_2w_folio)       → Folio journalentry
     *   13 nota (tl.memo)                           → Glosa
     *   14 idCuenta (tal.account)                   → Id Cuenta Contable
     *   15 numeroCuenta (a.acctnumber)              → Numero de Cuenta
     *   16 nombreCuenta (SUBSTR...)                 → Nombre Cuenta
     *   17 tipoCuenta (a.accttype)                  → (no se usa en el reporte)
     *   18 linePrincipal (tl.mainline)              → isMainline ("T"/"F")
     *   19 debito (NVL(tal.debit,0))                → Debe
     *   20 credito (NVL(tal.credit,0))              → Haber
     *   21 importeRestante (CASE...)                → amountremaining
     *   22 importePagado (CASE...)                  → amountpaid
     *   23 fechaNumero (TO_CHAR(t.trandate,'YYYYMMDD')) → Entero numérico para filtro
     *
     * @param   {string[]} cols  24 campos del CSV ya parseados (sin comillas)
     * @returns {Array}          Array con 19 valores: [0..18]
     */
    function buildRowFromSuiteQL(cols) {
        var recordtype = _strCsv(cols[4]);
        var isMainline = _isMainlineSql(cols[18]);  // SuiteQL devuelve "T"/"F"

        var debe    = _numCsv(cols[19]);
        var haber   = _numCsv(cols[20]);
        var amtRem  = _numCsv(cols[21]);
        var amtPaid = _numCsv(cols[22]);

        /* ── Folio según tipo de registro ────────────────────────────── */
        var folio = '';
        if (recordtype === 'vendorbill') {
            folio = _strCsv(cols[10]);   // tranid
        } else if (recordtype === 'journalentry' || recordtype === 'advintercompanyjournalentry') {
            folio = _strCsv(cols[12]);   // custcol_2w_folio
        } else if (recordtype === 'invoice'
                && CUENTAS_FICHA_PACIENTE.indexOf(_strCsv(cols[15])) !== -1) {
            folio = _strCsv(cols[24]);   // custbody_2w_as_ficha_paciente (col[24] en query actual)
        } else {
            folio = _strCsv(cols[11]);   // custbody_2winfolioacepta
        }

        /* ── Saldo Debe / Saldo Haber ────────────────────────────────── */
        var saldo = _calcSaldo(recordtype, isMainline, debe, haber, amtRem, amtPaid);

        return [
            _strCsv(cols[0]),                          // [0]  Id Transaccion
            _strCsv(cols[14]),                         // [1]  Id Cuenta Contable
            _strCsv(cols[2]),                          // [2]  Subsidiaria (texto)
            _strCsv(cols[3]),                          // [3]  Tipo de Transaccion
            _strCsv(cols[6]),                          // [4]  Nombre (entidad)
            folio,                                     // [5]  Folio
            _strCsv(cols[10]),                         // [6]  Numero Documento (tranid)
            _strCsv(cols[13]),                         // [7]  Glosa
            _strCsv(cols[9]),                          // [8]  Fecha (DD/MM/YYYY)
            _strCsv(cols[8]),                          // [9]  Periodo Contable
            _strCsv(cols[15]),                         // [10] Numero de Cuenta
            _strCsv(cols[16]),                         // [11] Nombre Cuenta
            debe,                                      // [12] Debe
            haber,                                     // [13] Haber
            saldo.saldoDebe,                           // [14] Saldo Debe
            saldo.saldoHaber,                          // [15] Saldo Haber
            _strCsv(cols[1]),                          // [16] Id Subsidiaria
            _strCsv(cols[5]),                          // [17] Id Entidad
            parseInt(_strCsv(cols[25]), 10) || 0,      // [18] Fecha YYYYMMDD — col[25] en query actual
            _strCsv(cols[7]),                          // [19] RUT
            _strCsv(cols[23]),                         // [20] Id Departamento — col[23] en query actual
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
     * Aplica agrupación/compensación (_compensarFilas) antes de escribir y,
     * opcionalmente, filtra filas cuya fecha sea anterior a fechaInicio.
     * Solo escribe las 15 primeras columnas por fila (sin IDs de agrupación).
     *
     * @param   {Object}         opts
     * @param   {Array[]}        opts.rows              Arrays de 17 valores crudos (de buildRow)
     * @param   {string}         opts.nombre            Nombre del archivo (con extensión .xls)
     * @param   {string|number}  opts.folderId          ID de la carpeta en File Cabinet
     * @param   {string}         [opts.fechaInicio]     Fecha de inicio DD/MM/YYYY (opcional)
     * @param   {boolean}        [opts.omitirNetoCero]   true → elimina filas agrupadas con neto = 0
     * @param   {string}         [opts.fechaInicio]      Fecha de inicio DD/MM/YYYY (opcional)
     * @param   {string}         [opts.departamento]     Internal ID de departamento (opcional)
     * @param   {string}         [opts.rut]              RUT de la entidad (opcional)
     * @returns {number}  Internal ID del archivo creado
     */
    function crearArchivoXls(opts) {
        const rows           = opts.rows           || [];
        const nombre         = opts.nombre         || 'reporte.xls';
        const folderId       = opts.folderId       || -15;
        const fechaInicio    = opts.fechaInicio    || null;
        const omitirNetoCero = opts.omitirNetoCero || false;
        const departamento   = opts.departamento   || '';
        /* rut se filtra en el WHERE de la SuiteQL; no se procesa aquí */

        /* ── 1. Agrupar y compensar filas (waterfall) ──────────────────── */
        var rowsXls = _compensarFilas(rows, omitirNetoCero);

        /* ── 2. Filtro unificado de parámetros opcionales (post-agrupación) ──
         *  row[18] = Fecha YYYYMMDD (int)  — para fechaInicio
         *  row[20] = Id Departamento       — para departamento
         *  (RUT ya viene filtrado desde la query SuiteQL)
         * ────────────────────────────────────────────────────────────────── */
        var fechaInicioNum = fechaInicio ? _toYYYYMMDD(fechaInicio) : 0;
        var hayFiltros     = fechaInicioNum || departamento;

        if (hayFiltros) {
            var totalAntes = rowsXls.length;
            rowsXls = rowsXls.filter(function (row) {
                if (fechaInicioNum && (Number(row[18]) || 0) < fechaInicioNum) return false;
                if (departamento   && String(row[20] || '') !== departamento)  return false;
                return true;
            });
            log.error({
                title  : 'crearArchivoXls — Filtros opcionales aplicados',
                details: 'fechaInicio: '  + (fechaInicio  || '—') +
                         ' | depto: '      + (departamento || '—') +
                         ' | antes: '      + totalAntes +
                         ' | después: '    + rowsXls.length,
            });
        }

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

        /* Filas de datos — 17 columnas */
        for (const row of rowsXls) {
            var xlsRow = [
                row[0],                           // Id Transaccion
                row[1],                           // Id Cuenta Contable
                row[2],                           // Subsidiaria
                row[3],                           // Tipo de Transaccion
                row[19] || '',                    // RUT (directo del CSV)
                row[4],                           // Nombre
                row[5],                           // Folio
                row[6],                           // Numero Documento
                row[7],                           // Glosa
                row[8],                           // Fecha
                row[9],                           // Periodo Contable
                row[10],                          // Numero de Cuenta
                row[11],                          // Nombre Cuenta
                row[12],                          // Debe
                row[13],                          // Haber
                row[14],                          // Saldo Debe
                row[15],                          // Saldo Haber
            ];
            xlsFile.appendLine({ value: _buildXlsRow(xlsRow, false) });
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
     * y aplica el algoritmo waterfall de absorción secuencial entre el lado Debe
     * y el lado Haber de cada grupo.
     *
     * Reglas:
     *   - Las filas SIN folio (row[5] = '') no se agrupan: se emiten como filas
     *     independientes en el orden en que aparecen.
     *   - Por cada grupo CON folio:
     *       · Si solo hay filas en un lado (solo Debe o solo Haber) → sin compensación;
     *         todas las filas del grupo se emiten sin modificar.
     *       · Si hay filas en ambos lados → waterfall secuencial:
     *           1. Puntero i = 0 (lista Debe), j = 0 (lista Haber).
     *           2. absorb = min(debeSaldo[i], haberSaldo[j]).
     *           3. Restar absorb de ambos saldos actuales.
     *           4. Si debeSaldo[i] llega a 0 → fila Debe[i] queda absorbida; i++.
     *           5. Si haberSaldo[j] llega a 0 → fila Haber[j] queda absorbida; j++.
     *           6. Repetir hasta agotar un lado.
     *           7. Las filas restantes del otro lado se emiten con su saldo no absorbido.
     *   - Filas absorbidas (saldo llega a 0):
     *       · omitirNetoCero = true  → se descartan del resultado.
     *       · omitirNetoCero = false → se incluyen con saldoDebe (row[14]) = 0 y
     *         saldoHaber (row[15]) = 0, conservando los valores crudos Debe (row[12])
     *         y Haber (row[13]) de la transacción original.
     *   - Filas parcialmente absorbidas: se emiten con su saldo residual actualizado.
     *
     * Clave de grupo: row[1] | row[16] | row[17] | row[5]
     *   row[1]  = Id Cuenta Contable
     *   row[16] = Id Subsidiaria (valor interno)
     *   row[17] = Id Entidad     (valor interno)
     *   row[5]  = Folio
     *
     * @param   {Array[]} rows            Arrays de 19 valores (salida de buildRowFromCsv)
     * @param   {boolean} omitirNetoCero  true → descartar filas absorbidas con saldo 0/0
     * @returns {Array[]}                 Filas compensadas, en orden de primera aparición del grupo
     */
    function _compensarFilas(rows, omitirNetoCero) {
        omitirNetoCero = omitirNetoCero || false;

        /* ── Pasada 1: clasificar filas por grupo y lado ────────────── */
        var ordenGrupos = [];      /* claves en orden de primera aparición */
        var grupos      = {};      /* clave → descriptor de grupo          */

        for (var i = 0; i < rows.length; i++) {
            var row = rows[i];

            if (!row[5]) {
                /* Sin folio: fila independiente */
                var nfKey = '__nf__' + i;
                ordenGrupos.push(nfKey);
                grupos[nfKey] = { noFolio: true, fila: row.slice() };
                continue;
            }

            var key = row[1] + '|' + row[16] + '|' + row[17] + '|' + row[5];
            if (!grupos[key]) {
                grupos[key] = {
                    noFolio   : false,
                    debeRows  : [],
                    haberRows : [],
                    neutroRows: [],
                };
                ordenGrupos.push(key);
            }
            var g  = grupos[key];
            var sd = Number(row[14]) || 0;
            var sh = Number(row[15]) || 0;
            if      (sd > 0) g.debeRows.push(row.slice());
            else if (sh > 0) g.haberRows.push(row.slice());
            else             g.neutroRows.push(row.slice());
        }

        /* ── Pasada 2: waterfall por grupo y emitir resultado ────────── */
        var resultado = [];

        for (var gi = 0; gi < ordenGrupos.length; gi++) {
            var k = ordenGrupos[gi];
            var g = grupos[k];

            if (g.noFolio) {
                resultado.push(g.fila);
                continue;
            }

            var debeRows   = g.debeRows;
            var haberRows  = g.haberRows;
            var neutroRows = g.neutroRows;

            /* ── Solo un lado → sin compensación ──────────────────────── */
            if (debeRows.length === 0 || haberRows.length === 0) {
                for (var a = 0; a < debeRows.length;   a++) resultado.push(debeRows[a]);
                for (var b = 0; b < haberRows.length;  b++) resultado.push(haberRows[b]);
                for (var c = 0; c < neutroRows.length; c++) resultado.push(neutroRows[c]);
                continue;
            }

            /* ── Ambos lados → waterfall de absorción secuencial ─────── */
            var debeSaldo  = debeRows.map(function (r)  { return Number(r[14])  || 0; });
            var haberSaldo = haberRows.map(function (r) { return Number(r[15]) || 0; });
            var debeAbsorb  = new Array(debeRows.length).fill(false);
            var haberAbsorb = new Array(haberRows.length).fill(false);

            var di = 0, hi = 0;
            while (di < debeRows.length && hi < haberRows.length) {
                var absorb = Math.min(debeSaldo[di], haberSaldo[hi]);
                debeSaldo[di]  = Math.round((debeSaldo[di]  - absorb) * 100) / 100;
                haberSaldo[hi] = Math.round((haberSaldo[hi] - absorb) * 100) / 100;

                if (debeSaldo[di]  === 0) { debeAbsorb[di]  = true; di++; }
                if (haberSaldo[hi] === 0) { haberAbsorb[hi] = true; hi++; }
            }

            /* Emitir filas Debe */
            for (var d = 0; d < debeRows.length; d++) {
                var rowD = debeRows[d].slice();
                if (debeAbsorb[d]) {
                    /* Absorbida completamente */
                    if (!omitirNetoCero) {
                        rowD[14] = 0;   /* Saldo Debe  → 0  (Debe raw row[12] se conserva) */
                        rowD[15] = 0;   /* Saldo Haber → 0 */
                        resultado.push(rowD);
                    }
                    /* omitirNetoCero = true → se descarta */
                } else {
                    rowD[14] = debeSaldo[d]; /* saldo restante (actualizado o intacto) */
                    resultado.push(rowD);
                }
            }

            /* Emitir filas Haber */
            for (var h = 0; h < haberRows.length; h++) {
                var rowH = haberRows[h].slice();
                if (haberAbsorb[h]) {
                    /* Absorbida completamente */
                    if (!omitirNetoCero) {
                        rowH[14] = 0;   /* Saldo Debe  → 0 */
                        rowH[15] = 0;   /* Saldo Haber → 0 (Haber raw row[13] se conserva) */
                        resultado.push(rowH);
                    }
                    /* omitirNetoCero = true → se descarta */
                } else {
                    rowH[15] = haberSaldo[h]; /* saldo restante */
                    resultado.push(rowH);
                }
            }

            /* Neutras: siempre pasan sin modificación */
            for (var n = 0; n < neutroRows.length; n++) resultado.push(neutroRows[n]);
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
        } else if (RT_PAGO.indexOf(recordtype) !== -1 || RT_ASIENTO.indexOf(recordtype) !== -1) {
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

    /* ═══ Helper de conversión de fecha ════════════════════════════════ */

    /**
     * Convierte una fecha en formato DD/MM/YYYY (formato NetSuite LATAM) al entero YYYYMMDD
     * para comparación numérica directa con el valor de cols[21].
     * Devuelve 0 si la fecha es nula, vacía o tiene formato inválido.
     * Aplica zero-padding en día y mes (ej. '1/8/2026' → 20260801).
     */
    function _toYYYYMMDD(fecha) {
        if (!fecha) return 0;
        var parts = String(fecha).split('/');
        if (parts.length !== 3) return 0;
        var dd   = parts[0].length === 1 ? '0' + parts[0] : parts[0];
        var mm   = parts[1].length === 1 ? '0' + parts[1] : parts[1];
        var yyyy = parts[2];
        return parseInt(yyyy + mm + dd, 10) || 0;
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
     * Interpreta el campo mainline del CSV (SearchTask) como booleano.
     * Acepta: "Yes", "*", "T", "1", "true", "sí", "si" (case-insensitive).
     */
    function _isMainlineCsv(val) {
        if (val === null || val === undefined) return false;
        var s = String(val).trim().toLowerCase();
        return s === 'yes' || s === '*' || s === 't' || s === '1' || s === 'true' || s === 'sí' || s === 'si';
    }

    /**
     * Interpreta el campo mainline del CSV (SuiteQLTask) como booleano.
     * SuiteQL devuelve "T" para verdadero y "F" para falso.
     */
    function _isMainlineSql(val) {
        if (val === null || val === undefined) return false;
        return String(val).trim().toUpperCase() === 'T';
    }

    /** Escapa un valor para CSV: encierra en comillas si tiene coma, comilla o salto de línea */
    function _escapeCsv(val) {
        var str = (val === null || val === undefined) ? '' : String(val);
        return (str.indexOf(',') !== -1 || str.indexOf('"') !== -1 || str.indexOf('\n') !== -1)
            ? '"' + str.replace(/"/g, '""') + '"'
            : str;
    }

    return {
        buildRow             : buildRow,
        buildRowFromCsv      : buildRowFromCsv,
        buildRowFromSuiteQL  : buildRowFromSuiteQL,
        crearArchivoCsv      : crearArchivoCsv,
        crearArchivoXls      : crearArchivoXls,
        generarNombreArchivo : generarNombreArchivo,
    };
});
