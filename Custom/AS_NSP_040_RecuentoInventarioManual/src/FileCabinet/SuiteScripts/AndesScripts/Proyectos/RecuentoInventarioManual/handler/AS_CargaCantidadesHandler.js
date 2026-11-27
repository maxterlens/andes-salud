/**
 * AS_NSP_040 — Recuento de Inventario Manual
 * @description Proceso de la pantalla Cargar CSV: sube las cantidades contadas
 *              y las manda a escribir en el recuento, todas al lote configurado.
 *
 *              mostrarFormulario → la pantalla para elegir la subsidiaria,
 *                                  el recuento, el lote y el archivo (GET).
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
 *              El CSV trae UPC;RECUENTO, una fila por articulo, sin lote:
 *              el UPC se busca entre los articulos del recuento (la ubicacion
 *              no va: es la del recuento elegido en la pantalla) y todo el
 *              RECUENTO va al lote elegido en la pantalla, uno de Lote
 *              Predeterminado de Recuento. Si no es de la subsidiaria del
 *              recuento no se carga nada. Un UPC que no esta en el recuento,
 *              o que esta en mas de un articulo, rechaza la carga. Si un
 *              articulo viene en varias filas, se suman. Una fila con RECUENTO
 *              vacio deja el articulo vacio en el recuento (sin cantidad ni
 *              lotes): vacio es "no se conto", no 0. Un 0 se escribe 0, sin
 *              lote. Un articulo que no viene en el CSV no se toca. Si una fila
 *              no pasa la validacion no se carga nada, como en el AS_NSP_032.
 *              Si NetSuite rechaza el guardado, la solicitud queda en Error con
 *              su mensaje.
 *
 * @NApiVersion 2.1
 * @NModuleScope Public
 * @author Andes Salud
 * @version 1.12.0
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
        const articulosPorUpc = agruparPorUpc(recuentoInventarioManualQuery.obtenerCantidadesRecuento(recuentoId));
        const errores         = filas.map((fila) => validarFila(fila, articulosPorUpc)).filter((error) => error);
        if (errores.length) return responderConFormulario(context, recuentoId, loteId, errores.join('<br>'));
        const cantidades  = agruparPorArticulo(filas, articulosPorUpc, lote);
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
        const recuentos     = recuentoInventarioManualQuery.obtenerRecuentosIniciados();
        const lotes         = recuentoInventarioManualQuery.obtenerLotesRecuento();
        const recuento      = recuentos.find((opcion) => opcion.id === String(recuentoId));
        const subsidiariaId = recuento ? recuento.subsidiaria : '';
        context.response.writePage(cargaCantidadesForm.construirFormulario(subsidiariaId, recuentoId, recuentos, loteId, lotes, alerta));
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
                    numero  : posicion + 1,
                    upc     : (columnas[0] || '').trim(),
                    recuento: (columnas[1] || '').trim().replace(',', '.'),
                };
            })
            .slice(1)
            .filter((fila) => fila.upc);
    }

    /**
     * Los articulos del recuento por su UPC. Un articulo sin UPC no entra:
     * no se puede cargar por CSV.
     */
    function agruparPorUpc(articulos) {
        const articulosPorUpc = {};
        articulos.filter((articulo) => articulo.codigoBarra).forEach((articulo) => {
            if (!articulosPorUpc[articulo.codigoBarra]) articulosPorUpc[articulo.codigoBarra] = [];
            articulosPorUpc[articulo.codigoBarra].push(articulo);
        });

        return articulosPorUpc;
    }

    function validarFila(fila, articulosPorUpc) {
        const prefijo   = 'Fila ' + fila.numero + ': ';
        const articulos = articulosPorUpc[fila.upc];
        if (!articulos) return prefijo + 'el UPC ' + fila.upc + ' no es de ningun articulo de este recuento';
        if (articulos.length > 1) {
            const nombres = articulos.map((articulo) => UTILS.convertirEntidadesHtmlATexto(articulo.nombre)).join(', ');
            return prefijo + 'el UPC ' + fila.upc + ' esta en mas de un articulo del recuento (' + nombres + ')';
        }
        if (fila.recuento === '') return '';
        if (isNaN(Number(fila.recuento)) || Number(fila.recuento) < 0) return prefijo + 'el RECUENTO "' + fila.recuento + '" no es una cantidad valida';
        return '';
    }

    function agruparPorArticulo(filas, articulosPorUpc, lote) {
        const cantidades = {};

        filas.forEach((fila) => {
            const id = articulosPorUpc[fila.upc][0].id;
            if (fila.recuento === '') {
                if (!cantidades[id]) cantidades[id] = { total: null, lotes: [] };
                return;
            }
            if (!cantidades[id] || cantidades[id].total === null) cantidades[id] = { total: 0, lotes: [{ lote: lote, cantidad: 0 }] };
            cantidades[id].total += Number(fila.recuento);
            cantidades[id].lotes[0].cantidad += Number(fila.recuento);
        });

        return cantidades;
    }

    return {
        mostrarFormulario: mostrarFormulario,
        cargarCantidades : cargarCantidades,
    };
});
