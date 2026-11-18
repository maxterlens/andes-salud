/**
 * AS_NSP_040 — Recuento de Inventario Manual
 * @description Quien cierra el recuento.
 *
 *              Cada estado tiene su rol:
 *                Iniciado (B)             → Completar recuento: lo ven todos,
 *                                           Farmacia (1370) cuenta y completa.
 *                Aprobacion pendiente (C) → Aprobar y Rechazar: solo
 *                                           ROLES_AUTORIZADOS (Administrador y
 *                                           Supervisor Contable); al resto,
 *                                           Farmacia incluida, se le ocultan.
 *
 *              El Aprobar nativo se reemplaza siempre por el propio, que deja
 *              la aprobacion en la cola (ver AS_AprobacionRecuentoHandler).
 *              Con una aprobacion en curso no queda ni Aprobar ni Rechazar:
 *              solo el aviso con el enlace a la solicitud.
 *
 *              Los botones se buscan por su id de NetSuite, igual en cualquier
 *              idioma.
 *
 * @NApiVersion 2.1
 * @NModuleScope Public
 * @author Andes Salud
 * @version 1.3.0
 *
 * CHANGELOG
 * 1.3.0 [FEAT] Aprobar propio por la cola y bloqueo con una aprobacion en curso.
 */
define(['N/runtime', 'N/url', 'N/ui/message', '../data/query/AS_RecuentoInventarioManualQuery',
        '../constants/AS_RecuentoInventarioManualConstants'],
    (runtime, url, message, recuentoInventarioManualQuery, CONSTANTES) => {

    // ─────────────────────────────────────────────────────────────────────────
    // Principales
    // ─────────────────────────────────────────────────────────────────────────

    function prepararAprobacion(form, recuento) {
        if (recuento.getValue({ fieldId: 'statuskey' }) !== CONSTANTES.RECUENTO.ESTADO_PENDIENTE_APROBACION) return;
        const botonAprobar  = form.getButton({ id: CONSTANTES.RECUENTO.BOTON_APROBAR });
        const botonRechazar = form.getButton({ id: CONSTANTES.RECUENTO.BOTON_RECHAZAR });
        if (!botonAprobar) return;
        botonAprobar.isHidden = true;
        const autorizado = CONSTANTES.ROLES_AUTORIZADOS.includes(runtime.getCurrentUser().role);
        const enCursoId  = recuentoInventarioManualQuery.obtenerAprobacionEnCurso(recuento.id);
        if (!autorizado || enCursoId) {
            if (botonRechazar) botonRechazar.isHidden = true;
        }
        if (enCursoId) return avisarAprobacionEnCurso(form, enCursoId);
        if (autorizado) agregarBotonAprobar(form);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Secundarias
    // ─────────────────────────────────────────────────────────────────────────

    function avisarAprobacionEnCurso(form, solicitudId) {
        const textos    = CONSTANTES.COLA.TEXTOS;
        const direccion = url.resolveRecord({ recordType: CONSTANTES.COLA.TIPO, recordId: solicitudId });
        form.addPageInitMessage({
            type   : message.Type.WARNING,
            title  : CONSTANTES.COLA.TITULOS.PROCESANDO,
            message: textos.EN_CURSO + '<a href="' + direccion + '">' + textos.SOLICITUD + '</a>',
        });
    }

    function agregarBotonAprobar(form) {
        form.clientScriptModulePath = CONSTANTES.FORMULARIO.CLIENT_SCRIPT;
        form.addButton({
            id          : CONSTANTES.BOTONES.APROBAR,
            label       : CONSTANTES.BOTONES.APROBAR_LABEL,
            functionName: 'aprobarRecuento',
        });
    }

    return {
        prepararAprobacion: prepararAprobacion,
    };
});
