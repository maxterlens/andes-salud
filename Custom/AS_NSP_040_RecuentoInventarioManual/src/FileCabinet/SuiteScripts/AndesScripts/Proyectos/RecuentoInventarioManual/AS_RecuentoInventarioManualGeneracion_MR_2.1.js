/**
 * AS_NSP_040 — Recuento de Inventario Manual
 * @description Crea los recuentos de las solicitudes Generar recuento de la
 *              cola, de a 1500 lineas por recuento y en paralelo: una parte
 *              por map. Lo lanzan el Suitelet al generar y la vista de la
 *              solicitud mientras esta Pendiente.
 *
 *              getInputData → las partes de las solicitudes Pendientes.
 *              map          → crea el recuento de una parte. Si falla, la
 *                             parte sigue al reduce con su error.
 *              reduce       → cierra la solicitud con todas sus partes.
 *              summarize    → una linea de log con lo hecho y los errores de
 *                             cada etapa.
 *
 * @NApiVersion 2.1
 * @NScriptType MapReduceScript
 * @scriptid     customscript_as_rec_inv_man_gen_mr
 * @deploymentid customdeploy_as_rec_inv_man_gen_mr
 * @author Andes Salud
 * @version 1.0.0
 *
 */
define(['./handler/AS_GeneracionRecuentoHandler'],
    (generacionRecuentoHandler) => {

    function getInputData() {
        try {
            return generacionRecuentoHandler.obtenerPartes();
        } catch (fallo) {
            log.error({ title: 'RECUENTO INVENTARIO GENERACION ERROR', details: 'etapa: getInputData | motivo: ' + (fallo.message || fallo) });
            throw fallo;
        }
    }

    function map(context) {
        const parte = JSON.parse(context.value);
        try {
            context.write({ key: parte.solicitudId, value: generacionRecuentoHandler.crearRecuentoParte(parte) });
        } catch (fallo) {
            log.error({
                title  : 'RECUENTO INVENTARIO GENERACION ERROR',
                details: 'solicitud: ' + parte.solicitudId + ' | parte: ' + parte.numero + ' de ' + parte.total
                       + ' | motivo: ' + (fallo.message || fallo),
            });
            context.write({ key: parte.solicitudId, value: { numero: parte.numero, total: parte.total, error: fallo.message || String(fallo) } });
        }
    }

    function reduce(context) {
        try {
            const resultados = context.values.map((valor) => JSON.parse(valor));
            context.write({ key: context.key, value: generacionRecuentoHandler.cerrarSolicitud(context.key, resultados) });
        } catch (fallo) {
            log.error({ title: 'RECUENTO INVENTARIO GENERACION ERROR', details: 'solicitud: ' + context.key + ' | motivo: ' + (fallo.message || fallo) });
            throw fallo;
        }
    }

    function summarize(summary) {
        if (summary.inputSummary.error) {
            log.error({ title: 'RECUENTO INVENTARIO GENERACION ERROR', details: 'etapa: getInputData | motivo: ' + summary.inputSummary.error });
        }
        summary.reduceSummary.errors.iterator().each((solicitudId, error) => {
            log.error({ title: 'RECUENTO INVENTARIO GENERACION ERROR', details: 'etapa: reduce | solicitud: ' + solicitudId + ' | motivo: ' + error });
            return true;
        });
        const estados = [];
        summary.output.iterator().each((solicitudId, estado) => {
            estados.push(estado);
            return true;
        });
        generacionRecuentoHandler.resumirGeneracion(estados);
    }

    return { getInputData, map, reduce, summarize };
});
