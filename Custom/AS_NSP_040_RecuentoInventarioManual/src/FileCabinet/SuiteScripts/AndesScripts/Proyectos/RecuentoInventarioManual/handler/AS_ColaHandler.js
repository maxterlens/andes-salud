/**
 * AS_NSP_040 — Recuento de Inventario Manual
 * @description Proceso del Scheduled: vacia la cola AS Recuento Inventario
 *              Manual Cola de a una solicitud, la mas antigua primero.
 *
 *              procesarCola → cierra las que quedaron Procesando de una corrida
 *                             interrumpida, procesa las Pendientes mientras
 *                             haya tiempo y unidades, y si quedan, se vuelve a
 *                             lanzar.
 *
 *              Cada solicitud es una de dos:
 *                CARGA      → escribe en el recuento las cantidades del CSV.
 *                APROBACION → ejecuta Aprobar en el recuento; NetSuite crea los
 *                             ajustes de inventario.
 *              GENERACION ya no pasa por aqui: la toma el Map/Reduce de
 *              generacion (AS_GeneracionRecuentoHandler), que la parte en
 *              recuentos de 1500 lineas y los crea en paralelo.
 *
 *              Dos deployments, cada uno con su fila: el de aprobaciones
 *              (DEPLOYMENT_APROBACION) toma solo APROBACION; el otro, CARGA.
 *              Una aprobacion de media hora no frena una carga, y cada uno
 *              cierra como interrumpidas solo las suyas.
 *              Si NetSuite la rechaza, queda en Error con su mensaje y la cola
 *              sigue con la siguiente. Aprobar no lanza error cuando NetSuite
 *              no aprueba: devuelve el mensaje, y la solicitud queda en Error
 *              igual.
 *
 *              Los tiempos de cada paso quedan en la solicitud y en el log,
 *              para saber donde se va el tiempo (el guardado tardo entre 10 y 15
 *              minutos en QA, 2026-11-16):
 *                cargar   → el recuento en memoria.
 *                escribir → las cantidades en las lineas.
 *                guardar  → el save(): NetSuite completa las lineas y corren
 *                           los User Event del recuento (el de WMS incluido).
 *
 * @NApiVersion 2.1
 * @NModuleScope Public
 * @author Andes Salud
 * @version 1.3.0
 *
 */
