/**
 * AS_NSP_035 — Reporte de Stock Valorizado
 * @description Proceso de la pantalla del reporte.
 *
 *              mostrarFormulario → filtros e historial de reportes (GET).
 *              solicitarReporte  → registra el pedido en el historial y lanza la
 *                                  consulta en segundo plano (POST, boton Generar).
 *
 *              El patron es el del AS_NSP_014: la consulta va como SuiteQLTask, que
 *              NetSuite corre en su cola y vuelca en un CSV del File Cabinet, sin el
 *              limite de filas ni el tiempo de un Suitelet. Al terminar, NetSuite
 *              lanza solo el Scheduled Script que arma el Excel
 *              (AS_GeneracionExcelHandler). El usuario no espera: el reporte aparece
 *              en el historial.
 * @NApiVersion 2.1
 * @NModuleScope Public
 * @author Andes Salud
 * @version 1.0.0
 *
 */
define(['N/task', 'N/redirect', 'N/runtime', 'N/format', '../form/AS_StockValorizadoForm',
        '../data/query/AS_StockValorizadoQuery', '../data/search/AS_StockValorizadoSearch',
        '../data/record/AS_StockValorizadoLogRecord', '../data/record/AS_ArchivoRecord',
        '../utils/AS_StockValorizadoUtils', '../constants/AS_StockValorizadoConstants'],
    (task, redirect, runtime, format, stockValorizadoForm, stockValorizadoQuery, stockValorizadoSearch,
     stockValorizadoLogRecord, archivoRecord, UTILS, CONSTANTES) => {

    // ─────────────────────────────────────────────────────────────────────────
    // Principales
    // ─────────────────────────────────────────────────────────────────────────

    function mostrarFormulario(context) {
        const historial  = stockValorizadoSearch.obtenerHistorial();
        const solicitado = context.request.parameters[CONSTANTES.URL.SOLICITADO] === 'T';

        context.response.writePage(stockValorizadoForm.construirFormulario(historial, solicitado));
    }

    function solicitarReporte(context) {
        const parametros = obtenerParametros(context.request);
        const fechaTexto = UTILS.convertirFechaATextoDiaMesAnio(parametros.fechaCorte);
        const logId      = stockValorizadoLogRecord.crearLog(parametros.subsidiaria, parametros.fechaCorte);
        const nombre     = 'StockValorizado_' + parametros.subsidiaria + '_' + fechaTexto.replace(/\//g, '-') + '_' + logId + '.csv';
        const csvId      = archivoRecord.crearCsvVacio(nombre, parametros.carpeta);

        lanzarConsulta(parametros.subsidiaria, fechaTexto, logId, csvId);

        log.audit({
            title  : 'STOCK VALORIZADO SOLICITADO',
            details: 'log: ' + logId + ' | subsidiaria: ' + parametros.subsidiaria + ' | corte: ' + fechaTexto + ' | csv: ' + csvId,
        });

        redirect.toSuitelet({
            scriptId    : CONSTANTES.SCRIPTS.SUITELET.ID,
            deploymentId: CONSTANTES.SCRIPTS.SUITELET.DESPLIEGUE,
            parameters  : { [CONSTANTES.URL.SOLICITADO]: 'T' },
        });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Secundarias
    // ─────────────────────────────────────────────────────────────────────────

    function obtenerParametros(request) {
        return {
            subsidiaria: request.parameters[CONSTANTES.CAMPOS.SUBSIDIARIA],
            fechaCorte : format.parse({ value: request.parameters[CONSTANTES.CAMPOS.FECHA_CORTE], type: format.Type.DATE }),
            carpeta    : runtime.getCurrentScript().getParameter({ name: CONSTANTES.PARAMETROS.CARPETA }),
        };
    }

    /**
     * El Scheduled Script va como dependencia de la consulta: NetSuite lo lanza
     * cuando el CSV ya esta escrito, con el log y el CSV que tiene que completar.
     */
    function lanzarConsulta(subsidiaria, fechaTexto, logId, csvId) {
        const tareaExcel = task.create({ taskType: task.TaskType.SCHEDULED_SCRIPT });
        tareaExcel.scriptId     = CONSTANTES.SCRIPTS.GENERACION.ID;
        tareaExcel.deploymentId = CONSTANTES.SCRIPTS.GENERACION.DESPLIEGUE;
        tareaExcel.params       = { [CONSTANTES.PARAMETROS.LOG]: logId, [CONSTANTES.PARAMETROS.CSV]: csvId };

        const tareaConsulta = task.create({ taskType: task.TaskType.SUITE_QL });
        tareaConsulta.query  = stockValorizadoQuery.armarConsultaStock();
        tareaConsulta.params = [Number(subsidiaria), fechaTexto];
        tareaConsulta.fileId = csvId;
        tareaConsulta.addInboundDependency(tareaExcel);
        tareaConsulta.submit();
    }

    return {
        mostrarFormulario: mostrarFormulario,
        solicitarReporte : solicitarReporte,
    };
});
