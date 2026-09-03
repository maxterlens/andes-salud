/**
 * AS_NSP_020 — Impresion de Etiqueta con Codigo de Barras
 * @NApiVersion 2.1
 * @NScriptType ClientScript
 * @NModuleScope Public
 */
define(['N/currentRecord',
        './lib/LibreriaZebra/BrowserPrint-3.1.250.min.js',
        './lib/LibreriaZebra/BrowserPrint-Zebra-1.1.250.min.js',
        './lib/EtiquetaArticuloConstants', './lib/EtiquetaZpl', './lib/ZebraPrinter'],
    (currentRecord, _browserPrint, _browserPrintZebra, CONSTANTES, etiquetaZpl, zebraPrinter) => {

    const imprimirEtiquetaArticulo = () => {
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

        const zpl = etiquetaZpl.construir(datos);

        log.debug({ title: 'ETIQUETA ZPL', details: zpl });

        zebraPrinter.imprimir(zpl)
            .then(mostrarResultado)
            .catch((fallo) => alert(fallo.message || fallo));
    };

    const obtenerDatosArticulo = () => {
        const articulo = currentRecord.get();

        return {
            nombre: articulo.getValue({ fieldId: CONSTANTES.CAMPOS_OCULTOS.NOMBRE }),
            upc   : articulo.getValue({ fieldId: CONSTANTES.CAMPOS_OCULTOS.UPC }),
        };
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
        imprimirEtiquetaArticulo: imprimirEtiquetaArticulo,
    };
});
