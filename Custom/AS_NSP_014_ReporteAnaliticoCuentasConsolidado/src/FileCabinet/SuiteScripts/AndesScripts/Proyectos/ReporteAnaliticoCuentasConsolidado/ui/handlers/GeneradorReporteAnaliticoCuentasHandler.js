/**
 * AS_NSP_014 — Reporte Analítico de Cuentas Consolidado
 * @description Handler de la vista principal (op=view).
 *              Orquesta la obtención de datos y la construcción del formulario.
 *              En POST lanza el SearchTask que, al completarse, dispara automáticamente
 *              el Map Reduce SS de generación de archivos XLS y CSV (patrón PRG).
 *
 *  Flujo del POST:
 *    1. Crea el registro de log (estado: "En Proceso").
 *    2. Actualiza la búsqueda guardada con los filtros dinámicos.
 *    3. Crea un archivo CSV temporal en el File Cabinet (destino del SearchTask).
 *    4. Configura el SS (MapReduce) como inboundDependency del SearchTask,
 *       pasándole todos los parámetros necesarios para la generación del reporte.
 *    5. Lanza el SearchTask. NetSuite ejecuta el SS automáticamente al terminar.
 *    6. Redirige al Suitelet (PRG) con mensaje de confirmación.
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

    /* ─── Script SS (MapReduce) que lee el CSV y genera XLS/CSV ─── */
    const SS_SCRIPT_ID = 'customscript_as_rpt_anlt_cuenta_cons_ss';
    const SS_DEPLOY_ID = 'customdeploy_as_rpt_anlt_cuenta_cons_ss';

    /* ─── Búsqueda guardada base ─────────────────────────────────── */
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
            fecha         : params[formModule.FILTROS.FECHA]           || '',
            cuentaContable: params[formModule.FILTROS.CUENTA_CONTABLE] || '',
            cliente       : params[formModule.FILTROS.CLIENTE]         || '',
            proveedor     : params[formModule.FILTROS.PROVEEDOR]       || '',
            folio         : params[formModule.FILTROS.FOLIO]           || '',
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
    /*  POST — Lanza el SearchTask + SS y redirige al Suitelet (PRG)  */
    /* ─────────────────────────────────────────────────────────────── */
    function handlePost(context) {
        const params = context.request.parameters;

        const subsidiaria    = params[formModule.FILTROS.SUBSIDIARIA]     || '';
        const fecha          = params[formModule.FILTROS.FECHA]           || '';
        const cuentaContable = params[formModule.FILTROS.CUENTA_CONTABLE] || '';
        const cliente        = params[formModule.FILTROS.CLIENTE]         || '';
        const proveedor      = params[formModule.FILTROS.PROVEEDOR]       || '';
        const folio          = params[formModule.FILTROS.FOLIO]           || '';

        log.audit({
            title  : 'handlePost — Solicitud de generación de reporte',
            details: JSON.stringify({ subsidiaria, fecha, cuentaContable, cliente, proveedor, folio }),
        });

        try {
            /* ── 1. Crear registro de log (estado: "En Proceso") ─────── */
            const logId = repository.crear({ subsidiaria, fechaCorte: fecha });
            log.audit({ title: 'handlePost — Registro de log creado', details: { logId } });

            /* ── 2. Obtener ID de carpeta del parámetro del Suitelet ─── */
            const folderId = runtime.getCurrentScript().getParameter({ name: PARAM_FOLDER_ID });

            /* ── 3. Actualizar búsqueda guardada con filtros dinámicos ── */
            const savedSearch = search.load({ id: SEARCH_ID });

            // Eliminar filtros dinámicos de ejecuciones anteriores.
            // La búsqueda base tiene exactamente 5 filtros; cualquier excedente
            // corresponde a filtros dinámicos de una corrida previa.
            while (savedSearch.filters.length > 5) {
                savedSearch.filters.pop();
            }

            // Agregar filtros obligatorios
            savedSearch.filters.push(
                search.createFilter({ name: 'subsidiary', operator: 'anyof',       values: [subsidiaria] })
            );
            savedSearch.filters.push(
                search.createFilter({ name: 'trandate',   operator: 'onorbefore',  values: [fecha] })
            );

            // Agregar filtros opcionales
            if (cuentaContable) {
                savedSearch.filters.push(
                    search.createFilter({ name: 'account', operator: 'anyof', values: [cuentaContable] })
                );
            }
            /* if (tipoRegistro) {
                savedSearch.filters.push(
                    search.createFilter({ name: 'type', operator: 'anyof', values: [tipoRegistro] })
                );
            } */

            const updatedSearchId = savedSearch.save();

            log.audit({
                title  : 'handlePost — Búsqueda actualizada',
                details: 'ID: ' + String(updatedSearchId),
            });

            /* ── 4. Crear archivo CSV temporal en el File Cabinet ─────── */
            const nombreTmp = 'tmp_rpt_analitico_log' + logId
                            + '_sub' + (subsidiaria || 'ALL') + '.csv';
            const tmpFile   = file.create({
                name    : nombreTmp,
                fileType: file.Type.CSV,
                contents: '',
                folder  : folderId,
            });
            const tmpFileId = tmpFile.save();

            log.audit({
                title  : 'handlePost — Archivo temporal creado',
                details: 'ID: ' + tmpFileId + ' | Nombre: ' + nombreTmp,
            });

            /* ── 5. Configurar SS (MapReduce) como inboundDependency ──────
             *
             *  IMPORTANTE: addInboundDependency solo acepta task.TaskType.MAP_REDUCE.
             *  El SS_2.1.js está definido como @NScriptType MapReduceScript.
             *  NO llamar a ssTask.submit() aquí — NetSuite lo lanza automáticamente
             *  cuando el SearchTask finaliza.
             * ─────────────────────────────────────────────────────────── */
            const ssTask            = task.create({ taskType: task.TaskType.SCHEDULED_SCRIPT });
            ssTask.scriptId         = SS_SCRIPT_ID;
            ssTask.deploymentId     = SS_DEPLOY_ID;
            ssTask.params           = {
                custscript_as_rpt_anlt_cta_ss_subsi      : subsidiaria,
                custscript_as_rpt_anlt_cta_ss_fecha_cort : fecha,
                custscript_as_rpt_anlt_cta_ss_cta_cont   : cuentaContable || null,
                custscript_as_rpt_anlt_cta_ss_log_id     : logId,
                custscript_as_rpt_anlt_cta_ss_folderid   : folderId,
                custscript_as_rpt_anlt_cta_ss_archtempid : tmpFileId,
            };

            /* ── 6. Crear y lanzar el SearchTask ─────────────────────── */
            const searchTask         = task.create({ taskType: task.TaskType.SEARCH });
            searchTask.savedSearchId = updatedSearchId;
            searchTask.fileId        = tmpFileId;
            searchTask.addInboundDependency(ssTask); // ssTask se lanza solo al completarse el SearchTask

            const taskId = searchTask.submit();

            log.audit({
                title  : 'handlePost — SearchTask lanzado',
                details: JSON.stringify({ taskId: String(taskId), logId, tmpFileId }),
            });

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
            log.error({ title: 'handlePost — Error al lanzar SearchTask', details: e });
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
