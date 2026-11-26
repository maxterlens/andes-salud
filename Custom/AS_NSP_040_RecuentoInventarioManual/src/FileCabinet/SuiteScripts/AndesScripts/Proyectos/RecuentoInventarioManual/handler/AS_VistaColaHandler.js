/**
 * AS_NSP_040 — Recuento de Inventario Manual
 * @description Proceso de la vista de una solicitud de la cola.
 *
 *              mostrarEstado → lee la solicitud y arma la vista de carga. Con la
 *                              solicitud Pendiente, cuenta las que van antes y
 *                              lanza su procesador si esta libre: el
 *                              Map/Reduce si es una generacion, el Scheduled
 *                              si es carga o aprobacion. Trae los recuentos
 *                              con su numero: en una generacion Lista, los
 *                              de todas sus partes.
 *
 *              Lanzarlo desde la vista cubre el unico hueco de la cola: una
 *              solicitud que llega justo cuando el procesador ya reviso que no
 *              quedaba nada y esta por terminar. El Suitelet no puede lanzarlo
 *              (sigue corriendo) y esa corrida ya no la ve. Como la vista se
 *              recarga sola mientras no termina, a la siguiente recarga el
 *              procesador ya esta libre y arranca.
 *
 * @NApiVersion 2.1
 * @NModuleScope Public
 * @author Andes Salud
 * @version 1.5.0
 *
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
        if (pendiente && fila.mapReduce) UTILS.lanzarMapReduceSiEstaLibre(fila.scriptId, fila.deploymentId);
        if (pendiente && !fila.mapReduce) UTILS.lanzarScheduledSiEstaLibre(fila.scriptId, fila.deploymentId);

        colaForm.construirVista(form, {
            tipo      : tipo,
            estado    : estado,
            antes     : pendiente ? recuentoInventarioManualQuery.contarSolicitudesAntes(solicitud.id, fila.tipos) : 0,
            recuentos : obtenerRecuentos(solicitud, tipo, estado),
            inicio    : solicitud.getValue({ fieldId: campos.INICIO }),
            fin       : solicitud.getValue({ fieldId: campos.FIN }),
            error     : solicitud.getValue({ fieldId: campos.ERROR }),
        });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Secundarias
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Cada tipo con su procesador: la generacion, el Map/Reduce; la
     * aprobacion, su deployment del Scheduled; la carga, el otro.
     */
    function obtenerFila(tipo) {
        const cola  = CONSTANTES.COLA;
        const tipos = cola.TIPOS;
        if (tipo === tipos.GENERACION) {
            return { mapReduce: true, scriptId: cola.GENERADOR, deploymentId: cola.DEPLOYMENT_GENERACION, tipos: [tipos.GENERACION] };
        }
        if (tipo === tipos.APROBACION) {
            return { mapReduce: false, scriptId: cola.PROCESADOR, deploymentId: cola.DEPLOYMENT_APROBACION, tipos: [tipos.APROBACION] };
        }
        return { mapReduce: false, scriptId: cola.PROCESADOR, deploymentId: cola.DEPLOYMENT, tipos: [tipos.CARGA] };
    }

    /**
     * Los recuentos de la solicitud con su numero, para los enlaces del
     * mensaje. Una generacion Lista guarda en sus datos los de todas sus
     * partes; las generadas antes del Map/Reduce no los tienen y quedan con
     * el del campo Recuento, igual que una carga o una aprobacion.
     */
    function obtenerRecuentos(solicitud, tipo, estado) {
        const campos     = CONSTANTES.COLA.CAMPOS;
        const recuentoId = solicitud.getValue({ fieldId: campos.RECUENTO });
        const generacion = tipo === CONSTANTES.COLA.TIPOS.GENERACION && estado === CONSTANTES.COLA.ESTADOS.LISTO;
        const datos      = generacion ? JSON.parse(solicitud.getValue({ fieldId: campos.DATOS }) || '{}') : {};
        const ids        = datos.recuentos || (recuentoId ? [String(recuentoId)] : []);
        const numeros    = recuentoInventarioManualQuery.obtenerNumerosRecuento(ids);

        return ids.map((id) => ({ id: id, numero: numeros[id] || id }));
    }

    return {
        mostrarEstado: mostrarEstado,
    };
});
