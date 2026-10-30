/**
 * AS_NSP_035 — Reporte de Stock Valorizado
 * @description Entry point del Scheduled Script que arma el Excel. No tiene
 *              programacion: lo lanza NetSuite cuando termina el SuiteQLTask del
 *              reporte, con el log y el CSV como parametros.
 * @NApiVersion 2.1
 * @NScriptType ScheduledScript
 * @NModuleScope Public
 * @scriptid     customscript_as_stock_valorizado_ss
 * @deploymentid customdeploy_as_stock_valorizado_ss
 * @author Andes Salud
 * @version 1.0.0
 *
 */
define(['N/runtime', './handler/AS_GeneracionExcelHandler', './constants/AS_StockValorizadoConstants'],
    (runtime, generacionExcelHandler, CONSTANTES) => {

    function execute() {
        const parametros = obtenerParametros();
        try {
            generacionExcelHandler.generarExcel(parametros.logId, parametros.csvId);
        } catch (fallo) {
            log.error({
                title  : 'STOCK VALORIZADO ERROR',
                details: 'log: ' + parametros.logId + ' | csv: ' + parametros.csvId
                       + ' | motivo: ' + (fallo.message || fallo),
            });
        }
    }

    function obtenerParametros() {
        const script = runtime.getCurrentScript();

        return {
            logId: script.getParameter({ name: CONSTANTES.PARAMETROS.LOG }),
            csvId: script.getParameter({ name: CONSTANTES.PARAMETROS.CSV }),
        };
    }

    return { execute };
});
