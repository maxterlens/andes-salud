/**
 * AS_NSP_040 — Recuento de Inventario Manual
 * @description Proceso del Map/Reduce de generacion: crea los recuentos de las
 *              solicitudes GENERACION de la cola, partidos en recuentos de 1500
 *              lineas (LINEAS_POR_RECUENTO), cada parte en su propio map para
 *              que corran en paralelo.
 *
 *              obtenerPartes        → getInputData. Cierra como interrumpidas
 *                                     las que quedaron Procesando (el
 *                                     deployment corre de a una ejecucion: si
 *                                     hay alguna, es de una corrida que se
 *                                     cayo), toma las Pendientes, las deja
 *                                     Procesando y devuelve una parte por cada
 *                                     1500 articulos.
 *              crearRecuentoParte   → map. Crea el recuento de una parte y lo
 *                                     deja Iniciado. Con mas de una parte, la
 *                                     Nota dice cual es ("Parte 1 de 2").
 *              cerrarSolicitud      → reduce. Con todas sus partes, deja la
 *                                     solicitud Listo con los recuentos creados
 *                                     o en Error con lo que fallo y lo que si se
 *                                     creo.
 *              resumirGeneracion    → summarize. Una linea de log con lo hecho.
 *
 *              Los tiempos de cada parte van al log; en la solicitud, el total
 *              de cada una (el campo Tiempos es de 300 caracteres):
 *                armar    → el recuento en memoria.
 *                guardar  → el save(): NetSuite completa las lineas y corren
 *                           los User Event del recuento (el de WMS incluido).
 *                comenzar → Comenzar recuento: NetSuite toma la instantanea
 *                           del stock.
 *
 * @NApiVersion 2.1
 * @NModuleScope Public
 * @author Andes Salud
 * @version 1.0.0
 *
 */
