/**
 * AS_NSP_040 — Recuento de Inventario Manual
 * @description Client script de la pantalla del recuento.
 *
 *              pageInit     → quita el aviso Cargando articulos que tapa la
 *                             lista: recien aqui NetSuite la tiene armada y un
 *                             check marcado se envia. Guarda la ubicacion con
 *                             la que se dibujo la lista y
 *                             escucha el envio del formulario: Generar recuento
 *                             avisa que se esta enviando y bloquea un segundo
 *                             envio, que dejaria otra solicitud en la cola.
 *              fieldChanged → Subsidiaria: filtra Cuenta y Ubicacion con el JSON
 *                             oculto, como el AS_NSP_032.
 *                             Ubicacion: recarga el Suitelet con la cabecera en
 *                             la URL, para traer los articulos de la ubicacion.
 *              saveRecord   → sin ningun articulo marcado no envia: muestra el
 *                             aviso rojo arriba, sin recargar la pagina.
 *              descargarTxt → boton de la vista del recuento: abre el Suitelet
 *                             con el id del recuento y baja el TXT.
 *              descargarDetalle → boton Detalle de conteo de la vista del
 *                             recuento: abre el Suitelet y baja el CSV.
 *              abrirCarga   → boton de la pantalla del recuento: abre la
 *                             pantalla de carga para elegir el recuento.
 *              aprobarRecuento → boton Aprobar propio del recuento: abre el
 *                             Suitelet, que deja la aprobacion en la cola y
 *                             lleva a la solicitud. Un segundo clic mientras
 *                             sale de la pagina no hace nada.
 *
 *              Lo que pasa despues de enviar se ve en la solicitud de la cola.
 *              Marcar un articulo de la lista no pasa por el client script: es
 *              el check nativo, asi que no pesa aunque la lista tenga miles.
 *
 * @NApiVersion 2.1
 * @NScriptType ClientScript
 * @NModuleScope Public
 * @author Andes Salud
 * @version 1.11.0
 *
 */
