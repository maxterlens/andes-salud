/**
 *@NApiVersion 2.1
 *@NScriptType ClientScript
 *@NModuleScope Public
 */
define(["N/search", "N/ui/message"], function (search, message) {
    /**
     * Function to be executed when a field is validated.
     *
     * @param {Object} scriptContext
     * @param {Record} scriptContext.currentRecord - Current form record
     * @param {string} scriptContext.sublistId - Sublist name
     * @param {string} scriptContext.fieldId - Field name
     * @param {number} scriptContext.lineNum - Line number. Will be undefined if not a sublist or matrix field.
     * @param {number} scriptContext.columnNum - Line number. Will be undefined if not a matrix field.
     */
    function validateField(scriptContext) {
        const record = scriptContext.currentRecord;
        const fieldId = scriptContext.fieldId;
        const fieldValue = record.getValue({ fieldId: fieldId });

        // Validación de duplicado en CREATE para custrecord_2win_familycode
        if (fieldId === "custrecord_2win_familycode" && scriptContext.mode === "create" && fieldValue) {
            try {
                const searchObj = search.create({
                    type: "customrecord_wmsse_item_family",
                    filters: [["custrecord_2win_familycode", "is", fieldValue]],
                    columns: ["internalid"]
                });
                const resultSet = searchObj.run();
                const results = resultSet.getRange({ start: 0, end: 1 });

                if (results.length > 0) {
                    // Mostrar mensaje de error
                    const myMsg = message.create({
                        title: "Error de Validación",
                        message: `Ya existe un registro con el código de familia '${fieldValue}'. Favor elegir otro.`,
                        type: message.Type.ERROR
                    });
                    myMsg.show();
                    return false; // Bloquea el guardado
                }
                return true;
            } catch (err) {
                console.error("validateField - error", err);
                return false;
            }
        }
        return true;
    }

    return {
        validateField: validateField
    };
});
