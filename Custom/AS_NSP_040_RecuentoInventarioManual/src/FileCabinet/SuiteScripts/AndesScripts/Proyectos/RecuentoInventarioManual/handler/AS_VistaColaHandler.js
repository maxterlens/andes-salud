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
 * @version 1.2.0
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
        const pendiente = estado === CONSTANTES.COLA.ESTADOS.PENDIENTE;
        if (pendiente) UTILS.lanzarScheduledSiEstaLibre(CONSTANTES.COLA.PROCESADOR, CONSTANTES.COLA.DEPLOYMENT);

        colaForm.construirVista(form, {
            tipo      : solicitud.getValue({ fieldId: campos.TIPO }),
            estado    : estado,
            antes     : pendiente ? recuentoInventarioManualQuery.contarSolicitudesAntes(solicitud.id) : 0,
            recuentoId: solicitud.getValue({ fieldId: campos.RECUENTO }),
            inicio    : solicitud.getValue({ fieldId: campos.INICIO }),
            fin       : solicitud.getValue({ fieldId: campos.FIN }),
            error     : solicitud.getValue({ fieldId: campos.ERROR }),
        });
    }

    return {
        mostrarEstado: mostrarEstado,
    };
});
