/**
 * AS_NSP_018 — Prestamo, Devolucion y Merma
 * @description Todo lo que hace la pantalla de captura: arma el formulario segun
 *              el tipo, guarda la cabecera con sus lineas, deja corregir un
 *              movimiento que todavia no se proceso, lo anula y responde el
 *              stock disponible de un articulo.
 *
 *              El formulario se arma segun el tipo, que viaja en la URL: al
 *              cambiar el combo el client script recarga la pantalla. Se hace asi
 *              porque las columnas de un sublist se definen en el servidor y no se
 *              pueden ocultar desde el cliente, y porque un Prestamo y una
 *              Devolucion no muestran ni los mismos campos ni las mismas columnas.
 *
 *              PRESTAMO    solo datos de salida: Ubicacion Origen la elige el
 *                          usuario, Ubicacion Destino es la bodega de prestamos de
 *                          la subsidiaria (la ubicacion marcada con el check AS
 *                          Bodega de Prestamos y Devoluciones) y el detalle
 *                          captura Articulo, Unidad, Disponible y Cantidad
 *                          Prestada. Lo devuelto y lo pendiente no se muestran:
 *                          nacen calculados y solo los mueve una devolucion.
 *              DEVOLUCION  se arma en dos pasos. Primero subsidiaria y prestamo
 *                          relacionado; con eso el servicio y las dos ubicaciones
 *                          se cargan solos del prestamo, invertidas y en solo
 *                          lectura, y el detalle viene cargado con lo que quedo
 *                          pendiente. Lo unico que se captura es cuanto vuelve de
 *                          cada linea y quien registra la devolucion.
 *              EDICION     un movimiento que todavia se corrige entra por esta
 *                          misma pantalla, con el parametro movimiento. La
 *                          cabecera solo deja la fecha, el responsable y los
 *                          comentarios. El detalle se rehace entero mientras no
 *                          haya traslado; con el traslado ya generado se muestra
 *                          pero no se toca, porque esas lineas son las que se
 *                          movieron.
 *              ANULACION   solo cambia el estado. Un movimiento sin procesar no
 *                          movio inventario, asi que no hay nada que revertir.
 *
 *              Generar los traslados no es cosa de este modulo: eso vive en
 *              PrestamoHandler y DevolucionHandler.
 *
 * @NApiVersion 2.1
 * @NModuleScope Public
 */
