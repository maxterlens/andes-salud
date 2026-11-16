/**
 * AS_NSP_040 — Recuento de Inventario Manual
 * @description Proceso de la pantalla del recuento.
 *
 *              mostrarFormulario → la cabecera que llega en la URL (el client
 *                                  script recarga al elegir la ubicacion) y,
 *                                  con ubicacion, la lista de sus articulos
 *                                  para marcar (GET).
 *              generarRecuento   → con los articulos marcados, manda a crear el
 *                                  recuento al Scheduled y muestra el aviso
 *                                  (POST). Con otro recuento generandose,
 *                                  vuelve a dibujar la pantalla con el aviso y
 *                                  lo marcado. Que haya algo marcado lo revisa
 *                                  el client script antes de enviar.
 *              consultarGeneracion → el estado de la tarea y, al terminar, la
 *                                  direccion del recuento creado. La pide el
 *                                  aviso cada pocos segundos (GET, responde
 *                                  JSON).
 *
 *              El recuento no se crea aqui: con miles de lineas, guardarlo y
 *              tomar la instantanea pasa el tiempo de un Suitelet. Lo crea
 *              AS_GeneracionRecuentoHandler desde el Scheduled.
 *
 * CHANGELOG v1.2.0 (2026-11-16):
 * - [FEAT] Seguimiento: generarRecuento arma un codigo unico, lo manda con los
 *          articulos y deja el aviso con el codigo y la tarea; consultarGeneracion
 *          responde el estado hasta que el recuento existe.
 *
 * CHANGELOG v1.1.0 (2026-11-16):
 * - [FEAT] Generar recuento lo manda a segundo plano con los articulos marcados de
 *          la lista.
 *
 * CHANGELOG v1.0.0 (2026-11-15):
 * - [FEAT] Mostrar la pantalla y generar el recuento desde las lineas agregadas.
 *
 * @NApiVersion 2.1
 * @NModuleScope Public
 * @author Andes Salud
 * @version 1.2.0
 */
define(['N/task', 'N/url', '../form/AS_RecuentoInventarioManualForm', '../form/AS_GeneracionRecuentoForm',
        '../data/query/AS_RecuentoInventarioManualQuery', '../constants/AS_RecuentoInventarioManualConstants'],
    (task, url, recuentoInventarioManualForm, generacionRecuentoForm, recuentoInventarioManualQuery, CONSTANTES) => {

    // ─────────────────────────────────────────────────────────────────────────
    // Principales
    // ─────────────────────────────────────────────────────────────────────────

    function mostrarFormulario(context) {
        responderConFormulario(context, leerCabecera(context.request.parameters), []);
    }

    function generarRecuento(context) {
        const parametros = obtenerParametrosGenerar(context.request);
        let tareaId;
        try {
            tareaId = encolarGeneracion(parametros);
        } catch (fallo) {
            if (fallo.name !== CONSTANTES.GENERACION.COLA_OCUPADA) throw fallo;
            return responderConFormulario(context, parametros.cabecera, parametros.articulos, CONSTANTES.FORMULARIO.OCUPADO);
        }

        log.audit({
            title  : 'RECUENTO INVENTARIO MANUAL ENVIADO',
            details: 'ubicacion: ' + parametros.cabecera.ubicacion + ' | articulos marcados: ' + parametros.articulos.length,
        });

        context.response.writePage(generacionRecuentoForm.construirAviso(parametros.codigo, tareaId, parametros.articulos.length));
    }

    /**
     * El recuento se busca solo con la tarea completa: antes puede existir ya
     * guardado pero sin Comenzar recuento, que es lo ultimo que hace el
     * Scheduled. Sin url y con la tarea terminada, el aviso muestra el fallo.
     */
    function consultarGeneracion(context, codigo, tareaId) {
        const estado     = task.checkStatus({ taskId: tareaId }).status;
        const recuentoId = estado === task.TaskStatus.COMPLETE ? recuentoInventarioManualQuery.obtenerRecuentoPorCodigo(codigo) : null;
        const direccion  = recuentoId ? url.resolveRecord({ recordType: CONSTANTES.RECUENTO.TIPO, recordId: recuentoId }) : '';

        context.response.setHeader({ name: 'Content-Type', value: 'application/json' });
        context.response.write(JSON.stringify({ estado: estado, url: direccion }));
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
     * Solo las lineas con Contar marcado. El codigo es unico por envio: el
     * Scheduled lo deja en el ID externo del recuento para encontrarlo.
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
            codigo   : CONSTANTES.FORMULARIO.CODIGO_PREFIJO + Date.now(),
        };
    }

    /**
     * Un solo deployment: si ya hay un recuento generandose, NetSuite no encola
     * otro y responde COLA_OCUPADA, que generarRecuento muestra como aviso.
     * Devuelve el id de la tarea, para el seguimiento.
     */
    function encolarGeneracion(parametros) {
        const generacion = CONSTANTES.GENERACION;
        const tarea      = task.create({ taskType: task.TaskType.SCHEDULED_SCRIPT });

        tarea.scriptId     = generacion.ID;
        tarea.deploymentId = generacion.DEPLOYMENT;
        tarea.params       = { [generacion.PARAMETRO_DATOS]: JSON.stringify(parametros) };

        return tarea.submit();
    }

    return {
        mostrarFormulario  : mostrarFormulario,
        generarRecuento    : generarRecuento,
        consultarGeneracion: consultarGeneracion,
    };
});
