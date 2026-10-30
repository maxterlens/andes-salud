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
 * @version 1.3.0
 *
 * CHANGELOG v1.3.0:
 * - [FEAT] No lanza un reporte mientras otro se esta generando.
 *
 * CHANGELOG v1.2.0:
 * - [FIX]  Ubicacion llega como un solo valor, ya no como seleccion multiple.
 *
 * CHANGELOG v1.1.0:
 * - [FEAT] Lee las ubicaciones del formulario y filtra el reporte por ellas.
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
        const historial   = stockValorizadoSearch.obtenerHistorial();
        const ubicaciones = stockValorizadoQuery.obtenerUbicaciones();
        const solicitado  = context.request.parameters[CONSTANTES.URL.SOLICITADO] === 'T';
        const ocupado     = context.request.parameters[CONSTANTES.URL.OCUPADO] === 'T';

        context.response.writePage(stockValorizadoForm.construirFormulario(historial, ubicaciones, solicitado, ocupado));
    }

    function solicitarReporte(context) {
        if (stockValorizadoSearch.existeReporteEnProceso()) {
            volverAlFormulario(CONSTANTES.URL.OCUPADO);
            return;
        }
        const parametros = obtenerParametros(context.request);
        const fechaTexto = UTILS.convertirFechaATextoDiaMesAnio(parametros.fechaCorte);
        const logId      = stockValorizadoLogRecord.crearLog(parametros.subsidiaria, parametros.ubicaciones, parametros.fechaCorte);
        const nombre     = 'StockValorizado_' + parametros.subsidiaria + '_' + fechaTexto.replace(/\//g, '-') + '_' + logId + '.csv';
        const csvId      = archivoRecord.crearCsvVacio(nombre, parametros.carpeta);

        lanzarConsulta(parametros.subsidiaria, parametros.ubicaciones, fechaTexto, logId, csvId);

        log.audit({
            title  : 'STOCK VALORIZADO SOLICITADO',
            details: 'log: ' + logId + ' | subsidiaria: ' + parametros.subsidiaria + ' | ubicaciones: ' + parametros.ubicaciones.join(',') + ' | corte: ' + fechaTexto + ' | csv: ' + csvId,
        });

        volverAlFormulario(CONSTANTES.URL.SOLICITADO);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Secundarias
    // ─────────────────────────────────────────────────────────────────────────

    function volverAlFormulario(aviso) {
        redirect.toSuitelet({
            scriptId    : CONSTANTES.SCRIPTS.SUITELET.ID,
            deploymentId: CONSTANTES.SCRIPTS.SUITELET.DESPLIEGUE,
            parameters  : { [aviso]: 'T' },
        });
    }

    function obtenerParametros(request) {
        return {
            subsidiaria: request.parameters[CONSTANTES.CAMPOS.SUBSIDIARIA],
            ubicaciones: [request.parameters[CONSTANTES.CAMPOS.UBICACION]].filter(Boolean),
            fechaCorte : format.parse({ value: request.parameters[CONSTANTES.CAMPOS.FECHA_CORTE], type: format.Type.DATE }),
            carpeta    : runtime.getCurrentScript().getParameter({ name: CONSTANTES.PARAMETROS.CARPETA }),
        };
    }

    /**
     * El Scheduled Script va como dependencia de la consulta: NetSuite lo lanza
     * cuando el CSV ya esta escrito, con el log y el CSV que tiene que completar.
     */
    function lanzarConsulta(subsidiaria, ubicaciones, fechaTexto, logId, csvId) {
        const tareaExcel = task.create({ taskType: task.TaskType.SCHEDULED_SCRIPT });
        tareaExcel.scriptId     = CONSTANTES.SCRIPTS.GENERACION.ID;
        tareaExcel.deploymentId = CONSTANTES.SCRIPTS.GENERACION.DESPLIEGUE;
        tareaExcel.params       = { [CONSTANTES.PARAMETROS.LOG]: logId, [CONSTANTES.PARAMETROS.CSV]: csvId };

        const tareaConsulta = task.create({ taskType: task.TaskType.SUITE_QL });
        tareaConsulta.query  = stockValorizadoQuery.armarConsultaStock(ubicaciones);
        tareaConsulta.params = [Number(subsidiaria), fechaTexto].concat(ubicaciones.map(Number));
        tareaConsulta.fileId = csvId;
        tareaConsulta.addInboundDependency(tareaExcel);
        tareaConsulta.submit();
    }

    return {
        mostrarFormulario: mostrarFormulario,
        solicitarReporte : solicitarReporte,
    };
});
