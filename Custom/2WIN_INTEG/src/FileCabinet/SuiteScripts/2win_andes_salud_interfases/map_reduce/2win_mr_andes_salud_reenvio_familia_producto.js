/**
 * @NApiVersion 2.1
 * @NScriptType MapReduceScript
 * @description Script Map/Reduce para reenvío masivo de eventos de creación de familia de producto a Andes Salud
 */
define([
    "../domain/2win_dom_familia_producto",
    "../lib/2win_lib_auditoria",
    "N/runtime",
    "N/log",
    "N/record",
    "N/search"
], function (domFamiliaProducto, libAuditoria, runtime, nLog, record, search) {
    const RECORD_TYPE = "customrecord_wmsse_item_family";
    const CUSTODIA_INTERFACE = "creacion familia_producto send in";

    /**
     * @function getInputData - Obtiene la lista de familias de producto que necesitan ser reenviadas
     * @returns {Array} - Array de IDs de registros a procesar
     */
    function getInputData() {
        try {
            nLog.audit("getInputData - Inicio", "Buscando familias de producto para reenvío masivo");

            const fechaDesdeParam = runtime.getCurrentScript().getParameter({
                name: "custscript_mr_as_reenvio_fp_desde"
            });

            const filters = [
                ["isinactive", "is", "F"]
            ];

            if (fechaDesdeParam) {
                filters.push("AND");
                filters.push(["created", "onorafter", fechaDesdeParam]);
            }

            const familiaSearch = search.create({
                type: RECORD_TYPE,
                filters: filters,
                columns: [
                    search.createColumn({ name: "internalid", label: "ID" }),
                    search.createColumn({ name: "name", label: "Nombre" }),
                    search.createColumn({ name: "custrecord_2win_familycode", label: "Código Familia" }),
                    search.createColumn({ name: "created", label: "Fecha Creación" })
                ]
            });

            const familias = [];
            let totalRegistros = 0;

            familiaSearch.run().each(function (result) {
                const recordId = result.getValue({ name: "internalid" });
                const nombre = result.getValue({ name: "name" });
                const codFamilia = result.getValue({ name: "custrecord_2win_familycode" });

                const tieneCustodiaExitosa = tieneCustodiaExitosaParaRegistro(recordId);

                if (!tieneCustodiaExitosa) {
                    familias.push({
                        recordId: recordId,
                        nombre: nombre,
                        codFamilia: codFamilia
                    });
                }

                totalRegistros++;
                return true;
            });

            nLog.audit("getInputData - Resultados", {
                totalRegistrosAnalizados: totalRegistros,
                registrosParaReenviar: familias.length,
                fechaFiltro: fechaDesdeParam || "No especificado"
            });

            if (familias.length === 0) {
                nLog.audit("getInputData - Info", "No se encontraron familias de producto que necesiten reenvío");
                return [];
            }

            return familias.map(f => f.recordId.toString());
        } catch (error) {
            nLog.error("getInputData - Error", error);
            throw error;
        }
    }

    /**
     * @function tieneCustodiaExitosaParaRegistro - Verifica si existe una custodia exitosa para el registro
     * @param {string} recordId - ID del registro de familia
     * @returns {boolean} - True si existe custodia exitosa
     */
    function tieneCustodiaExitosaParaRegistro(recordId) {
        try {
            const custodiaSearch = search.create({
                type: "customrecord_2win_andessalud_custodia",
                filters: [
                    ["custrecord_2win_as_id_registro", "is", recordId],
                    "AND",
                    ["custrecord_2win_as_interface", "contains", "creacion familia"],
                    "AND",
                    ["custrecord_2win_as_codigo_respuesta", "is", "000"]
                ],
                columns: ["internalid"]
            });

            const count = custodiaSearch.runPaged().count;
            return count > 0;
        } catch (error) {
            nLog.error("tieneCustodiaExitosaParaRegistro - Error", error);
            return false;
        }
    }

    /**
     * @function map - Procesa cada familia de producto individualmente
     * @param {Object} context - Contexto del Map
     */
    function map(context) {
        const recordId = context.key;
        let resultado = {
            recordId: recordId,
            exitoso: false,
            error: null
        };

        try {
            nLog.audit(`map - Procesando familia ID: ${recordId}`, "Iniciando eventoCreacionRegistro");

            const familiaRecord = record.load({
                type: RECORD_TYPE,
                id: recordId,
                isDynamic: false
            });

            const respuesta = domFamiliaProducto.eventoCreacionRegistro(familiaRecord);

            resultado.exitoso = true;
            resultado.respuesta = respuesta;

            nLog.audit(`map - Familia ID: ${recordId}`, "Evento procesado exitosamente");

            context.write({
                key: recordId,
                value: JSON.stringify(resultado)
            });
        } catch (error) {
            nLog.error(`map - Error procesando familia ID: ${recordId}`, error);
            resultado.error = error.message;

            context.write({
                key: recordId,
                value: JSON.stringify(resultado)
            });
        }
    }

    /**
     * @function summarize - Resume y registra los resultados de la ejecución
     * @param {Object} summary - Resumen de ejecución del Map/Reduce
     */
    function summarize(summary) {
        const proceso = {
            nombreProceso: "Interfaces Andes Salud - Reenvío Masivo Familia Producto",
            scriptId: "2win_mr_andes_salud_reenvio_familia_producto",
            etapa: "summarize",
            estado: "000",
            tokenProceso: "",
            descripcionResultado: ""
        };

        try {
            nLog.audit("summarize - Inicio", "Procesando resultados finales");

            const resultados = {
                total: 0,
                exitosos: 0,
                fallidos: 0,
                errores: []
            };

            if (summary.output) {
                summary.output.iterator().each(function (key, value) {
                    try {
                        const resultado = JSON.parse(value);
                        resultados.total++;

                        if (resultado.exitoso) {
                            resultados.exitosos++;
                        } else {
                            resultados.fallidos++;
                            resultados.errores.push({
                                recordId: resultado.recordId,
                                error: resultado.error
                            });
                        }
                    } catch (parseError) {
                        nLog.error("summarize - Error parseando resultado", parseError);
                        resultados.fallidos++;
                    }
                    return true;
                });
            }

            proceso.descripcionResultado = `
                Total procesados: ${resultados.total}
                Exitosos: ${resultados.exitosos}
                Fallidos: ${resultados.fallidos}
            `.trim();

            nLog.audit("summarize - Estadísticas", proceso.descripcionResultado);

            if (resultados.fallidos > 0) {
                nLog.error("summarize - Errores detectados", JSON.stringify(resultados.errores));
            }

            proceso.scriptId = runtime.getCurrentScript().id;
            proceso.tokenProceso = libAuditoria.obtenerToken();
            libAuditoria.crearReporteAuditoria(proceso);
        } catch (error) {
            nLog.error("summarize - Error fatal", error);
            proceso.estado = "001";
            proceso.descripcionResultado = error.message;
            libAuditoria.crearReporteAuditoria(proceso);
        }
    }

    return {
        getInputData: getInputData,
        map: map,
        summarize: summarize
    };
});