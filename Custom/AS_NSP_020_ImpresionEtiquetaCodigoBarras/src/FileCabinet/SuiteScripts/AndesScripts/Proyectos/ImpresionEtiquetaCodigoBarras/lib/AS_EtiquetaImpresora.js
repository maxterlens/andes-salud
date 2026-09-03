/**
 * AS_NSP_020 — Impresion de Etiqueta con Codigo de Barras
 * @NApiVersion 2.1
 * @NModuleScope Public
 */
define(['./AS_EtiquetaArticuloConstants'],
    (CONSTANTES) => {

    const imprimir = async (zpl) => {
        const impresora = await buscarImpresora();

        if (!impresora) {
            throw new Error(CONSTANTES.MENSAJES.SIN_IMPRESORA);
        }

        return enviar(impresora, zpl);
    };

    const buscarImpresora = () => {
        return new Promise((resolver) => {
            BrowserPrint.getDefaultDevice('printer', (impresora) => {
                log.debug({ title: 'ZEBRA IMPRESORA', details: 'encontrada: ' + impresora.name });
                resolver(impresora);
            }, (error) => {
                log.debug({ title: 'ZEBRA IMPRESORA', details: 'no encontrada: ' + error });
                resolver(null);
            });
        });
    };

    const enviar = (impresora, zpl) => {
        return new Promise((resolver) => {
            impresora.send(zpl,
                () => {
                    log.debug({ title: 'ZEBRA ENVIO', details: 'ok: ' + impresora.name });
                    resolver({ exito: true, mensaje: '', impresora: impresora.name });
                },
                (error) => {
                    log.debug({ title: 'ZEBRA ENVIO', details: 'error: ' + error });
                    resolver({ exito: false, mensaje: error, impresora: impresora.name });
                });
        });
    };


    return {
        imprimir: imprimir,
    };
});