define(['../data/record/AS_ColaRecord', '../data/record/AS_RecuentoInventarioRecord',
        '../data/query/AS_RecuentoInventarioManualQuery', '../utils/AS_RecuentoInventarioManualUtils',
        '../constants/AS_RecuentoInventarioManualConstants'],
    (colaRecord, recuentoInventarioRecord, recuentoInventarioManualQuery, UTILS, CONSTANTES) => {

    // ─────────────────────────────────────────────────────────────────────────
    // Principales
    // ─────────────────────────────────────────────────────────────────────────

    function obtenerPartes() {
        const estados = CONSTANTES.COLA.ESTADOS;
        const tipos   = [CONSTANTES.COLA.TIPOS.GENERACION];
        recuentoInventarioManualQuery.obtenerSolicitudes(estados.PROCESANDO, tipos)
            .forEach((solicitudId) => colaRecord.marcarError(solicitudId, CONSTANTES.COLA.TEXTOS.INTERRUMPIDA));
        const partes = [];
        recuentoInventarioManualQuery.obtenerSolicitudes(estados.PENDIENTE, tipos).forEach((solicitudId) => {
            const solicitud = colaRecord.leerSolicitud(solicitudId);
            colaRecord.marcarProcesando(solicitudId);
            const bloques = UTILS.partirEnBloques(solicitud.datos.articulos, CONSTANTES.COLA.LINEAS_POR_RECUENTO);
            bloques.forEach((articulos, indice) => {
                partes.push({
                    solicitudId: String(solicitudId),
                    numero     : indice + 1,
                    total      : bloques.length,
                    cabecera   : agregarParteANota(solicitud.datos.cabecera, indice + 1, bloques.length),
                    articulos  : articulos,
                });
            });
        });

        return partes;
    }

    function crearRecuentoParte(parte) {
        const inicio     = Date.now();
        const recuento   = recuentoInventarioRecord.armarRecuento(parte.cabecera, parte.articulos);
        const armado     = Date.now();
        const recuentoId = recuentoInventarioRecord.guardarRecuento(recuento);
        const guardado   = Date.now();
        recuentoInventarioRecord.comenzarRecuento(recuentoId);
        const fin        = Date.now();

        log.audit({
            title  : 'RECUENTO INVENTARIO MANUAL GENERADO',
            details: 'solicitud: ' + parte.solicitudId + ' | parte: ' + parte.numero + ' de ' + parte.total
                   + ' | recuento: ' + recuentoId + ' | lineas: ' + parte.articulos.length
                   + ' | armar: ' + convertirASegundos(armado - inicio) + ' | guardar: ' + convertirASegundos(guardado - armado)
                   + ' | comenzar: ' + convertirASegundos(fin - guardado) + ' | total: ' + convertirASegundos(fin - inicio),
        });

        return { numero: parte.numero, total: parte.total, recuentoId: String(recuentoId), segundos: Math.round((fin - inicio) / 1000) };
    }

    /**
     * resultados: uno por parte, { numero, total, recuentoId, segundos } o
     * { numero, total, error } si esa parte fallo.
     */
    function cerrarSolicitud(solicitudId, resultados) {
        const ordenados = resultados.sort((primero, segundo) => primero.numero - segundo.numero);
        const fallidos  = ordenados.filter((resultado) => resultado.error);
        const creados   = ordenados.filter((resultado) => !resultado.error);
        if (fallidos.length) {
            colaRecord.marcarError(solicitudId, armarMensajeError(fallidos, creados));
            return CONSTANTES.COLA.ESTADOS.ERROR;
        }
        const solicitud = colaRecord.leerSolicitud(solicitudId);
        solicitud.datos.recuentos = creados.map((creado) => creado.recuentoId);
        colaRecord.marcarListo(solicitudId, creados[0].recuentoId, armarTiempos(creados), solicitud.datos);

        return CONSTANTES.COLA.ESTADOS.LISTO;
    }

    function resumirGeneracion(estados) {
        const listas   = estados.filter((estado) => estado === CONSTANTES.COLA.ESTADOS.LISTO).length;
        const conError = estados.length - listas;

        log.audit({
            title  : 'RECUENTO INVENTARIO GENERACION PROCESADA',
            details: 'solicitudes: ' + estados.length + ' | listas: ' + listas + ' | con error: ' + conError,
        });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Secundarias
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Con mas de una parte, la Nota dice cual es ("Parte 1 de 2") para
     * distinguir los recuentos en la lista. Con una sola, queda como la
     * escribio el usuario.
     */
    function agregarParteANota(cabecera, numero, total) {
        if (total === 1) return cabecera;
        const parte = CONSTANTES.FORMULARIO.PARTE + numero + CONSTANTES.FORMULARIO.PARTE_DE + total;
        return Object.assign({}, cabecera, { nota: cabecera.nota ? cabecera.nota + ' - ' + parte : parte });
    }

    /**
     * Lo que fallo y, si algo se creo, sus recuentos: antes de volver a
     * generar hay que revisarlos para no duplicarlos.
     */
    function armarMensajeError(fallidos, creados) {
        const errores = fallidos.map((fallido) => CONSTANTES.FORMULARIO.PARTE + fallido.numero + CONSTANTES.FORMULARIO.PARTE_DE
                                                + fallido.total + ': ' + fallido.error).join(' | ');
        if (!creados.length) return errores;
        return errores + '.' + CONSTANTES.COLA.TEXTOS.CREADOS + creados.map((creado) => creado.recuentoId).join(', ');
    }

    function armarTiempos(creados) {
        if (creados.length === 1) return 'total: ' + creados[0].segundos + ' s';
        return creados.map((creado) => 'parte ' + creado.numero + ': ' + creado.segundos + ' s').join(' | ');
    }

    function convertirASegundos(milisegundos) { return Math.round(milisegundos / 1000) + ' s'; }

    return {
        obtenerPartes     : obtenerPartes,
        crearRecuentoParte: crearRecuentoParte,
        cerrarSolicitud   : cerrarSolicitud,
        resumirGeneracion : resumirGeneracion,
    };
});
