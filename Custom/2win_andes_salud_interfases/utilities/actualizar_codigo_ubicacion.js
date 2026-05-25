/**
 * @NApiVersion 2.1
 * @NScriptType Suitelet
 * @description Script para actualizar ubicaciones con custrecord_2w_codigo_ubicacion vacío copiando el internalid
 *
 * INSTRUCCIONES DE USO EN CONSOLA DEL BROWSER:
 * 1. Ejecuta este script como Suitelet en NetSuite
 * 2. O copia el contenido de la función actualizarUbicaciones() y ejecútalo en la consola del browser
 */

define(["N/search", "N/record", "N/log"], function (search, record, nLog) {
    /**
     * Función principal que actualiza las ubicaciones
     * @param {Object} options - Opciones de configuración
     * @param {number} options.batchSize - Tamaño del lote (default: 10)
     * @param {boolean} options.dryRun - Si es true, solo muestra qué se actualizaría sin hacer cambios
     * @returns {Object} Resultado de la operación
     */
    function actualizarUbicaciones(options) {
        options = options || {};
        const batchSize = options.batchSize || 10;
        const dryRun = options.dryRun || false;

        nLog.audit("Iniciando actualización", `Tamaño de lote: ${batchSize}, Dry Run: ${dryRun}`);

        let actualizadas = 0;
        let errores = 0;
        let totalEncontradas = 0;

        try {
            // Buscar todas las ubicaciones donde custrecord_2w_codigo_ubicacion esté vacío
            const ubicacionSearch = search.create({
                type: search.Type.LOCATION,
                filters: [["custrecord_2w_codigo_ubicacion", "isempty", ""]],
                columns: [search.createColumn({ name: "internalid" }), search.createColumn({ name: "name" }), search.createColumn({ name: "custrecord_2w_codigo_ubicacion" })]
            });

            const pagedData = ubicacionSearch.runPaged({
                pageSize: batchSize
            });

            totalEncontradas = pagedData.count;

            nLog.audit("Total de ubicaciones encontradas", totalEncontradas);

            if (totalEncontradas === 0) {
                nLog.audit("Resultado", "No se encontraron ubicaciones con código vacío");
                return {
                    success: true,
                    totalProcesadas: 0,
                    actualizadas: 0,
                    errores: 0,
                    mensaje: "No se encontraron ubicaciones con código vacío"
                };
            }

            // Procesar cada página de resultados
            pagedData.pageRanges.forEach(function (pageRange) {
                const page = pagedData.fetch({
                    index: pageRange.index
                });

                page.data.forEach(function (result) {
                    const internalId = result.getValue({ name: "internalid" });
                    const name = result.getValue({ name: "name" });
                    const codigoActual = result.getValue({ name: "custrecord_2w_codigo_ubicacion" });

                    try {
                        nLog.debug("Procesando ubicación", `ID: ${internalId}, Nombre: ${name}`);

                        if (!dryRun) {
                            // Cargar y actualizar el registro
                            const ubicacionRecord = record.load({
                                type: record.Type.LOCATION,
                                id: internalId
                            });

                            ubicacionRecord.setValue({
                                fieldId: "custrecord_2w_codigo_ubicacion",
                                value: internalId
                            });

                            const recordId = ubicacionRecord.save({
                                enableSourcing: false,
                                ignoreMandatoryFields: true
                            });

                            nLog.audit("Ubicación actualizada", `ID: ${internalId} -> Código: ${internalId}`);
                        } else {
                            nLog.audit("DRY RUN - Se actualizaría", `ID: ${internalId} -> Código: ${internalId}`);
                        }

                        actualizadas++;
                    } catch (e) {
                        nLog.error(`Error actualizando ubicación ID: ${internalId}`, e);
                        errores++;
                    }
                });
            });

            const resultado = {
                success: true,
                totalProcesadas: totalEncontradas,
                actualizadas: actualizadas,
                errores: errores,
                mensaje: dryRun ? `DRY RUN completado. Se actualizarían ${actualizadas} ubicaciones` : `Proceso completado. ${actualizadas} ubicaciones actualizadas, ${errores} errores`
            };

            nLog.audit("Resultado final", JSON.stringify(resultado));

            return resultado;
        } catch (e) {
            nLog.error("Error en el proceso principal", e);
            return {
                success: false,
                error: e.toString(),
                actualizadas: actualizadas,
                errores: errores
            };
        }
    }

    /**
     * Suitelet para ejecutar desde URL
     */
    function onRequest(context) {
        const request = context.request;
        const response = context.response;

        const dryRun = request.parameters.dryrun === "true";
        const batchSize = request.parameters.batchsize ? parseInt(request.parameters.batchsize) : 10;

        const resultado = actualizarUbicaciones({
            batchSize: batchSize,
            dryRun: dryRun
        });

        response.write(JSON.stringify(resultado, null, 2));
    }

    // Exportar función principal para uso en consola
    window.actualizarUbicaciones = actualizarUbicaciones;

    return {
        onRequest: onRequest
    };
});

