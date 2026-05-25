/**
 * @NApiVersion 2.1
 * @NScriptType ClientScript
 * @NModuleScope Public
 */
define(["N/search"], function (search) {
    /**
     * Function to be executed when a field is changed by a user or script.
     *
     * @param {Object} scriptContext
     * @param {Record} scriptContext.currentRecord - Current form record
     * @param {string} scriptContext.sublistId - Sublist name
     * @param {string} scriptContext.fieldId - Field name
     * @param {number} scriptContext.lineNum - Line number. Will be undefined if not a sublist or matrix field.
     * @param {number} scriptContext.columnNum - Line number. Will be undefined if not a matrix field.
     */
    function fieldChanged(scriptContext) {
        const record = scriptContext.currentRecord;
        const fieldId = scriptContext.fieldId;

        if (fieldId === "custrecord_2w_region_chile") {
            const regionId = record.getValue({
                fieldId: "custrecord_2w_region_chile"
            });
            if (regionId) {
                const hl7RegionId = search.lookupFields({
                    type: "customrecord_2w_regiones_chile",
                    id: regionId,
                    columns: ["custrecord_2w_regiones_chile_hl7"]
                }).custrecord_2w_regiones_chile_hl7;
                record.setValue({
                    fieldId: "state",
                    value: hl7RegionId,
                    ignoreFieldChange: true
                });
            }
        } else if (fieldId === "custrecord_2w_ciudad_chile") {
            const ciudadId = record.getValue({
                fieldId: "custrecord_2w_ciudad_chile"
            });
            if (ciudadId) {
                const hl7CiudadId = search.lookupFields({
                    type: "customrecord_2win_ciudades_chile",
                    id: ciudadId,
                    columns: ["custrecord_2wincodigosciudadeshl7"]
                }).custrecord_2wincodigosciudadeshl7;
                record.setValue({
                    fieldId: "city",
                    value: hl7CiudadId,
                    ignoreFieldChange: true
                });
            }
        } else if (fieldId === "custrecord_2win_comunas_chile") {
            const comunaId = record.getValue({
                fieldId: "custrecord_2win_comunas_chile"
            });
            if (comunaId) {
                const hl7ComunaId = search.lookupFields({
                    type: "customrecord_2w_comunas_chile",
                    id: comunaId,
                    columns: ["custrecord_2wincodigoscomunashl7"]
                }).custrecord_2wincodigoscomunashl7;
                record.setValue({
                    fieldId: "addr2",
                    value: hl7ComunaId,
                    ignoreFieldChange: true
                });
            }
        }
    }

    return {
        fieldChanged: fieldChanged
    };
});
