/**
 * @NApiVersion 2.1
 * @NScriptType ClientScript
 */
define([
    "N/currentRecord",
    "N/runtime"
], function (
    currentRecord,
    runtime
) {

    /**
     * @function pageInit - Funcion para procesar evento de un registro en netsuite.
     * @param {object} context
     */
    function pageInit(context) {
        // Captura inicial metricas
        let scriptObj = runtime.getCurrentScript();
        let startUnits = scriptObj.getRemainingUsage();
        let startTime = new Date().getTime();
        try {
            // Captura final metricas
            let endTime = new Date().getTime();
            let endUnits = scriptObj.getRemainingUsage();
            let unitsUsed = startUnits - endUnits;
            let executionTime = (endTime - startTime) / 1000;
            console.log("pageInit - metricas", {
                tiempoEjecucion: executionTime,
                unidadesUsadas: unitsUsed,
                unidadesRestantes: endUnits
            });
        } catch (error) {
            console.error("pageInit - error", {
                error: error
            });
            throw error;
        }
    }

    /**
     * Selecciona o deselecciona todos los checkboxes de la lista
     */
    function seleccionarTodos() {
        try {
            // Captura inicial metricas
            let scriptObj = runtime.getCurrentScript();
            let startUnits = scriptObj.getRemainingUsage();
            let startTime = new Date().getTime();

            // Recuperar conteo de lineas
            const form = currentRecord.get();
            const numLineas = form.getLineCount({
                sublistId: "custlist_2win_vista_auditoria_resumen"
            });

            // Evaluar si marcar o desmarcar
            let marcarTodos = true;
            if (numLineas > 0) {
                const primerValor = form.getSublistValue({
                    sublistId: "custlist_2win_vista_auditoria_resumen",
                    fieldId: "custlist_2win_vista_auditoria_seleccion",
                    line: 0
                });
                marcarTodos = !(primerValor === "T" || primerValor === true);
            }

            // Iterar sobre lineas exitentes para marcar/desmarcar
            for (let i = 0; i < numLineas; i++) {
                form.selectLine({
                    sublistId: "custlist_2win_vista_auditoria_resumen",
                    line: i
                });

                form.setCurrentSublistValue({
                    sublistId: "custlist_2win_vista_auditoria_resumen",
                    fieldId: "custlist_2win_vista_auditoria_seleccion",
                    value: marcarTodos
                });

                form.commitLine({
                    sublistId: "custlist_2win_vista_auditoria_resumen"
                });
            }

            // Actualizar texto del botón
            const btnSeleccionarTodo = document.getElementById("custpage_2win_vista_auditoria_seleccionar");
            if (btnSeleccionarTodo) {
                btnSeleccionarTodo.value = marcarTodos ? "Deseleccionar Todo" : "Seleccionar Todo";
            }

            // Captura final metricas
            let endTime = new Date().getTime();
            let endUnits = scriptObj.getRemainingUsage();
            let unitsUsed = startUnits - endUnits;
            let executionTime = (endTime - startTime) / 1000;
            console.log("seleccionarTodos - metricas", {
                tiempoEjecucion: executionTime,
                unidadesUsadas: unitsUsed,
                unidadesRestantes: endUnits
            });
        } catch (error) {
            console.log("seleccionarTodos - error", error);
            alert(`Error al seleccionar todos: ${error.message}`);
        }
    }

    /**
     * Funcion para redirigir a formulario inicial
     * @param {string} urlDestino
     */
    function volverAFormularioBusqueda(urlDestino) {
        console.log("volverAFormularioBusqueda - urlDestino", {
            urlDestino: urlDestino
        });
        // Captura inicial metricas
        let scriptObj = runtime.getCurrentScript();
        let startUnits = scriptObj.getRemainingUsage();
        let startTime = new Date().getTime();
        try {
            if (urlDestino) {
                // Evita la alerta de "¿Desea salir del sitio web?" de NetSuite
                window.onbeforeunload = null;
                window.location.href = urlDestino;

                // Captura final metricas
                let endTime = new Date().getTime();
                let endUnits = scriptObj.getRemainingUsage();
                let unitsUsed = startUnits - endUnits;
                let executionTime = (endTime - startTime) / 1000;
                console.log("volverAFormularioBusqueda - metricas", {
                    tiempoEjecucion: executionTime,
                    unidadesUsadas: unitsUsed,
                    unidadesRestantes: endUnits
                });
            }
        } catch (error) {
            console.error("volverAFormularioBusqueda - error", {
                error: error
            });
            throw error;
        }
    }

    /**
     * @function recargarVistaDeResumen - Funcion para recargar vista
     */
    function recargarVistaDeResumen() {
        // Captura inicial metricas
        let scriptObj = runtime.getCurrentScript();
        let startUnits = scriptObj.getRemainingUsage();
        let startTime = new Date().getTime();
        try {
            // Evita la alerta de "¿Desea salir del sitio web?" de NetSuite
            window.onbeforeunload = null;
            window.location.reload();

            // Captura final metricas
            let endTime = new Date().getTime();
            let endUnits = scriptObj.getRemainingUsage();
            let unitsUsed = startUnits - endUnits;
            let executionTime = (endTime - startTime) / 1000;
            console.log("recargarVistaDeResumen - metricas", {
                tiempoEjecucion: executionTime,
                unidadesUsadas: unitsUsed,
                unidadesRestantes: endUnits
            });
        } catch (error) {
            console.error("recargarVistaDeResumen - error", {
                error: error
            });
            throw error;
        }
    }

    /**
     * Confirma la eliminación de transacciones seleccionadas
     * @param {Object} scriptContext - Contexto del script
     */
    function confirmarReinyeccion() {
        // Captura inicial metricas
        let scriptObj = runtime.getCurrentScript();
        let startUnits = scriptObj.getRemainingUsage();
        let startTime = new Date().getTime();

        try {
            const form = currentRecord.get();
            let seleccionadas = 0;
            try {
                // Verificar si hay transacciones seleccionadas
                const numLineas = form.getLineCount({
                    sublistId: "custlist_2win_vista_auditoria_resumen"
                });

                for (let i = 0; i < numLineas; i++) {
                    const seleccionada = form.getSublistValue({
                        sublistId: "custlist_2win_vista_auditoria_resumen",
                        fieldId: "custlist_2win_vista_auditoria_seleccion",
                        line: i
                    });

                    if (seleccionada === "T" || seleccionada === true) {
                        seleccionadas++;
                    }
                }
            } catch (e) {
                // Si no hay sublist, mostrar mensaje de error
                alert("No hay procesos para reinyectar");
                return false;
            }

            if (seleccionadas === 0) {
                alert("Debe seleccionar al menos un proceso para reinyectar.");
                return false;
            }

            // Confirmar reinyeccion
            const mensaje = `¿Está seguro que desea reinyectar ${seleccionadas} procesos?\n\nEsta acción no se puede deshacer.`;

            if (confirm(mensaje)) {
                // Establecer el campo oculto para indicar accion
                try {
                    form.setValue({
                        fieldId: "custpage_2win_vista_auditoria_es_reinyeccion",
                        value: "T"
                    });
                    // Recuperar url actual sin hash
                    const urlSinHash = window.location.href.split('#')[0];

                    // Usar la API nativa de URL del navegador para gestionar los parámetros
                    const urlObj = new URL(urlSinHash);
                    // urlObj.searchParams.set('custpage_2win_vista_auditoria_es_reinyeccion', true);

                    // Desactivar alertas nativas de NetSuite sobre abandonar la página
                    window.onbeforeunload = null;
                    document.getElementById("submitter").click();
                    // document.forms[0].submit();
                    // window.location.href = urlObj.toString();
                } catch (e) {
                    // Si hay error al establecer el campo, continuar de todos modos
                    console.log(`No se pudo establecer el campo oculto: ${e.message}`);
                }

                // Retornar true para permitir el envío normal del formulario
                return true;
            }
            // Captura final metricas
            let endTime = new Date().getTime();
            let endUnits = scriptObj.getRemainingUsage();
            let unitsUsed = startUnits - endUnits;
            let executionTime = (endTime - startTime) / 1000;
            console.log("confirmarReinyeccion - metricas", {
                tiempoEjecucion: executionTime,
                unidadesUsadas: unitsUsed,
                unidadesRestantes: endUnits
            });
        } catch (error) {
            console.error("confirmarReinyeccion - error", {
                error: error
            });
            throw error;
        }

        return false;
    }

    return {
        pageInit: pageInit,
        seleccionarTodos: seleccionarTodos,
        volverAFormularioBusqueda: volverAFormularioBusqueda,
        recargarVistaDeResumen: recargarVistaDeResumen,
        confirmarReinyeccion: confirmarReinyeccion
    };
});