define(['N/ui/serverWidget', 'N/redirect', 'N/error', 'N/runtime', '../lib/MovimientoInventarioConstants', '../repositories/MovimientoInventarioRepository', '../repositories/InventoryTransferRepository'],
    (serverWidget, redirect, error, runtime, CONSTANTES, movimientoRepository, inventoryTransferRepository) => {

    // ------------------------------------------------------------------
    // PERMISO  lo llama el Suitelet antes de cada operacion que escribe
    // ------------------------------------------------------------------

    // Un rol fuera de la lista entra al modulo en modo lectura: ve la lista, abre
    // el movimiento con su detalle e imprime el comprobante. Registrar, editar,
    // procesar, devolver y anular necesitan el rol autorizado. El User Event ya
    // le esconde los botones que escriben; esto es lo que corta si igual llega
    // por URL.
    function validarPermisoEscritura() {
        if (CONSTANTES.ROLES_AUTORIZADOS.includes(runtime.getCurrentUser().role)) {
            return;
        }

        throw error.create({
            name     : 'AS_ROL_NO_AUTORIZADO',
            message  : 'Tu rol solo puede consultar los movimientos de inventario. '
                     + 'Para registrar, editar, procesar o anular uno necesitas el rol autorizado.',
            notifyOff: true,
        });
    }

    // Lo que la pantalla de captura recibe por la URL. Tipo, prestamo, fecha,
    // responsable y comentarios vuelven de la recarga que dispara el client
    // script al cambiar el tipo o el prestamo: sin ellos el usuario perderia lo
    // que ya escribio. Fecha y comentarios llegan encodeados porque el cliente
    // tiene que escapar las barras y el texto libre para armar la URL; sobre un
    // valor sin escapar decodeURIComponent no cambia nada.
    function obtenerParametrosFormulario(request) {
        return {
            movimiento : request.parameters.movimiento,
            tipo       : request.parameters.tipo,
            prestamo   : request.parameters.prestamo,
            fecha      : decodeURIComponent(request.parameters.fecha || ''),
            responsable: request.parameters.responsable || '',
            comentarios: decodeURIComponent(request.parameters.comentarios || ''),
        };
    }

    // Lo que el formulario manda al guardar. Todos los campos de la cabecera
    // viajan con el prefijo custpage_; el detalle no, que se lee por sublista.
    function obtenerParametrosGuardado(request) {
        return {
            movimiento        : request.parameters.custpage_movimiento,
            tipo              : request.parameters.custpage_tipo,
            fecha             : request.parameters.custpage_fecha,
            subsidiaria       : request.parameters.custpage_subsidiaria,
            servicio          : request.parameters.custpage_servicio,
            ubicacionOrigen   : request.parameters.custpage_ubicacion,
            ubicacionDestino  : request.parameters.custpage_ubicacion_dest,
            usuarioResponsable: request.parameters.custpage_usuario_resp,
            motivo            : request.parameters.custpage_motivo,
            prestamo          : request.parameters.custpage_prestamo_ref,
            comentarios       : request.parameters.custpage_comentarios,
        };
    }

    function renderizarFormulario(context) {
        const parametros = obtenerParametrosFormulario(context.request);

        const idMovimiento = parametros.movimiento;

        let movimiento = null;
        let idTipo     = parametros.tipo;
        let idPrestamo = parametros.prestamo;

        // Editando no se elige ninguno de los dos: el tipo y el prestamo
        // relacionado salen del movimiento que se esta corrigiendo.
        if (idMovimiento) {
            movimiento = movimientoRepository.cargarMovimiento(idMovimiento);
            idTipo     = movimiento.getValue({ fieldId: 'custrecord_as_mov_tipo' });
            idPrestamo = movimiento.getValue({ fieldId: 'custrecord_as_mov_prestamo_ref' });
        }

        const tipos = movimientoRepository.listarTiposMovimiento();

        const tipoElegido = tipos.filter((opcion) => opcion.id === idTipo)[0];
        const nombreTipo  = tipoElegido ? tipoElegido.nombre : '';

        const titulo          = movimiento ? 'Edicion de Movimiento de Inventario' : 'Registro de Movimiento de Inventario';
        const etiquetaGuardar = movimiento ? 'Actualizar Movimiento' : 'Guardar Movimiento';

        const form = serverWidget.createForm({ title: titulo });

        form.clientScriptModulePath = CONSTANTES.CLIENT_SCRIPT;

        // Las opciones se cargan a mano en vez de usar source: con source
        // NetSuite agrega la opcion "- New -" para crear valores de la lista.
        const campoTipo = form.addField({
            id   : 'custpage_tipo',
            type : serverWidget.FieldType.SELECT,
            label: 'Tipo de Movimiento',
        });
        campoTipo.isMandatory  = true;
        campoTipo.defaultValue = idTipo;
        campoTipo.addSelectOption({ value: '', text: '' });

        CONSTANTES.ORDEN_TIPOS.forEach((nombre) => {
            const opcion = tipos.filter((tipo) => tipo.nombre === nombre)[0];
            campoTipo.addSelectOption({ value: opcion.id, text: opcion.nombre });
        });

        const campoFecha = form.addField({
            id   : 'custpage_fecha',
            type : serverWidget.FieldType.DATE,
            label: CONSTANTES.ETIQUETAS_FECHA[nombreTipo] || 'Fecha',
        });
        campoFecha.isMandatory = true;

        // Viene de vuelta en la URL para que la recarga no se la lleve. En modo
        // edicion la pisa despues aplicarModoEdicion con la del movimiento.
        campoFecha.defaultValue = parametros.fecha;

        if (nombreTipo === CONSTANTES.TIPOS.MERMA) {
            const campoMotivo = form.addField({
                id   : 'custpage_motivo',
                type : serverWidget.FieldType.SELECT,
                label: 'Motivo de la Baja',
            });
            campoMotivo.isMandatory = true;
            campoMotivo.addSelectOption({ value: '', text: '' });

            movimientoRepository.listarMotivosBaja().forEach((opcion) => {
                campoMotivo.addSelectOption({ value: opcion.id, text: opcion.nombre });
            });
        }

        const campoSubsidiaria = form.addField({
            id    : 'custpage_subsidiaria',
            type  : serverWidget.FieldType.SELECT,
            label : 'Subsidiaria',
            source: 'subsidiary',
        });
        campoSubsidiaria.isMandatory = true;

        // El prestamo va pegado a la subsidiaria porque son los dos unicos datos
        // que se eligen en una devolucion: el combo trae todos los pendientes y el
        // client script deja solo los de la subsidiaria elegida. Se cargan a mano
        // en vez de con source: asi cada opcion muestra de donde salio el material
        // y cuanto falta por devolver.
        let prestamosPendientes = [];

        if (nombreTipo === CONSTANTES.TIPOS.DEVOLUCION) {
            prestamosPendientes = movimientoRepository.listarPrestamosPendientes();

            const campoPrestamo = form.addField({
                id   : 'custpage_prestamo_ref',
                type : serverWidget.FieldType.SELECT,
                label: 'Prestamo Relacionado',
            });
            campoPrestamo.isMandatory = true;
            campoPrestamo.addSelectOption({ value: '', text: '' });

            // El combo nace vacio y lo llena el client script con los prestamos de
            // la subsidiaria elegida, igual que los dos combos de ubicacion: la
            // lista completa ya viaja en custpage_ubicaciones_data. Antes cargaba
            // aqui todos los pendientes de la cuenta y el cliente los recortaba
            // despues, asi que con la subsidiaria en blanco se veian todos.
            //
            // La unica que carga el servidor es la opcion del prestamo ya elegido:
            // cuando el formulario vuelve con el prestamo en la URL, o se abre en
            // edicion, el campo se pinta sin que el usuario toque la subsidiaria y
            // sin la opcion se veria vacio.
            const prestamoElegido = prestamosPendientes.filter((prestamo) => prestamo.id === idPrestamo)[0];

            if (prestamoElegido) {
                campoPrestamo.addSelectOption({
                    value: prestamoElegido.id,
                    text : prestamoElegido.nombre + ' - ' + prestamoElegido.ubicacion
                         + ' - pendiente ' + prestamoElegido.pendiente,
                });
            }

            campoPrestamo.defaultValue = idPrestamo;
        }

        const campoServicio = form.addField({
            id    : 'custpage_servicio',
            type  : serverWidget.FieldType.SELECT,
            label : 'Servicio',
            source: 'department',
        });
        campoServicio.isMandatory = true;

        // Segunda columna: el traslado. Sin STARTCOL NetSuite reparte los campos de
        // a tercios por orden de creacion y separa el origen del destino.
        const campoFrom = form.addField({
            id   : 'custpage_ubicacion',
            type : serverWidget.FieldType.SELECT,
            label: 'Ubicacion Origen',
        });
        campoFrom.isMandatory = true;
        campoFrom.addSelectOption({ value: '', text: '' });
        campoFrom.updateBreakType({ breakType: serverWidget.FieldBreakType.STARTCOL });

        // En un prestamo el cliente lo deja con una sola opcion, la bodega de
        // prestamos de la subsidiaria. En una merma se llena con todas.
        const campoTo = form.addField({
            id   : 'custpage_ubicacion_dest',
            type : serverWidget.FieldType.SELECT,
            label: 'Ubicacion Destino',
        });
        campoTo.isMandatory = true;
        campoTo.addSelectOption({ value: '', text: '' });

        const campoUsuario = form.addField({
            id    : 'custpage_usuario_resp',
            type  : serverWidget.FieldType.SELECT,
            label : CONSTANTES.ETIQUETAS_RESPONSABLE[nombreTipo] || 'Usuario Responsable',
            source: 'employee',
        });
        campoUsuario.isMandatory = true;
        campoUsuario.updateBreakType({ breakType: serverWidget.FieldBreakType.STARTCOL });

        // Vuelve de la URL por lo mismo que la fecha: se escribe antes de elegir
        // el prestamo y esa eleccion recarga el formulario.
        campoUsuario.defaultValue = parametros.responsable;

        const campoComentarios = form.addField({
            id   : 'custpage_comentarios',
            type : serverWidget.FieldType.TEXTAREA,
            label: 'Comentarios',
        });
        campoComentarios.defaultValue = parametros.comentarios;

        // Las ubicaciones con su subsidiaria viajan al cliente en un campo oculto:
        // asi el filtro no necesita ir al servidor cada vez que cambia el combo.
        // Cada una trae su check de bodega de prestamos, que es lo que el cliente
        // usa para dejar el destino de un prestamo en una sola opcion.
        const ubicaciones = movimientoRepository.listarUbicacionesPorSubsidiaria();

        const campoUbicaciones = form.addField({
            id   : 'custpage_ubicaciones_data',
            type : serverWidget.FieldType.LONGTEXT,
            label: 'Ubicaciones',
        });
        campoUbicaciones.updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN });
        campoUbicaciones.defaultValue = JSON.stringify({
            esPrestamo : (nombreTipo === CONSTANTES.TIPOS.PRESTAMO),
            ubicaciones: ubicaciones,
            prestamos  : prestamosPendientes,
        });

        // La devolucion se arma en dos pasos: hasta que no se elige el prestamo no
        // hay nada que mostrar, porque el servicio y las dos ubicaciones salen de
        // el. Se quita el obligatorio junto con el campo, o NetSuite pide un valor
        // que el usuario no puede ver.
        if (nombreTipo === CONSTANTES.TIPOS.DEVOLUCION && !idPrestamo) {
            campoServicio.isMandatory = false;
            campoFrom.isMandatory     = false;
            campoTo.isMandatory       = false;

            campoServicio.updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN });
            campoFrom.updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN });
            campoTo.updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN });
        }

        if (nombreTipo === CONSTANTES.TIPOS.DEVOLUCION) {
            armarDetalleDevolucion(form, {
                campoFrom       : campoFrom,
                campoTo         : campoTo,
                campoSubsidiaria: campoSubsidiaria,
                campoServicio   : campoServicio,
                idPrestamo      : idPrestamo,
            });
        } else {
            armarDetalleSalida(form, nombreTipo);
        }

        if (movimiento) {
            aplicarModoEdicion(form, movimiento, nombreTipo, idPrestamo);
        }

        // En el primer paso de una devolucion todavia no hay nada que guardar.
        if (nombreTipo !== CONSTANTES.TIPOS.DEVOLUCION || idPrestamo) {
            form.addSubmitButton({ label: etiquetaGuardar });
        }

        context.response.writePage(form);
    }

    // ------------------------------------------------------------------
    // DETALLE  el prestamo y la merma capturan lineas, la devolucion las trae
    // ------------------------------------------------------------------

    // Un prestamo y una merma son movimientos de salida: se captura que sale, de
    // que ubicacion y cuanto. Lo devuelto y lo pendiente no aparecen aqui aunque
    // el prestamo los guarde: nacen en 0 y en la cantidad prestada, y quien los
    // mueve es la devolucion.
    function armarDetalleSalida(form, nombreTipo) {
        const sublista = form.addSublist({
            id   : 'custpage_sl_detalle',
            type : serverWidget.SublistType.INLINEEDITOR,
            label: CONSTANTES.ETIQUETAS_DETALLE.TITULO,
        });

        sublista.addField({
            id    : 'custpage_col_articulo',
            type  : serverWidget.FieldType.SELECT,
            label : CONSTANTES.ETIQUETAS_DETALLE.ARTICULO,
            source: 'item',
        }).isMandatory = true;

        // Unidad y Disponible las llena el client script al elegir el articulo,
        // consultando la ubicacion origen. Van deshabilitadas: son informativas y
        // no se capturan. La unidad del detalle se llena sola por sourcing.
        //
        // Disponible arranca con el total del articulo en la ubicacion y, en
        // cuanto se elige un lote, pasa a mostrar lo que hay de ese lote: es
        // contra eso que se captura la cantidad.
        sublista.addField({
            id   : 'custpage_col_unidad',
            type : serverWidget.FieldType.TEXT,
            label: CONSTANTES.ETIQUETAS_DETALLE.UNIDAD,
        }).updateDisplayType({ displayType: serverWidget.FieldDisplayType.DISABLED });

        sublista.addField({
            id   : 'custpage_col_disponible',
            type : serverWidget.FieldType.INTEGER,
            label: 'Disponible',
        }).updateDisplayType({ displayType: serverWidget.FieldDisplayType.DISABLED });

        // El lote que se entrega. Nace vacio y lo llena el client script con los
        // lotes del articulo al elegirlo, en la misma consulta que trae la unidad
        // y el disponible. Un sublist tiene un solo juego de opciones para toda
        // la columna, asi que las de cada articulo se van sumando y cada una dice
        // a que articulo pertenece. Un articulo sin control de lote no aporta
        // ninguna y la columna queda en blanco.
        sublista.addField({
            id   : 'custpage_col_lote',
            type : serverWidget.FieldType.SELECT,
            label: CONSTANTES.ETIQUETAS_DETALLE.LOTE,
        }).addSelectOption({ value: '', text: '' });

        const etiquetaCantidad = (nombreTipo === CONSTANTES.TIPOS.MERMA) ? CONSTANTES.ETIQUETAS_DETALLE.CANTIDAD : 'Cantidad Prestada';

        sublista.addField({
            id   : 'custpage_col_cantidad',
            type : serverWidget.FieldType.INTEGER,
            label: etiquetaCantidad,
        }).isMandatory = true;
    }

    function armarDetalleDevolucion(form, datos) {
        // Sin prestamo elegido no hay detalle: la pantalla se queda en fecha,
        // subsidiaria, prestamo, responsable y comentarios.
        if (!datos.idPrestamo) {
            return;
        }

        const sublista = form.addSublist({
            id   : 'custpage_sl_detalle',
            type : serverWidget.SublistType.INLINEEDITOR,
            label: CONSTANTES.ETIQUETAS_DETALLE.TITULO,
        });

        // El id de la linea del prestamo viaja oculto en cada fila: es contra el
        // que se descuenta despues, sin cuadrar por articulo.
        sublista.addField({
            id   : 'custpage_col_linea',
            type : serverWidget.FieldType.TEXT,
            label: 'Linea',
        }).updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN });

        sublista.addField({
            id   : 'custpage_col_articulo_id',
            type : serverWidget.FieldType.TEXT,
            label: 'Articulo Id',
        }).updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN });

        sublista.addField({
            id   : 'custpage_col_articulo',
            type : serverWidget.FieldType.TEXT,
            label: CONSTANTES.ETIQUETAS_DETALLE.ARTICULO,
        }).updateDisplayType({ displayType: serverWidget.FieldDisplayType.DISABLED });

        sublista.addField({
            id   : 'custpage_col_unidad',
            type : serverWidget.FieldType.TEXT,
            label: CONSTANTES.ETIQUETAS_DETALLE.UNIDAD,
        }).updateDisplayType({ displayType: serverWidget.FieldDisplayType.DISABLED });

        sublista.addField({
            id   : 'custpage_col_prestada',
            type : serverWidget.FieldType.TEXT,
            label: CONSTANTES.ETIQUETAS_DETALLE.PRESTADA,
        }).updateDisplayType({ displayType: serverWidget.FieldDisplayType.DISABLED });

        sublista.addField({
            id   : 'custpage_col_devuelta',
            type : serverWidget.FieldType.TEXT,
            label: CONSTANTES.ETIQUETAS_DETALLE.DEVUELTA,
        }).updateDisplayType({ displayType: serverWidget.FieldDisplayType.DISABLED });

        sublista.addField({
            id   : 'custpage_col_pendiente',
            type : serverWidget.FieldType.TEXT,
            label: CONSTANTES.ETIQUETAS_DETALLE.PENDIENTE,
        }).updateDisplayType({ displayType: serverWidget.FieldDisplayType.DISABLED });

        // La unica columna editable. Nace en lo pendiente para que devolver todo
        // sea guardar sin tocar nada.
        sublista.addField({
            id   : 'custpage_col_a_devolver',
            type : serverWidget.FieldType.INTEGER,
            label: 'Cantidad a Devolver',
        });

        // Con el prestamo elegido la devolucion no pregunta nada mas: subsidiaria,
        // servicio y las dos ubicaciones salen de el, invertidas.
        const prestamo = movimientoRepository.cargarMovimiento(datos.idPrestamo);

        datos.campoSubsidiaria.defaultValue = prestamo.getValue({ fieldId: 'custrecord_as_mov_subsidiaria' });
        datos.campoServicio.defaultValue    = prestamo.getValue({ fieldId: 'custrecord_as_mov_servicio' });

        // El material vuelve de donde quedo: el origen de la devolucion es el
        // destino del prestamo, no la bodega que hoy tenga el check. Si alguien
        // mueve el check a otra ubicacion, los prestamos ya hechos siguen
        // devolviendose desde la bodega correcta. Cada combo lleva una sola
        // opcion, la que hereda del prestamo, porque los dos se muestran en solo
        // lectura y un campo INLINE solo pinta el texto de la opcion elegida.
        const bodegaDelPrestamo = prestamo.getValue({ fieldId: 'custrecord_as_mov_ubicacion_dest' });
        const ubicacionRetorno  = prestamo.getValue({ fieldId: 'custrecord_as_mov_ubicacion' });

        datos.campoFrom.addSelectOption({
            value: bodegaDelPrestamo,
            text : prestamo.getText({ fieldId: 'custrecord_as_mov_ubicacion_dest' }),
        });
        datos.campoTo.addSelectOption({
            value: ubicacionRetorno,
            text : prestamo.getText({ fieldId: 'custrecord_as_mov_ubicacion' }),
        });

        datos.campoFrom.defaultValue = bodegaDelPrestamo;
        datos.campoTo.defaultValue   = ubicacionRetorno;

        // Todo lo que hereda del prestamo se muestra pero no se edita: si el
        // usuario pudiera cambiarlo, la devolucion dejaria de ser el inverso del
        // prestamo que dice descontar. Lo unico que se captura es la cantidad a
        // devolver de cada linea y quien registra la devolucion.
        datos.campoSubsidiaria.updateDisplayType({ displayType: serverWidget.FieldDisplayType.INLINE });
        datos.campoServicio.updateDisplayType({ displayType: serverWidget.FieldDisplayType.INLINE });
        datos.campoFrom.updateDisplayType({ displayType: serverWidget.FieldDisplayType.INLINE });
        datos.campoTo.updateDisplayType({ displayType: serverWidget.FieldDisplayType.INLINE });

        movimientoRepository.buscarLineasPorMovimiento(datos.idPrestamo).forEach((linea, indice) => {
            sublista.setSublistValue({ id: 'custpage_col_linea',       line: indice, value: String(linea.id) });
            sublista.setSublistValue({ id: 'custpage_col_articulo_id', line: indice, value: String(linea.articulo) });
            sublista.setSublistValue({ id: 'custpage_col_articulo',    line: indice, value: linea.articuloTexto });
            sublista.setSublistValue({ id: 'custpage_col_prestada',    line: indice, value: String(linea.cantidad) });
            sublista.setSublistValue({ id: 'custpage_col_devuelta',    line: indice, value: String(linea.devuelta) });
            sublista.setSublistValue({ id: 'custpage_col_pendiente',   line: indice, value: String(linea.pendiente) });
            sublista.setSublistValue({ id: 'custpage_col_a_devolver',  line: indice, value: String(linea.pendiente) });

            // La unidad es informativa y puede no estar: setSublistValue no acepta
            // un valor vacio, asi que la columna se deja en blanco sin llamarlo.
            if (linea.unidadTexto) {
                sublista.setSublistValue({ id: 'custpage_col_unidad', line: indice, value: linea.unidadTexto });
            }
        });
    }

    // ------------------------------------------------------------------
    // EDICION  corrige un movimiento que todavia no genero traslado
    // ------------------------------------------------------------------

    // De la cabecera solo se corrigen la fecha, el responsable y los comentarios:
    // el tipo, la subsidiaria, el servicio y las dos ubicaciones son contra lo que
    // se guardaron las lineas. El detalle si se rehace entero.
    function aplicarModoEdicion(form, movimiento, nombreTipo, idPrestamo) {
        const campoMovimiento = form.addField({
            id   : 'custpage_movimiento',
            type : serverWidget.FieldType.TEXT,
            label: 'Movimiento',
        });
        campoMovimiento.updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN });
        campoMovimiento.defaultValue = movimiento.id;

        const tieneTraslado = movimiento.getValue({ fieldId: 'custrecord_as_mov_transfer' });

        // El client script tambien tiene que saberlo: con el traslado generado el
        // detalle es el registro de lo que se movio, no una captura, y sus
        // validaciones no aplican. Un campo bloqueado no viaja, asi que la marca
        // va en uno oculto.
        const campoBloqueado = form.addField({
            id   : 'custpage_detalle_bloqueado',
            type : serverWidget.FieldType.TEXT,
            label: 'Detalle bloqueado',
        });
        campoBloqueado.updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN });
        campoBloqueado.defaultValue = tieneTraslado ? 'T' : 'F';

        // La fecha se guardo con setText y se lee igual: getValue devolveria un
        // Date que el campo del formulario no sabe pintar.
        form.getField({ id: 'custpage_fecha' }).defaultValue        = movimiento.getText({ fieldId: 'custrecord_as_mov_fecha' });
        form.getField({ id: 'custpage_usuario_resp' }).defaultValue = movimiento.getValue({ fieldId: 'custrecord_as_mov_usuario_resp' });
        form.getField({ id: 'custpage_comentarios' }).defaultValue  = movimiento.getValue({ fieldId: 'custrecord_as_mov_comentarios' });

        // El tipo decide que campos y que columnas trae la pantalla: cambiarlo
        // aqui dejaria sin sentido el detalle que ya se guardo.
        form.getField({ id: 'custpage_tipo' })
            .updateDisplayType({ displayType: serverWidget.FieldDisplayType.DISABLED });

        // Una devolucion ya muestra bloqueado todo lo que hereda del prestamo. Lo
        // unico que falta es el prestamo mismo y lo que se capturo por linea.
        if (nombreTipo === CONSTANTES.TIPOS.DEVOLUCION) {
            form.getField({ id: 'custpage_prestamo_ref' })
                .updateDisplayType({ displayType: serverWidget.FieldDisplayType.DISABLED });

            precargarCantidadesDevolucion(form, movimiento.id, idPrestamo);

            return;
        }

        if (nombreTipo === CONSTANTES.TIPOS.MERMA) {
            const campoMotivo = form.getField({ id: 'custpage_motivo' });

            campoMotivo.defaultValue = movimiento.getValue({ fieldId: 'custrecord_as_mov_motivo' });
            campoMotivo.updateDisplayType({ displayType: serverWidget.FieldDisplayType.DISABLED });
        }

        // Los combos de ubicacion los llena el client script cuando cambia la
        // subsidiaria, y aqui la subsidiaria no se toca: cada uno lleva cargada
        // desde el servidor la unica opcion que le corresponde.
        const campoSubsidiaria = form.getField({ id: 'custpage_subsidiaria' });
        const campoServicio    = form.getField({ id: 'custpage_servicio' });
        const campoFrom        = form.getField({ id: 'custpage_ubicacion' });
        const campoTo          = form.getField({ id: 'custpage_ubicacion_dest' });

        const ubicacionOrigen  = movimiento.getValue({ fieldId: 'custrecord_as_mov_ubicacion' });
        const ubicacionDestino = movimiento.getValue({ fieldId: 'custrecord_as_mov_ubicacion_dest' });

        campoFrom.addSelectOption({ value: ubicacionOrigen,  text: movimiento.getText({ fieldId: 'custrecord_as_mov_ubicacion' }) });
        campoTo.addSelectOption({   value: ubicacionDestino, text: movimiento.getText({ fieldId: 'custrecord_as_mov_ubicacion_dest' }) });

        campoSubsidiaria.defaultValue = movimiento.getValue({ fieldId: 'custrecord_as_mov_subsidiaria' });
        campoServicio.defaultValue    = movimiento.getValue({ fieldId: 'custrecord_as_mov_servicio' });
        campoFrom.defaultValue        = ubicacionOrigen;
        campoTo.defaultValue          = ubicacionDestino;

        campoSubsidiaria.updateDisplayType({ displayType: serverWidget.FieldDisplayType.DISABLED });
        campoServicio.updateDisplayType({ displayType: serverWidget.FieldDisplayType.DISABLED });
        campoFrom.updateDisplayType({ displayType: serverWidget.FieldDisplayType.DISABLED });
        campoTo.updateDisplayType({ displayType: serverWidget.FieldDisplayType.DISABLED });

        precargarDetalleSalida(form, movimiento.id, ubicacionOrigen);

        // Con el traslado ya generado el detalle se muestra para que el usuario vea
        // que esta corrigiendo, pero no se toca: esas lineas son las que se
        // movieron. El disponible se oculta porque ya no dice nada, el material
        // salio de la ubicacion de origen.
        if (tieneTraslado) {
            const sublista = form.getSublist({ id: 'custpage_sl_detalle' });

            sublista.getField({ id: 'custpage_col_articulo' })
                .updateDisplayType({ displayType: serverWidget.FieldDisplayType.DISABLED });
            sublista.getField({ id: 'custpage_col_cantidad' })
                .updateDisplayType({ displayType: serverWidget.FieldDisplayType.DISABLED });
            sublista.getField({ id: 'custpage_col_lote' })
                .updateDisplayType({ displayType: serverWidget.FieldDisplayType.DISABLED });
            sublista.getField({ id: 'custpage_col_disponible' })
                .updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN });
        }
    }

    // El disponible se consulta igual que lo hace el client script al elegir el
    // articulo: la linea guardada no lo trae, y sin el no se ve contra que se
    // esta corrigiendo la cantidad.
    function precargarDetalleSalida(form, idMovimiento, ubicacionOrigen) {
        const sublista = form.getSublist({ id: 'custpage_sl_detalle' });
        const lineas   = movimientoRepository.buscarLineasPorMovimiento(idMovimiento);

        const stock = inventoryTransferRepository.buscarStockPorArticulo(
            lineas.map((linea) => linea.articulo), ubicacionOrigen);

        // Los lotes de cada articulo, para que el lote se pueda cambiar mientras
        // el movimiento no se haya procesado. En el alta las opciones las carga
        // el client script al elegir el articulo; al editar ese evento no ocurre,
        // asi que las pone el servidor. Se consulta una vez por articulo.
        const campoLote = sublista.getField({ id: 'custpage_col_lote' });

        const nombresCargados = {};
        const stockDeLotes    = {};

        lineas.forEach((linea) => {
            if (nombresCargados[linea.articulo]) {
                return;
            }

            nombresCargados[linea.articulo] = true;

            inventoryTransferRepository.buscarLotesDisponibles(linea.articulo, ubicacionOrigen).forEach((lote) => {
                nombresCargados[lote.nombreLote] = true;
                stockDeLotes[linea.articulo + '|' + lote.nombreLote] = lote.enMano;

                campoLote.addSelectOption({
                    value: lote.nombreLote,
                    text : linea.articuloTexto + ' - ' + lote.nombreLote + ' (hay ' + lote.enMano + ')',
                });
            });
        });

        lineas.forEach((linea, indice) => {
            sublista.setSublistValue({ id: 'custpage_col_articulo',   line: indice, value: String(linea.articulo) });
            sublista.setSublistValue({ id: 'custpage_col_cantidad',   line: indice, value: String(linea.cantidad) });
            // Con lote guardado, Disponible muestra lo de ese lote y no el total
            // del articulo: es contra eso que se corrige la cantidad, igual que
            // en la pantalla de alta. Sin esto la columna dice 199 con un lote
            // que tiene 6 y el tope del cliente no salta.
            const enMano = stockDeLotes[linea.articulo + '|' + linea.lote];

            sublista.setSublistValue({
                id   : 'custpage_col_disponible',
                line : indice,
                value: String(enMano === undefined ? stock[String(linea.articulo)].disponible : enMano),
            });

            // El lote guardado puede ya no tener stock en la ubicacion -alguien lo
            // movio despues de registrar el movimiento- y entonces no vino en la
            // consulta de arriba. Se agrega igual para que la linea no se vea
            // vacia y se entienda con que quedo guardada.
            if (linea.lote) {
                if (!nombresCargados[linea.lote]) {
                    campoLote.addSelectOption({ value: linea.lote, text: linea.lote });
                }

                sublista.setSublistValue({ id: 'custpage_col_lote', line: indice, value: linea.lote });
            }

            // La unidad es informativa y puede no estar: setSublistValue no acepta
            // un valor vacio, asi que la columna se deja en blanco sin llamarlo.
            if (linea.unidadTexto) {
                sublista.setSublistValue({ id: 'custpage_col_unidad', line: indice, value: linea.unidadTexto });
            }
        });
    }

    // Las filas del sublist son las lineas del prestamo, en el mismo orden en que
    // las pinto armarDetalleDevolucion. Lo que cambia al editar es que la cantidad
    // a devolver arranca en lo que se capturo y no en lo pendiente.
    function precargarCantidadesDevolucion(form, idMovimiento, idPrestamo) {
        const sublista = form.getSublist({ id: 'custpage_sl_detalle' });

        const lineasPrestamo   = movimientoRepository.buscarLineasPorMovimiento(idPrestamo);
        const lineasDevolucion = movimientoRepository.buscarLineasPorMovimiento(idMovimiento);

        lineasPrestamo.forEach((lineaPrestamo, indice) => {
            const guardada = lineasDevolucion.filter((linea) => linea.lineaPrestamo === lineaPrestamo.id)[0];
            const cantidad = guardada ? guardada.cantidad : 0;

            sublista.setSublistValue({ id: 'custpage_col_a_devolver', line: indice, value: String(cantidad) });
        });
    }

    // ------------------------------------------------------------------
    // GUARDADO  el alta y la correccion siguen el mismo camino
    // ------------------------------------------------------------------

    function guardarMovimiento(context) {
        const request = context.request;

        const parametros = obtenerParametrosGuardado(request);

        const idMovimiento = parametros.movimiento;

        let movimiento = null;
        let idTipo     = parametros.tipo;

        // Editando, el tipo se muestra bloqueado, y un campo bloqueado no viaja en
        // el request: se lee del movimiento que se esta corrigiendo.
        if (idMovimiento) {
            movimiento = movimientoRepository.cargarMovimiento(idMovimiento);
            idTipo     = movimiento.getValue({ fieldId: 'custrecord_as_mov_tipo' });
        }

        const tipos = movimientoRepository.listarTiposMovimiento();

        const tipoElegido = tipos.filter((opcion) => opcion.id === idTipo)[0];
        const nombreTipo  = tipoElegido ? tipoElegido.nombre : '';

        // Un movimiento ya procesado solo deja corregir la cabecera: el detalle se
        // muestra bloqueado, no viaja en el request y no se rehace. Por eso las
        // validaciones de detalle se saltan enteras, o cortarian con una cantidad
        // vacia que nadie mando.
        const rehaceDetalle = !idMovimiento || !movimiento.getValue({ fieldId: 'custrecord_as_mov_transfer' });

        const totalLineas = request.getLineCount({ group: 'custpage_sl_detalle' });

        if (rehaceDetalle) {
            // NetSuite solo exige las columnas obligatorias de la linea que se esta
            // editando: si el usuario nunca toca Add el sublist llega vacio. Se corta
            // antes de crear la cabecera, porque un movimiento sin lineas no tiene
            // nada que trasladar y queda ocupando un numero.
            if (totalLineas < 1) {
                throw error.create({
                    name     : 'AS_MOVIMIENTO_SIN_DETALLE',
                    message  : 'El movimiento no tiene lineas de detalle. Agrega al menos un articulo con el boton Add antes de guardar.',
                    notifyOff: true,
                });
            }

            // Una cantidad en cero no tiene nada que trasladar y una negativa moveria
            // el inventario al reves. Se corta antes de crear la cabecera: la linea
            // fallaria al guardarse por el minimo del campo y quedaria un movimiento
            // sin detalle, que despues no se puede ni abrir para anularlo.
            if (nombreTipo !== CONSTANTES.TIPOS.DEVOLUCION) {
                for (let i = 0; i < totalLineas; i++) {
                    if (Number(request.getSublistValue({ group: 'custpage_sl_detalle', name: 'custpage_col_cantidad', line: i })) <= 0) {
                        throw error.create({
                            name     : 'AS_CANTIDAD_INVALIDA',
                            message  : 'La cantidad de cada articulo tiene que ser mayor que cero.',
                            notifyOff: true,
                        });
                    }
                }
            }

            // Una devolucion trae una linea por cada linea pendiente del prestamo y
            // las que van en cero no se guardan, que es como se devuelve solo parte de
            // los articulos. Si van todas en cero no hay nada que devolver: sin este
            // corte la cabecera se crea igual y queda sin detalle.
            if (nombreTipo === CONSTANTES.TIPOS.DEVOLUCION) {
                let lineasConCantidad = 0;

                for (let i = 0; i < totalLineas; i++) {
                    if (Number(request.getSublistValue({ group: 'custpage_sl_detalle', name: 'custpage_col_a_devolver', line: i })) > 0) {
                        lineasConCantidad++;
                    }
                }

                if (lineasConCantidad < 1) {
                    throw error.create({
                        name     : 'AS_DEVOLUCION_SIN_CANTIDAD',
                        message  : 'Indica cuanto vas a devolver: al menos un articulo tiene que llevar una cantidad mayor que cero.',
                        notifyOff: true,
                    });
                }
            }
        }

        let idCabecera       = idMovimiento;
        let ubicacionOrigen  = parametros.ubicacionOrigen;
        let ubicacionDestino = parametros.ubicacionDestino;

        // Editando solo se rehace lo que la pantalla dejo tocar. La cabecera
        // siempre; el detalle solo si el movimiento todavia no genero traslado.
        // Ahi borrar y volver a crear las lineas es seguro, porque nada descuenta
        // contra ellas hasta que se procesa. Con traslado el detalle se muestra
        // bloqueado y no viaja: aunque alguien lo forzara, aqui no se toca. Las
        // dos ubicaciones tampoco viajan, se muestran bloqueadas: salen del
        // movimiento que se esta corrigiendo.
        if (idMovimiento) {
            ubicacionOrigen  = movimiento.getValue({ fieldId: 'custrecord_as_mov_ubicacion' });
            ubicacionDestino = movimiento.getValue({ fieldId: 'custrecord_as_mov_ubicacion_dest' });

            movimientoRepository.actualizarDatosMovimiento(idMovimiento, {
                fecha             : parametros.fecha,
                usuarioResponsable: parametros.usuarioResponsable,
                comentarios       : parametros.comentarios,
            });

            if (rehaceDetalle) {
                movimientoRepository.eliminarLineasMovimiento(idMovimiento);
            }
        } else {
            let subsidiaria = parametros.subsidiaria;
            let servicio    = parametros.servicio;

            // En una devolucion esos cuatro campos se muestran bloqueados, y un
            // campo bloqueado no viaja en el request: se leen del prestamo, que es
            // de donde salieron. Las ubicaciones van invertidas, el material
            // vuelve por donde se fue.
            if (nombreTipo === CONSTANTES.TIPOS.DEVOLUCION) {
                const prestamo = movimientoRepository.cargarMovimiento(parametros.prestamo);

                subsidiaria      = prestamo.getValue({ fieldId: 'custrecord_as_mov_subsidiaria' });
                servicio         = prestamo.getValue({ fieldId: 'custrecord_as_mov_servicio' });
                ubicacionOrigen  = prestamo.getValue({ fieldId: 'custrecord_as_mov_ubicacion_dest' });
                ubicacionDestino = prestamo.getValue({ fieldId: 'custrecord_as_mov_ubicacion' });
            }

            // El movimiento nace pendiente de procesar: el traslado de inventario
            // se genera despues, con el boton de proceso sobre el registro ya
            // creado. Por eso el responsable se guarda aqui y quien procesa se
            // sella alla: no tienen por que ser la misma persona.
            idCabecera = movimientoRepository.crearMovimiento({
                tipo               : parametros.tipo,
                subsidiaria        : subsidiaria,
                servicio           : servicio,
                ubicacionOrigen    : ubicacionOrigen,
                ubicacionDestino   : ubicacionDestino,
                estado             : movimientoRepository.obtenerIdEstadoMovimiento(CONSTANTES.ESTADOS.PENDIENTE_PROCESAR),
                usuarioResponsable : parametros.usuarioResponsable,
                motivo             : parametros.motivo,
                prestamoRelacionado: parametros.prestamo,
                comentarios        : parametros.comentarios,
                fecha              : parametros.fecha,
            });
        }

        // El detalle se guarda igual en el alta y en la correccion: lo unico que
        // cambia es de que columnas sale cada linea, y eso lo decide el tipo.
        const articulos = [];

        if (rehaceDetalle) {
            for (let i = 0; i < totalLineas; i++) {
                const guardada = (nombreTipo === CONSTANTES.TIPOS.DEVOLUCION)
                               ? guardarLineaDevolucion(request, idCabecera, i)
                               : guardarLineaSalida(request, idCabecera, i);

                if (guardada) {
                    articulos.push(guardada.articulo + ' x' + guardada.cantidad);
                }
            }
        }

        log.audit({
            title  : CONSTANTES.LOGS.REGISTRADO,
            details: 'movimiento: ' + idCabecera + ' | tipo: ' + nombreTipo
                   + ' | origen: ' + ubicacionOrigen + ' | destino: ' + ubicacionDestino
                   + ' | articulos: ' + (articulos.join(' | ') || 'detalle sin cambios'),
        });

        redirect.toRecord({
            type: CONSTANTES.RECORDS.MOVIMIENTO,
            id  : idCabecera,
        });
    }

    function guardarLineaSalida(request, idCabecera, linea) {
        const articulo = request.getSublistValue({
            group: 'custpage_sl_detalle',
            name : 'custpage_col_articulo',
            line : linea,
        });
        const cantidad = request.getSublistValue({
            group: 'custpage_sl_detalle',
            name : 'custpage_col_cantidad',
            line : linea,
        });
        const lote = request.getSublistValue({
            group: 'custpage_sl_detalle',
            name : 'custpage_col_lote',
            line : linea,
        });

        movimientoRepository.crearLineaDetalle(idCabecera, articulo, cantidad, lote);

        return { articulo: articulo, cantidad: cantidad };
    }

    // Las lineas de una devolucion no se capturan: vienen del prestamo. Solo se
    // guardan las que devuelven algo, con la linea del prestamo que descuentan.
    function guardarLineaDevolucion(request, idCabecera, linea) {
        const idLineaPrestamo = request.getSublistValue({
            group: 'custpage_sl_detalle',
            name : 'custpage_col_linea',
            line : linea,
        });
        const articulo = request.getSublistValue({
            group: 'custpage_sl_detalle',
            name : 'custpage_col_articulo_id',
            line : linea,
        });
        const cantidad = Number(request.getSublistValue({
            group: 'custpage_sl_detalle',
            name : 'custpage_col_a_devolver',
            line : linea,
        }));

        if (cantidad <= 0) {
            return null;
        }

        movimientoRepository.crearLineaDevolucion(idCabecera, articulo, cantidad, idLineaPrestamo);

        return { articulo: articulo, cantidad: cantidad };
    }

    // ------------------------------------------------------------------
    // ANULACION  un movimiento sin procesar no movio nada que revertir
    // ------------------------------------------------------------------

    function anularMovimientoInventario(context) {
        const idMovimiento = context.request.parameters.idMovimiento;

        movimientoRepository.actualizarEstadoMovimiento(idMovimiento, movimientoRepository.obtenerIdEstadoMovimiento(CONSTANTES.ESTADOS.ANULADO));

        redirect.toRecord({
            type: CONSTANTES.RECORDS.MOVIMIENTO,
            id  : idMovimiento,
        });
    }

    // ------------------------------------------------------------------
    // DISPONIBILIDAD  lo consulta el client script al elegir un articulo
    // ------------------------------------------------------------------

    function consultarDisponible(context) {
        const articulo  = context.request.parameters.articulo;
        const ubicacion = context.request.parameters.ubicacion;

        const stock = inventoryTransferRepository.buscarStockPorArticulo([articulo], ubicacion);
        const lotes = inventoryTransferRepository.buscarLotesDisponibles(articulo, ubicacion);

        context.response.write(JSON.stringify({
            unidad    : stock[articulo].unidad,
            disponible: stock[articulo].disponible,
            lotes     : lotes.map((lote) => ({ nombre: lote.nombreLote, enMano: lote.enMano })),
        }));
    }

    return {
        validarPermisoEscritura   : validarPermisoEscritura,
        renderizarFormulario      : renderizarFormulario,
        guardarMovimiento         : guardarMovimiento,
        anularMovimientoInventario: anularMovimientoInventario,
        consultarDisponible       : consultarDisponible,
    };
});
