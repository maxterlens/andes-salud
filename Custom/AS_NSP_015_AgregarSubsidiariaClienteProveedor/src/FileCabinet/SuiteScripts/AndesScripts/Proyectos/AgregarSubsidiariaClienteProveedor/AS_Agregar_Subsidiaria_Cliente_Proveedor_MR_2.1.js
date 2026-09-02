/**
 * @NApiVersion 2.1
 * @NScriptType MapReduceScript
 * @NModuleScope SameAccount
 */

define([
    'N/record',
    'N/runtime',
    'N/query',
], (
    record,
    runtime,
    query,
) => {
    const currentScript = runtime.getCurrentScript();

    const subsidiariaArray = currentScript.getParameter({ name: 'custscript_as_agreg_sub_ent_subsidiaria' }) ? currentScript.getParameter({ name: 'custscript_as_agreg_sub_ent_subsidiaria' }).split(',') : [];
    const recordType = currentScript.getParameter({ name: 'custscript_as_agreg_sub_ent_tipo_entidad' });

    // ─────────────────────────────────────────────────────────────────────────
    // GET INPUT DATA
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @returns {number[]} Arreglo de IDs enteros de vendors sin las subsidiarias indicadas.
     */
    function getInputData() {

        log.error('getInputData | Inicio', `Ejecutando consulta SQL paginada. Subsidiarias: ${subsidiariaArray.join(',')}`);

        if (!subsidiariaArray.length) {
            log.error('getInputData | Parámetro faltante', 'El parámetro custscript_as_agreg_sub_ent_subsidiaria no tiene valor.');
            return [];
        }

        const sql = `
            SELECT
                v.id
            FROM
                ${recordType} v
            WHERE
                NOT EXISTS (
                    SELECT 1
                    FROM ${recordType}SubsidiaryMap vs
                    WHERE vs.entity = v.id
                      AND vs.subsidiary IN (${subsidiariaArray.join(',')})
                )
        `;
        log.error('sql', sql);

        const vendorIds = [];
        let   stopPaging = false;

        const resultIterator = query.runSuiteQLPaged({
            query:    sql,
            pageSize: 1000
        }).iterator();

        resultIterator.each(function (page) {
            const pageIterator = page.value.data.iterator();
            pageIterator.each(function (row) {

                const remainingUsage = currentScript.getRemainingUsage();
                if (remainingUsage <= 9000) {
                    log.error(
                        'getInputData | Límite de governance alcanzado',
                        `Unidades restantes: ${remainingUsage}. Se detiene la iteración con ${vendorIds.length} registros cargados.`
                    );
                    stopPaging = true;
                    return false; // corta el iterador de filas
                }

                vendorIds.push(parseInt(row.value.getValue(0), 10));
                return true;
            });
            return !stopPaging; // corta el iterador de páginas si se alcanzó el límite
        });

        log.error('getInputData | Registros encontrados', `Total: ${vendorIds.length}`);

        return vendorIds;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // MAP
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @param {Object} context – Contexto de la etapa Map.
     * @param {string} context.value – ID entero del vendor.
     */
    function map(context) {

        // ── 1. Obtener el ID del vendor ───────────────────────────────────
        const entityId = JSON.parse(context.value);

        //log.error('map | Procesando Proveedor', `ID: ${entityId}`);

        // ── 2. Validar parámetro de subsidiaria ───────────────────────────
        if (!subsidiariaArray.length) {
            log.error('map | Parámetro faltante', `No hay subsidiarias configuradas. Se omite el proveedor ID: ${entityId}`);
            return;
        }

        // ── 3. Cargar el record Vendor ────────────────────────────────────
        let entityRecord;

        try {
            entityRecord = record.load({
                type:      recordType,
                id:        entityId,
                isDynamic: true
            });
        } catch (e) {
            log.error(`map | Error al cargar Vendor ID: ${entityId}`, e.message);
            return;
        }

        // ── 4. Verificar si la subsidiaria ya está en submachine ──────────
        const lineCount         = entityRecord.getLineCount({ sublistId: 'submachine' });
        let   subsidiariaExiste = false;

        for (let i = 0; i < lineCount; i++) {
            const subValue = entityRecord.getSublistValue({
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
            /*log.error(
                'map | Subsidiaria ya registrada',
                `Vendor ID: ${entityId} | Subsidiaria ID: ${subsidiariaArray.join(',')} — Se omite para evitar duplicado`
            );*/
            return;
        }

        // ── 5. Agregar nueva línea en submachine y guardar ─────────────────
        try {
            subsidiariaArray.forEach(subsidiariaId => {

                entityRecord.selectNewLine({ sublistId: 'submachine' });

                entityRecord.setCurrentSublistValue({
                    sublistId: 'submachine',
                    fieldId:   'subsidiary',
                    value:     subsidiariaId
                });

                entityRecord.commitLine({ sublistId: 'submachine' });
            });

            const savedId = entityRecord.save({ ignoreMandatoryFields: true, disableTriggers: true });

            /*log.error(
                'map | Subsidiaria agregada correctamente',
                `Vendor ID: ${savedId} | Subsidiaria ID: ${subsidiariaArray.join(',')}`
            );*/

        } catch (e) {
            log.error(
                `map | Error al guardar Vendor ID: ${entityId}`,
                `Subsidiaria ID: ${subsidiariaArray.join(',')} | Error: ${e.message}`
            );
        }
    }

    function summarize(context) {
        log.error('Summarize', 'END');
    }

    // ─────────────────────────────────────────────────────────────────────────
    // ENTRY POINTS
    // ─────────────────────────────────────────────────────────────────────────

    return {
        getInputData,
        map,
        summarize
    };

});
