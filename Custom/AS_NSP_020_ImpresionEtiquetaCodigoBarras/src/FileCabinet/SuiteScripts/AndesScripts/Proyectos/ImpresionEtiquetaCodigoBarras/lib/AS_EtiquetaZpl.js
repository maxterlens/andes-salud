/**
 * AS_NSP_020 — Impresion de Etiqueta con Codigo de Barras
 * @NApiVersion 2.1
 * @NModuleScope Public
 */
define([],
    () => {

    const construir = (datos, formato, cantidad) => {
        return abrirEtiqueta(formato)
             + nombreArticulo(datos.nombre, formato)
             + codigoBarras(datos.upc, formato)
             + cerrarEtiqueta(cantidad);
    };

    const abrirEtiqueta = (formato) => {
        return '^XA'
             + '^CI28'
             + '^PW' + formato.ancho
             + '^LL' + formato.alto;
    };

    const nombreArticulo = (nombre, formato) => {
        return '^FO0,' + formato.yNombre
             + '^A0N,' + formato.fuenteNombre + ',' + formato.fuenteNombre
             + '^FB' + formato.ancho + ',' + formato.lineasNombre + ',0,C,0'
             + '^FD' + nombre + '\\&^FS';
    };

    const centrarCodigoBarras = (upc, formato) => {
        const ancho = formato.modulo * (11 * (upc.length + 3) + 13);

        return Math.max(0, Math.round((formato.ancho - ancho) / 2));
    };

    const codigoBarras = (upc, formato) => {
        return '^FO' + centrarCodigoBarras(upc, formato) + ',' + formato.yCodigo
             + '^BY' + formato.modulo + ',3,' + formato.altoCodigo
             + '^BCN,' + formato.altoCodigo + ',Y,N,N'
             + '^FD' + upc + '^FS';
    };

    const cerrarEtiqueta = (cantidad) => {
        return '^PQ' + cantidad + ',0,1,Y'
             + '^XZ';
    };

    return { construir: construir };
});
