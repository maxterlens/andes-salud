/**
 * @NApiVersion 2.1
 * @NModuleScope Public
 */
define([
    "N/log",
    "N/record",
    "N/search",
    "./2win_dao"
], function (
    nLog,
    record,
    search,
    dao
) {

    const STATUS = {
        PENDIENTE: "📌 PENDIENTE",
        PROCESANDO: "🔃 PROCESANDO",
        FALLIDO: "⛔ FALLIDO",
        INYECTADO: "✅ REINYECTADO",
    }

    /* =========================
    * BUSQUEDAS
    * ========================= */

    /**
     * @function busquedaRegistrosReinyeccion - Función para realizar una busqueda en una tabla de netsuite.
     * @param {object} parametro - Parametros a usar en los filtros de la busqueda.
     * @param {string} parametro.custrecord_2w_rein_recaudacion_identifi - internalid de ambiente destino.
     * @param {string} parametro.internalid - internalid de ambiente destino.
     * @returns {Array<Object>} - Resultados de busqueda
     */
    function busquedaRegistrosReinyeccion(parametro) {
        try {
            nLog.audit("busquedaRegistrosReinyeccion - parametro", {
                parametro: parametro,
            });

            // Tipo, filtros y columnas para la busqueda
            let objSearch = {
                type: "customrecord_2w_reinyeccion_recaudacion",
                filters: [
                    ["custrecord_2w_rein_recaudacion_uuid", "is", parametro]
                    // ["internalid", "anyof", parametro]
                ],
                columns: [
                    search.createColumn({ name: "internalid", label: "internalid" }),
                    search.createColumn({ name: "custrecord_2w_rein_recaudacion_auditoria", label: "custrecord_2w_rein_recaudacion_auditoria" }),
                    search.createColumn({ name: "custrecord_2w_rein_recaudacion_uuid", label: "custrecord_2w_rein_recaudacion_uuid" }),
                    search.createColumn({ name: "custrecord_2w_rein_recaudacion_identifi", label: "custrecord_2w_rein_recaudacion_identifi" }),
                    search.createColumn({ name: "custrecord_2w_rein_recaudacion_proceso", label: "custrecord_2w_rein_recaudacion_proceso" }),
                    search.createColumn({ name: "custrecord_2w_rein_recaudacion_registro", label: "custrecord_2w_rein_recaudacion_registro" }),
                    search.createColumn({ name: "custrecord_2w_rein_recaudacion_status", label: "custrecord_2w_rein_recaudacion_status" }),
                    search.createColumn({ name: "custrecord_2w_rein_recaudacion_reinyect", label: "custrecord_2w_rein_recaudacion_reinyect" }),
                    // search.createColumn({ name: "custrecord_2w_rein_recaudacion_detalle", label: "custrecord_2w_rein_recaudacion_detalle" }),
                    search.createColumn({
                        name: "formulatext",
                        formula: "SUBSTR({custrecord_2w_rein_recaudacion_detalle}, 1, 300)",
                        label: "custrecord_2w_rein_recaudacion_detalle"
                    }),
                    search.createColumn({
                        name: "custrecord_2win_auditoria_estado",
                        join: "CUSTRECORD_2W_REIN_RECAUDACION_AUDITORIA",
                        label: "custrecord_2win_auditoria_estado"
                    }),
                    search.createColumn({
                        name: "custrecord_2win_auditoria_descripcion",
                        join: "CUSTRECORD_2W_REIN_RECAUDACION_AUDITORIA",
                        label: "custrecord_2win_auditoria_descripcion"
                    })
                ]
            };
            let filtros = `tipo: ${objSearch.type}, filtros: ${objSearch.filters}`;

            // Ejecuta busqueda paginada
            let resultado = dao.getDataSearch(objSearch);

            // Ejecutar busqueda
            nLog.audit("busquedaRegistrosReinyeccion - resultados", {
                extension: resultado.length,
                resultado: resultado
            });

            return resultado;
        } catch (error) {
            nLog.error("busquedaRegistrosReinyeccion - error", error);
            throw error;
        }
    }

    /**
     * @function busquedaRegistrosReinyeccionPendientes - Función para realizar una busqueda en una tabla de netsuite.
     * @param {object} parametro - Parametros a usar en los filtros de la busqueda.
     * @returns {Array<Object>} - Resultados de busqueda
     */
    function busquedaRegistrosReinyeccionPendientes(parametro) {
        try {
            nLog.audit("busquedaRegistrosReinyeccionPendientes - parametro", {
                parametro: parametro,
            });

            // Tipo, filtros y columnas para la busqueda
            let objSearch = {
                type: "customrecord_2w_reinyeccion_recaudacion",
                filters: [
                    ["custrecord_2w_rein_recaudacion_status", "is", STATUS.PENDIENTE]
                ],
                columns: [
                    search.createColumn({ name: "internalid", label: "internalid" }),
                    search.createColumn({ name: "custrecord_2w_rein_recaudacion_uuid", label: "custrecord_2w_rein_recaudacion_uuid" }),
                    search.createColumn({ name: "custrecord_2w_rein_recaudacion_auditoria", label: "custrecord_2w_rein_recaudacion_auditoria" }),
                    search.createColumn({ name: "custrecord_2w_rein_recaudacion_identifi", label: "custrecord_2w_rein_recaudacion_identifi" }),
                    search.createColumn({ name: "custrecord_2w_rein_recaudacion_proceso", label: "custrecord_2w_rein_recaudacion_proceso" }),
                    search.createColumn({ name: "custrecord_2w_rein_recaudacion_registro", label: "custrecord_2w_rein_recaudacion_registro" }),
                    search.createColumn({ name: "custrecord_2w_rein_recaudacion_status", label: "custrecord_2w_rein_recaudacion_status" }),
                    search.createColumn({ name: "custrecord_2w_rein_recaudacion_reinyect", label: "custrecord_2w_rein_recaudacion_reinyect" }),
                    // search.createColumn({ name: "custrecord_2w_rein_recaudacion_detalle", label: "custrecord_2w_rein_recaudacion_detalle" }),
                    search.createColumn({
                        name: "formulatext",
                        formula: "SUBSTR({custrecord_2w_rein_recaudacion_detalle}, 1, 300)",
                        label: "custrecord_2w_rein_recaudacion_detalle"
                    })
                ]
            };
            let filtros = `tipo: ${objSearch.type}, filtros: ${objSearch.filters}`;

            // Ejecuta busqueda paginada
            let resultado = dao.getDataSearch(objSearch);

            // Ejecutar busqueda
            nLog.audit("busquedaRegistrosReinyeccionPendientes - resultados", {
                extension: resultado.length,
                resultado: resultado
            });

            return resultado;
        } catch (error) {
            nLog.error("busquedaRegistrosReinyeccionPendientes - error", error);
            throw error;
        }
    }

    /* =========================
    * CREAR
    * ========================= */

    /**
     * @function crearRegistroReinyeccion - Crea un nuevo registro en base a los datos recibidos
     * @param {object} datosResumenCarga - datos necesarios para crear el registro
     * @returns {Number} - internalid de registro creado
     */
    function crearRegistroReinyeccion(datosResumenCarga) {
        try {
            nLog.debug("crearRegistroReinyeccion - datosResumenCarga", {
                datosResumenCarga: datosResumenCarga
            });

            // Crear el registro
            let crearRegistro = record.create({ type: "customrecord_2w_reinyeccion_recaudacion", isDynamic: true });

            // Definir Body fields
            crearRegistro.setValue({ fieldId: "custrecord_2w_rein_recaudacion_uuid", value: datosResumenCarga.custrecord_2w_rein_recaudacion_uuid });
            crearRegistro.setValue({ fieldId: "custrecord_2w_rein_recaudacion_auditoria", value: datosResumenCarga.custrecord_2w_rein_recaudacion_auditoria });
            if (datosResumenCarga.custrecord_2w_rein_recaudacion_identifi) {
                crearRegistro.setValue({ fieldId: "custrecord_2w_rein_recaudacion_identifi", value: datosResumenCarga.custrecord_2w_rein_recaudacion_identifi });
            }
            if (datosResumenCarga.custrecord_2w_rein_recaudacion_proceso) {
                crearRegistro.setValue({ fieldId: "custrecord_2w_rein_recaudacion_proceso", value: datosResumenCarga.custrecord_2w_rein_recaudacion_proceso });
            }
            if (datosResumenCarga.custrecord_2w_rein_recaudacion_registro) {
                crearRegistro.setValue({ fieldId: "custrecord_2w_rein_recaudacion_registro", value: datosResumenCarga.custrecord_2w_rein_recaudacion_registro });
            }
            if (datosResumenCarga.custrecord_2w_rein_recaudacion_status) {
                crearRegistro.setValue({ fieldId: "custrecord_2w_rein_recaudacion_status", value: datosResumenCarga.custrecord_2w_rein_recaudacion_status });
            }
            if (datosResumenCarga.custrecord_2w_rein_recaudacion_detalle) {
                crearRegistro.setValue({ fieldId: "custrecord_2w_rein_recaudacion_detalle", value: datosResumenCarga.custrecord_2w_rein_recaudacion_detalle });
            }

            // Guardar registro
            let internalidRegistro = crearRegistro.save({ enableSourcing: true });
            nLog.debug("crearRegistroReinyeccion - internalidRegistro", internalidRegistro);

            return internalidRegistro;
        } catch (error) {
            nLog.error("crearRegistroReinyeccion - error", error);
            throw error;
        }
    }

    /* =========================
    * ACTUALIZAR
    * ========================= */

    /**
     * @function actualizarRegistroReinyeccion - Crea un nuevo registro en base a los datos recibidos
     * @param {string} internalidRegistroResumenCarga - internalid de registro a actualizar
     * @param {object} camposParaActualizar - Campos a actualizar en el registro
     * @returns {Number} - internalid de registro creado
     */
    function actualizarRegistroReinyeccion(internalidRegistroResumenCarga, camposParaActualizar) {
        try {
            nLog.debug("actualizarRegistroReinyeccion - parametros", {
                internalidRegistroResumenCarga: internalidRegistroResumenCarga,
                camposParaActualizar: camposParaActualizar
            });

            // Submit a record with both select and multi-select fields
            const internalidRegistro = record.submitFields({
                type: "customrecord_2w_reinyeccion_recaudacion",
                id: internalidRegistroResumenCarga,
                values: camposParaActualizar
            });

            nLog.debug("actualizarRegistroReinyeccion - internalidRegistro", internalidRegistro);

            return internalidRegistro;
        } catch (error) {
            nLog.error("actualizarRegistroReinyeccion - error", error);
            throw error;
        }
    }

    return {
        busquedaRegistrosReinyeccion: busquedaRegistrosReinyeccion,
        busquedaRegistrosReinyeccionPendientes: busquedaRegistrosReinyeccionPendientes,
        crearRegistroReinyeccion: crearRegistroReinyeccion,
        actualizarRegistroReinyeccion: actualizarRegistroReinyeccion
    };
});
