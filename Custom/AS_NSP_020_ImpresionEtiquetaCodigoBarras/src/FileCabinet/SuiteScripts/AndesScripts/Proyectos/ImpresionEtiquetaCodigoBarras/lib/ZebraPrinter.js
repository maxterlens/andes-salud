/**
 * AS_NSP_020 — Impresion de Etiqueta con Codigo de Barras
 * @NApiVersion 2.1
 * @NModuleScope Public
 */
define(['./EtiquetaArticuloConstants'],
    (CONSTANTES) => {

    const imprimir = async (zpl) => {
        await cargarLibreria();

        const impresora = await buscarImpresora();

        if (!impresora) {
            throw new Error(CONSTANTES.MENSAJES.SIN_IMPRESORA);
        }

        return enviar(impresora, zpl);
    };

    let promesaLibreria = null;

    const cargarLibreria = () => {
        if (promesaLibreria) {
            return promesaLibreria;
        }

        promesaLibreria = new Promise((resolver, rechazar) => {
            const script = document.createElement('script');

            script.src     = CONSTANTES.IMPRESORA.LIBRERIA;
            script.onload  = resolver;
            script.onerror = () => rechazar(new Error(CONSTANTES.MENSAJES.SIN_LIBRERIA));

            document.head.appendChild(script);
        });

        return promesaLibreria;
    };

    const buscarImpresora = async () => {
        const zebra = await T2bPrinter.find((dispositivo) => dispositivo.manufacturer === CONSTANTES.IMPRESORA.FABRICANTE);

        return zebra || T2bPrinter.default();
    };

    const enviar = async (impresora, zpl) => {
        const respuesta = await T2bPrinter.write(impresora, zpl);

        return {
            exito    : respuesta.success,
            mensaje  : respuesta.message,
            impresora: impresora.name,
        };
    };


    return {
        precargar: cargarLibreria,
        imprimir : imprimir,
    };
});
