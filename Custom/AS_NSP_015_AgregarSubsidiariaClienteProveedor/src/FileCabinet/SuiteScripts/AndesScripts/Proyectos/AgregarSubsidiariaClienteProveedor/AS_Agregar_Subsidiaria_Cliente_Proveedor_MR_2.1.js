/**
 * @NApiVersion 2.1
 * @NScriptType MapReduceScript
 * @NModuleScope SameAccount
 */

define([
    'N/record',
    'N/runtime',
    'N/search',
], (
    record,
    runtime,
    search,
) => {
    const currentScript = runtime.getCurrentScript();

    const subsidiariaArray = currentScript.getParameter({ name: 'custscript_as_agreg_sub_ent_subsidiaria' }) ? currentScript.getParameter({ name: 'custscript_as_agreg_sub_ent_subsidiaria' }).split(',') : '';
    const recordType = currentScript.getParameter({ name: 'custscript_as_agreg_sub_ent_tipo_entidad' });

    // ─────────────────────────────────────────────────────────────────────────
    // GET INPUT DATA
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @returns {search.Search} Objeto de búsqueda de vendors.
     */
    function getInputData() {

        log.error('getInputData | Inicio', 'Creando búsqueda de Proveedores activos');

        if (subsidiariaArray.length) {
            const vendorSearch = search.create({
                type: recordType,
                filters: [
                    ['msesubsidiary.internalid','noneof', subsidiariaArray], 
                    'AND',
                    ['isinactive', 'is', false],
                ],
                columns: [
                    'internalid',
                    'entityid'
                ]
            });
            return vendorSearch;
        }
        return []
    }

    // ─────────────────────────────────────────────────────────────────────────
    // MAP
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @param {Object} context – Contexto de la etapa Map.
     * @param {string} context.value – JSON con el resultado del search.
     */
    function map(context) {

        // ── 1. Parsear resultado del search ───────────────────────────────
        const searchResult = JSON.parse(context.value);
        const vendorId     = searchResult.id;
        const entityId     = searchResult.values?.entityid     ?? '';

        log.error('map | Procesando Proveedor', `ID: ${vendorId} | Entidad: ${entityId}`);

        // ── 2. Obtener parámetro: subsidiaria a agregar ───────────────────

        if (!subsidiariaArray.length) {
            log.error('map | Parámetro faltante', `El parámetro "${subsidiariaArray.join(',')}" no tiene valor. Se omite el proveedor ID: ${vendorId}`);
            return;
        }

        // ── 3. Cargar el record Vendor ────────────────────────────────────
        let vendorRecord;

        try {
            vendorRecord = record.load({
                type:      recordType,
                id:        vendorId,
                isDynamic: true
            });
        } catch (e) {
            log.error(`map | Error al cargar Vendor ID: ${vendorId}`, e.message);
            return;
        }

        // ── 4. Verificar si la subsidiaria ya está en submachine ──────────
        const lineCount        = vendorRecord.getLineCount({ sublistId: 'submachine' });
        let   subsidiariaExiste = false;

        for (let i = 0; i < lineCount; i++) {
            const subValue = vendorRecord.getSublistValue({
                sublistId: 'submachine',
                fieldId:   'subsidiary',
                line:      i
            });

            if (subsidiariaArray.includes(String(subValue))) {
                subsidiariaExiste = true;
                break;
            }
        }

        if (subsidiariaExiste) {
            log.error(
                'map | Subsidiaria ya registrada',
                `Vendor ID: ${vendorId} | Subsidiaria ID: ${subsidiariaArray.join(',')} — Se omite para evitar duplicado`
            );
            return;
        }

        // ── 5. Agregar nueva línea en submachine y guardar ─────────────────
        try {
            subsidiariaArray.forEach(subsidiariaId => {
                
                vendorRecord.selectNewLine({ sublistId: 'submachine' });

                vendorRecord.setCurrentSublistValue({
                    sublistId: 'submachine',
                    fieldId:   'subsidiary',
                    value:     subsidiariaId
                });

                vendorRecord.commitLine({ sublistId: 'submachine' });
            });

            const savedId = vendorRecord.save({ ignoreMandatoryFields: true, disableTriggers: true });

            log.error(
                'map | Subsidiaria agregada correctamente',
                `Vendor ID: ${savedId} | Entidad: ${entityId} | Subsidiaria ID: ${subsidiariaArray.join(',')}`
            );

        } catch (e) {
            log.error(
                `map | Error al guardar Vendor ID: ${vendorId}`,
                `Subsidiaria ID: ${subsidiariaArray.join(',')} | Error: ${e.message}`
            );
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // ENTRY POINTS
    // ─────────────────────────────────────────────────────────────────────────

    return {
        getInputData,
        map
    };

});
