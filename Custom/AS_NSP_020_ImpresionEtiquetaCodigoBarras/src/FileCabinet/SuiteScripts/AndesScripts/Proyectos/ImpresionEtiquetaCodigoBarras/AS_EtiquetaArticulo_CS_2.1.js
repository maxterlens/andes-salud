/**
 * AS_NSP_020 — Impresion de Etiqueta con Codigo de Barras
 *
 * CHANGELOG v1.1.0 (2026-10-02):
 * - [FIX] La libreria Zebra sale del define y se carga al pulsar el boton.
 *         En el define, NetSuite la evaluaba en el servidor al validar el CS
 *         desde clientScriptModulePath y caia con "navigator is not defined"
 *         (produccion, 2026-10-02).
 * - [FIX] pageInit vacio: sin un hook estandar NetSuite rechaza el archivo al
 *         guardarlo ("deben implantar una funcion de tipo de script").
 *
 * @NApiVersion 2.1
 * @NScriptType ClientScript
 * @NModuleScope Public
 */
define(['require', 'N/currentRecord',
        './lib/AS_EtiquetaArticuloConstants', './lib/AS_EtiquetaZpl',
        './lib/AS_EtiquetaSelector', './lib/AS_EtiquetaImpresora'],
    (require, currentRecord, CONSTANTES, etiquetaZpl, etiquetaSelector, etiquetaImpresora) => {

    // NetSuite exige al menos un hook estandar en un ClientScript 2.1; no hace nada
    const pageInit = () => {};

    const imprimirEtiquetaArticulo = async () => {
        const datos = obtenerDatosArticulo();

        log.debug({
            title  : 'ETIQUETA DATOS',
            details: 'nombre: [' + datos.nombre + ']'
                   + ' | upc: [' + datos.upc + ']',
        });

        if (!datos.upc) {
            alert(CONSTANTES.MENSAJES.SIN_UPC);

            return;
        }

        const configuracion = obtenerConfiguracion();

        if (!configuracion.formatos.length) {
            alert(CONSTANTES.MENSAJES.SIN_FORMATO);

            return;
        }

        const eleccion = await etiquetaSelector.elegir(configuracion.formatos, datos.subsidiaria);

        if (!eleccion) {
            return;
        }

        const zpl = etiquetaZpl.construir(datos, eleccion.formato, eleccion.cantidad);

        log.debug({ title: 'ETIQUETA ZPL', details: zpl });

        const libreriaCargada = await cargarLibreriaZebra();

        if (!libreriaCargada) {
            alert(CONSTANTES.MENSAJES.SIN_LIBRERIA);

            return;
        }

        etiquetaImpresora.imprimir(zpl)
            .then(mostrarResultado)
            .catch((fallo) => alert(fallo.message || fallo));
    };

    // BrowserPrint-Zebra extiende el global BrowserPrint: se cargan en orden, una despues de la otra
    const cargarLibreriaZebra = () => {
        return new Promise((resolver) => {
            require(['./lib/LibreriaZebra/BrowserPrint-3.1.250.min.js'], () => {
                require(['./lib/LibreriaZebra/BrowserPrint-Zebra-1.1.250.min.js'],
                    () => resolver(true),
                    () => resolver(false));
            }, () => resolver(false));
        });
    };

    const obtenerDatosArticulo = () => {
        const articulo = currentRecord.get();

        return {
            nombre     : articulo.getValue({ fieldId: CONSTANTES.CAMPOS_OCULTOS.NOMBRE }),
            upc        : articulo.getValue({ fieldId: CONSTANTES.CAMPOS_OCULTOS.UPC }),
            subsidiaria: articulo.getValue({ fieldId: CONSTANTES.CAMPO_SUBSIDIARIA.OCULTO }),
        };
    };

    const obtenerConfiguracion = () => {
        const texto = currentRecord.get().getValue({ fieldId: CONSTANTES.CAMPO_CONFIGURACION });

        return JSON.parse(texto);
    };

    const mostrarResultado = (resultado) => {
        log.debug({
            title  : 'ETIQUETA IMPRESA',
            details: 'impresora: ' + resultado.impresora
                   + ' | exito: ' + resultado.exito
                   + ' | mensaje: ' + resultado.mensaje,
        });

        alert(resultado.exito
            ? CONSTANTES.MENSAJES.ENVIADA + resultado.impresora
            : CONSTANTES.MENSAJES.FALLO_ENVIO + resultado.mensaje);
    };

    return {
        pageInit                : pageInit,
        imprimirEtiquetaArticulo: imprimirEtiquetaArticulo,
    };
});
