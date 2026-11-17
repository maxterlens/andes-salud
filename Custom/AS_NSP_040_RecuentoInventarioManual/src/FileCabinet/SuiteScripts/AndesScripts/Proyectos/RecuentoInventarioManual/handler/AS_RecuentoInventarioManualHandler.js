/**
 * AS_NSP_040 — Recuento de Inventario Manual
 * @description Proceso de la pantalla del recuento.
 *
 *              mostrarFormulario → la cabecera que llega en la URL (el client
 *                                  script recarga al elegir la ubicacion) y,
 *                                  con ubicacion, la lista de sus articulos
 *                                  para marcar (GET).
 *              generarRecuento   → con los articulos marcados, deja la solicitud
 *                                  en la cola, lanza el Scheduled si esta libre
 *                                  y lleva al usuario a la solicitud (POST). Si
 *                                  la ubicacion ya tiene una generacion sin
 *                                  terminar, vuelve a dibujar la pantalla con
 *                                  el aviso y lo marcado. Que haya algo marcado
 *                                  lo revisa el client script antes de enviar.
 *
 *              El recuento no se crea aqui: con miles de lineas, guardarlo y
 *              tomar la instantanea pasa el tiempo de un Suitelet. Lo crea
 *              AS_ColaHandler desde el Scheduled. Llevar al usuario a la
 *              solicitud (y no dibujar un aviso) hace que recargar la pagina
 *              solo vuelva a mostrarla, sin reenviar el formulario.
 *
 * @NApiVersion 2.1
 * @NModuleScope Public
 * @author Andes Salud
 * @version 1.3.0
 */
define(['N/redirect', '../form/AS_RecuentoInventarioManualForm', '../data/query/AS_RecuentoInventarioManualQuery',
        '../data/record/AS_ColaRecord', '../utils/AS_RecuentoInventarioManualUtils',
        '../constants/AS_RecuentoInventarioManualConstants'],
    (redirect, recuentoInventarioManualForm, recuentoInventarioManualQuery, colaRecord, UTILS, CONSTANTES) => {

    // ─────────────────────────────────────────────────────────────────────────
    // Principales
    // ─────────────────────────────────────────────────────────────────────────

    function mostrarFormulario(context) {
        responderConFormulario(context, leerCabecera(context.request.parameters), []);
    }

    function generarRecuento(context) {
        const parametros = obtenerParametrosGenerar(context.request);
        const cabecera   = parametros.cabecera;
        const enCursoId  = recuentoInventarioManualQuery.obtenerGeneracionEnCurso(cabecera.ubicacion);
        if (enCursoId) return responderConFormulario(context, cabecera, parametros.articulos, CONSTANTES.FORMULARIO.GENERACION_PENDIENTE + enCursoId + ').');
        const solicitudId = colaRecord.crearSolicitud(CONSTANTES.COLA.TIPOS.GENERACION, { ubicacion: cabecera.ubicacion, datos: parametros });
        UTILS.lanzarScheduledSiEstaLibre(CONSTANTES.COLA.PROCESADOR, CONSTANTES.COLA.DEPLOYMENT);

        log.audit({
            title  : 'RECUENTO INVENTARIO MANUAL ENVIADO',
            details: 'solicitud: ' + solicitudId + ' | ubicacion: ' + cabecera.ubicacion + ' | articulos marcados: ' + parametros.articulos.length,
        });

        redirect.toRecord({ type: CONSTANTES.COLA.TIPO, id: solicitudId });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Secundarias
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Los dos procesos terminan aqui: Cuenta y Ubicacion necesitan sus opciones
     * con la subsidiaria, y la lista, los articulos de la ubicacion.
     */
    function responderConFormulario(context, cabecera, seleccionados, alerta) {
        const cuentas     = recuentoInventarioManualQuery.obtenerCuentasRecuento();
        const ubicaciones = recuentoInventarioManualQuery.obtenerUbicaciones();
        const articulos   = cabecera.ubicacion ? recuentoInventarioManualQuery.obtenerArticulosUbicacion(cabecera.ubicacion) : [];
        context.response.writePage(recuentoInventarioManualForm.construirFormulario(cabecera, articulos, seleccionados, cuentas, ubicaciones, alerta));
    }

    /**
     * La cabecera llega con los mismos ids en el GET (URL que arma el client
     * script) y en el POST (el formulario enviado).
     */
    function leerCabecera(valores) {
        const campos = CONSTANTES.CAMPOS;

        return {
            subsidiaria : valores[campos.SUBSIDIARIA],
            ubicacion   : valores[campos.UBICACION],
            departamento: valores[campos.DEPARTAMENTO],
            clase       : valores[campos.CLASE],
            fecha       : valores[campos.FECHA],
            cuenta      : valores[campos.CUENTA],
            nota        : valores[campos.NOTA],
        };
    }

    /**
     * Solo las lineas con Contar marcado.
     */
    function obtenerParametrosGenerar(request) {
        const sublista  = CONSTANTES.SUBLISTA;
        const articulos = [];

        for (let linea = 0; linea < request.getLineCount({ group: sublista.ID }); linea++) {
            if (request.getSublistValue({ group: sublista.ID, name: sublista.COLUMNAS.CONTAR, line: linea }) !== 'T') continue;
            articulos.push(request.getSublistValue({ group: sublista.ID, name: sublista.COLUMNAS.ARTICULO, line: linea }));
        }

        return {
            cabecera : leerCabecera(request.parameters),
            articulos: articulos,
        };
    }

    return {
        mostrarFormulario: mostrarFormulario,
        generarRecuento  : generarRecuento,
    };
});
