/**
 * @NApiVersion 2.1
 * @NScriptType ClientScript
 * @NModuleScope SameAccount
 */
define(["N/currentRecord"], function (currentRecord) {
    /**
     * Selecciona o deselecciona todos los checkboxes de la lista
     */
    function seleccionarTodos() {
        try {
            const form = currentRecord.get();
            const numLineas = form.getLineCount({
                sublistId: "custpage_transacciones"
            });

            // Determinar si marcar o desmarcar basado en el primer checkbox
            let marcarTodos = true;
            if (numLineas > 0) {
                const primerValor = form.getSublistValue({
                    sublistId: "custpage_transacciones",
                    fieldId: "custpage_select",
                    line: 0
                });
                marcarTodos = !(primerValor === "T" || primerValor === true);
            }

            // Marcar o desmarcar todos
            for (let i = 0; i < numLineas; i++) {
                form.selectLine({
                    sublistId: "custpage_transacciones",
                    line: i
                });

                form.setCurrentSublistValue({
                    sublistId: "custpage_transacciones",
                    fieldId: "custpage_select",
                    value: marcarTodos
                });

                form.commitLine({
                    sublistId: "custpage_transacciones"
                });
            }

            // Actualizar texto del botón
            const btnSeleccionarTodo = document.getElementById("custpage_btn_seleccionar_todo");
            if (btnSeleccionarTodo) {
                btnSeleccionarTodo.value = marcarTodos ? "Deseleccionar Todo" : "Seleccionar Todo";
            }
        } catch (e) {
            alert(`Error al seleccionar todos: ${e.message}`);
        }
    }

    /**
     * Confirma la eliminación de transacciones seleccionadas
     * @param {Object} scriptContext - Contexto del script
     */
    function confirmarEliminacion() {
        const form = currentRecord.get();

        // Verificar si hay transacciones seleccionadas
        let seleccionadas = 0;
        try {
            const numLineas = form.getLineCount({
                sublistId: "custpage_transacciones"
            });

            for (let i = 0; i < numLineas; i++) {
                const seleccionada = form.getSublistValue({
                    sublistId: "custpage_transacciones",
                    fieldId: "custpage_select",
                    line: i
                });

                if (seleccionada === "T" || seleccionada === true) {
                    seleccionadas++;
                }
            }
        } catch (e) {
            // Si no hay sublist, mostrar mensaje de error
            alert("No hay transacciones para eliminar");
            return false;
        }

        if (seleccionadas === 0) {
            alert("Debe seleccionar al menos una transacción para eliminar.");
            return false;
        }

        // Confirmar eliminación
        const mensaje = `¿Está seguro que desea eliminar ${seleccionadas} transacción(es)?\n\nEsta acción no se puede deshacer.`;

        if (confirm(mensaje)) {
            // Establecer el campo oculto para indicar que es una eliminación
            try {
                form.setValue({
                    fieldId: "custpage_es_eliminacion",
                    value: "T"
                });
                // eslint-disable-next-line no-undef
                setWindowChanged(window, false);
                document.getElementById("submitter").click();
            } catch (e) {
                // Si hay error al establecer el campo, continuar de todos modos
                console.log(`No se pudo establecer el campo oculto: ${e.message}`);
            }

            // Retornar true para permitir el envío normal del formulario
            return true;
        }

        return false;
    }

    /**
     * Maneja el cambio de campos en el formulario
     * @param {Object} scriptContext - Contexto del script
     */
    function fieldChanged(scriptContext) {
        const fieldId = scriptContext.fieldId;

        // Si cambia el selector de flujo, redirigir cambiando el parámetro en la URL
        if (fieldId === "custpage_flujo") {
            const currentRecord = scriptContext.currentRecord;
            const flujoSeleccionado = currentRecord.getValue({
                fieldId: "custpage_flujo"
            });

            // Obtener URL actual
            let url = window.location.href;

            // Crear o actualizar el parámetro custpage_flujo
            const paramName = "custpage_flujo";
            const paramValue = flujoSeleccionado;

            // Verificar si el parámetro ya existe en la URL
            if (url.indexOf(`${paramName}=`) !== -1) {
                // Reemplazar el valor existente
                url = url.replace(new RegExp(`${paramName}=([^&]*)`), `${paramName}=${paramValue}`);
            } else {
                // Agregar el parámetro
                const separator = url.indexOf("?") !== -1 ? "&" : "?";
                url = `${url + separator + paramName}=${paramValue}`;
            }
            // eslint-disable-next-line no-undef
            setWindowChanged(window, false);
            // Redirigir a la nueva URL
            window.location.href = url;
        }
    }

    return {
        confirmarEliminacion,
        seleccionarTodos,
        fieldChanged: fieldChanged
    };
});
