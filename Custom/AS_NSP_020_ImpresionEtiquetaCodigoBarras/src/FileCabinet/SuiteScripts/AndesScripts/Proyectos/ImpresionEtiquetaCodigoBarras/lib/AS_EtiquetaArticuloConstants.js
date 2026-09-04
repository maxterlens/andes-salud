/**
 * AS_NSP_020 — Impresion de Etiqueta con Codigo de Barras
 * @NApiVersion 2.1
 * @NModuleScope Public
 */
define([],
    () => {

    const CLIENT_SCRIPT = '/SuiteScripts/AndesScripts/Proyectos/ImpresionEtiquetaCodigoBarras/AS_EtiquetaArticulo_CS_2.1.js';
    const BOTON_NATIVO = 'printlabel';

    const BOTON_ETIQUETA = {
        ID    : 'custpage_btn_etiqueta_zebra',
        LABEL : 'Imprimir Etiqueta Zebra',
        ACCION: 'imprimirEtiquetaArticulo',
    };

    const CAMPOS = {
        NOMBRE: 'itemid',
        UPC   : 'upccode',
    };

    const CAMPOS_OCULTOS = {
        NOMBRE: 'custpage_etiqueta_nombre',
        UPC   : 'custpage_etiqueta_upc',
    };

    const CAMPO_SUBSIDIARIA = {
        ORIGEN: 'subsidiary',
        OCULTO: 'custpage_etiqueta_subsidiaria',
    };

    const CAMPO_CONFIGURACION = 'custpage_etiqueta_configuracion';

    const SELECTOR = {
        TITULO     : 'Imprimir Etiqueta',
        SUBSIDIARIA: 'Subsidiaria',
        FORMATO    : 'Formato de etiqueta',
        CANTIDAD   : 'Cantidad de etiquetas',
        ACEPTAR    : 'Imprimir',
        CANCELAR   : 'Cancelar',
    };

    const CANTIDAD_INICIAL = 1;

    // Las medidas de la etiqueta viven en este custom record, una fila por formato
    const FORMATO = {
        RECORD        : 'customrecord_as_formato_etiqueta',
        SUBSIDIARIA   : 'custrecord_as_fe_subsidiaria',
        ANCHO         : 'custrecord_as_fe_ancho',
        ALTO          : 'custrecord_as_fe_alto',
        Y_NOMBRE      : 'custrecord_as_fe_y_nombre',
        FUENTE_NOMBRE : 'custrecord_as_fe_fuente_nombre',
        LINEAS_NOMBRE : 'custrecord_as_fe_lineas_nombre',
        Y_CODIGO      : 'custrecord_as_fe_y_codigo',
        ALTO_CODIGO   : 'custrecord_as_fe_alto_codigo',
        MODULO        : 'custrecord_as_fe_modulo',
        PREDETERMINADO: 'custrecord_as_fe_predeterminado',
    };

    const MENSAJES = {
        SIN_UPC      : 'El articulo no tiene UPC Code cargado, no se puede generar el codigo de barras.',
        SIN_CANTIDAD : 'Indica cuantas etiquetas quieres imprimir.',
        SIN_FORMATO  : 'No hay ningun formato de etiqueta configurado. Creelo en AS Configuracion Etiqueta Impresora.',
        SIN_IMPRESORA: 'No se encontro la impresora. Verifica que Browser Print este abierto en este equipo.',
        SIN_LIBRERIA : 'No se pudo cargar la libreria de Browser Print.',
        ENVIADA      : 'Etiqueta enviada a ',
        FALLO_ENVIO  : 'No se pudo imprimir: ',
    };

    return {
        CLIENT_SCRIPT      : CLIENT_SCRIPT,
        BOTON_NATIVO       : BOTON_NATIVO,
        BOTON_ETIQUETA     : BOTON_ETIQUETA,
        CAMPOS             : CAMPOS,
        CAMPOS_OCULTOS     : CAMPOS_OCULTOS,
        CAMPO_SUBSIDIARIA  : CAMPO_SUBSIDIARIA,
        CAMPO_CONFIGURACION: CAMPO_CONFIGURACION,
        SELECTOR           : SELECTOR,
        FORMATO            : FORMATO,
        CANTIDAD_INICIAL   : CANTIDAD_INICIAL,
        MENSAJES           : MENSAJES,
    };
});
