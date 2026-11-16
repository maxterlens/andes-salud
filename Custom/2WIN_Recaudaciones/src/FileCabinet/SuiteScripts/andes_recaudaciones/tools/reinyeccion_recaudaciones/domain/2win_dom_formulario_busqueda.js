/**
 * @NApiVersion 2.1
 * @NModuleScope Public
 */
define([
    "N/log",
    "N/runtime",
    "../dao/2win_dao_formulario_busqueda",
    "../dao/2win_dao_auditoria",
], function (
    log,
    runtime,
    daoFormularioBusqueda,
    daoAuditoria
) {
    // Variable para almacenar datos del proceso
    let proceso = {
        nombreProceso: "reinyeccion recaudacion",
        scriptId: "",
        etapa: "",
        estado: "000",
        tokenProceso: "",
        descripcionResultado: ""
    };

    /**
     * Función para procesar evento de un registro en netsuite.
     * @returns {Object} - Formulario con campos requeridos.
     */
    function generarFormularioBusqueda() {
        try {
            // Ajustar objeto proceso
            proceso.etapa = generarFormularioBusqueda.name;
            proceso.scriptId = runtime.getCurrentScript().id;
            // Generar token para auditoria
            proceso.tokenProceso = daoAuditoria.obtenerToken();

            // Genera formulario para carga busqueda de registros auditoria
            const formularioCargaArchivos = daoFormularioBusqueda.generarFormularioBusqueda();

            // Crear registro auditoria
            proceso.descripcionResultado = "procesado correctamente";
            // daoAuditoria.crearReporteAuditoria(proceso);

            return formularioCargaArchivos;
        } catch (error) {
            log.error("generarFormularioBusqueda - error", error);

            // Crear registro auditoria
            proceso.estado = "001";
            proceso.descripcionResultado = error.message;
            // daoAuditoria.crearReporteAuditoria(proceso);

            throw error;
        }
    }

    return {
        generarFormularioBusqueda: generarFormularioBusqueda
    };
});
