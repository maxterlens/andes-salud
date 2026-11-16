/**
 * AS_NSP_040 — Recuento de Inventario Manual
 * @description Client script de la pantalla del recuento.
 *
 *              pageInit     → guarda la ubicacion con la que se dibujo la lista y
 *                             escucha el envio del formulario: Generar recuento
 *                             avisa que se esta enviando y bloquea un segundo
 *                             envio, que crearia otro recuento. En el aviso de
 *                             la generacion, sigue la tarea: cuenta el tiempo,
 *                             pregunta el estado cada pocos segundos y abre el
 *                             recuento al terminar.
 *              fieldChanged → Subsidiaria: filtra Cuenta y Ubicacion con el JSON
 *                             oculto, como el AS_NSP_032.
 *                             Ubicacion: recarga el Suitelet con la cabecera en
 *                             la URL, para traer los articulos de la ubicacion.
 *              saveRecord   → sin ningun articulo marcado no envia: muestra el
 *                             aviso rojo arriba, sin recargar la pagina.
 *              descargarTxt → boton de la vista del recuento: abre el Suitelet
 *                             con el id del recuento y baja el TXT.
 *              cargarCsv    → boton de la vista del recuento Iniciado: abre la
 *                             pantalla del Suitelet para subir las cantidades.
 *
 *              Marcar un articulo de la lista no pasa por el client script: es
 *              el check nativo, asi que no pesa aunque la lista tenga miles.
 *
 * CHANGELOG v1.5.0 (2026-11-16):
 * - [FEAT] seguirGeneracion y consultarGeneracion: el aviso muestra el estado y
 *          el tiempo, y abre el recuento o muestra el fallo.
 *
 * CHANGELOG v1.4.1 (2026-11-16):
 * - [FIX] Generar recuento sin articulos marcados recargaba la pagina para
 *         avisar desde el servidor. Ahora lo revisa saveRecord y no envia: el
 *         aviso es el mensaje rojo de NetSuite, sin pasar por "Enviando".
 *
 * CHANGELOG v1.4.0 (2026-11-16):
 * - [FEAT] La tabla pasa a lista con check: se quitan los datos del articulo por
 *          linea y el control de repetidos, la lista ya trae cada articulo una vez.
 *
 * CHANGELOG v1.3.0 (2026-11-15):
 * - [FEAT] cargarCsv para el boton de la vista del recuento.
 *
 * CHANGELOG v1.2.0 (2026-11-15):
 * - [FEAT] descargarTxt para el boton de la vista del recuento.
 *
 * CHANGELOG v1.1.0 (2026-11-15):
 * - [FIX] El aviso "Generando recuento" salia en saveRecord, antes de que NetSuite
 *         revisara los obligatorios: sin Cuenta el envio se cancelaba, el aviso
 *         quedaba pegado y los botones deshabilitados. Ahora sale en el envio real.
 *
 * CHANGELOG v1.0.0 (2026-11-15):
 * - [FEAT] Filtro por subsidiaria, recarga por ubicacion, datos del articulo y repetidos.
 *
 * @NApiVersion 2.1
 * @NScriptType ClientScript
 * @NModuleScope Public
 * @author Andes Salud
 * @version 1.5.0
 */
define(['N/currentRecord', 'N/url', 'N/https', 'N/ui/message', './constants/AS_RecuentoInventarioManualConstants'],
    (currentRecord, url, https, message, CONSTANTES) => {

    let ubicacionDibujada = '';
    let generando         = false;
    let avisoSinArticulos = null;

    function pageInit(context) {
        ubicacionDibujada = context.currentRecord.getValue({ fieldId: CONSTANTES.CAMPOS.UBICACION });
        document.forms.main_form.addEventListener('submit', avisarGenerando);
        if (context.currentRecord.getValue({ fieldId: CONSTANTES.CAMPOS.GENERACION })) seguirGeneracion(context.currentRecord);
    }

    /**
     * Un reloj de un segundo para que se vea que avanza, y cada
     * SEGUIMIENTO_SEGUNDOS la consulta al Suitelet, que es liviana: el estado de
     * la tarea y, al final, la direccion del recuento.
     */
    function seguirGeneracion(registroActual) {
        const campos    = CONSTANTES.CAMPOS;
        const direccion = url.resolveScript({
            scriptId    : CONSTANTES.SCRIPT.ID,
            deploymentId: CONSTANTES.SCRIPT.DEPLOYMENT,
            params      : {
                [campos.GENERACION]: registroActual.getValue({ fieldId: campos.GENERACION }),
                [campos.TAREA]     : registroActual.getValue({ fieldId: campos.TAREA }),
            },
        });
        let segundos = 0;

        const reloj = setInterval(() => {
            segundos++;
            registroActual.setValue({ fieldId: campos.TIEMPO, value: Math.floor(segundos / 60) + ' min ' + (segundos % 60) + ' s' });
            if (segundos % CONSTANTES.FORMULARIO.SEGUIMIENTO_SEGUNDOS === 0) consultarGeneracion(registroActual, direccion, reloj);
        }, 1000);
    }

    /**
     * Con url, el recuento ya esta Iniciado: se abre. Terminada sin url, o
     * fallida, el reloj se detiene y se muestra el aviso rojo.
     */
    function consultarGeneracion(registroActual, direccion, reloj) {
        https.get.promise({ url: direccion }).then((respuesta) => {
            const generacion = JSON.parse(respuesta.body);
            registroActual.setValue({ fieldId: CONSTANTES.CAMPOS.ESTADO, value: CONSTANTES.FORMULARIO.ESTADOS_TAREA[generacion.estado] || generacion.estado });
            if (generacion.url) {
                clearInterval(reloj);
                window.location.href = generacion.url;
                return;
            }
            if (generacion.estado !== 'COMPLETE' && generacion.estado !== 'FAILED') return;
            clearInterval(reloj);
            message.create({
                type   : message.Type.ERROR,
                title  : CONSTANTES.FORMULARIO.ALERTA_TITULO,
                message: CONSTANTES.FORMULARIO.FALLO_GENERACION,
            }).show();
        });
    }

    /**
     * El evento submit del formulario llega solo cuando NetSuite ya reviso los
     * obligatorios; si los rechazo, llega cancelado (defaultPrevented) o no
     * llega. Un segundo envio mientras se genera se cancela aqui.
     */
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

    /**
     * Rehace las opciones del select con las de la subsidiaria elegida, sacadas
     * del JSON oculto que dejo el servidor ({ subsidiaria, id, nombre }).
     */
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

    /**
     * La lista de articulos la arma el servidor: una ubicacion nueva es recargar
     * la pagina. La cabecera viaja en la URL con los mismos ids de los campos.
     * Elegir la misma ubicacion no recarga.
     */
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

    /**
     * No muestra el mensaje de "Enviando", que sale en el envio real (ver
     * avisarGenerando). Recorre hasta el primer marcado. El aviso anterior se
     * oculta para que dos clics no apilen dos mensajes.
     */
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

    function cargarCsv() {
        window.location.href = url.resolveScript({
            scriptId    : CONSTANTES.SCRIPT.ID,
            deploymentId: CONSTANTES.SCRIPT.DEPLOYMENT,
            params      : { [CONSTANTES.CAMPOS.RECUENTO_CARGA]: currentRecord.get().id },
        });
    }

    return {
        pageInit    : pageInit,
        fieldChanged: fieldChanged,
        saveRecord  : saveRecord,
        descargarTxt: descargarTxt,
        cargarCsv   : cargarCsv,
    };
});
