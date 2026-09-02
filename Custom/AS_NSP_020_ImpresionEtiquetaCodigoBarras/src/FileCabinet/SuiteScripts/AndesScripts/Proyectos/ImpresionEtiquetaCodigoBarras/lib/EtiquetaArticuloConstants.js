/**
 * AS_NSP_020 — Impresion de Etiqueta con Codigo de Barras
 * @NApiVersion 2.1
 * @NModuleScope Public
 */
define([],
    () => {

    const CLIENT_SCRIPT = './AS_EtiquetaArticulo_CS_2.1.js';
    const BOTON_NATIVO = 'printlabel';

    const BOTON_ETIQUETA = {
        ID    : 'custpage_btn_etiqueta_zebra',
        LABEL : 'Imprimir Etiqueta Zebra',
        ACCION: 'imprimirEtiquetaArticulo',
    };

    const CAMPOS = {
        NOMBRE     : 'itemid',
        DESCRIPCION: 'purchasedescription',
        UPC        : 'upccode',
    };

    const CAMPOS_OCULTOS = {
        NOMBRE     : 'custpage_etiqueta_nombre',
        DESCRIPCION: 'custpage_etiqueta_descripcion',
        UPC        : 'custpage_etiqueta_upc',
    };

    const IMPRESORA = {
        LIBRERIA  : 'https://labeldictate.com/text2barcode/lib/t2bprinter.js',
        FABRICANTE: 'Zebra',
    };

    const ETIQUETA = {
        ANCHO: 479,
        ALTO : 280,
    };

    const NOMBRE = {
        Y     : 45,
        FUENTE: 26,
        LINEAS: 2,
    };

    const DESCRIPCION = {
        Y     : 108,
        FUENTE: 22,
        LINEAS: 1,
    };

    const CODIGO_BARRAS = {
        Y     : 140,
        ALTO  : 70,
        MODULO: 2,
    };

    const COPIAS = 1;
    const MENSAJES = {
        SIN_UPC      : 'El articulo no tiene UPC Code cargado, no se puede generar el codigo de barras.',
        SIN_IMPRESORA: 'No se encontro la impresora. Verifica que Text2 Barcode este abierto en este equipo.',
        SIN_LIBRERIA : 'No se pudo cargar la libreria de Text2 Barcode.',
        ENVIADA      : 'Etiqueta enviada a ',
        FALLO_ENVIO  : 'No se pudo imprimir: ',
    };

    return {
        CLIENT_SCRIPT : CLIENT_SCRIPT,
        BOTON_NATIVO  : BOTON_NATIVO,
        BOTON_ETIQUETA: BOTON_ETIQUETA,
        CAMPOS        : CAMPOS,
        CAMPOS_OCULTOS: CAMPOS_OCULTOS,
        IMPRESORA     : IMPRESORA,
        ETIQUETA      : ETIQUETA,
        NOMBRE        : NOMBRE,
        DESCRIPCION   : DESCRIPCION,
        CODIGO_BARRAS : CODIGO_BARRAS,
        COPIAS        : COPIAS,
        MENSAJES      : MENSAJES,
    };
});
