/**
 * AS_NSP_014 — Reporte Analítico de Cuentas Consolidado
 * @description Repositorio de la búsqueda unificada de transacciones.
 *              Consolida las 4 búsquedas originales en un único search.Type.TRANSACTION:
 *                - Facturas de venta y compra   (CustInvc, VendBill)
 *                - Notas de crédito             (CustCred, VendCred)
 *                - Anticipos y pagos            (CustDep, VPrep, CustPymt, VendPymt)
 *                - Asientos contables           (Journal)
 *
 *  Lógica de "partida activa" unificada en un CASE WHEN por {recordtype}:
 *
 *  ┌──────────────────────────────────────────────────────────────────┐
 *  │ FACTURAS y NC (invoice, vendorbill, creditmemo, vendorcredit)    │
 *  │   mainline = '*'  → incluir si amountremaining > 0              │
 *  │   mainline ≠ '*'  → incluir si amount ≠ 0                      │
 *  ├──────────────────────────────────────────────────────────────────┤
 *  │ PAGOS y ANTICIPOS (customerdeposit, vendorprepayment,           │
 *  │                    customerpayment, vendorpayment)               │
 *  │   mainline = '*'  → incluir siempre                             │
 *  │   mainline ≠ '*'  → incluir si amountpaid ≠ ABS(amount)        │
 *  ├──────────────────────────────────────────────────────────────────┤
 *  │ ASIENTOS CONTABLES (journalentry)                                │
 *  │   incluir si amountpaid ≠ ABS(amount)                           │
 *  └──────────────────────────────────────────────────────────────────┘
 *
 * @NApiVersion 2.1
 * @NModuleScope Public
 */
define(['N/search'], function (search) {

    /* ─────────────────────────────────────────────────────────────────── */
    /**
     * Construye y devuelve la búsqueda unificada de transacciones.
     * Diseñada para ser entregada directamente por getInputData() del Map Reduce;
     * el motor MR se encarga de la paginación automática.
     *
     * @param   {Object}  [params={}]
     * @param   {string}  [params.subsidiaria]  Internal ID de subsidiaria (filtra si se proporciona)
     * @param   {string}  [params.fechaCorte]   Fecha en formato NS (MM/DD/YYYY); aplica onorbefore
     * @returns {search.Search}
     */
    function buildSearch(params) {
        params = params || {};
        const subsidiaria = params.subsidiaria;
        const fechaCorte  = params.fechaCorte;
        const cuentaContable = params.cuentaContable;
        const tipoRegistro = params.tipoRegistro;

        /* ── Fórmula de filtro unificada ─────────────────────────────── */
        const FORMULA_FILTRO =
            "CASE" +
            " WHEN {recordtype} IN ('invoice','vendorbill','creditmemo','vendorcredit')" +
            " THEN CASE WHEN {mainline} = '*' AND NVL({amountremaining},0) > 0 THEN 1" +
                       " WHEN {mainline} != '*' AND NVL({amount},0) != 0 THEN 1 ELSE 0 END" +
            " WHEN {recordtype} IN ('customerdeposit','vendorprepayment','customerpayment','vendorpayment')" +
            " THEN CASE WHEN {mainline} != '*' AND NVL({amountpaid},0) != ABS(NVL({amount},0)) THEN 1" +
                       " WHEN {mainline} = '*' THEN 1 ELSE 0 END" +
            " WHEN {recordtype} = 'journalentry'" +
            " THEN CASE WHEN NVL({amountpaid},0) != ABS(NVL({amount},0)) THEN 1 ELSE 0 END" +
            " ELSE 0 END";

        /* ── Filtros base ────────────────────────────────────────────── */
        const filters = [
            ['posting',     'is',    'T'],
            'AND',
            ['voided',      'is',    'F'],
            'AND',
            ['accounttype', 'anyof',
                'Bank', 'AcctRec', 'OthCurrAsset', 'FixedAsset', 'OthAsset',
                'AcctPay', 'CredCard', 'OthCurrLiab', 'LongTermLiab', 'Equity'],
            'AND',
            ['type', 'anyof',
                'VendBill', 'CustInvc',
                'CustCred',  'VendCred',
                'CustDep',   'VPrep',   'CustPymt', 'VendPymt',
                'Journal'],
            'AND',
            ['formulanumeric: ' + FORMULA_FILTRO, 'equalto', '1'],
        ];

        /* ── Filtros opcionales ──────────────────────────────────────── */
        filters.push('AND',    ['subsidiary', 'anyof',      subsidiaria]);
        filters.push('AND',    ['trandate',   'onorbefore', fechaCorte]);
        if (cuentaContable) filters.push('AND', ['account',    'anyof',      cuentaContable]);
        if (tipoRegistro) filters.push('AND',   ['recordtype', 'anyof',      tipoRegistro]);
        if (true) filters.push('AND', ['internalid', 'anyof',      1013804]);

        /* ── Búsqueda ────────────────────────────────────────────────── */
        return search.create({
            type    : search.Type.TRANSACTION,
            settings: [
                { name: 'consolidationtype',            value: 'NONE' },
                { name: 'includeperiodendtransactions', value: 'F'    },
            ],
            filters : filters,
            columns : [
                search.createColumn({ name: 'internalid',                        label: 'Id Transaccion'     }),
                search.createColumn({ name: 'internalid', join: 'account',       label: 'Id Cuenta Contable' }),
                search.createColumn({ name: 'subsidiarynohierarchy',             label: 'Subsidiaria'        }),
                search.createColumn({ name: 'type',                              label: 'Tipo'               }),
                search.createColumn({ name: 'recordtype',                        label: 'Tipo Registro'      }),
                search.createColumn({ name: 'entity',                            label: 'Nombre'             }),
                search.createColumn({ name: 'postingperiod',                     label: 'Periodo'            }),
                search.createColumn({ name: 'trandate',                          label: 'Fecha'              }),
                search.createColumn({ name: 'tranid',                            label: 'Num Documento'      }),
                search.createColumn({ name: 'custbody_2winfolioacepta',          label: 'Folio Acepta'       }),
                search.createColumn({ name: 'custcol_2w_folio',                  label: 'Folio JE'           }),
                search.createColumn({ name: 'memo',                              label: 'Glosa'              }),
                search.createColumn({ name: 'account',                           label: 'Cuenta Contable'    }),
                search.createColumn({ name: 'accounttype',                       label: 'Tipo Cuenta'        }),
                search.createColumn({ name: 'mainline',                          label: 'Mainline'           }),
                search.createColumn({ name: 'debitamount',                       label: 'Debe'               }),
                search.createColumn({ name: 'creditamount',                      label: 'Haber'              }),
                search.createColumn({ name: 'amountremaining',                   label: 'Importe Restante'   }),
                search.createColumn({ name: 'amountpaid',                        label: 'Importe Pagado'     }),
            ],
        });
    }

    return { buildSearch };
});
