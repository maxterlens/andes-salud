/**
 * AS_NSP_018 — Prestamo, Devolucion y Merma
 * @description Client script del proyecto. Cubre dos pantallas:
 *              Suitelet de captura → recarga el formulario al cambiar el tipo o el
 *              prestamo relacionado, porque el servidor arma campos y columnas
 *              distintos para cada uno, y llena las columnas calculadas.
 *              Cabecera del registro → funciones de los botones Nuevo, Imprimir,
 *              Anular, Procesar y Devolver, referenciadas por nombre desde el
 *              User Event.
 *
 * @NApiVersion 2.1
 * @NScriptType ClientScript
 * @NModuleScope Public
 */
define(['N/url', 'N/https', 'N/currentRecord', 'N/ui/message', './lib/MovimientoInventarioConstants'],
    (url, https, currentRecord, message, CONSTANTES) => {

    // Las columnas obligatorias del sublist solo se revisan al hacer Add: si el
    // usuario nunca lo toca, el detalle viaja vacio. Se corta aqui para que no
    // pierda lo que ya cargo en la cabecera.
    // Cuanto hay de cada lote, tal como lo respondio el servidor al elegir el
    // articulo. Se guarda para no volver a preguntar cuando el usuario elige un
    // lote. La clave lleva el articulo porque dos articulos distintos pueden
    // tener lotes con el mismo nombre.
    const stockPorLote = {};

    function saveRecord(context) {
        const registroActual = context.currentRecord;

        // Con el traslado ya generado el detalle se muestra bloqueado y es el
        // registro de lo que se movio: sus cantidades son historicas y no tienen
        // que cuadrar contra el stock de hoy. Solo se corrige la cabecera.
        if (registroActual.getValue({ fieldId: 'custpage_detalle_bloqueado' }) === 'T') {
            return true;
        }

        const totalLineas = registroActual.getLineCount({ sublistId: 'custpage_sl_detalle' });

        if (totalLineas < 1) {
            alert('Agrega al menos un articulo al detalle antes de guardar. '
                + 'Recuerda confirmar la linea con el boton Add.');

            return false;
        }

        // Un prestamo o una merma mueven lo que dice cada linea, asi que ninguna
        // puede ir en cero ni en negativo. fieldChanged ya avisa al tipear, pero
        // ese aviso se saltea si la linea se agrega sin pasar por el campo: aqui
        // es donde no se escapa. El servidor lo vuelve a cortar, pero ahi ya es
        // una pagina de error y se pierde lo cargado.
        if (!esDevolucion(registroActual)) {
            for (let i = 0; i < totalLineas; i++) {
                const cantidad = Number(registroActual.getSublistValue({
                    sublistId: 'custpage_sl_detalle',
                    fieldId  : 'custpage_col_cantidad',
                    line     : i,
                }));

                if (cantidad <= 0) {
                    alert('La cantidad tiene que ser mayor que cero. Revisa la linea ' + (i + 1) + '.');

                    return false;
                }

                // Disponible ya trae lo del lote elegido cuando hay uno, asi que
                // sirve de tope sin volver a preguntarle al servidor. En una
                // linea sin lote es el total del articulo, que tambien es tope.
                const disponible = Number(registroActual.getSublistValue({
                    sublistId: 'custpage_sl_detalle',
                    fieldId  : 'custpage_col_disponible',
                    line     : i,
                }));

                if (cantidad > disponible) {
                    alert('La linea ' + (i + 1) + ' pide ' + cantidad + ' y solo hay ' + disponible + '.');

                    return false;
                }
            }
        }

        // Una devolucion trae una linea por cada linea pendiente del prestamo y las
        // que van en cero no se guardan, que es como se devuelve solo parte de los
        // articulos. Si van todas en cero no hay nada que devolver: se avisa aqui
        // para que el usuario lo corrija en la misma pantalla. El servidor lo
        // vuelve a cortar, pero ahi ya es una pagina de error.
        if (esDevolucion(registroActual)) {
            let lineasConCantidad = 0;

            for (let i = 0; i < totalLineas; i++) {
                const aDevolver = Number(registroActual.getSublistValue({
                    sublistId: 'custpage_sl_detalle',
                    fieldId  : 'custpage_col_a_devolver',
                    line     : i,
                }));

                if (aDevolver > 0) {
                    lineasConCantidad++;
                }
            }

            if (lineasConCantidad < 1) {
                alert('Indica cuanto vas a devolver: al menos un articulo tiene que llevar una cantidad mayor que cero.');

                return false;
            }
        }

        return true;
    }

    function fieldChanged(context) {
        const registroActual = context.currentRecord;

        if (context.sublistId === 'custpage_sl_detalle' && context.fieldId === 'custpage_col_articulo') {
            mostrarDisponible(registroActual);
            return;
        }

        if (context.sublistId === 'custpage_sl_detalle' && context.fieldId === 'custpage_col_lote') {
            mostrarStockDelLote(registroActual);
            return;
        }

        if (context.sublistId === 'custpage_sl_detalle' && context.fieldId === 'custpage_col_cantidad') {
            topearCantidadPrestada(registroActual);
            return;
        }

        if (context.sublistId === 'custpage_sl_detalle' && context.fieldId === 'custpage_col_a_devolver') {
            topearCantidadADevolver(registroActual);
            return;
        }

        // El tipo y el prestamo cambian que campos y que columnas trae el
        // formulario, y eso lo decide el servidor: la unica forma es volver a
        // pedirlo. Se recarga antes de capturar nada, asi que no se pierde trabajo.
        if (context.fieldId === 'custpage_tipo') {
            recargarFormulario(registroActual);
            return;
        }

        if (context.fieldId === 'custpage_prestamo_ref') {
            recargarFormulario(registroActual);
            return;
        }

        if (context.fieldId === 'custpage_subsidiaria') {
            actualizarPorSubsidiaria(registroActual);
            return;
        }
    }

    function recargarFormulario(registroActual) {
        // Lo que el usuario ya escribio viaja de vuelta para que la recarga no se
        // lo borre. La fecha con getText y no getValue: getValue de un campo DATE
        // devuelve un objeto Date, y el servidor la vuelve a poner como
        // defaultValue, que es texto en el formato de la cuenta.
        //
        // Fecha y comentarios van encodeados porque resolveScript no escapa los
        // valores: las barras de la fecha rompen la URL con un INVALID_ID que
        // culpa al script id, y los comentarios son texto libre. El tipo, el
        // responsable y el prestamo son ids y no lo necesitan.
        const parametros = {
            tipo       : registroActual.getValue({ fieldId: 'custpage_tipo' }),
            fecha      : encodeURIComponent(registroActual.getText({ fieldId: 'custpage_fecha' })),
            responsable: registroActual.getValue({ fieldId: 'custpage_usuario_resp' }),
            comentarios: encodeURIComponent(registroActual.getValue({ fieldId: 'custpage_comentarios' })),
        };

        // El prestamo relacionado solo existe en el formulario de devolucion.
        if (esDevolucion(registroActual)) {
            parametros.prestamo = registroActual.getValue({ fieldId: 'custpage_prestamo_ref' });
        }

        window.location.href = url.resolveScript({
            scriptId    : CONSTANTES.SUITELET.SCRIPT,
            deploymentId: CONSTANTES.SUITELET.DEPLOYMENT,
            params      : parametros,
        });
    }

    // En una devolucion el From y el To los resuelve el servidor desde el prestamo:
    // aqui solo se tocan cuando el usuario elige la subsidiaria de un prestamo o
    // de una merma.
    function esDevolucion(registroActual) {
        return !!registroActual.getField({ fieldId: 'custpage_prestamo_ref' });
    }

    // El stock se pide al Suitelet en vez de consultarlo aqui, para que la
    // consulta siga viviendo en el repository y no se duplique. Devuelve la
    // unidad, el disponible del articulo en la ubicacion y sus lotes con stock.
    function consultarStock(articulo, ubicacion) {
        const respuesta = https.get({
            url: url.resolveScript({
                scriptId    : CONSTANTES.SUITELET.SCRIPT,
                deploymentId: CONSTANTES.SUITELET.DEPLOYMENT,
                params      : {
                    op       : CONSTANTES.OPERACIONES.DISPONIBLE,
                    articulo : articulo,
                    ubicacion: ubicacion,
                },
            }),
        });

        return JSON.parse(respuesta.body);
    }

    function mostrarDisponible(registroActual) {
        const ubicacion = registroActual.getValue({ fieldId: 'custpage_ubicacion' });

        if (!ubicacion) {
            alert('Selecciona primero la Ubicacion Origen para ver el stock disponible.');
            return;
        }

        const articulo = registroActual.getCurrentSublistValue({
            sublistId: 'custpage_sl_detalle',
            fieldId  : 'custpage_col_articulo',
        });

        const stock = consultarStock(articulo, ubicacion);

        registroActual.setCurrentSublistValue({
            sublistId: 'custpage_sl_detalle',
            fieldId  : 'custpage_col_unidad',
            value    : stock.unidad,
        });

        registroActual.setCurrentSublistValue({
            sublistId: 'custpage_sl_detalle',
            fieldId  : 'custpage_col_disponible',
            value    : stock.disponible,
        });

        cargarLotesDelArticulo(registroActual, stock.lotes);
    }

    // Los lotes del articulo recien elegido se agregan al combo de la columna
    // Lote. Se suman a las que ya haya y no se borran las anteriores: un sublist
    // tiene un solo juego de opciones para toda la columna, asi que borrarlas
    // dejaria en blanco el lote de las lineas ya cargadas. Por eso cada opcion
    // dice de que articulo es. Un articulo sin control de lote no trae ninguna.
    function cargarLotesDelArticulo(registroActual, lotes) {
        if (!lotes.length) {
            return;
        }

        const articulo = registroActual.getCurrentSublistText({
            sublistId: 'custpage_sl_detalle',
            fieldId  : 'custpage_col_articulo',
        });

        const campoLote = registroActual.getSublistField({
            sublistId: 'custpage_sl_detalle',
            fieldId  : 'custpage_col_lote',
            line     : registroActual.getCurrentSublistIndex({ sublistId: 'custpage_sl_detalle' }),
        });

        const idArticulo = registroActual.getCurrentSublistValue({
            sublistId: 'custpage_sl_detalle',
            fieldId  : 'custpage_col_articulo',
        });

        lotes.forEach((lote) => {
            stockPorLote[idArticulo + '|' + lote.nombre] = lote.enMano;

            campoLote.insertSelectOption({
                value: lote.nombre,
                text : articulo + ' - ' + lote.nombre + ' (hay ' + lote.enMano + ')',
            });
        });
    }

    // Elegido el lote, Disponible deja de mostrar el total del articulo y pasa a
    // mostrar lo que hay de ese lote: es contra eso que se captura la cantidad, y
    // asi los dos numeros de la pantalla no se contradicen.
    //
    // Las opciones del combo se acumulan entre articulos, asi que se puede elegir
    // un lote que no es del articulo de la linea. En ese caso no hay stock que
    // mostrar y la columna se deja como estaba: el servidor lo rechaza al
    // procesar, que es donde se sabe de verdad.
    function mostrarStockDelLote(registroActual) {
        const idArticulo = registroActual.getCurrentSublistValue({
            sublistId: 'custpage_sl_detalle',
            fieldId  : 'custpage_col_articulo',
        });
        const lote = registroActual.getCurrentSublistValue({
            sublistId: 'custpage_sl_detalle',
            fieldId  : 'custpage_col_lote',
        });

        // Editando un movimiento las opciones del combo las cargo el servidor, asi
        // que el cliente nunca vio el stock de esos lotes. Se pide una sola vez
        // por articulo y queda cacheado igual que en el alta.
        if (stockPorLote[idArticulo + '|' + lote] === undefined) {
            const ubicacion = registroActual.getValue({ fieldId: 'custpage_ubicacion' });

            consultarStock(idArticulo, ubicacion).lotes.forEach((fila) => {
                stockPorLote[idArticulo + '|' + fila.nombre] = fila.enMano;
            });
        }

        const enMano = stockPorLote[idArticulo + '|' + lote];

        if (enMano === undefined) {
            return;
        }

        registroActual.setCurrentSublistValue({
            sublistId: 'custpage_sl_detalle',
            fieldId  : 'custpage_col_disponible',
            value    : enMano,
        });
    }

    // Con lote elegido, Disponible ya muestra lo que hay de ese lote, asi que es
    // el tope de lo que se puede prestar. Sin lote no se topea: ahi Disponible es
    // el total del articulo y quien reparte entre lotes es el servidor. El
    // procesamiento vuelve a validar; esto es para enterarse en el momento.
    //
    // El cero y los negativos NO se corrigen aqui: escribir el campo vuelve a
    // disparar fieldChanged y la alerta se repite sin fin. Esos los corta
    // saveRecord, que es el paso por el que si o si hay que pasar.
    function topearCantidadPrestada(registroActual) {
        const cantidad = Number(registroActual.getCurrentSublistValue({
            sublistId: 'custpage_sl_detalle',
            fieldId  : 'custpage_col_cantidad',
        }));

        const lote = registroActual.getCurrentSublistValue({
            sublistId: 'custpage_sl_detalle',
            fieldId  : 'custpage_col_lote',
        });

        if (!lote) {
            return;
        }

        const disponible = Number(registroActual.getCurrentSublistValue({
            sublistId: 'custpage_sl_detalle',
            fieldId  : 'custpage_col_disponible',
        }));

        if (cantidad > disponible) {
            alert('No hay tanto del lote ' + lote + ': quedan ' + disponible + '.');

            registroActual.setCurrentSublistValue({
                sublistId: 'custpage_sl_detalle',
                fieldId  : 'custpage_col_cantidad',
                value    : disponible,
            });
        }
    }

    // El servidor vuelve a validar el tope: esto es solo para que el usuario se
    // entere en el momento y no despues de guardar.
    function topearCantidadADevolver(registroActual) {
        const aDevolver = Number(registroActual.getCurrentSublistValue({
            sublistId: 'custpage_sl_detalle',
            fieldId  : 'custpage_col_a_devolver',
        }));
        const pendiente = Number(registroActual.getCurrentSublistValue({
            sublistId: 'custpage_sl_detalle',
            fieldId  : 'custpage_col_pendiente',
        }));

        if (aDevolver < 0) {
            alert('La cantidad a devolver no puede ser negativa.');

            registroActual.setCurrentSublistValue({
                sublistId: 'custpage_sl_detalle',
                fieldId  : 'custpage_col_a_devolver',
                value    : 0,
            });

            return;
        }

        if (aDevolver > pendiente) {
            alert('No se puede devolver mas de lo pendiente de esta linea: quedan ' + pendiente + '.');

            registroActual.setCurrentSublistValue({
                sublistId: 'custpage_sl_detalle',
                fieldId  : 'custpage_col_a_devolver',
                value    : pendiente,
            });
        }
    }

    // Elegir la subsidiaria recarga lo que depende de ella, y eso es distinto en
    // cada tipo: una devolucion elige un prestamo pendiente de esa subsidiaria y
    // hereda de el las dos ubicaciones, asi que no tiene combos que llenar; un
    // prestamo y una merma eligen ubicaciones y no tienen prestamo que buscar.
    function actualizarPorSubsidiaria(registroActual) {
        if (esDevolucion(registroActual)) {
            cargarPrestamosDeSubsidiaria(registroActual);
            return;
        }

        cargarUbicacionesDeSubsidiaria(registroActual);
    }

    // El combo de prestamos nace con todos los pendientes de la cuenta: aqui
    // quedan solo los de la subsidiaria elegida. Cada opcion dice de que ubicacion
    // salio el material y cuanto falta por devolver.
    function cargarPrestamosDeSubsidiaria(registroActual) {
        const subsidiaria = registroActual.getValue({ fieldId: 'custpage_subsidiaria' });
        const datos       = JSON.parse(registroActual.getValue({ fieldId: 'custpage_ubicaciones_data' }));

        const campoPrestamo = registroActual.getField({ fieldId: 'custpage_prestamo_ref' });

        campoPrestamo.removeSelectOption({ value: null });
        campoPrestamo.insertSelectOption({ value: '', text: '' });

        datos.prestamos.forEach((prestamo) => {
            if (prestamo.subsidiaria !== subsidiaria) {
                return;
            }

            campoPrestamo.insertSelectOption({
                value: prestamo.id,
                text : prestamo.nombre + ' - ' + prestamo.ubicacion
                     + ' - pendiente ' + prestamo.pendiente,
            });
        });
    }

    // Los dos combos de ubicacion nacen vacios y se llenan aqui con las
    // ubicaciones de la subsidiaria elegida. removeSelectOption con value null
    // borra todas las opciones anteriores.
    function cargarUbicacionesDeSubsidiaria(registroActual) {
        const subsidiaria = registroActual.getValue({ fieldId: 'custpage_subsidiaria' });
        const datos       = JSON.parse(registroActual.getValue({ fieldId: 'custpage_ubicaciones_data' }));

        const campoFrom = registroActual.getField({ fieldId: 'custpage_ubicacion' });
        const campoTo   = registroActual.getField({ fieldId: 'custpage_ubicacion_dest' });

        campoFrom.removeSelectOption({ value: null });
        campoFrom.insertSelectOption({ value: '', text: '' });

        campoTo.removeSelectOption({ value: null });
        campoTo.insertSelectOption({ value: '', text: '' });

        datos.ubicaciones.forEach((ubicacion) => {
            if (ubicacion.subsidiaria !== subsidiaria) {
                return;
            }

            // En un prestamo la bodega de prestamos no puede ser el origen: es el
            // destino. Y el destino no se elige, es ella y nada mas. En una merma
            // los dos combos se llenan con todas.
            if (!datos.esPrestamo || !ubicacion.esBodegaPrestamo) {
                campoFrom.insertSelectOption({ value: ubicacion.id, text: ubicacion.nombre });
            }

            if (!datos.esPrestamo || ubicacion.esBodegaPrestamo) {
                campoTo.insertSelectOption({ value: ubicacion.id, text: ubicacion.nombre });
            }
        });

        // En un prestamo el destino no se elige: queda seleccionada la bodega de
        // prestamos de la subsidiaria, que hace de intermediaria entre el origen y
        // quien recibe. Se selecciona despues del bucle, cuando el combo ya tiene
        // cargada la opcion. Si esa subsidiaria no tiene ninguna marcada, el combo
        // queda en blanco y el prestamo no se puede guardar. Una merma se queda
        // con las dos listas completas y elige el usuario.
        const bodega = datos.ubicaciones.filter((ubicacion) => ubicacion.subsidiaria === subsidiaria
                                                            && ubicacion.esBodegaPrestamo)[0];

        if (datos.esPrestamo && bodega) {
            registroActual.setValue({ fieldId: 'custpage_ubicacion_dest', value: bodega.id });
        }
    }

    // El boton Nuevo de la vista y el New de la lista llevan al mismo sitio: la
    // pantalla de captura, la unica que guarda cabecera y detalle de una vez.
    function crearMovimientoInventario() {
        window.location.href = url.resolveScript({
            scriptId    : CONSTANTES.SUITELET.SCRIPT,
            deploymentId: CONSTANTES.SUITELET.DEPLOYMENT,
        });
    }

    // El PDF se abre en una pestana aparte para no perder la pagina del
    // movimiento: el usuario imprime y sigue donde estaba.
    function imprimirMovimiento() {
        window.open(url.resolveScript({
            scriptId    : CONSTANTES.SUITELET.SCRIPT,
            deploymentId: CONSTANTES.SUITELET.DEPLOYMENT,
            params      : {
                op          : CONSTANTES.OPERACIONES.IMPRIMIR,
                idMovimiento: currentRecord.get().id,
            },
        }), '_blank');
    }

    function anularMovimientoInventario() {
        if (!confirm('Se anulara el movimiento. Confirma?')) {
            return;
        }

        window.location.href = url.resolveScript({
            scriptId    : CONSTANTES.SUITELET.SCRIPT,
            deploymentId: CONSTANTES.SUITELET.DEPLOYMENT,
            params      : {
                op          : CONSTANTES.OPERACIONES.ANULAR,
                idMovimiento: currentRecord.get().id,
            },
        });
    }

    // El traslado lo genera el Suitelet y la pagina se queda como esta hasta que
    // responde: el aviso es lo unico que le dice al usuario que ya arranco, para
    // que no vuelva a pulsar el boton y se generen dos traslados.
    function avisarProcesando(detalle) {
        message.create({
            title  : 'Procesando el movimiento',
            message: detalle + ' No cierres ni recargues la pagina.',
            type   : message.Type.WARNING,
        }).show();
    }

    function generarTransferPrestamo() {
        avisarProcesando('Se esta generando el traslado del prestamo.');

        window.location.href = url.resolveScript({
            scriptId    : CONSTANTES.SUITELET.SCRIPT,
            deploymentId: CONSTANTES.SUITELET.DEPLOYMENT,
            params      : {
                op          : CONSTANTES.OPERACIONES.PROCESAR,
                idMovimiento: currentRecord.get().id,
            },
        });
    }

    function generarTransferDevolucion() {
        avisarProcesando('Se esta generando el traslado de la devolucion.');

        window.location.href = url.resolveScript({
            scriptId    : CONSTANTES.SUITELET.SCRIPT,
            deploymentId: CONSTANTES.SUITELET.DEPLOYMENT,
            params      : {
                op          : CONSTANTES.OPERACIONES.DEVOLVER,
                idMovimiento: currentRecord.get().id,
            },
        });
    }

    return {
        saveRecord                : saveRecord,
        fieldChanged              : fieldChanged,
        crearMovimientoInventario : crearMovimientoInventario,
        imprimirMovimiento        : imprimirMovimiento,
        anularMovimientoInventario: anularMovimientoInventario,
        generarTransferPrestamo   : generarTransferPrestamo,
        generarTransferDevolucion : generarTransferDevolucion,
    };
});