/*
 * ============================================================================
 * INSTRUCCIONES PARA EJECUTAR EN CONSOLA DEL BROWSER
 * ============================================================================
 *
 * Opción 1: Ejecutar el Suitelet
 * 1. Despliega este script como Suitelet
 * 2. Accede a la URL: /app/site/hosting/scriptlet.nl?script=XXX&deploy=YYY&dryrun=false&batchsize=10
 *    - dryrun=true: Solo simula sin hacer cambios
 *    - dryrun=false: Ejecuta la actualización real
 *    - batchsize: Número de registros por lote (default: 10)
 *
 * Opción 2: Copiar y pegar en consola del browser
 * 1. Abre la consola del browser (F12)
 * 2. Copia el siguiente código y pégalo en la consola:
 *
 * -----------------------------------------------------------------------
 *
 * (function() {
 *     const batchSize = 10;
 *     const dryRun = false; // Cambia a true para simular
 *
 *     function actualizar() {
 *         const searchObj = search.create({
 *             type: search.Type.LOCATION,
 *             filters: [["custrecord_2w_codigo_ubicacion", "isempty", ""]],
 *             columns: ["internalid", "name", "custrecord_2w_codigo_ubicacion"]
 *         });
 *
 *         const pagedData = searchObj.runPaged({ pageSize: batchSize });
 *         console.log("Total de ubicaciones encontradas: " + pagedData.count);
 *
 *         pagedData.pageRanges.forEach(function(pageRange) {
 *             const page = pagedData.fetch({ index: pageRange.index });
 *
 *             page.data.forEach(function(result) {
 *                 const internalId = result.getValue({ name: "internalid" });
 *                 const name = result.getValue({ name: "name" });
 *
 *                 try {
 *                     if (!dryRun) {
 *                         const record = recordModule.load({
 *                             type: recordModule.Type.LOCATION,
 *                             id: internalId
 *                         });
 *
 *                         record.setValue({
 *                             fieldId: "custrecord_2w_codigo_ubicacion",
 *                             value: internalId
 *                         });
 *
 *                         record.save({
 *                             enableSourcing: false,
 *                             ignoreMandatoryFields: true
 *                         });
 *
 *                         console.log("✓ Actualizada: ID " + internalId + " - " + name);
 *                     } else {
 *                         console.log("DRY RUN: Se actualizaría ID " + internalId + " - " + name);
 *                     }
 *                 } catch (e) {
 *                     console.error("✗ Error en ID " + internalId + ": " + e);
 *                 }
 *             });
 *         });
 *
 *         console.log("Proceso completado. Modo: " + (dryRun ? "DRY RUN" : "ACTUALIZACIÓN"));
 *     }
 *
 *     actualizar();
 * })();
 *
 * -----------------------------------------------------------------------
 *
 * RECOMENDACIÓN:
 * 1. Primero ejecuta con dryRun=true para verificar qué se actualizará
 * 2. Luego ejecuta con dryRun=false para hacer la actualización real
 * 3. Monitorea los logs de NetSuite para ver el progreso detallado
 *
 */
