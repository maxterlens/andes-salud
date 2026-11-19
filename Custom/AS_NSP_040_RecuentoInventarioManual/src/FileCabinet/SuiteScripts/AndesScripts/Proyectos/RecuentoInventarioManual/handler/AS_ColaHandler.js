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
 *              Cada solicitud es una de tres:
 *                GENERACION → crea el Recuento de inventario con los articulos
 *                             marcados y lo deja Iniciado.
 *                CARGA      → escribe en el recuento las cantidades del CSV.
 *                APROBACION → ejecuta Aprobar en el recuento; NetSuite crea los
 *                             ajustes de inventario.
 *
 *              Dos deployments, cada uno con su fila: el de aprobaciones
 *              (DEPLOYMENT_APROBACION) toma solo APROBACION; el otro,
 *              GENERACION y CARGA. Una aprobacion de media hora no frena una
 *              carga, y cada uno cierra como interrumpidas solo las suyas.
 *              Si NetSuite la rechaza, queda en Error con su mensaje y la cola
 *              sigue con la siguiente.
 *
 *              Los tiempos de cada paso quedan en la solicitud y en el log,
 *              para saber donde se va el tiempo (el guardado tardo entre 10 y 15
 *              minutos en QA, 2026-11-16):
 *                armar / cargar → el recuento en memoria.
 *                escribir       → las cantidades en las lineas (solo CARGA).
 *                guardar        → el save(): NetSuite completa las lineas y
 *                                 corren los User Event del recuento (el de
 *                                 WMS incluido).
 *                comenzar       → Comenzar recuento: NetSuite toma la
 *                                 instantanea del stock (solo GENERACION).
 *
 * @NApiVersion 2.1
 * @NModuleScope Public
 * @author Andes Salud
 * @version 1.1.0
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
        return [tipos.GENERACION, tipos.CARGA];
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
        const tipos = CONSTANTES.COLA.TIPOS;
        if (solicitud.tipo === tipos.GENERACION) return generarRecuento(solicitud.datos);
        if (solicitud.tipo === tipos.CARGA) return cargarCantidades(solicitud.recuento, solicitud.datos);
        return aprobarRecuento(solicitud.recuento);
    }

    /**
     * datos: { cabecera, articulos }, lo que marco la pantalla.
     */
    function generarRecuento(datos) {
        const inicio     = Date.now();
        const recuento   = recuentoInventarioRecord.armarRecuento(datos.cabecera, datos.articulos);
        const armado     = Date.now();
        const recuentoId = recuentoInventarioRecord.guardarRecuento(recuento);
        const guardado   = Date.now();
        recuentoInventarioRecord.comenzarRecuento(recuentoId);
        const fin        = Date.now();
        const tiempos    = 'armar: ' + convertirASegundos(armado - inicio)
                         + ' | guardar: ' + convertirASegundos(guardado - armado)
                         + ' | comenzar: ' + convertirASegundos(fin - guardado)
                         + ' | total: ' + convertirASegundos(fin - inicio);

        log.audit({
            title  : 'RECUENTO INVENTARIO MANUAL GENERADO',
            details: 'recuento: ' + recuentoId + ' | lineas: ' + datos.articulos.length + ' | ' + tiempos,
        });

        return { recuentoId: recuentoId, tiempos: tiempos };
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
        recuentoInventarioRecord.aprobarRecuento(recuentoId);
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
