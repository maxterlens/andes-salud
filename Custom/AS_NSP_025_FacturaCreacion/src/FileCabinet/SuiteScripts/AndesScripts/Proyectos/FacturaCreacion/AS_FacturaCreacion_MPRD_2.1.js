/**
 * @NApiVersion 2.1
 * @NScriptType MapReduceScript
 * @NModuleScope SameAccount
 * @scriptid    customscript_as_factura_creacion
 * @author      Andes Salud
 * @version     1.0.2
 * @description Crea facturas de venta a partir de un archivo .json del File Cabinet, cuya ruta
 *              llega en el parametro del deployment. Location no se informa: sale obligatoria al
 *              guardar la factura y se omite con el ignoreMandatoryFields del save.
 */
define(['N/file', 'N/runtime', './handlers/AS_FacturaCreacionHandler'],
    (file, runtime, handler) => {

    const getInputData = () => {
        const rutaArchivo = runtime.getCurrentScript().getParameter({ name: 'custscript_as_fc_archivo_json' });
        const archivo = file.load({ id: rutaArchivo });
        return JSON.parse(archivo.getContents());
    };

    const map = (context) => {
        const fila = JSON.parse(context.value);
        log.debug('REGISTRADO', fila.externalId);

        try {
            const facturaId = handler.crearFactura(fila);
            log.debug('PROCESADO', `${fila.externalId} = Invoice ${facturaId}`);
        } catch (e) {
            log.error('ERROR', `${fila.externalId} - ${e.message}`);
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
