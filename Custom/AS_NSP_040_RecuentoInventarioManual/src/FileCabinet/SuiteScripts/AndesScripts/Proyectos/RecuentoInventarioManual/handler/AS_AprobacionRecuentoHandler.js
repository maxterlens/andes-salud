/**
 * AS_NSP_040 — Recuento de Inventario Manual
 * @description Proceso del boton Aprobar propio del recuento.
 *
 *              solicitarAprobacion → si el recuento ya tiene una aprobacion en
 *                                    cola o en proceso, lleva a esa solicitud;
 *                                    si no, deja una nueva, lanza el deployment
 *                                    de aprobaciones del Scheduled y lleva al
 *                                    usuario a ella (Suitelet, GET).
 *
 *              El recuento no se aprueba aqui: el Aprobar nativo con miles de
 *              lineas tarda media hora y el navegador corta a los 14 minutos
 *              (QA, 2026-11-17); un segundo clic mientras corre el primero
 *              puede tumbar los dos. El Scheduled ejecuta la misma accion
 *              nativa (approve) y NetSuite crea los ajustes, como con el boton.
 *              Llevar al usuario a la solicitud saca la pagina del recuento y
 *              recargar solo vuelve a mostrarla.
 *
 * @NApiVersion 2.1
 * @NModuleScope Public
 * @author Andes Salud
 * @version 1.0.0
 */
define(['N/redirect', '../data/query/AS_RecuentoInventarioManualQuery', '../data/record/AS_ColaRecord',
        '../utils/AS_RecuentoInventarioManualUtils', '../constants/AS_RecuentoInventarioManualConstants'],
    (redirect, recuentoInventarioManualQuery, colaRecord, UTILS, CONSTANTES) => {

    // ─────────────────────────────────────────────────────────────────────────
    // Principales
    // ─────────────────────────────────────────────────────────────────────────

    function solicitarAprobacion(recuentoId) {
        const enCursoId = recuentoInventarioManualQuery.obtenerAprobacionEnCurso(recuentoId);
        if (enCursoId) return redirect.toRecord({ type: CONSTANTES.COLA.TIPO, id: enCursoId });
        const solicitudId = colaRecord.crearSolicitud(CONSTANTES.COLA.TIPOS.APROBACION, { recuento: recuentoId, datos: {} });
        UTILS.lanzarScheduledSiEstaLibre(CONSTANTES.COLA.PROCESADOR, CONSTANTES.COLA.DEPLOYMENT_APROBACION);

        log.audit({
            title  : 'RECUENTO INVENTARIO APROBACION ENVIADA',
            details: 'solicitud: ' + solicitudId + ' | recuento: ' + recuentoId,
        });

        redirect.toRecord({ type: CONSTANTES.COLA.TIPO, id: solicitudId });
    }

    return {
        solicitarAprobacion: solicitarAprobacion,
    };
});
