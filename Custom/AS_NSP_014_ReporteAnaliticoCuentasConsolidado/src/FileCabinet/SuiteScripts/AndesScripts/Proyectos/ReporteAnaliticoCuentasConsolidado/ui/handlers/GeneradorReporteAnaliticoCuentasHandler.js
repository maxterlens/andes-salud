/**
 * AS_NSP_014 — Reporte Analítico de Cuentas Consolidado
 * @description Handler de la vista principal (op=view).
 *              Orquesta la obtención de datos y la construcción del formulario.
 *              En POST lanza el script Map Reduce de generación y redirige (PRG).
 *
 * @NApiVersion 2.1
 * @NModuleScope Public
 */
define([
    'N/url',
    'N/task',
    'N/redirect',
    '../forms/GeneradorReporteAnaliticoCuentasForm',
    '../../repositories/LogReporteAnaliticoCuentasRepository',
], function (url, task, redirect, formModule, repository) {

    /* ─── Identificadores del Suitelet ──────────────────────────── */
    const SL_SCRIPT_ID = 'customscript_as_rpt_anlt_cuenta_cons_sl';
    const SL_DEPLOY_ID = 'customdeploy_as_rpt_anlt_cuenta_cons_sl';

    /**
     * Ruta del Client Script — relativa a la ubicación del Suitelet en FileCabinet.
     * El SL está en ui/ y el CS también en ui/, por lo tanto:
     */
    const CS_MODULE_PATH = '../AS_Generador_Reporte_Analitico_Cuentas_Consolidado_CS_2.1.js';

    /* ─── Script Map Reduce ──────────────────────────────────────── */
    /**
     * TODO: Reemplazar por el script ID y deployment ID reales
     *       una vez que el Map Reduce esté creado.
     */
    const MR_SCRIPT_ID = 'customscript_as_rpt_anlt_cuenta_cons_mr';
    const MR_DEPLOY_ID = 'customdeploy_as_rpt_anlt_cuenta_cons_mr';

    /* ─── Parámetros de mensaje post-redirect ────────────────────── */
    const PARAM_MSG_EXITO = 'custparam_msg_exito';
    const PARAM_MSG_ERROR = 'custparam_msg_error';

    /* ─────────────────────────────────────────────────────────────── */
    /*  GET — Renderiza el formulario principal con filtros y logs     */
    /* ─────────────────────────────────────────────────────────────── */
    /**
     * @param {Object} context        - Contexto del Suitelet (context.request / context.response)
     * @param {Object} [extra={}]     - Opciones adicionales (mensajeExito, mensajeError)
     */
    function handleGet(context, extra) {
        extra = extra || {};
        const params = context.request.parameters;

        /* Leer filtros activos desde los parámetros del request */
        const filtros = {
            subsidiaria   : params[formModule.FILTROS.SUBSIDIARIA]     || '',
            fecha         : params[formModule.FILTROS.FECHA]           || '',
            cuentaContable: params[formModule.FILTROS.CUENTA_CONTABLE] || '',
            cliente       : params[formModule.FILTROS.CLIENTE]         || '',
            proveedor     : params[formModule.FILTROS.PROVEEDOR]       || '',
            folio         : params[formModule.FILTROS.FOLIO]           || '',
        };

        /* Mensajes provenientes del redirect POST-Redirect-GET */
        const mensajeExito = extra.mensajeExito || params[PARAM_MSG_EXITO] || '';
        const mensajeError  = extra.mensajeError  || params[PARAM_MSG_ERROR]  || '';

        /* URL base del propio Suitelet (sin op ni fileId) */
        const suiteletUrl = url.resolveScript({
            scriptId         : SL_SCRIPT_ID,
            deploymentId     : SL_DEPLOY_ID,
            returnExternalUrl: false,
        });

        /* Consulta al repositorio — filtros de subsidiaria y fecha de corte */
        let logs = [];
        try {
            logs = repository.getAll();
        } catch (e) {
            log.error({ title: 'handleGet — Error al obtener logs', details: e });
        }

        /* Construir formulario y adjuntar Client Script */
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
    /*  POST — Lanza el Map Reduce y redirige al Suitelet (PRG)       */
    /* ─────────────────────────────────────────────────────────────── */
    /**
     * Patrón Post-Redirect-Get: al terminar el POST se emite un redirect
     * hacia el propio Suitelet para evitar reenvíos accidentales del form.
     *
     * @param {Object} context - Contexto del Suitelet
     */
    function handlePost(context) {
        const params = context.request.parameters;

        const subsidiaria    = params[formModule.FILTROS.SUBSIDIARIA]     || '';
        const fecha          = params[formModule.FILTROS.FECHA]           || '';
        const cuentaContable = params[formModule.FILTROS.CUENTA_CONTABLE] || '';
        const cliente        = params[formModule.FILTROS.CLIENTE]         || '';
        const proveedor      = params[formModule.FILTROS.PROVEEDOR]       || '';
        const folio          = params[formModule.FILTROS.FOLIO]           || '';
        //const tipoRegistro   = params[formModule.FILTROS.TIPO_REGISTRO]   || '';

        log.audit({
            title  : 'handlePost — Solicitud de generación de reporte',
            details: JSON.stringify({ subsidiaria, fecha, cuentaContable, cliente, proveedor, folio }),
        });

        try {
            /* ── 1. Crear registro de log (delegado al repositorio) ───── */
            const logId = repository.crear({ subsidiaria, fechaCorte: fecha });
            log.audit({ title: 'handlePost — Registro de log creado', details: { logId } });

            /* ── 2. Lanzar Map Reduce ────────────────────────────────── */
            const mrTask = task.create({
                taskType    : task.TaskType.MAP_REDUCE,
                scriptId    : MR_SCRIPT_ID,
                deploymentId: MR_DEPLOY_ID,
                params      : {
                    custscript_as_rpt_anlt_cta_cons_subsidia : subsidiaria,
                    custscript_as_rpt_anlt_cta_cons_fechacor : fecha,
                    custscript_as_rpt_anlt_cta_cons_cuentaid : cuentaContable,
                    custscript_as_rpt_anlt_cta_cons_logid    : logId,

                    //custscript_as_rpt_anlt_cta_cons_tipregis : tipoRegistro,
                    //custscript_as_mr_param_cliente           : cliente,
                    //custscript_as_mr_param_proveedor         : proveedor,
                    //custscript_as_mr_param_folio             : folio,
                },
            });
            const taskId = mrTask.submit();
            log.audit({ title: 'handlePost — MR lanzado', details: { taskId, logId } });

            /* ── 3. Redirect (POST-Redirect-Get) ─────────────────────── */
            redirect.toSuitelet({
                scriptId    : SL_SCRIPT_ID,
                deploymentId: SL_DEPLOY_ID,
                parameters  : {
                    [PARAM_MSG_EXITO]: 'La solicitud de generación de reporte fue recibida exitosamente. ' +
                                       'El archivo estará disponible en el histórico una vez completado el proceso.',
                },
            });

        } catch (e) {
            log.error({ title: 'handlePost — Error al lanzar MR', details: e });
            redirect.toSuitelet({
                scriptId    : SL_SCRIPT_ID,
                deploymentId: SL_DEPLOY_ID,
                parameters  : {
                    [PARAM_MSG_ERROR]: 'Error al iniciar la generación del reporte: ' + (e.message || String(e)),
                },
            });
        }
    }

    return { handleGet, handlePost };
});
