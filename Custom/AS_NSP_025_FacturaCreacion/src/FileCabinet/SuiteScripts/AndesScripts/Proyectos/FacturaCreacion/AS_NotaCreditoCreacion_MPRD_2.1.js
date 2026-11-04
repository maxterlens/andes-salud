/**
 * @NApiVersion 2.1
 * @NScriptType MapReduceScript
 * @NModuleScope SameAccount
 * @scriptid    customscript_as_nota_credito_creacion
 * @author      Andes Salud
 * @version     1.0.0
 * @description Crea notas de credito de venta a partir de un archivo .json del File Cabinet,
 *              cuya ruta llega en el parametro del deployment.
 */
define(['N/file', 'N/runtime', './handlers/AS_NotaCreditoCreacionHandler'],
    (file, runtime, handler) => {

    const getInputData = () => {
        const rutaArchivo = runtime.getCurrentScript().getParameter({ name: 'custscript_as_nc_archivo_json' });
        const archivo = file.load({ id: rutaArchivo });
        return JSON.parse(archivo.getContents());
    };

    const map = (context) => {
        const fila = JSON.parse(context.value);
        log.debug('REGISTRADO', fila.externalId);

        try {
            const resultado = handler.crearNotaCredito(fila);
            const identificador = resultado.numero
                ? `${resultado.numero} (Internal ID ${resultado.id})`
                : `Internal ID ${resultado.id}`;

            if (resultado.advertencia) {
                log.debug(resultado.estado,
                    `${fila.externalId} = ${identificador}. NetSuite devolvio: ${resultado.advertencia}`);
                return;
            }

            log.debug(resultado.estado, `${fila.externalId} = ${identificador}`);
        } catch (e) {
            log.error('NO CREADO', `${fila.externalId} - ${e.message}`);
        }
    };

    const summarize = (summary) => {
        let total = 0;
        summary.mapSummary.keys.iterator().each(() => {
            total++;
            return true;
        });

        log.audit('PROCESADO', `Filas recibidas: ${total}`);
    };

    return {
        getInputData: getInputData,
        map:          map,
        summarize:    summarize
    };
});
