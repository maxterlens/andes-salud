/**
 * AS_NSP_040 — Recuento de Inventario Manual
 * @description Lo que ve el usuario en la vista de una solicitud de la cola: el
 *              mensaje arriba con el estado y un solo grupo, AS - Espera de
 *              Recuento de Inventario, con el recuento, el tipo de proceso y la
 *              fecha y hora de inicio y de fin. Los campos propios del record e
 *              Inactivo se ocultan. Mientras no termine, la pagina se recarga
 *              sola. No busca ni guarda records.
 *
 *              Pendiente  → en cola, con cuantas solicitudes van antes.
 *              Procesando → que se esta haciendo y que tarda.
 *              Listo      → el enlace al recuento; en una aprobacion, que
 *                           quedo aprobado.
 *              Error      → el mensaje de NetSuite.
 *
 * @NApiVersion 2.1
 * @NModuleScope Public
 * @author Andes Salud
 * @version 1.3.0
 *
 * CHANGELOG
 * 1.3.0 [FEAT] Textos de la aprobacion: Aprobando y Recuento aprobado.
 */
define(['N/ui/serverWidget', 'N/ui/message', 'N/url', 'N/format', '../constants/AS_RecuentoInventarioManualConstants'],
    (serverWidget, message, url, format, CONSTANTES) => {

    // ─────────────────────────────────────────────────────────────────────────
    // Principales
    // ─────────────────────────────────────────────────────────────────────────

    function construirVista(form, solicitud) {
        const estados   = CONSTANTES.COLA.ESTADOS;
        const terminada = solicitud.estado === estados.LISTO || solicitud.estado === estados.ERROR;

        form.addPageInitMessage({
            type   : obtenerTipoMensaje(solicitud.estado),
            title  : CONSTANTES.COLA.TITULOS[solicitud.estado],
            message: armarTexto(solicitud) + (terminada ? '' : ' ' + CONSTANTES.COLA.TEXTOS.REFRESCO),
        });
        ocultarCamposDelRecord(form);
        agregarEspera(form, solicitud);
        if (!terminada) agregarRecarga(form);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Secundarias
    // ─────────────────────────────────────────────────────────────────────────

    function obtenerTipoMensaje(estado) {
        if (estado === CONSTANTES.COLA.ESTADOS.LISTO) return message.Type.CONFIRMATION;
        if (estado === CONSTANTES.COLA.ESTADOS.ERROR) return message.Type.ERROR;
        return message.Type.INFORMATION;
    }

    function armarTexto(solicitud) {
        const estados = CONSTANTES.COLA.ESTADOS;
        const textos     = CONSTANTES.COLA.TEXTOS;
        const aprobacion = solicitud.tipo === CONSTANTES.COLA.TIPOS.APROBACION;
        if (solicitud.estado === estados.PENDIENTE) return textos.PENDIENTE + solicitud.antes + '.';
        if (solicitud.estado === estados.PROCESANDO) return aprobacion ? textos.APROBANDO : textos.PROCESANDO;
        if (solicitud.estado === estados.ERROR) return textos.ERROR + solicitud.error;
        const direccion = url.resolveRecord({ recordType: CONSTANTES.RECUENTO.TIPO, recordId: solicitud.recuentoId });
        return (aprobacion ? textos.APROBADO : textos.LISTO) + ' <a href="' + direccion + '">' + textos.ABRIR + '</a>';
    }

    function ocultarCamposDelRecord(form) {
        const campos = CONSTANTES.COLA.CAMPOS;
        [CONSTANTES.COLA.CAMPO_INACTIVO, campos.TIPO, campos.ESTADO, campos.RECUENTO, campos.UBICACION, campos.ERROR,
         campos.TIEMPOS, campos.INICIO, campos.FIN]
            .forEach((campoId) => form.getField({ id: campoId }).updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN }));
    }

    function agregarEspera(form, solicitud) {
        const vista = CONSTANTES.COLA.VISTA;

        form.addFieldGroup({ id: vista.GRUPO, label: vista.TITULO });

        const campoRecuento = form.addField({
            id       : vista.RECUENTO,
            type     : serverWidget.FieldType.SELECT,
            label    : 'Recuento de inventario',
            source   : 'transaction',
            container: vista.GRUPO,
        });
        campoRecuento.defaultValue = solicitud.recuentoId;
        campoRecuento.updateDisplayType({ displayType: serverWidget.FieldDisplayType.INLINE });
        const campoInicio = form.addField({
            id       : vista.INICIO,
            type     : serverWidget.FieldType.TEXT,
            label    : 'Fecha y hora de inicio',
            container: vista.GRUPO,
        });
        campoInicio.defaultValue = formatearFechaHora(solicitud.inicio);
        campoInicio.updateDisplayType({ displayType: serverWidget.FieldDisplayType.INLINE });
        const campoTipo = form.addField({
            id       : vista.TIPO,
            type     : serverWidget.FieldType.TEXT,
            label    : 'Tipo de proceso',
            container: vista.GRUPO,
        });
        campoTipo.defaultValue = CONSTANTES.COLA.TIPOS_LABEL[solicitud.tipo];
        campoTipo.updateDisplayType({ displayType: serverWidget.FieldDisplayType.INLINE });
        const campoFin = form.addField({
            id       : vista.FIN,
            type     : serverWidget.FieldType.TEXT,
            label    : 'Fecha y hora de fin',
            container: vista.GRUPO,
        });
        campoFin.defaultValue = formatearFechaHora(solicitud.fin);
        campoFin.updateDisplayType({ displayType: serverWidget.FieldDisplayType.INLINE });
    }

    function formatearFechaHora(fecha) {
        if (!fecha) return '';
        return format.format({ value: fecha, type: format.Type.DATETIME });
    }

    function agregarRecarga(form) {
        const campoRecarga = form.addField({
            id   : CONSTANTES.CAMPOS.REFRESCO,
            type : serverWidget.FieldType.INLINEHTML,
            label: 'Recarga',
        });
        campoRecarga.defaultValue = '<script>setTimeout(function () { window.location.reload(); }, '
                                  + CONSTANTES.COLA.REFRESCO_SEGUNDOS * 1000 + ');</script>';
    }

    return {
        construirVista: construirVista,
    };
});
