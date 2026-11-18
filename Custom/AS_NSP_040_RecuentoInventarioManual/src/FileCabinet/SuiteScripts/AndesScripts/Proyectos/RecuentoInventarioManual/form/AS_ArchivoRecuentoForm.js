/**
 * AS_NSP_040 — Recuento de Inventario Manual
 * @description Lo que ve el usuario del TXT del recuento: el boton en la vista y
 *              el archivo. No busca ni guarda records.
 *
 *              El archivo se crea en memoria para responderlo como descarga:
 *              una fila de encabezado y una fila por articulo del recuento,
 *              separadas por coma. Windows-1252, como los TXT del AS_NSP_036.
 *              PRO_CORREL lleva el id interno del articulo y COD_BARRA va
 *              vacio; PRO_CORREL1 sigue con el correlativo de la fila.
 *              COD 3 lleva el id de la ubicacion del recuento en todas las filas.
 *              El nombre sale como se ve en NetSuite (< en vez de &lt;), con
 *              las comas cambiadas por punto.
 *
 * @NApiVersion 2.1
 * @NModuleScope Public
 * @author Andes Salud
 * @version 1.7.0
 *
 * CHANGELOG
 * 1.7.0 [FEAT] COD 3 con el id de la ubicacion del recuento.
 * 1.6.0 [FIX] El nombre del articulo sin &lt; &gt; &amp;: sale como en NetSuite.
 * 1.5.0 [FEAT] PRO_CORREL con el id interno del articulo y COD_BARRA vacio.
 */
define(['N/file', '../utils/AS_RecuentoInventarioManualUtils', '../constants/AS_RecuentoInventarioManualConstants'],
    (file, UTILS, CONSTANTES) => {

    // ─────────────────────────────────────────────────────────────────────────
    // Principales
    // ─────────────────────────────────────────────────────────────────────────

    function agregarBoton(form) {
        form.clientScriptModulePath = CONSTANTES.FORMULARIO.CLIENT_SCRIPT;
        form.addButton({
            id          : CONSTANTES.BOTONES.TXT,
            label       : CONSTANTES.BOTONES.TXT_LABEL,
            functionName: 'descargarTxt',
        });
    }

    function construirArchivo(recuentoId, articulos, ubicacionId) {
        const archivo = CONSTANTES.ARCHIVO;
        const filas   = [archivo.ENCABEZADO.join(archivo.SEPARADOR)];
        articulos.forEach((articulo, indice) => {
            const correlativo = indice + 1;
            const nombre      = UTILS.convertirEntidadesHtmlATexto(articulo.nombre).replace(/,/g, '.');
            filas.push([articulo.id, articulo.codigoBarra, '', ubicacionId, '', '', nombre, '',
                        correlativo, '', '', '', '', ''].join(archivo.SEPARADOR));
        });

        return file.create({
            name    : archivo.PREFIJO + '-' + recuentoId + '.txt',
            fileType: file.Type.PLAINTEXT,
            contents: filas.join('\r\n'),
            encoding: file.Encoding.WINDOWS_1252,
        });
    }

    return {
        agregarBoton    : agregarBoton,
        construirArchivo: construirArchivo,
    };
});
