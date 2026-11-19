/**
 * AS_NSP_040 — Recuento de Inventario Manual
 * @description Proceso de la pantalla Cargar CSV: sube las cantidades contadas
 *              y las manda a escribir en el recuento, todas al lote configurado.
 *
 *              mostrarFormulario → la pantalla para elegir el recuento, el
 *                                  lote y el archivo (GET).
 *              cargarCantidades  → lee el CSV, valida cada fila, deja las
 *                                  cantidades en la cola, lanza el Scheduled si
 *                                  esta libre y lleva al usuario a la solicitud
 *                                  (POST).
 *
 *              Las cantidades no se escriben aqui: guardar un recuento de 2.703
 *              articulos tardo entre 10 y 15 minutos en QA. Lo hace
 *              AS_ColaHandler desde el Scheduled, y el usuario puede cerrar la
 *              pagina. Dos cargas del mismo recuento no chocan: la cola las
 *              procesa en orden y la segunda solo pisa los articulos que trae.
 *
 *              El CSV trae UBICACION;ID;ARTICULO;RECUENTO, con UBICACION y ID
 *              por id interno, una fila por articulo, sin lote: todo el
 *              RECUENTO va al lote elegido en la pantalla, uno de Lote
 *              Predeterminado de Recuento. Si no es de la subsidiaria del
 *              recuento no se carga nada. Si un articulo viene en varias
 *              filas, se suman. Una fila con RECUENTO vacio deja el articulo
 *              vacio en el recuento (sin cantidad ni lotes): vacio es "no se
 *              conto", no 0. Un articulo que no viene en el CSV no se toca.
 *              ARTICULO es solo para leerlo. Si una fila no pasa la validacion
 *              no se carga nada, como en el AS_NSP_032. Si NetSuite rechaza el
 *              guardado, la solicitud queda en Error con su mensaje.
 *
 * @NApiVersion 2.1
 * @NModuleScope Public
 * @author Andes Salud
 * @version 1.10.0
 *
 */
define(['N/redirect', '../form/AS_CargaCantidadesForm', '../data/query/AS_RecuentoInventarioManualQuery',
        '../data/record/AS_ColaRecord', '../utils/AS_RecuentoInventarioManualUtils',
        '../constants/AS_RecuentoInventarioManualConstants'],
    (redirect, cargaCantidadesForm, recuentoInventarioManualQuery, colaRecord, UTILS, CONSTANTES) => {

    // ─────────────────────────────────────────────────────────────────────────
    // Principales
    // ─────────────────────────────────────────────────────────────────────────

    function mostrarFormulario(context) {
        responderConFormulario(context, '', '');
    }

    function cargarCantidades(context, recuentoId, loteId) {
        const contenido = leerArchivo(context.request);
        if (!contenido) return responderConFormulario(context, recuentoId, loteId, CONSTANTES.CARGA.SIN_ARCHIVO);
        const filas = leerFilas(contenido);
        if (!filas.length) return responderConFormulario(context, recuentoId, loteId, CONSTANTES.CARGA.SIN_FILAS);
        const lote = recuentoInventarioManualQuery.obtenerLoteRecuento(recuentoId, loteId);
        if (!lote) return responderConFormulario(context, recuentoId, loteId, CONSTANTES.CARGA.SIN_LOTE);
        const ubicacion = recuentoInventarioManualQuery.obtenerUbicacionRecuento(recuentoId);
        const articulos = recuentoInventarioManualQuery.obtenerCantidadesRecuento(recuentoId).map((cantidad) => cantidad.id);
        const errores   = filas.map((fila) => validarFila(fila, ubicacion, articulos)).filter((error) => error);
        if (errores.length) return responderConFormulario(context, recuentoId, loteId, errores.join('<br>'));
        const cantidades  = agruparPorArticulo(filas, lote);
        const solicitudId = colaRecord.crearSolicitud(CONSTANTES.COLA.TIPOS.CARGA, { recuento: recuentoId, datos: { cantidades: cantidades } });
        UTILS.lanzarScheduledSiEstaLibre(CONSTANTES.COLA.PROCESADOR, CONSTANTES.COLA.DEPLOYMENT);

        log.audit({
            title  : 'RECUENTO INVENTARIO CARGA ENVIADA',
            details: 'solicitud: ' + solicitudId + ' | recuento: ' + recuentoId + ' | lote: ' + lote + ' | filas: ' + filas.length
                   + ' | articulos: ' + Object.keys(cantidades).length,
        });

        redirect.toRecord({ type: CONSTANTES.COLA.TIPO, id: solicitudId });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Secundarias
    // ─────────────────────────────────────────────────────────────────────────

    function responderConFormulario(context, recuentoId, loteId, alerta) {
        const recuentos = recuentoInventarioManualQuery.obtenerRecuentosIniciados();
        const lotes     = recuentoInventarioManualQuery.obtenerLotesRecuento();
        context.response.writePage(cargaCantidadesForm.construirFormulario(recuentoId, recuentos, loteId, lotes, alerta));
    }

    function leerArchivo(request) {
        const archivo = request.files[CONSTANTES.CAMPOS.ARCHIVO];
        if (!archivo) return '';
        return UTILS.convertirArchivoATexto(archivo);
    }

    function leerFilas(contenido) {
        const separador = contenido.indexOf(';') >= 0 ? ';' : ',';

        return contenido.split(/\r?\n/)
            .map((fila, posicion) => {
                const columnas = fila.split(separador);
                return {
                    numero   : posicion + 1,
                    ubicacion: (columnas[0] || '').trim(),
                    id       : (columnas[1] || '').trim(),
                    recuento : (columnas[3] || '').trim().replace(',', '.'),
                };
            })
            .slice(1)
            .filter((fila) => fila.id);
    }

    function validarFila(fila, ubicacion, articulos) {
        const prefijo = 'Fila ' + fila.numero + ': ';
        if (!articulos.includes(fila.id)) return prefijo + 'el ID ' + fila.id + ' no es un articulo de este recuento';
        if (fila.ubicacion !== ubicacion.id) {
            return prefijo + 'la ubicacion "' + fila.ubicacion + '" no es la del recuento (' + ubicacion.id + ' - ' + ubicacion.nombre + ')';
        }
        if (fila.recuento === '') return '';
        if (isNaN(Number(fila.recuento)) || Number(fila.recuento) < 0) return prefijo + 'el RECUENTO "' + fila.recuento + '" no es una cantidad valida';
        return '';
    }

    function agruparPorArticulo(filas, lote) {
        const cantidades = {};

        filas.forEach((fila) => {
            if (fila.recuento === '') {
                if (!cantidades[fila.id]) cantidades[fila.id] = { total: null, lotes: [] };
                return;
            }
            if (!cantidades[fila.id] || cantidades[fila.id].total === null) cantidades[fila.id] = { total: 0, lotes: [{ lote: lote, cantidad: 0 }] };
            cantidades[fila.id].total += Number(fila.recuento);
            cantidades[fila.id].lotes[0].cantidad += Number(fila.recuento);
        });

        return cantidades;
    }

    return {
        mostrarFormulario: mostrarFormulario,
        cargarCantidades : cargarCantidades,
    };
});
