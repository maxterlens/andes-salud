/**
 * AS_NSP_014 — Reporte Analítico de Cuentas Consolidado
 * @description Handler de la vista principal (op=view).
 *              Orquesta la obtención de datos y la construcción del formulario.
 *              En POST lanza el SuiteQLTask que, al completarse, dispara automáticamente
 *              el SS de generación de archivos XLS y CSV (patrón PRG).
 *
 *  Flujo del POST (modo SuiteQL — por defecto):
 *    1. Crea el registro de log (estado: "En Proceso").
 *    2. Construye la query SuiteQL con los filtros dinámicos.
 *    3. Crea un archivo CSV temporal en el File Cabinet (destino del SuiteQLTask).
 *    4. Configura el SS como inboundDependency del SuiteQLTask,
 *       pasándole todos los parámetros necesarios para la generación del reporte.
 *    5. Lanza el SuiteQLTask. NetSuite ejecuta el SS automáticamente al terminar.
 *    6. Redirige al Suitelet (PRG) con mensaje de confirmación.
 *
 *  Modo auditoría (SearchTask): descomentar los bloques marcados con [AUDIT]
 *  y comentar los marcados con [SUITEQL].
 *
 * @NApiVersion 2.1
 * @NModuleScope Public
 */
define([
    'N/url',
    'N/task',
    'N/file',
    'N/search',
    'N/runtime',
    'N/redirect',
    '../forms/GeneradorReporteAnaliticoCuentasForm',
    '../../repositories/LogReporteAnaliticoCuentasRepository',
], function (url, task, file, search, runtime, redirect, formModule, repository) {

    /* ─── Identificadores del Suitelet ──────────────────────────── */
    const SL_SCRIPT_ID = 'customscript_as_rpt_anlt_cuenta_cons_sl';
    const SL_DEPLOY_ID = 'customdeploy_as_rpt_anlt_cuenta_cons_sl';

    const CS_MODULE_PATH = '../AS_Generador_Reporte_Analitico_Cuentas_Consolidado_CS_2.1.js';

    /* ─── Script SS que lee el CSV y genera XLS/CSV ─────────────── */
    const SS_SCRIPT_ID = 'customscript_as_rpt_anlt_cuenta_cons_ss';
    const SS_DEPLOY_ID = 'customdeploy_as_rpt_anlt_cuenta_cons_ss';

    /* ─── Búsqueda guardada base (modo auditoría) ────────────────── */
    const SEARCH_ID = 'customsearch_as_rpt_analitico_cuentas';

    /* ─── Parámetro del Suitelet: carpeta File Cabinet destino ───── */
    const PARAM_FOLDER_ID = 'custscript_as_rpt_anlt_cta_sl_folderid';

    /* ─── Parámetros de mensaje post-redirect ────────────────────── */
    const PARAM_MSG_EXITO = 'custparam_msg_exito';
    const PARAM_MSG_ERROR = 'custparam_msg_error';

    /* ─────────────────────────────────────────────────────────────── */
    /*  GET — Renderiza el formulario principal con filtros y logs     */
    /* ─────────────────────────────────────────────────────────────── */
    function handleGet(context, extra) {
        extra = extra || {};
        const params = context.request.parameters;

        const filtros = {
            subsidiaria   : params[formModule.FILTROS.SUBSIDIARIA]     || '',
            fechaInicio   : params[formModule.FILTROS.FECHA_INICIO]    || '',
            fecha         : params[formModule.FILTROS.FECHA]           || '',
            cuentaContable: params[formModule.FILTROS.CUENTA_CONTABLE] || '',
            cliente       : params[formModule.FILTROS.CLIENTE]         || '',
            proveedor     : params[formModule.FILTROS.PROVEEDOR]       || '',
            folio         : params[formModule.FILTROS.FOLIO]           || '',
            departamento  : params[formModule.FILTROS.DEPARTAMENTO]    || '',
            rut           : params[formModule.FILTROS.RUT]             || '',
        };

        const mensajeExito = extra.mensajeExito || params[PARAM_MSG_EXITO] || '';
        const mensajeError  = extra.mensajeError  || params[PARAM_MSG_ERROR]  || '';

        const suiteletUrl = url.resolveScript({
            scriptId         : SL_SCRIPT_ID,
            deploymentId     : SL_DEPLOY_ID,
            returnExternalUrl: false,
        });

        let logs = [];
        try {
            logs = repository.getAll();
        } catch (e) {
            log.error({ title: 'handleGet — Error al obtener logs', details: e });
        }

        const form = formModule.buildForm({
            suiteletUrl,
            logs,
            filtros,
            mensajeExito,
            mensajeError,
        });
        form.clientScriptModulePath = CS_MODULE_PATH;

        context.response.writePage(form);
    }

    /* ─────────────────────────────────────────────────────────────── */
    /*  POST — Lanza el SuiteQLTask + SS y redirige al Suitelet (PRG) */
    /* ─────────────────────────────────────────────────────────────── */
    function handlePost(context) {
        const params = context.request.parameters;

        const subsidiaria    = params[formModule.FILTROS.SUBSIDIARIA]      || '';
        const fechaInicio    = params[formModule.FILTROS.FECHA_INICIO]     || '';
        const fecha          = params[formModule.FILTROS.FECHA]            || '';
        const cuentaContable = params[formModule.FILTROS.CUENTA_CONTABLE]  || '';
        const omitirNetoCero = params[formModule.FILTROS.OMITIR_NETO_CERO] || 'F';
        const cliente        = params[formModule.FILTROS.CLIENTE]          || '';
        const proveedor      = params[formModule.FILTROS.PROVEEDOR]        || '';
        const folio          = params[formModule.FILTROS.FOLIO]            || '';
        const departamento   = params[formModule.FILTROS.DEPARTAMENTO]     || '';
        const rut            = params[formModule.FILTROS.RUT]              || '';

        /*log.audit({
            title  : 'handlePost — Solicitud de generación de reporte',
            details: JSON.stringify({ subsidiaria, fechaInicio, fecha, cuentaContable, cliente, proveedor, folio }),
        });*/

        try {
            /* ── 1. Crear registro de log (estado: "En Proceso") ─────── */
            const textoFiltros = _buildTextoFiltros({ cuentaContable, departamento, rut, omitirNetoCero });
            const logId = repository.crear({ subsidiaria, fechaCorte: fecha, fechaInicio: fechaInicio, otrosFiltros: textoFiltros });

            /* ── 2. Obtener ID de carpeta del parámetro del Suitelet ─── */
            const folderId = runtime.getCurrentScript().getParameter({ name: PARAM_FOLDER_ID });

            /* ══════════════════════════════════════════════════════════
             *  [AUDIT] Modo auditoría — SearchTask
             *  Descomentar este bloque y comentar el bloque [SUITEQL]
             *  para usar la búsqueda guardada como fuente de datos.
             * ══════════════════════════════════════════════════════════ */
            /*
            // [AUDIT] 3. Actualizar búsqueda guardada con filtros dinámicos
            const savedSearch = search.load({ id: SEARCH_ID });
            while (savedSearch.filters.length > 5) {
                savedSearch.filters.pop();
            }
            savedSearch.filters.push(
                search.createFilter({ name: 'subsidiary', operator: 'anyof',      values: [subsidiaria] })
            );
            savedSearch.filters.push(
                search.createFilter({ name: 'trandate',   operator: 'onorbefore', values: [fecha] })
            );
            if (cuentaContable) {
                savedSearch.filters.push(
                    search.createFilter({ name: 'account', operator: 'anyof', values: [cuentaContable] })
                );
            }
            const updatedSearchId = savedSearch.save();
            */

            /* ══════════════════════════════════════════════════════════
             *  [SUITEQL] Modo por defecto — SuiteQLTask
             *  Comentar este bloque y descomentar el [AUDIT] para auditoría.
             * ══════════════════════════════════════════════════════════ */
            // [SUITEQL] 3. Construir query SuiteQL con filtros dinámicos
            const qlQuery = _buildSuiteQLQuery(subsidiaria, fecha, cuentaContable, rut);

            /* ── 4. Crear archivo CSV en el File Cabinet ─────────────── */
            const nombreTmp = 'DataReporteAnalitico' + logId
                            + '_sub' + (subsidiaria || 'ALL') + '.csv';
            const tmpFile   = file.create({
                name    : nombreTmp,
                fileType: file.Type.CSV,
                contents: '',
                folder  : folderId,
            });
            const tmpFileId = tmpFile.save();

            /* ── 5. Configurar SS como inboundDependency ─────────────── */
            const ssTask        = task.create({ taskType: task.TaskType.SCHEDULED_SCRIPT });
            ssTask.scriptId     = SS_SCRIPT_ID;
            ssTask.deploymentId = SS_DEPLOY_ID;
            ssTask.params       = {
                custscript_as_rpt_anlt_cta_ss_subsi      : subsidiaria,
                custscript_as_rpt_anlt_cta_ss_fecha_ini  : fechaInicio,
                custscript_as_rpt_anlt_cta_ss_fecha_cort : fecha,
                custscript_as_rpt_anlt_cta_ss_cta_cont   : cuentaContable,
                custscript_as_rpt_anlt_cta_ss_omit_n0    : omitirNetoCero,
                custscript_as_rpt_anlt_cta_ss_log_id     : logId,
                custscript_as_rpt_anlt_cta_ss_folderid   : folderId,
                custscript_as_rpt_anlt_cta_ss_archtempid : tmpFileId,
                custscript_as_rpt_anlt_cta_ss_departamen : departamento,
                custscript_as_rpt_anlt_cta_ss_rut        : rut,
            };

            /* ══════════════════════════════════════════════════════════
             *  [SUITEQL] 6. Crear y lanzar el SuiteQLTask
             * ══════════════════════════════════════════════════════════ */
            const qlTask    = task.create({ taskType: task.TaskType.SUITE_QL });
            qlTask.query    = qlQuery;
            qlTask.fileId   = tmpFileId;
            qlTask.addInboundDependency(ssTask);
            const taskId = qlTask.submit();

            /* ══════════════════════════════════════════════════════════
             *  [AUDIT] 6. Crear y lanzar el SearchTask
             *  Descomentar al activar modo auditoría.
             * ══════════════════════════════════════════════════════════ */
            /*
            const searchTask         = task.create({ taskType: task.TaskType.SEARCH });
            searchTask.savedSearchId = updatedSearchId;
            searchTask.fileId        = tmpFileId;
            searchTask.addInboundDependency(ssTask);
            const taskId = searchTask.submit();
            */

            /*log.audit({
                title  : 'handlePost — Task lanzado',
                details: JSON.stringify({ taskId: String(taskId), logId, tmpFileId }),
            });*/

            /* ── 7. Redirect (POST-Redirect-Get) ─────────────────────── */
            redirect.toSuitelet({
                scriptId    : SL_SCRIPT_ID,
                deploymentId: SL_DEPLOY_ID,
                parameters  : {
                    [PARAM_MSG_EXITO]: 'La solicitud de generación de reporte fue recibida exitosamente. ' +
                                       'El archivo estará disponible en el histórico una vez completado el proceso.',
                },
            });

        } catch (e) {
            log.error({ title: 'handlePost — Error al lanzar task', details: e });
            redirect.toSuitelet({
                scriptId    : SL_SCRIPT_ID,
                deploymentId: SL_DEPLOY_ID,
                parameters  : {
                    [PARAM_MSG_ERROR]: 'Error al iniciar la generación del reporte: ' + (e.message || String(e)),
                },
            });
        }
    }

    /* ─────────────────────────────────────────────────────────────── */
    /*  _buildSuiteQLQuery — Construye la query SuiteQL con filtros    */
    /* ─────────────────────────────────────────────────────────────── */
    /**
     * Genera el string de la query SuiteQL sustituyendo los filtros dinámicos.
     *
     * @param {string} subsidiaria     Internal ID numérico de la subsidiaria
     * @param {string} fecha           Fecha de corte en formato DD/MM/YYYY
     * @param {string} cuentaContable  Internal ID de la cuenta contable (opcional; '' = sin filtro)
     * @returns {string}  Query SuiteQL lista para asignar a SuiteQLTask.query
     */
    function _buildSuiteQLQuery(subsidiaria, fecha, cuentaContable, rut) {
        var filtroCuenta = cuentaContable
            ? '\n\tAND tal.account = ' + cuentaContable
            : '';
        var filtroRut = rut
            ? "\n\tAND NVL(e.custentity_2wrut, c.custentity_2wrut) = '" + rut + "'"
            : '';

        return [
            'SELECT',
            '\tt.id as id,',
            '\ttl.subsidiary as idSubsidiaria,',
            '\ts.name as subsidiaria,',
            '\tt.type as tipo,',
            '\tt.recordtype as tipoRegistro,',
            '\ttl.entity as idEntidad,',
            '\tBUILTIN.DF(tl.entity) as entidad,',
            '\tNVL(e.custentity_2wrut, c.custentity_2wrut) as rut,',
            '\tBUILTIN.DF(t.postingperiod) as periodo,',
            "\tTO_CHAR(t.trandate, 'DD/MM/YYYY') as fecha,",
            '\tt.tranid as numeroDocumento,',
            '\tt.custbody_2winfolioacepta as folio,',
            '\ttl.custcol_2w_folio as folioColumna,',
            '\ttl.memo as nota,',
            '\ttal.account as idCuenta,',
            '\ta.acctnumber as numeroCuenta,',
            "\tSUBSTR(a.displaynamewithhierarchy, INSTR(a.displaynamewithhierarchy, ' ') + 1) as nombreCuenta,",
            '\ta.accttype as tipoCuenta,',
            '\ttl.mainline as linePrincipal,',
            '\tNVL(tal.debit,0) as debito,',
            '\tNVL(tal.credit,0) as credito,',
            '\tCASE',
            "\t    WHEN t.recordtype IN ('invoice','vendorbill')",
            '\t        THEN tal.amountunpaid',
            "\t    WHEN t.recordtype IN ('creditmemo','vendorcredit','customerdeposit','vendorprepayment','customerpayment','vendorpayment')",
            '\t        THEN tal.paymentamountunused',
            "\t    WHEN t.recordtype IN ('journalentry','advintercompanyjournalentry')",
            '\t        THEN COALESCE(tal.amountunpaid, tal.paymentamountunused)',
            '\t    ELSE NULL',
            '\tEND AS importeRestante,',
            '\tCASE',
            "\t    WHEN t.recordtype IN ('invoice','vendorbill')",
            '\t        THEN tal.amountpaid',
            "\t    WHEN t.recordtype IN ('creditmemo','vendorcredit','customerdeposit','customerpayment','vendorpayment')",
            '\t        THEN tal.paymentamountused',
            "\t    WHEN t.recordtype = 'vendorprepayment'",
            '\t        THEN tal.amountlinked',
            "\t    WHEN t.recordtype IN ('journalentry','advintercompanyjournalentry')",
            '\t        THEN COALESCE(tal.amountpaid, tal.paymentamountused)',
            '\t    ELSE NULL',
            '\tEND AS importePagado,',
            '\ttl.department as idDepartamento,',
            '\tt.custbody_2w_as_ficha_paciente as fichaPaciente,',
            "\tTO_NUMBER(TO_CHAR(t.trandate,'YYYYMMDD')) as fechaNumero",
            'FROM',
            '\ttransaction t',
            '\tJOIN transactionLine tl ON tl.transaction = t.id',
            '\tJOIN transactionaccountingline tal ON tal.transaction = t.id',
            '\t\tAND tal.transactionline = tl.id',
            '\t\tAND tal.accountingbook = 1',
            '\tJOIN subsidiary s ON s.id = tl.subsidiary',
            '\tLEFT JOIN vendor e ON e.id = tl.entity',
            '\tLEFT JOIN customer c ON c.id = tl.entity',
            '\tJOIN account a ON a.id = tal.account',
            'WHERE',
            "\tt.posting = 'T'",
            "\tAND t.voided = 'F'",
            "\tAND a.accttype IN ('Bank','AcctRec','OthCurrAsset','FixedAsset','OthAsset','AcctPay','CredCard','OthCurrLiab','LongTermLiab','Equity')",
            "\tAND t.type IN ('VendBill','CustInvc','CustCred','VendCred','CustDep','VPrep','CustPymt','VendPymt','Journal')",
            '\tAND tl.subsidiary = ' + subsidiaria,
            "\tAND t.trandate <= TO_DATE('" + fecha + "', 'DD/MM/YYYY')" + filtroCuenta + filtroRut,
            '\tAND CASE',
            "\t        WHEN t.recordtype IN ('invoice','vendorbill','creditmemo','vendorcredit') THEN",
            '\t            CASE',
            "\t                WHEN tl.mainline = 'T'",
            '\t                     AND CASE',
            "\t                             WHEN t.recordtype IN ('invoice','vendorbill')      THEN NVL(tal.amountunpaid, 0)",
            "\t                             WHEN t.recordtype IN ('creditmemo','vendorcredit') THEN NVL(tal.paymentamountunused, 0)",
            '\t                             ELSE 0',
            '\t                         END > 0',
            '\t                THEN 1',
            "\t                WHEN tl.mainline != 'T'",
            '\t                     AND (NVL(tal.debit, 0) + NVL(tal.credit, 0)) != 0',
            '\t                THEN 1',
            '\t                ELSE 0',
            '\t            END',
            "\t        WHEN t.recordtype IN ('customerdeposit','vendorprepayment','customerpayment','vendorpayment') THEN",
            '\t            CASE',
            "\t                WHEN tl.mainline = 'T'",
            '\t                THEN 1',
            "\t                WHEN tl.mainline != 'T'",
            '\t                     AND CASE',
            "\t                             WHEN t.recordtype IN ('customerdeposit','customerpayment','vendorpayment') THEN NVL(tal.paymentamountused, 0)",
            "\t                             WHEN t.recordtype = 'vendorprepayment'                                     THEN NVL(tal.amountlinked, 0)",
            '\t                             ELSE 0',
            '\t                         END != (NVL(tal.debit, 0) + NVL(tal.credit, 0))',
            '\t                THEN 1',
            '\t                ELSE 0',
            '\t            END',
            "\t        WHEN t.recordtype IN ('journalentry','advintercompanyjournalentry') THEN",
            '\t            CASE',
            '\t                WHEN NVL(COALESCE(tal.amountpaid, tal.paymentamountused), 0)',
            '\t                     != (NVL(tal.debit, 0) + NVL(tal.credit, 0))',
            '\t                THEN 1',
            '\t                ELSE 0',
            '\t            END',
            '\t        ELSE 0',
            '\t    END = 1',
        ].join('\n');
    }

    /* ─────────────────────────────────────────────────────────────── */
    /*  _buildTextoFiltros — Resumen legible de los filtros aplicados  */
    /* ─────────────────────────────────────────────────────────────── */
    /**
     * Construye el texto de resumen de filtros que se almacena en el log.
     * Cuando un filtro no tiene valor usa "Todas".
     *
     * @param {Object} opts
     * @param {string} opts.cuentaContable  Internal ID de la cuenta (opcional)
     * @param {string} opts.departamento    Internal ID del departamento (opcional)
     * @param {string} opts.rut             RUT ingresado (opcional)
     * @param {string} opts.omitirNetoCero  'T' | 'F'
     * @returns {string}
     */
    function _buildTextoFiltros(opts) {
        var cuentaId  = opts.cuentaContable || '';
        var deptoId   = opts.departamento   || '';
        var rut       = opts.rut            || '';
        var omitir    = (opts.omitirNetoCero === 'T' || opts.omitirNetoCero === true) ? 'T' : 'F';

        /* Lookup número de cuenta */
        var cuentaText = 'Todas';
        if (cuentaId) {
            try {
                var cuentaRes = search.lookupFields({ type: 'account', id: cuentaId, columns: ['number'] });
                cuentaText = cuentaRes.number || cuentaId;
            } catch (e) { cuentaText = cuentaId; }
        }

        /* Lookup nombre de departamento */
        var deptoText = 'Todas';
        if (deptoId) {
            try {
                var deptoRes = search.lookupFields({ type: 'department', id: deptoId, columns: ['namenohierarchy'] });
                deptoText = deptoRes.namenohierarchy || deptoId;
            } catch (e) { deptoText = deptoId; }
        }

        return 'Cuenta: '      + cuentaText         + '\n' +
               'Departamento: ' + deptoText           + '\n' +
               'RUT: '          + (rut || 'Todas')   + '\n' +
               'Omitir Cero: '  + omitir;
    }

    return { handleGet, handlePost };
});
