/**
 * AS_NSP_040 — Recuento de Inventario Manual
 * @description Lo que ve el usuario del TXT del recuento: el boton en la vista y
 *              el archivo. No busca ni guarda records.
 *
 *              El archivo se crea en memoria para responderlo como descarga:
 *              una fila de encabezado y una fila por articulo del recuento,
 *              separadas por coma. Windows-1252, como los TXT del AS_NSP_036.
 *
 * CHANGELOG v1.4.0 (2026-11-16):
 * - [FEAT] Formato de la pistola: PRO_CORREL,PRO_CODIGO,COD_BARRA,COD 3,COD 4,
 *          COD 5,pro_nombre,,PRO_CORREL1,,,,,Cantidad. Sin ubicacion ni lote.
 *
 * CHANGELOG v1.3.0 (2026-11-16):
 * - [FEAT] Una fila por articulo con LOTE vacio: bodega lo llena al contar.
 *
 * CHANGELOG v1.2.0 (2026-11-16):
 * - [FEAT] Columnas ID;ARTICULO;RECUENTO;UBICACION;LOTE.
 *
 * CHANGELOG v1.1.0 (2026-11-15):
 * - [FEAT] Columna ID primero y sin AJUSTADA: el mismo archivo vuelve por Cargar CSV.
 *
 * CHANGELOG v1.0.0 (2026-11-15):
 * - [FEAT] agregarBoton y construirArchivo, version de prueba con 5 columnas.
 *
 * @NApiVersion 2.1
 * @NModuleScope Public
 * @author Andes Salud
 * @version 1.4.0
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

    /**
     * Formato de la pistola: el correlativo va en PRO_CORREL y PRO_CORREL1, el
     * codigo de barras en PRO_CODIGO y COD_BARRA, y Cantidad vacia: la llena
     * bodega al contar. Las comas del nombre pasan a punto (12,5MG → 12.5MG)
     * porque el separador es la coma y partirian la fila.
     */
    function construirArchivo(recuentoId, articulos) {
        const archivo = CONSTANTES.ARCHIVO;
        const filas   = [archivo.ENCABEZADO.join(archivo.SEPARADOR)];
        articulos.forEach((articulo, indice) => {
            const correlativo = indice + 1;
            const nombre      = articulo.nombre.replace(/,/g, '.');
            filas.push([correlativo, articulo.codigoBarra, articulo.codigoBarra, '', '', '', nombre, '',
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
