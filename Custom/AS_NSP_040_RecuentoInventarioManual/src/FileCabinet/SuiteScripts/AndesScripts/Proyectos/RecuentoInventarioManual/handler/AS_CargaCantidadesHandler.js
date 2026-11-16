/**
 * AS_NSP_040 — Recuento de Inventario Manual
 * @description Proceso del boton Cargar CSV del recuento: sube las cantidades
 *              contadas por lote y las escribe en el recuento.
 *
 *              agregarBoton      → con el recuento Iniciado, el boton en la vista
 *                                  (UE).
 *              mostrarFormulario → la pantalla para elegir el archivo (GET).
 *              cargarCantidades  → lee el CSV, valida cada fila, escribe la
 *                                  Cantidad del recuento y el detalle por lote
 *                                  y vuelve al recuento (POST).
 *
 *              El CSV es el TXT de Descargar TXT con RECUENTO lleno:
 *              ID;ARTICULO;RECUENTO;UBICACION;LOTE, una fila por lote. Una fila
 *              con RECUENTO vacio no se toca. ARTICULO es solo para leerlo.
 *              Si una fila no pasa la validacion no se carga nada, como en el
 *              AS_NSP_032. Si NetSuite rechaza el guardado, la pantalla muestra
 *              su mensaje.
 *
 * CHANGELOG v1.2.1 (2026-11-16):
 * - [FIX] La conversion del archivo a texto y pasarAMayusculasSinEspaciosExtra
 *         pasan a AS_RecuentoInventarioManualUtils.
 *
 * CHANGELOG v1.2.0 (2026-11-16):
 * - [FEAT] El LOTE es libre: puede ser uno nuevo (prueba1) para estandarizar el
 *          nombre; no se compara con la instantanea ni con el stock.
 *
 * CHANGELOG v1.1.0 (2026-11-16):
 * - [FEAT] CSV de 5 columnas con ubicacion y lote: valida ID, ubicacion, cantidad
 *          y lote, y suma los lotes de cada articulo. Se quita el lote fijo.
 *
 * CHANGELOG v1.0.0 (2026-11-15):
 * - [FEAT] agregarBoton, mostrarFormulario y cargarCantidades, version de prueba.
 *
 * @NApiVersion 2.1
 * @NModuleScope Public
 * @author Andes Salud
 * @version 1.2.1
 */
define(['N/redirect', '../form/AS_CargaCantidadesForm', '../data/query/AS_RecuentoInventarioManualQuery',
        '../data/record/AS_RecuentoInventarioRecord', '../utils/AS_RecuentoInventarioManualUtils',
        '../constants/AS_RecuentoInventarioManualConstants'],
    (redirect, cargaCantidadesForm, recuentoInventarioManualQuery, recuentoInventarioRecord, UTILS, CONSTANTES) => {

    // ─────────────────────────────────────────────────────────────────────────
    // Principales
    // ─────────────────────────────────────────────────────────────────────────

    function agregarBoton(form, recuento) {
        if (recuento.getValue({ fieldId: 'statuskey' }) !== CONSTANTES.RECUENTO.ESTADO_INICIADO) return;
        cargaCantidadesForm.agregarBoton(form);
    }

    function mostrarFormulario(context, recuentoId) {
        context.response.writePage(cargaCantidadesForm.construirFormulario(recuentoId));
    }

    function cargarCantidades(context, recuentoId) {
        const contenido = leerArchivo(context.request);
        if (!contenido) return responderConError(context, recuentoId, CONSTANTES.CARGA.SIN_ARCHIVO);
        const filas = leerFilas(contenido);
        if (!filas.length) return responderConError(context, recuentoId, CONSTANTES.CARGA.SIN_FILAS);
        const ubicacion = recuentoInventarioManualQuery.obtenerUbicacionRecuento(recuentoId);
        const articulos = recuentoInventarioManualQuery.obtenerCantidadesRecuento(recuentoId).map((cantidad) => cantidad.id);
        const errores   = filas.map((fila) => validarFila(fila, ubicacion, articulos)).filter((error) => error);
        if (errores.length) return responderConError(context, recuentoId, errores.join('<br>'));
        let actualizadas;
        try {
            actualizadas = recuentoInventarioRecord.actualizarCantidades(recuentoId, agruparPorArticulo(filas));
        } catch (fallo) {
            if (fallo.name !== 'USER_ERROR') throw fallo;
            return responderConError(context, recuentoId, fallo.message);
        }

        log.audit({
            title  : 'RECUENTO INVENTARIO CANTIDADES CARGADAS',
            details: 'recuento: ' + recuentoId + ' | filas: ' + filas.length + ' | lineas actualizadas: ' + actualizadas,
        });

        redirect.toRecord({ type: CONSTANTES.RECUENTO.TIPO, id: recuentoId });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Secundarias
    // ─────────────────────────────────────────────────────────────────────────

    function responderConError(context, recuentoId, mensaje) {
        context.response.writePage(cargaCantidadesForm.construirFormulario(recuentoId, mensaje));
    }

    function leerArchivo(request) {
        const archivo = request.files[CONSTANTES.CAMPOS.ARCHIVO];
        if (!archivo) return '';
        return UTILS.convertirArchivoATexto(archivo);
    }

    /**
     * Las filas con RECUENTO, saltando el encabezado. Excel en es_ES puede
     * guardar la cantidad con coma decimal: se pasa a punto antes de convertirla.
     */
    function leerFilas(contenido) {
        const separador = contenido.indexOf(';') >= 0 ? ';' : ',';

        return contenido.split(/\r?\n/)
            .map((fila, posicion) => {
                const columnas = fila.split(separador);
                return {
                    numero   : posicion + 1,
                    id       : (columnas[0] || '').trim(),
                    recuento : (columnas[2] || '').trim().replace(',', '.'),
                    ubicacion: (columnas[3] || '').trim(),
                    lote     : (columnas[4] || '').trim(),
                };
            })
            .slice(1)
            .filter((fila) => fila.id && fila.recuento !== '');
    }

    function validarFila(fila, ubicacion, articulos) {
        const prefijo = 'Fila ' + fila.numero + ': ';
        if (!articulos.includes(fila.id)) return prefijo + 'el ID ' + fila.id + ' no es un articulo de este recuento';
        if (UTILS.pasarAMayusculasSinEspaciosExtra(fila.ubicacion) !== UTILS.pasarAMayusculasSinEspaciosExtra(ubicacion)) {
            return prefijo + 'la ubicacion "' + fila.ubicacion + '" no es la del recuento (' + ubicacion + ')';
        }
        if (isNaN(Number(fila.recuento)) || Number(fila.recuento) < 0) return prefijo + 'el RECUENTO "' + fila.recuento + '" no es una cantidad valida';
        if (!fila.lote) return prefijo + 'falta el LOTE';
        return '';
    }

    /**
     * { idArticulo: { total, lotes: [{ lote, cantidad }] } }: la linea del
     * recuento lleva el total y su detalle un lote por fila.
     */
    function agruparPorArticulo(filas) {
        const cantidades = {};

        filas.forEach((fila) => {
            if (!cantidades[fila.id]) cantidades[fila.id] = { total: 0, lotes: [] };
            cantidades[fila.id].total += Number(fila.recuento);
            cantidades[fila.id].lotes.push({ lote: fila.lote, cantidad: Number(fila.recuento) });
        });

        return cantidades;
    }

    return {
        agregarBoton     : agregarBoton,
        mostrarFormulario: mostrarFormulario,
        cargarCantidades : cargarCantidades,
    };
});