define(['N/currentRecord', 'N/url', 'N/ui/message', './constants/AS_RecuentoInventarioManualConstants'],
    (currentRecord, url, message, CONSTANTES) => {

    let ubicacionDibujada = '';
    let generando         = false;
    let avisoSinArticulos = null;
    let aprobando         = false;

    function pageInit(context) {
        const avisoCargando = document.getElementById(CONSTANTES.FORMULARIO.CARGANDO_ID);
        if (avisoCargando) avisoCargando.remove();
        ubicacionDibujada = context.currentRecord.getValue({ fieldId: CONSTANTES.CAMPOS.UBICACION });
        document.forms.main_form.addEventListener('submit', avisarGenerando);
    }

    function avisarGenerando(evento) {
        if (evento.defaultPrevented) return;
        if (generando) {
            evento.preventDefault();
            return;
        }
        generando = true;
        message.create({
            type   : message.Type.INFORMATION,
            title  : CONSTANTES.FORMULARIO.GENERANDO_TITULO,
            message: CONSTANTES.FORMULARIO.GENERANDO_TEXTO,
        }).show();
    }

    function fieldChanged(context) {
        if (context.fieldId === CONSTANTES.CAMPOS.SUBSIDIARIA) {
            filtrarPorSubsidiaria(context.currentRecord, CONSTANTES.CAMPOS.CUENTA, CONSTANTES.CAMPOS.CUENTAS_DATA);
            filtrarPorSubsidiaria(context.currentRecord, CONSTANTES.CAMPOS.UBICACION, CONSTANTES.CAMPOS.UBICACIONES_DATA);
            return;
        }
        if (context.fieldId === CONSTANTES.CAMPOS.UBICACION) recargarConUbicacion(context.currentRecord);
    }

    function filtrarPorSubsidiaria(registroActual, campoId, datosId) {
        const campo       = registroActual.getField({ fieldId: campoId });
        const subsidiaria = registroActual.getValue({ fieldId: CONSTANTES.CAMPOS.SUBSIDIARIA });
        const opciones    = JSON.parse(registroActual.getValue({ fieldId: datosId }));

        campo.removeSelectOption({ value: null });
        campo.insertSelectOption({ value: '', text: '' });
        opciones.forEach((opcion) => {
            if (opcion.subsidiaria !== subsidiaria) return;
            campo.insertSelectOption({ value: opcion.id, text: opcion.nombre });
        });
    }

    function recargarConUbicacion(registroActual) {
        const campos    = CONSTANTES.CAMPOS;
        const ubicacion = registroActual.getValue({ fieldId: campos.UBICACION });
        if (!ubicacion || ubicacion === ubicacionDibujada) return;
        const parametros = {};
        parametros[campos.SUBSIDIARIA]  = registroActual.getValue({ fieldId: campos.SUBSIDIARIA });
        parametros[campos.UBICACION]    = ubicacion;
        parametros[campos.DEPARTAMENTO] = registroActual.getValue({ fieldId: campos.DEPARTAMENTO });
        parametros[campos.CLASE]        = registroActual.getValue({ fieldId: campos.CLASE });
        parametros[campos.FECHA]        = registroActual.getText({ fieldId: campos.FECHA });
        parametros[campos.CUENTA]       = registroActual.getValue({ fieldId: campos.CUENTA });
        parametros[campos.NOTA]         = registroActual.getValue({ fieldId: campos.NOTA });

        window.onbeforeunload = null;
        window.location.href  = url.resolveScript({
            scriptId    : CONSTANTES.SCRIPT.ID,
            deploymentId: CONSTANTES.SCRIPT.DEPLOYMENT,
            params      : parametros,
        });
    }

    function saveRecord(context) {
        const sublista = CONSTANTES.SUBLISTA;
        const lineas   = context.currentRecord.getLineCount({ sublistId: sublista.ID });
        for (let linea = 0; linea < lineas; linea++) {
            if (context.currentRecord.getSublistValue({ sublistId: sublista.ID, fieldId: sublista.COLUMNAS.CONTAR, line: linea })) return true;
        }
        if (avisoSinArticulos) avisoSinArticulos.hide();
        avisoSinArticulos = message.create({
            type   : message.Type.ERROR,
            title  : CONSTANTES.FORMULARIO.ALERTA_TITULO,
            message: CONSTANTES.FORMULARIO.SIN_ARTICULOS,
        });
        avisoSinArticulos.show();
        return false;
    }

    function descargarTxt() {
        window.location.href = url.resolveScript({
            scriptId    : CONSTANTES.SCRIPT.ID,
            deploymentId: CONSTANTES.SCRIPT.DEPLOYMENT,
            params      : { [CONSTANTES.CAMPOS.RECUENTO]: currentRecord.get().id },
        });
    }

    function descargarDetalle() {
        window.location.href = url.resolveScript({
            scriptId    : CONSTANTES.SCRIPT.ID,
            deploymentId: CONSTANTES.SCRIPT.DEPLOYMENT,
            params      : { [CONSTANTES.CAMPOS.DETALLE]: currentRecord.get().id },
        });
    }

    function abrirCarga() {
        window.onbeforeunload = null;
        window.location.href  = url.resolveScript({
            scriptId    : CONSTANTES.SCRIPT.ID,
            deploymentId: CONSTANTES.SCRIPT.DEPLOYMENT,
            params      : { [CONSTANTES.CAMPOS.CARGA]: 'T' },
        });
    }

    function aprobarRecuento() {
        if (aprobando) return;
        aprobando = true;
        window.location.href = url.resolveScript({
            scriptId    : CONSTANTES.SCRIPT.ID,
            deploymentId: CONSTANTES.SCRIPT.DEPLOYMENT,
            params      : { [CONSTANTES.CAMPOS.APROBAR]: currentRecord.get().id },
        });
    }

    return {
        pageInit        : pageInit,
        fieldChanged    : fieldChanged,
        saveRecord      : saveRecord,
        descargarTxt    : descargarTxt,
        descargarDetalle: descargarDetalle,
        abrirCarga      : abrirCarga,
        aprobarRecuento : aprobarRecuento,
    };
});
