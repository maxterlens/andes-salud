/**
 * @NApiVersion 2.1
 * @NModuleScope Public
 */
define([
    "N/runtime",
    "../dao/2win_dao_vista_registros_auditoria",
    "../dao/2win_dao_auditoria",
], function (
    runtime,
    daoVistaRegistrosAuditoria,
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
     * @function generarVistaRegistrosAuditoria
     * @param {string} registrosAuditoria - internalid registro resumen carga archivos
     * @returns {object} - Vista para mostrar resumen
     */
    function generarVistaRegistrosAuditoria(registrosAuditoria) {
        try {
            // Ajustar objeto proceso
            proceso.etapa = generarVistaRegistrosAuditoria.name;
            proceso.scriptId = runtime.getCurrentScript().id;
            // Generar token para auditoria
            proceso.tokenProceso = daoAuditoria.obtenerToken();

            // Genera vista para resumen
            const vistaResumenCargaArchivos = daoVistaRegistrosAuditoria.generarVistaRegistrosAuditoria();

            // Poblar la vista con los registros recuperados
            const vistaResumenCargaArchivosPoblada = daoVistaRegistrosAuditoria.poblarVistaRegistrosAuditoria(vistaResumenCargaArchivos, registrosAuditoria);

            // Crear registro auditoria
            proceso.descripcionResultado = "procesado correctamente";
            // daoAuditoria.crearReporteAuditoria(proceso);

            return vistaResumenCargaArchivosPoblada;
        } catch (error) {
            log.error("generarVistaRegistrosAuditoria - error", error);

            // Crear registro auditoria
            proceso.estado = "001";
            proceso.descripcionResultado = error.message;
            // daoAuditoria.crearReporteAuditoria(proceso);

            throw error;
        }
    }

    return {
        generarVistaRegistrosAuditoria: generarVistaRegistrosAuditoria
    };
});
