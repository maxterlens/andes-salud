/**
 * @NApiVersion 2.1
 * @NScriptType MapReduceScript
 */

define([
    'N/file',
    'N/query',
    'N/record',
    'N/runtime',
    'N/log'
], (
    file,
    query,
    record,
    runtime,
    log
) => {

    /**
     * Lee el CSV y retorna un arreglo con todos los externalIds.
     * Cada elemento del arreglo se convierte en una invocación de map.
     */
    function getInputData() {

        const script = runtime.getCurrentScript();

        const fileId = script.getParameter({ name: 'custscript_as_elm_cl_csv_idfile' });

        if (!fileId) {
            throw new Error('Parámetro custscript_csv_file no recibido');
        }

        const lines = file.load({ id: fileId }).getContents().split(/\r?\n/);

        const externalIds = [];

        for (let i = 0; i < lines.length; i++) {

            const line = lines[i].trim();

            if (!line) continue;

            if (i === 0 && line.toLowerCase() === 'externalid') continue;

            externalIds.push(line);
        }

        log.audit('getInputData', `Total externalIds: ${externalIds.length}`);

        return externalIds;
    }

    /**
     * Por cada externalId:
     * 1. Busca el internalId del customer via SuiteQL
     * 2. Si existe, lo elimina
     */
    function map(context) {

        const externalId = context.value;

        const sql = `
            SELECT id
            FROM customer
            WHERE externalid = '${externalId}'
        `;

        let results;

        try {
            results = query.runSuiteQL({ query: sql }).asMappedResults();
        } catch (e) {
            log.error(`map | SuiteQL error [${externalId}]`, e.message);
            return;
        }

        if (!results.length) {
            log.debug('map | No encontrado', `externalId: ${externalId}`);
            return;
        }

        const internalId = Number(results[0].id);

        try {
            record.delete({ type: record.Type.CUSTOMER, id: internalId });
            log.debug('map | Eliminado', `externalId: ${externalId} | internalId: ${internalId}`);
        } catch (e) {
            log.error(`map | Error eliminando Customer ${internalId} [${externalId}]`, e.message);
        }
    }

    return {
        getInputData,
        map
    };

});