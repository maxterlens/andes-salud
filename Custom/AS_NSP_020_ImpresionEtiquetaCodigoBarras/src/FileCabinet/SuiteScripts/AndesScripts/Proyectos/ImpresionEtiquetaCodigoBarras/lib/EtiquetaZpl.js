/**
 * AS_NSP_020 — Impresion de Etiqueta con Codigo de Barras
 * @NApiVersion 2.1
 * @NModuleScope Public
 */
define(['./EtiquetaArticuloConstants'],
    (CONSTANTES) => {

    const construir = (datos) => {
        return abrirEtiqueta()
             + nombreArticulo(datos.nombre)
             + codigoBarras(datos.upc)
             + cerrarEtiqueta();
    };

    const abrirEtiqueta = () => {
        return '^XA'
             + '^CI28'
             + '^PW' + CONSTANTES.ETIQUETA.ANCHO
             + '^LL' + CONSTANTES.ETIQUETA.ALTO;
    };

    const nombreArticulo = (nombre) => {
        return '^FO0,' + CONSTANTES.NOMBRE.Y
             + '^A0N,' + CONSTANTES.NOMBRE.FUENTE + ',' + CONSTANTES.NOMBRE.FUENTE
             + '^FB' + CONSTANTES.ETIQUETA.ANCHO + ',' + CONSTANTES.NOMBRE.LINEAS + ',0,C,0'
             + '^FD' + nombre + '\\&^FS';
    };

    const centrarCodigoBarras = (upc) => {
        const ancho = CONSTANTES.CODIGO_BARRAS.MODULO * (11 * (upc.length + 3) + 13);

        return Math.max(0, Math.round((CONSTANTES.ETIQUETA.ANCHO - ancho) / 2));
    };

    const codigoBarras = (upc) => {
        return '^FO' + centrarCodigoBarras(upc) + ',' + CONSTANTES.CODIGO_BARRAS.Y
             + '^BY' + CONSTANTES.CODIGO_BARRAS.MODULO + ',3,' + CONSTANTES.CODIGO_BARRAS.ALTO
             + '^BCN,' + CONSTANTES.CODIGO_BARRAS.ALTO + ',Y,N,N'
             + '^FD' + upc + '^FS';
    };

    const cerrarEtiqueta = () => {
        return '^PQ' + CONSTANTES.COPIAS + ',0,1,Y'
             + '^XZ';
    };

    return { construir: construir };
});
