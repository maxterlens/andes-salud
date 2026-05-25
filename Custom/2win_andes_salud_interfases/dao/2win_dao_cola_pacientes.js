/**
 * @NApiVersion 2.1
 * @NModuleScope Public
 * @description DAO para gestionar la cola de pacientes en carga masiva
 */
define(["N/search", "N/log"], function (search, nLog) {
    /**
     * @function buscarPacientesPendientes - Busca pacientes pendientes de procesar
     * @param {Number} limite - Límite de resultados (opcional, por defecto 50)
     * @returns {Array} - Array de registros de custodia pendientes
     */
    function buscarPacientesPendientes(limite) {
        try {
            nLog.audit("buscarPacientesPendientes - inicio", "Buscando pacientes pendientes");

            const objSearch = {
                type: "customrecord_2win_andessalud_custodia",
                filters: [
                    ["custrecord_2win_as_interface", "is", "carga masiva pacientes"],
                    "AND",
                    ["custrecord_2win_as_codigo_respuesta", "is", "PENDIENTE"]
                ],
                columns: [
                    search.createColumn({ name: "internalid", label: "internalid" }),
                    search.createColumn({ name: "externalid", label: "externalid" }),
                    search.createColumn({ name: "custrecord_2win_as_datos_entrada", label: "datosEntrada" }),
                    search.createColumn({ name: "custrecord_2win_as_codigo_respuesta", label: "estado" }),
                    search.createColumn({ name: "custrecord_2win_as_fecha_mensaje", label: "fechaMensaje" }),
                    search.createColumn({ name: "custrecord_2win_as_reintentos", label: "reintentos" })
                ]
            };

            const searchObj = search.create(objSearch);
            const resultSet = searchObj.run();

            // Paginar resultados
            const pageSize = limite || 50;
            const resultados = [];
            let startIndex = 0;
            let page = resultSet.getRange({
                start: startIndex,
                end: startIndex + pageSize
            });

            while (page && page.length > 0) {
                for (let i = 0; i < page.length; i++) {
                    resultados.push({
                        internalid: page[i].getValue("internalid"),
                        externalid: page[i].getValue("externalid"),
                        datosEntrada: page[i].getValue("custrecord_2win_as_datos_entrada"),
                        estado: page[i].getValue("custrecord_2win_as_codigo_respuesta"),
                        fechaMensaje: page[i].getValue("custrecord_2win_as_fecha_mensaje"),
                        reintentos: page[i].getValue("custrecord_2win_as_reintentos")
                    });
                }

                if (resultados.length >= pageSize) break;

                startIndex += pageSize;
                page = resultSet.getRange({
                    start: startIndex,
                    end: startIndex + pageSize
                });
            }

            nLog.audit("buscarPacientesPendientes - resultados", {
                totalEncontrados: resultados.length
            });

            return resultados;
        } catch (error) {
            nLog.error("buscarPacientesPendientes - error", error);
            throw error;
        }
    }

    /**
     * @function buscarPacientesConError - Busca pacientes con error de procesamiento
     * @param {Number} limite - Límite de resultados (opcional, por defecto 50)
     * @returns {Array} - Array de registros de custodia con error
     */
    function buscarPacientesConError(limite) {
        try {
            nLog.audit("buscarPacientesConError - inicio", "Buscando pacientes con error");

            const objSearch = {
                type: "customrecord_2win_andessalud_custodia",
                filters: [
                    ["custrecord_2win_as_interface", "is", "carga masiva pacientes"],
                    "AND",
                    ["custrecord_2win_as_codigo_respuesta", "is", "001"]
                ],
                columns: [
                    search.createColumn({ name: "internalid", label: "internalid" }),
                    search.createColumn({ name: "externalid", label: "externalid" }),
                    search.createColumn({ name: "custrecord_2win_as_datos_entrada", label: "datosEntrada" }),
                    search.createColumn({ name: "custrecord_2win_as_codigo_respuesta", label: "estado" }),
                    search.createColumn({ name: "custrecord_2win_as_respuesta", label: "respuesta" }),
                    search.createColumn({ name: "custrecord_2win_as_reintentos", label: "reintentos" }),
                    search.createColumn({ name: "custrecord_2win_as_fecha_proceso", label: "fechaProceso" })
                ]
            };

            const searchObj = search.create(objSearch);
            const resultSet = searchObj.run();

            // Paginar resultados
            const pageSize = limite || 50;
            const resultados = [];
            let startIndex = 0;
            let page = resultSet.getRange({
                start: startIndex,
                end: startIndex + pageSize
            });

            while (page && page.length > 0) {
                for (let i = 0; i < page.length; i++) {
                    resultados.push({
                        internalid: page[i].getValue("internalid"),
                        externalid: page[i].getValue("externalid"),
                        datosEntrada: page[i].getValue("custrecord_2win_as_datos_entrada"),
                        estado: page[i].getValue("custrecord_2win_as_codigo_respuesta"),
                        respuesta: page[i].getValue("custrecord_2win_as_respuesta"),
                        reintentos: page[i].getValue("custrecord_2win_as_reintentos"),
                        fechaProceso: page[i].getValue("custrecord_2win_as_fecha_proceso")
                    });
                }

                if (resultados.length >= pageSize) break;

                startIndex += pageSize;
                page = resultSet.getRange({
                    start: startIndex,
                    end: startIndex + pageSize
                });
            }

            nLog.audit("buscarPacientesConError - resultados", {
                totalEncontrados: resultados.length
            });

            return resultados;
        } catch (error) {
            nLog.error("buscarPacientesConError - error", error);
            throw error;
        }
    }

    /**
     * @function obtenerEstadisticasCola - Obtiene estadísticas de la cola de pacientes
     * @returns {Object} - Objeto con estadísticas de la cola
     */
    function obtenerEstadisticasCola() {
        try {
            nLog.audit("obtenerEstadisticasCola - inicio", "Calculando estadísticas de cola");

            const stats = {
                pendientes: 0,
                procesando: 0,
                exitosos: 0,
                errores: 0,
                total: 0
            };

            // Buscar por cada estado
            const estados = ["PENDIENTE", "PROCESANDO", "000", "001"];

            estados.forEach(function (estado) {
                const searchObj = search.create({
                    type: "customrecord_2win_andessalud_custodia",
                    filters: [
                        ["custrecord_2win_as_interface", "is", "carga masiva pacientes"],
                        "AND",
                        ["custrecord_2win_as_codigo_respuesta", "is", estado]
                    ],
                    columns: [search.createColumn({ name: "internalid", label: "count", aggregate: "COUNT" })]
                });

                const resultSet = searchObj.run();
                const result = resultSet.getRange(0, 1);

                if (result && result.length > 0) {
                    const count = result[0].getValue("count") || 0;
                    stats.total += parseInt(count, 10);

                    switch (estado) {
                        case "PENDIENTE":
                            stats.pendientes = parseInt(count, 10);
                            break;
                        case "PROCESANDO":
                            stats.procesando = parseInt(count, 10);
                            break;
                        case "000":
                            stats.exitosos = parseInt(count, 10);
                            break;
                        case "001":
                            stats.errores = parseInt(count, 10);
                            break;
                    }
                }
            });

            nLog.audit("obtenerEstadisticasCola - resultados", stats);

            return stats;
        } catch (error) {
            nLog.error("obtenerEstadisticasCola - error", error);
            throw error;
        }
    }

    /**
     * @function buscarPacientePorCustodiaId - Busca un paciente por su ID de custodia
     * @param {Number} custodiaId - ID del registro de custodia
     * @returns {Object|null} - Objeto con datos del paciente o null si no existe
     */
    function buscarPacientePorCustodiaId(custodiaId) {
        try {
            nLog.debug("buscarPacientePorCustodiaId - custodiaId", custodiaId);

            const searchObj = search.create({
                type: "customrecord_2win_andessalud_custodia",
                filters: [["internalid", "is", custodiaId]],
                columns: [
                    search.createColumn({ name: "internalid", label: "internalid" }),
                    search.createColumn({ name: "externalid", label: "externalid" }),
                    search.createColumn({ name: "custrecord_2win_as_datos_entrada", label: "datosEntrada" }),
                    search.createColumn({ name: "custrecord_2win_as_codigo_respuesta", label: "estado" }),
                    search.createColumn({ name: "custrecord_2win_as_respuesta", label: "respuesta" }),
                    search.createColumn({ name: "custrecord_2win_as_reintentos", label: "reintentos" }),
                    search.createColumn({ name: "custrecord_2win_as_fecha_proceso", label: "fechaProceso" }),
                    search.createColumn({ name: "custrecord_2win_as_tiempo_proceso", label: "tiempoProceso" })
                ]
            });

            const resultSet = searchObj.run();
            const result = resultSet.getRange(0, 1);

            if (result && result.length > 0) {
                return {
                    internalid: result[0].getValue("internalid"),
                    externalid: result[0].getValue("externalid"),
                    datosEntrada: result[0].getValue("custrecord_2win_as_datos_entrada"),
                    estado: result[0].getValue("custrecord_2win_as_codigo_respuesta"),
                    respuesta: result[0].getValue("custrecord_2win_as_respuesta"),
                    reintentos: result[0].getValue("custrecord_2win_as_reintentos"),
                    fechaProceso: result[0].getValue("custrecord_2win_as_fecha_proceso"),
                    tiempoProceso: result[0].getValue("custrecord_2win_as_tiempo_proceso")
                };
            }

            return null;
        } catch (error) {
            nLog.error("buscarPacientePorCustodiaId - error", error);
            throw error;
        }
    }

    return {
        buscarPacientesPendientes: buscarPacientesPendientes,
        buscarPacientesConError: buscarPacientesConError,
        obtenerEstadisticasCola: obtenerEstadisticasCola,
        buscarPacientePorCustodiaId: buscarPacientePorCustodiaId
    };
});