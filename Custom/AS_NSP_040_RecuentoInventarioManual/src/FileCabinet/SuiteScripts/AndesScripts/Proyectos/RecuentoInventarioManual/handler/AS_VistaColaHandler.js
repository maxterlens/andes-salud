/**
 * AS_NSP_040 — Recuento de Inventario Manual
 * @description Proceso de la vista de una solicitud de la cola.
 *
 *              mostrarEstado → lee la solicitud y arma la vista de carga. Con la
 *                              solicitud Pendiente, cuenta las que van antes y
 *                              lanza el Scheduled si esta libre.
 *
 *              Lanzarlo desde la vista cubre el unico hueco de la cola: una
 *              solicitud que llega justo cuando el Scheduled ya reviso que no
 *              quedaba nada y esta por terminar. El Suitelet no puede lanzarlo
 *              (sigue corriendo) y esa corrida ya no la ve. Como la vista se
 *              recarga sola mientras no termina, a la siguiente recarga el
 *              Scheduled ya esta libre y arranca.
 *
 * @NApiVersion 2.1
 * @NModuleScope Public
 * @author Andes Salud
 * @version 1.3.0
 *
 * CHANGELOG
 * 1.3.0 [FEAT] La aprobacion lanza su deployment y cuenta solo su fila.
 */
define(['../form/AS_ColaForm', '../data/query/AS_RecuentoInventarioManualQuery',
        '../utils/AS_RecuentoInventarioManualUtils', '../constants/AS_RecuentoInventarioManualConstants'],
    (colaForm, recuentoInventarioManualQuery, UTILS, CONSTANTES) => {

    // ─────────────────────────────────────────────────────────────────────────
    // Principales
    // ─────────────────────────────────────────────────────────────────────────

    function mostrarEstado(form, solicitud) {
        const campos    = CONSTANTES.COLA.CAMPOS;
        const estado    = solicitud.getValue({ fieldId: campos.ESTADO });
        const tipo      = solicitud.getValue({ fieldId: campos.TIPO });
        const pendiente = estado === CONSTANTES.COLA.ESTADOS.PENDIENTE;
        const fila      = obtenerFila(tipo);
        if (pendiente) UTILS.lanzarScheduledSiEstaLibre(CONSTANTES.COLA.PROCESADOR, fila.deploymentId);

        colaForm.construirVista(form, {
            tipo      : tipo,
            estado    : estado,
            antes     : pendiente ? recuentoInventarioManualQuery.contarSolicitudesAntes(solicitud.id, fila.tipos) : 0,
            recuentoId: solicitud.getValue({ fieldId: campos.RECUENTO }),
            inicio    : solicitud.getValue({ fieldId: campos.INICIO }),
            fin       : solicitud.getValue({ fieldId: campos.FIN }),
            error     : solicitud.getValue({ fieldId: campos.ERROR }),
        });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Secundarias
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * La aprobacion tiene su propio deployment del Scheduled; generacion y
     * carga comparten el otro.
     */
    function obtenerFila(tipo) {
        const cola  = CONSTANTES.COLA;
        const tipos = cola.TIPOS;
        if (tipo === tipos.APROBACION) return { deploymentId: cola.DEPLOYMENT_APROBACION, tipos: [tipos.APROBACION] };
        return { deploymentId: cola.DEPLOYMENT, tipos: [tipos.GENERACION, tipos.CARGA] };
    }

    return {
        mostrarEstado: mostrarEstado,
    };
});
