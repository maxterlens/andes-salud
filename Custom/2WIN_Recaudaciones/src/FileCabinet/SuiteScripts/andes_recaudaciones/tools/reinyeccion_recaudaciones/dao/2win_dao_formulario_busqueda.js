/**
 * @NApiVersion 2.1
 * @NModuleScope Public
 */
define([
    "N/format",
    "N/ui/message",
    "N/runtime",
    "N/ui/serverWidget",
    "N/url",
], function (
    format,
    message,
    runtime,
    serverWidget,
    url
) {

    /* =========================
    * FORMULARIO
    * ========================= */

    /**
     * @function generarFormularioBusqueda
     */
    function generarFormularioBusqueda() {
        try {
            // Crear formulario para carga de archivos
            const form = serverWidget.createForm({
                title: "Busqueda registros auditoria recaudaciones"
            });

            // --- CAMPOS ---
            const campoFecha = form.addField({
                id: "custpage_2win_reinyeccion_recaudaciones_fecha",
                type: serverWidget.FieldType.DATE,
                label: "Fecha registros auditoria",
            });

            // Agregar información/descripción de ayuda
            campoFecha.helpText = "Seleccione la fecha en la cual se buscaran registros de auditoria erroneos para el proceso de recaudaciones andessalud";

            // Asignar un valor por defecto (fecha actual)
            campoFecha.defaultValue = format.format({
                value: new Date(),
                type: format.Type.DATE
            });

            // Marcar campo como OBLIGATORIO
            campoFecha.isMandatory = true;

            // --- BOTONES ---
            form.addSubmitButton({
                label: "Buscar"
            });

            // Retornar formulario generado
            return form;
        } catch (error) {
            log.error("generarFormularioBusqueda - error", error);
            throw error;
        }
    }

    return {
        generarFormularioBusqueda: generarFormularioBusqueda,
    };
});
