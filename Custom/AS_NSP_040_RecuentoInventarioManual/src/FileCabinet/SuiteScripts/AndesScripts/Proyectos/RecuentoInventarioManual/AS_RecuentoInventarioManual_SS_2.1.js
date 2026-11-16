/**
 * AS_NSP_040 — Recuento de Inventario Manual
 * @description Entry point del Scheduled que crea el recuento. No tiene
 *              programacion: lo lanza el Suitelet al presionar Generar recuento,
 *              con la cabecera y los articulos en un parametro.
 *
 * CHANGELOG v1.0.0 (2026-11-16):
 * - [FEAT] Generar el recuento en segundo plano, en una sola transaccion.
 *
 * @NApiVersion 2.1
 * @NScriptType ScheduledScript
 * @NModuleScope Public
 * @scriptid     customscript_as_rec_inv_man_ss
 * @deploymentid customdeploy_as_rec_inv_man_ss
 * @author Andes Salud
 * @version 1.0.0
 */
define(['N/runtime', './handler/AS_GeneracionRecuentoHandler', './constants/AS_RecuentoInventarioManualConstants'],
    (runtime, generacionRecuentoHandler, CONSTANTES) => {

    function execute() {
        try {
            generacionRecuentoHandler.generarRecuento(obtenerParametros().datos);
        } catch (fallo) {
            log.error({ title: 'RECUENTO INVENTARIO MANUAL ERROR', details: 'motivo: ' + (fallo.message || fallo) });
            throw fallo;
        }
    }

    function obtenerParametros() {
        const script = runtime.getCurrentScript();

        return {
            datos: JSON.parse(script.getParameter({ name: CONSTANTES.GENERACION.PARAMETRO_DATOS })),
        };
    }

    return { execute };
});
