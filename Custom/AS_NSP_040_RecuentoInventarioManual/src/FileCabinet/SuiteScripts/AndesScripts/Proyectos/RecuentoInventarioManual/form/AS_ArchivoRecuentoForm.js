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
 *
 * @NApiVersion 2.1
 * @NModuleScope Public
 * @author Andes Salud
 * @version 1.5.0
 *
 * CHANGELOG
 * 1.5.0 [FEAT] PRO_CORREL con el id interno del articulo y COD_BARRA vacio.
 */
define(['N/file', '../constants/AS_RecuentoInventarioManualConstants'],
    (file, CONSTANTES) => {

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

    function construirArchivo(recuentoId, articulos) {
        const archivo = CONSTANTES.ARCHIVO;
        const filas   = [archivo.ENCABEZADO.join(archivo.SEPARADOR)];
        articulos.forEach((articulo, indice) => {
            const correlativo = indice + 1;
            const nombre      = articulo.nombre.replace(/,/g, '.');
            filas.push([articulo.id, articulo.codigoBarra, '', '', '', '', nombre, '',
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
