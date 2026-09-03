/**
 * AS_NSP_020 — Impresion de Etiqueta con Codigo de Barras
 * @NApiVersion 2.1
 * @NScriptType ClientScript
 * @NModuleScope Public
 */
define(['N/currentRecord',
        './lib/LibreriaZebra/BrowserPrint-3.1.250.min.js',
        './lib/LibreriaZebra/BrowserPrint-Zebra-1.1.250.min.js',
        './lib/AS_EtiquetaArticuloConstants', './lib/AS_EtiquetaZpl',
        './lib/AS_EtiquetaSelector', './lib/AS_EtiquetaImpresora'],
    (currentRecord, _browserPrint, _browserPrintZebra,
     CONSTANTES, etiquetaZpl, etiquetaSelector, etiquetaImpresora) => {

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

        const formato = await etiquetaSelector.elegir(
            configuracion.subsidiarias, configuracion.formatos, datos.subsidiaria);

        if (!formato) {
            return;
        }

        log.debug({ title: 'ETIQUETA FORMATO', details: formato.nombre + ' | ' + JSON.stringify(formato) });

        const zpl = etiquetaZpl.construir(datos, formato);

        log.debug({ title: 'ETIQUETA ZPL', details: zpl });

        etiquetaImpresora.imprimir(zpl)
            .then(mostrarResultado)
            .catch((fallo) => alert(fallo.message || fallo));
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
        imprimirEtiquetaArticulo: imprimirEtiquetaArticulo,
    };
});
