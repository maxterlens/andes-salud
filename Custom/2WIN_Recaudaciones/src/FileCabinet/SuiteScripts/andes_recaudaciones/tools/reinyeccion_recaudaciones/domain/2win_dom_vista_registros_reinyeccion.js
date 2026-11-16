/**
 * @NApiVersion 2.1
 * @NModuleScope Public
 */
define([
    "N/runtime",
    "../dao/2win_dao_2w_reinyeccion_recaudacion",
    "../dao/2win_dao_vista_registros_reinyeccion"
], function (
    runtime,
    daoReinyeccion,
    daoVistaRegistrosReinyeccion
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
     * @function generarVistaRegistrosReinyeccion
     * @param {string} identificadorLote - internalid registro resumen carga archivos
     * @returns {object} - Vista para mostrar resumen
     */
    function generarVistaRegistrosReinyeccion(identificadorLote) {
        try {
            // Ajustar objeto proceso
            proceso.etapa = generarVistaRegistrosReinyeccion.name;
            proceso.scriptId = runtime.getCurrentScript().id;
            // Generar token para auditoria
            // proceso.tokenProceso = daoReinyeccion.obtenerToken();

            // Recuperar registros reinyeccion
            let registrosReinyeccion = daoReinyeccion.busquedaRegistrosReinyeccion(identificadorLote);

            // Genera vista para resumen
            const vistaRegistrosReinyeccion = daoVistaRegistrosReinyeccion.generarVistaRegistrosReinyeccion();

            // Poblar la vista con los registros recuperados
            const vistaResumenCargaArchivosPoblada = daoVistaRegistrosReinyeccion.poblarVistaRegistrosReinyeccion(vistaRegistrosReinyeccion, registrosReinyeccion);

            // Crear registro auditoria
            proceso.descripcionResultado = "procesado correctamente";
            // daoReinyeccion.crearReporteAuditoria(proceso);

            return vistaResumenCargaArchivosPoblada;
        } catch (error) {
            log.error("generarVistaRegistrosReinyeccion - error", error);

            // Crear registro auditoria
            proceso.estado = "001";
            proceso.descripcionResultado = error.message;
            // daoReinyeccion.crearReporteAuditoria(proceso);

            throw error;
        }
    }

    return {
        generarVistaRegistrosReinyeccion: generarVistaRegistrosReinyeccion
    };
});
