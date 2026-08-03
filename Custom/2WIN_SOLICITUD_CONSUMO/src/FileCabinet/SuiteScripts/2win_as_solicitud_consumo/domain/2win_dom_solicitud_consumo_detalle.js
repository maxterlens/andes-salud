/**
 * @NApiVersion 2.1
 * @module ./2win_dom_solicitud_consumo_detalle.js
 * @NModuleScope Public
 */
define([
    "N/log",
    "N/runtime",
    "../dao/2win_dao_2win_solicitud_consumo_det",
    "../dao/2win_dao_2win_solicitud_consumo",
    "../dao/2win_dao_ubicacion",
    "../lib/2win_lib_auditoria",
], function (
    nLog, 
    runtime,
    daoSolicitudConsumoDetalle,
    daoSolicitudConsumo,
    daoUbicacion,
    libAuditoria,
) {
    // Variable para almacenar datos del proceso
    let proceso = {
        nombreProceso: "andessalud solicitud de consumo",
        scriptId: "",
        etapa: "",
        estado: "000",
        tokenProceso: "",
        descripcionResultado: ""
    };

    const ESTADOS = {
        ENVIO_PENDIENTE: "7",
        ENVIADA: "8",
        CERRADA: "9",
    };

    /**
     * Elimina los registros de detalle de solicitud de consumo relacionados a un registro de solicitud de consumo.
     * @param {object} registroSolicitudConsumo - Registro recueprado del context.oldRecord en evento delete de user event
     */
    function eliminarRegistrosDetalleSolicitudConsumo(registroSolicitudConsumo) {
        try {
            nLog.audit("eliminarRegistrosDetalleSolicitudConsumo - registroSolicitudConsumo", {
                registroSolicitudConsumo: registroSolicitudConsumo
            });

            // Recuperar registros de detalle
            let registrosDetalle = daoSolicitudConsumoDetalle.busquedaDetallesSolicitudConsumoPorReferencia(registroSolicitudConsumo.id);

            let registrosEliminados = [];

            registrosDetalle.forEach(detalle => {
                // Eliminar cada registro de detalle
                let internalidRegistroEliminado = daoSolicitudConsumoDetalle.eliminarRegistroDetalleSolicitudConsumo(detalle.internalid);
                registrosEliminados.push(internalidRegistroEliminado);
            });

            nLog.audit('eliminarRegistrosDetalleSolicitudConsumo - registrosEliminados', {
                extension: registrosEliminados.length,
                registrosEliminados: registrosEliminados
            });
        } catch (error) {
            nLog.error("eliminarRegistrosDetalleSolicitudConsumo - error", error);
            throw error;
        }
    }

    /**
     * Compara las líneas de la sublista entre el registro viejo y el nuevo
     * para eliminar los registros huérfanos que el usuario quitó manualmente.
     * @param {object} oldRecord - Registro antes de los cambios.
     * @param {object} newRecord - Registro con los cambios aplicados.
     */
    function procesarLineasEditadas(oldRecord, newRecord) {
        try {
            // Obtener todos los inetrnalid de registros detalle que se mantienen en el nuevo registro
            let idsEnNuevoRegistro = daoSolicitudConsumo.recuperarLineasSublistaDetalleSolictudConsumo(newRecord);

            // Obtener todos los inetrnalid de registros detalle que se mantienen en el anterior registro
            let idsEnAnteriorRegistro = daoSolicitudConsumo.recuperarLineasSublistaDetalleSolictudConsumo(oldRecord);

            // Variable para almacenar internalid de registros a eliminar
            let registrosAEliminar = [];
            
            // Comparar internalid de lineas en el registro anterior vs el nuevo registro para aislar internalid de registros a eliminar
            for (let j = 0; j < idsEnAnteriorRegistro.length; j++) {
                let idRelacionadoAnterior = idsEnAnteriorRegistro[j];

                // Si el ID estaba antes pero NO está en la lista de los que quedaron
                if (idRelacionadoAnterior && idsEnNuevoRegistro.indexOf(idRelacionadoAnterior.toString()) === -1) {
                    registrosAEliminar.push(idRelacionadoAnterior);
                };
            };
            nLog.debug("procesarLineasEditadas - registrosAEliminar", {
                extension: registrosAEliminar.length,
                registrosAEliminar: registrosAEliminar
            });

            // Ejecutar la eliminación de los registros encontrados
            let registrosEliminados = [];
            if (registrosAEliminar.length > 0) {                
                registrosAEliminar.forEach(internalid => {
                    // Eliminar cada registro de detalle
                    let internalidRegistroEliminado = daoSolicitudConsumoDetalle.eliminarRegistroDetalleSolicitudConsumo(internalid);
                    registrosEliminados.push(internalidRegistroEliminado);
                });
            };

            nLog.audit("procesarLineasEditadas - registrosEliminados", {
                extension: registrosEliminados.length,
                registrosEliminados: registrosEliminados
            })

        } catch (error) {
            nLog.error("procesarLineasEditadas - error", error);
            throw error;
        }
    }

    return {
        eliminarRegistrosDetalleSolicitudConsumo: eliminarRegistrosDetalleSolicitudConsumo,
        procesarLineasEditadas: procesarLineasEditadas
    };
});