define(['N/runtime', '../data/record/AS_ColaRecord', '../data/record/AS_RecuentoInventarioRecord',
        '../data/query/AS_RecuentoInventarioManualQuery', '../utils/AS_RecuentoInventarioManualUtils',
        '../constants/AS_RecuentoInventarioManualConstants'],
    (runtime, colaRecord, recuentoInventarioRecord, recuentoInventarioManualQuery, UTILS, CONSTANTES) => {

    // ─────────────────────────────────────────────────────────────────────────
    // Principales
    // ─────────────────────────────────────────────────────────────────────────

    function procesarCola() {
        const inicio       = Date.now();
        const estados      = CONSTANTES.COLA.ESTADOS;
        const deploymentId = runtime.getCurrentScript().deploymentId;
        const tipos        = obtenerTiposDelDeployment(deploymentId);
        const cerradas     = cerrarInterrumpidas(tipos);
        let procesadas     = 0;
        let siguienteId    = recuentoInventarioManualQuery.obtenerSolicitudes(estados.PENDIENTE, tipos)[0];
        while (siguienteId && quedaTiempo(inicio)) {
            procesarSolicitud(siguienteId);
            procesadas++;
            siguienteId = recuentoInventarioManualQuery.obtenerSolicitudes(estados.PENDIENTE, tipos)[0];
        }
        if (siguienteId) UTILS.lanzarScheduledSiEstaLibre(CONSTANTES.COLA.PROCESADOR, deploymentId);

        log.audit({
            title  : 'RECUENTO INVENTARIO COLA PROCESADA',
            details: 'deployment: ' + deploymentId + ' | procesadas: ' + procesadas + ' | interrumpidas cerradas: ' + cerradas
                   + ' | quedan pendientes: ' + (siguienteId ? 'si' : 'no'),
        });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Secundarias
    // ─────────────────────────────────────────────────────────────────────────

    function obtenerTiposDelDeployment(deploymentId) {
        const tipos = CONSTANTES.COLA.TIPOS;
        if (deploymentId === CONSTANTES.COLA.DEPLOYMENT_APROBACION) return [tipos.APROBACION];
        return [tipos.CARGA];
    }

    function cerrarInterrumpidas(tipos) {
        const interrumpidas = recuentoInventarioManualQuery.obtenerSolicitudes(CONSTANTES.COLA.ESTADOS.PROCESANDO, tipos);
        interrumpidas.forEach((solicitudId) => colaRecord.marcarError(solicitudId, CONSTANTES.COLA.TEXTOS.INTERRUMPIDA));
        return interrumpidas.length;
    }

    function quedaTiempo(inicio) {
        if (runtime.getCurrentScript().getRemainingUsage() < CONSTANTES.COLA.UNIDADES_MINIMAS) return false;
        return Date.now() - inicio < CONSTANTES.COLA.MINUTOS_MAXIMOS * 60000;
    }

    function procesarSolicitud(solicitudId) {
        const solicitud = colaRecord.leerSolicitud(solicitudId);
        colaRecord.marcarProcesando(solicitudId);
        try {
            const resultado = ejecutarSolicitud(solicitud);
            colaRecord.marcarListo(solicitudId, resultado.recuentoId, resultado.tiempos);
        } catch (fallo) {
            log.error({
                title  : 'RECUENTO INVENTARIO SOLICITUD ERROR',
                details: 'solicitud: ' + solicitudId + ' | tipo: ' + solicitud.tipo + ' | motivo: ' + (fallo.message || fallo),
            });
            colaRecord.marcarError(solicitudId, fallo.message || String(fallo));
        }
    }

    function ejecutarSolicitud(solicitud) {
        if (solicitud.tipo === CONSTANTES.COLA.TIPOS.CARGA) return cargarCantidades(solicitud.recuento, solicitud.datos);
        return aprobarRecuento(solicitud.recuento);
    }

    /**
     * datos: { cantidades }, con cantidades:
     * { idArticulo: { total, lotes: [{ lote, cantidad }] } }.
     */
    function cargarCantidades(recuentoId, datos) {
        const inicio       = Date.now();
        const recuento     = recuentoInventarioRecord.cargarRecuento(recuentoId);
        const cargado      = Date.now();
        const actualizadas = recuentoInventarioRecord.escribirCantidades(recuento, datos.cantidades);
        const escrito      = Date.now();
        recuentoInventarioRecord.guardarRecuento(recuento);
        const fin          = Date.now();
        const tiempos      = 'cargar: ' + convertirASegundos(cargado - inicio)
                           + ' | escribir: ' + convertirASegundos(escrito - cargado)
                           + ' | guardar: ' + convertirASegundos(fin - escrito)
                           + ' | total: ' + convertirASegundos(fin - inicio);

        log.audit({
            title  : 'RECUENTO INVENTARIO CANTIDADES CARGADAS',
            details: 'recuento: ' + recuentoId + ' | lineas actualizadas: ' + actualizadas + ' | ' + tiempos,
        });

        return { recuentoId: recuentoId, tiempos: tiempos };
    }

    function aprobarRecuento(recuentoId) {
        const inicio  = Date.now();
        const fallo   = recuentoInventarioRecord.aprobarRecuento(recuentoId);
        if (fallo) throw new Error(CONSTANTES.COLA.TEXTOS.NO_APROBADO + fallo + CONSTANTES.COLA.TEXTOS.NO_APROBADO_CAUSA);
        const tiempos = 'aprobar: ' + convertirASegundos(Date.now() - inicio);

        log.audit({
            title  : 'RECUENTO INVENTARIO MANUAL APROBADO',
            details: 'recuento: ' + recuentoId + ' | ' + tiempos,
        });

        return { recuentoId: recuentoId, tiempos: tiempos };
    }

    function convertirASegundos(milisegundos) { return Math.round(milisegundos / 1000) + ' s'; }

    return {
        procesarCola: procesarCola,
    };
});
