/**
 * @NApiVersion 2.1
 * @NModuleScope Public
 */
define(["N/ui/serverWidget"], function (serverWidget) {
    /**
     * Crea una pestaña en el formulario
     * @param {Form} form - El objeto del formulario
     * @param {string} id - ID de la pestaña
     * @param {string} label - Etiqueta visible
     * @param {string} [parentTab] - ID de la pestaña padre (opcional)
     */
    function createTab(form, id, label, parentTab) {
        form.addTab({
            id: id,
            label: label,
            tab: parentTab
        });
    }

    /**
     * Crea una subpestaña en el formulario
     * @param {Form} form - El objeto del formulario
     * @param {string} id - ID de la subpestaña
     * @param {string} label - Etiqueta visible
     * @param {string} parentTab - ID de la pestaña padre
     */
    function createSubtab(form, id, label, parentTab) {
        form.addSubtab({
            id: id,
            label: label,
            tab: parentTab
        });
    }

    /**
     * Crea un campo en el formulario
     * @param {Form} form - El objeto del formulario
     * @param {string} id - ID del campo
     * @param {string} type - Tipo de campo (serverWidget.FieldType)
     * @param {string} label - Etiqueta visible
     * @param {string} container - ID del contenedor (tab/subtab)
     * @param {Object} [options] - Opciones adicionales
     * @returns {Field}
     */
    function createField(form, id, type, label, container, options) {
        const fieldOptions = Object.assign({ id: id, type: type, label: label, container: container }, options || {});
        return form.addField(fieldOptions);
    }

    /**
     * Crea una sublista en el formulario
     * @param {Form} form - El objeto del formulario
     * @param {string} id - ID de la sublista
     * @param {string} type - Tipo de sublista (serverWidget.SublistType)
     * @param {string} label - Etiqueta visible
     * @param {string} tab - ID de la pestaña contenedor
     * @returns {Sublist}
     */
    function createSublist(form, id, type, label, tab) {
        return form.addSublist({
            id: id,
            type: type,
            label: label,
            tab: tab
        });
    }

    /**
     * Oculta campos nativos del formulario
     * @param {Form} form - El objeto del formulario
     * @param {Array} fieldIds - Array de IDs de campos a ocultar
     * @param {Array} excludeFields - Array de campos a excluir
     */
    function hideNativeFields(form, fieldIds, excludeFields) {
        fieldIds.forEach(function (fieldId) {
            if (excludeFields && excludeFields.includes(fieldId)) return;
            try {
                const field = form.getField({ id: fieldId });
                if (field) {
                    field.updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN });
                }
            } catch (e) {
                // Campo no encontrado, continuar
            }
        });
    }

    /**
     * Asigna valores a campos del formulario desde lookupFields
     * @param {Form} form - El objeto del formulario
     * @param {Array} custIds - Array de IDs de campos personalizados
     * @param {Array} recordFields - Array de IDs de campos del registro
     * @param {Object} valueFields - Objeto con valores del lookupFields
     * @param {Object} nLog - Objeto de log
     */
    function setFieldValues(form, custIds, recordFields, valueFields, nLog) {
        custIds.forEach(function (custId, index) {
            const field = form.getField({ id: custId });
            if (field && valueFields[recordFields[index]] !== undefined) {
                try {
                    let value = valueFields[recordFields[index]];
                    if (Array.isArray(value)) {
                        value = value.length > 0 ? value[0].text : "";
                    }
                    if (value === true) {
                        value = "T";
                    } else if (value === false) {
                        value = "F";
                    }
                    field.defaultValue = value || "";
                } catch (error) {
                    nLog.error("Error setting field value", `Field ID: ${custId}, Error: ${error}`);
                }
            }
        });
    }

    return {
        createTab: createTab,
        createSubtab: createSubtab,
        createField: createField,
        createSublist: createSublist,
        hideNativeFields: hideNativeFields,
        setFieldValues: setFieldValues
    };
});
