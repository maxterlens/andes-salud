/**
 * AS_NSP_040 — Recuento de Inventario Manual
 * @description Funciones genericas del modulo, sin negocio.
 *
 *              convertirArchivoATexto           → el contenido de un archivo
 *                                                 subido, como texto.
 *              pasarAMayusculasSinEspaciosExtra → para comparar textos escritos
 *                                                 a mano.
 *              formatearMoneda                  → un importe con el formato de
 *                                                 moneda del usuario.
 *
 * CHANGELOG v1.0.0 (2026-11-16):
 * - [FEAT] Sale de AS_CargaCantidadesHandler y AS_ImporteRecuentoForm, como el
 *          utils del AS_NSP_032.
 *
 * @NApiVersion 2.1
 * @NModuleScope Public
 * @author Andes Salud
 * @version 1.0.0
 */
define(['N/encode', 'N/format'],
    (encode, format) => {

    // ─────────────────────────────────────────────────────────────────────────
    // Principales
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * En Windows el navegador sube el .csv como "application/vnd.ms-excel":
     * NetSuite lo toma como binario y getContents lo devuelve en base64. Ahi se
     * decodifica a texto, como en el AS_NSP_032.
     */
    function convertirArchivoATexto(archivo) {
        if (archivo.isText) return archivo.getContents();
        return encode.convert({
            string        : archivo.getContents(),
            inputEncoding : encode.Encoding.BASE_64,
            outputEncoding: encode.Encoding.UTF_8,
        });
    }

    function pasarAMayusculasSinEspaciosExtra(texto) {
        return String(texto || '').trim().replace(/\s+/g, ' ').toUpperCase();
    }

    /**
     * Con el formato de moneda del usuario (la cuenta es es_ES).
     */
    function formatearMoneda(valor) {
        return format.format({ value: valor, type: format.Type.CURRENCY });
    }

    return {
        convertirArchivoATexto          : convertirArchivoATexto,
        pasarAMayusculasSinEspaciosExtra: pasarAMayusculasSinEspaciosExtra,
        formatearMoneda                 : formatearMoneda,
    };
});
