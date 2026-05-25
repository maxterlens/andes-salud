/**
 * @NApiVersion 2.1
 * @module ./2win_dao_prefactura.js
 * @NModuleScope Public
 */
define(["N/record", "N/search", "./2win_dao"],

    function (record, search, dao) {

        const ID_ESTADO_CREAR_DETALLE = "Nuevo";
        const ID_ESTADO_EDITAR_DETALLE = "Modificado";
        const ID_ESTADO_ELIMINAR_DETALLE = "Eliminado";

        function crear(prefactura, detalles, lineas_ov) {

            try {

                log.audit("crear - prefactura", prefactura);
                log.audit("crear - detalles", detalles);

                const prefacturaRecord = record.create({ type: "customrecord_2w_as_prefactura", isDynamic: true });
                prefacturaRecord.setValue({ fieldId: "name", value: prefactura.num_prefactura });
                prefacturaRecord.setValue({ fieldId: "custrecord_2w_as_pf_ingreso", value: prefactura.ingreso });
                prefacturaRecord.setValue({ fieldId: "custrecord_2w_as_pf_cuenta_paciente", value: prefactura.cuenta_paciente });
                prefacturaRecord.setValue({ fieldId: "custrecord_2w_as_pf_paciente", value: prefactura.id_paciente });
                prefacturaRecord.setValue({ fieldId: "custrecord_2w_as_pf_ficha", value: prefactura.ficha });
                prefacturaRecord.setValue({ fieldId: "custrecord_2w_as_pf_fecha", value: new Date() });
                prefacturaRecord.setValue({ fieldId: "custrecord_2w_as_pf_ov_origen", value: prefactura.id_orden_venta });
                prefacturaRecord.setValue({ fieldId: "custrecord_2w_as_pf_montoneto", value: prefactura.monto_neto });
                prefacturaRecord.setValue({ fieldId: "custrecord_2w_as_pf_montoexento", value: prefactura.monto_exento });
                prefacturaRecord.setValue({ fieldId: "custrecord_2w_as_pf_montoiva", value: prefactura.monto_iva });
                prefacturaRecord.setValue({ fieldId: "custrecord_2w_as_pf_montototal", value: prefactura.monto_total });

                const id_prefactura = prefacturaRecord.save();

                // Detalle
                detalles.forEach(function (detalle) {

                    const detallePrefacturaRecord = record.create({ type: "customrecord_2w_as_prefactura_detalles", isDynamic: true });
                    detallePrefacturaRecord.setValue({ fieldId: "custrecord_2w_as_dpf_prefactura", value: id_prefactura });
                    detallePrefacturaRecord.setValue({ fieldId: "custrecord_2w_as_dpf_numlinea", value: detalle.numlinea });
                    detallePrefacturaRecord.setValue({ fieldId: "custrecord_2w_as_dpf_prestador", value: detalle.id_prestador });
                    detallePrefacturaRecord.setValue({ fieldId: "custrecord_2w_as_dpf_financiador", value: detalle.id_financiador });
                    detallePrefacturaRecord.setValue({ fieldId: "custrecord_2w_as_dpf_glosa", value: detalle.glosa });
                    detallePrefacturaRecord.setValue({ fieldId: "custrecord_2w_as_dpf_montoneto", value: detalle.monto_neto });
                    detallePrefacturaRecord.setValue({ fieldId: "custrecord_2w_as_dpf_montoexento", value: detalle.monto_exento });
                    detallePrefacturaRecord.setValue({ fieldId: "custrecord_2w_as_dpf_montoiva", value: detalle.monto_iva });
                    detallePrefacturaRecord.setValue({ fieldId: "custrecord_2w_as_dpf_montototal", value: detalle.monto_total });
                    detallePrefacturaRecord.setValue({ fieldId: "custrecord_2w_as_dpf_crgcorrel", value: detalle.crg_correl });
                    detallePrefacturaRecord.setValue({ fieldId: "custrecord_2w_as_dpf_ov_origen", value: detalle.id_orden_venta });
                    const id_detalle_prefactura = detallePrefacturaRecord.save();
                    log.audit("crear - detalle id", id_detalle_prefactura);

                    // Actualizar lineas de la orden de venta con id de prefactura y detalle prefactura
                    if (lineas_ov && lineas_ov.length > 0) {
                        const correlativos = detalle.crg_correl.split(",");
                        correlativos.forEach(function (correlativo) {

                            log.audit("crear - procesando correlativo", correlativo);

                            // Obtener lineas de la orden de venta con el correlativo
                            const lineas = lineas_ov.filter(linea => String(linea.correlativo) === String(correlativo).trim());
                            log.audit("crear - lineas encontradas para correlativo " + correlativo, lineas);

                            // Actualizar linea con id de prefactura y detalle prefactura
                            lineas.forEach(function (linea) {
                                linea.id_prefactura = id_prefactura;
                                linea.id_detalle_prefactura = id_detalle_prefactura;
                            });
                        });
                    }
                });

                return id_prefactura;

            } catch (error) {
                log.error("crear - error", error);
                throw error;
            }

        }

        function editar(id, prefactura, detalles) {

            try {

                log.audit("editar - id", id);
                log.audit("editar - prefactura", prefactura);
                log.audit("editar - detalles", detalles);

                // Actualizar prefactura
                record.submitFields({
                    type: "customrecord_2w_as_prefactura",
                    id: id,
                    values: {
                        "custrecord_2w_as_pf_ingreso": prefactura.ingreso,
                        "custrecord_2w_as_pf_cuenta_paciente": prefactura.cuenta_paciente,
                        "custrecord_2w_as_pf_paciente": prefactura.id_paciente,
                        "custrecord_2w_as_pf_ficha": prefactura.ficha,
                        "custrecord_2w_as_pf_ov_origen": prefactura.id_orden_venta,
                        "custrecord_2w_as_pf_montoneto": prefactura.monto_neto,
                        "custrecord_2w_as_pf_montoexento": prefactura.monto_exento,
                        "custrecord_2w_as_pf_montoiva": prefactura.monto_iva,
                        "custrecord_2w_as_pf_montototal": prefactura.monto_total
                    }
                });

                // Detalle
                detalles.forEach(function (detalle) {

                    log.audit("editar - detalle", detalle);

                    if (detalle.estado === ID_ESTADO_CREAR_DETALLE) {

                        // Crear nuevo detalle
                        const detallePrefacturaRecord = record.create({ type: "customrecord_2w_as_prefactura_detalles", isDynamic: true });
                        detallePrefacturaRecord.setValue({ fieldId: "custrecord_2w_as_dpf_prefactura", value: id });
                        detallePrefacturaRecord.setValue({ fieldId: "custrecord_2w_as_dpf_numlinea", value: detalle.numlinea });
                        detallePrefacturaRecord.setValue({ fieldId: "custrecord_2w_as_dpf_prestador", value: detalle.id_prestador });
                        detallePrefacturaRecord.setValue({ fieldId: "custrecord_2w_as_dpf_financiador", value: detalle.id_financiador });
                        detallePrefacturaRecord.setValue({ fieldId: "custrecord_2w_as_dpf_glosa", value: detalle.glosa });
                        detallePrefacturaRecord.setValue({ fieldId: "custrecord_2w_as_dpf_montoneto", value: detalle.monto_neto });
                        detallePrefacturaRecord.setValue({ fieldId: "custrecord_2w_as_dpf_montoexento", value: detalle.monto_exento });
                        detallePrefacturaRecord.setValue({ fieldId: "custrecord_2w_as_dpf_montoiva", value: detalle.monto_iva });
                        detallePrefacturaRecord.setValue({ fieldId: "custrecord_2w_as_dpf_montototal", value: detalle.monto_total });
                        detallePrefacturaRecord.setValue({ fieldId: "custrecord_2w_as_dpf_crgcorrel", value: detalle.crg_correl });
                        detallePrefacturaRecord.setValue({ fieldId: "custrecord_2w_as_dpf_ov_origen", value: detalle.id_orden_venta });
                        const id_detalle_prefactura = detallePrefacturaRecord.save();
                        log.audit("editar - detalle creado id", id_detalle_prefactura);

                    } else if (detalle.estado === ID_ESTADO_EDITAR_DETALLE) {

                        // Actualizar detalle existente
                        record.submitFields({
                            type: "customrecord_2w_as_prefactura_detalles",
                            id: detalle.id,
                            values: {
                                "custrecord_2w_as_dpf_numlinea": detalle.numlinea,
                                "custrecord_2w_as_dpf_prestador": detalle.id_prestador,
                                "custrecord_2w_as_dpf_financiador": detalle.id_financiador,
                                "custrecord_2w_as_dpf_glosa": detalle.glosa,
                                "custrecord_2w_as_dpf_montoneto": detalle.monto_neto,
                                "custrecord_2w_as_dpf_montoexento": detalle.monto_exento,
                                "custrecord_2w_as_dpf_montoiva": detalle.monto_iva,
                                "custrecord_2w_as_dpf_montototal": detalle.monto_total,
                                "custrecord_2w_as_dpf_crgcorrel": detalle.crg_correl,
                                "custrecord_2w_as_dpf_ov_origen": detalle.id_orden_venta
                            }
                        });
                        log.audit("editar - detalle actualizado id", detalle.id);

                    } else if (detalle.estado === ID_ESTADO_ELIMINAR_DETALLE) {

                        // Eliminar detalle existente
                        record.delete({
                            type: "customrecord_2w_as_prefactura_detalles",
                            id: detalle.id
                        });
                        log.audit("editar - detalle eliminado id", detalle.id);
                    }
                });

                return id;

            } catch (error) {
                throw error;
            }

        }

        function eliminar(id) {

            try {

                log.audit("eliminar - id", id);

                record.delete({
                    type: "customrecord_2w_as_prefactura",
                    id: id
                });

                return id;

            } catch (error) {
                throw error;
            }

        }

        function buscar(prefactura) {

            try {

                var objSearch = {
                    type: "customrecord_2w_as_prefactura",
                    filters:
                        [
                            ["name", "is", prefactura.num_prefactura],
                            "AND",
                            ["custrecord_2w_as_pf_cuenta_paciente", "is", prefactura.cuenta_paciente]
                        ],
                    columns:
                        [
                            search.createColumn({ name: "internalid", label: "id" }),
                            search.createColumn({ name: "custrecord_2w_as_pf_montoneto", label: "monto_neto" }),
                            search.createColumn({ name: "custrecord_2w_as_pf_montoexento", label: "monto_exento" }),
                            search.createColumn({ name: "custrecord_2w_as_pf_montoiva", label: "monto_iva" }),
                            search.createColumn({ name: "custrecord_2w_as_pf_montototal", label: "monto_total" })
                        ]
                };

                // Ejecutar busqueda
                var result = dao.obtenerResultados(objSearch);

                // Valida que la busqueda retorne resultados
                if (result.length > 0) {
                    return result[0];
                } else {
                    log.error('buscar - prefactura no encontrada', prefactura);
                    return null;
                }

            } catch (error) {
                throw error;
            }
        }

        function obtenerDetalles(id_prefactura) {

            try {

                var objSearch = {
                    type: "customrecord_2w_as_prefactura_detalles",
                    filters:
                        [
                            ["custrecord_2w_as_dpf_prefactura", "anyof", id_prefactura],
                            "AND",
                            ["custrecord_2w_as_dpf_ov_origen.mainline", "is", "T"]
                        ],
                    columns:
                        [
                            search.createColumn({ name: "internalid", label: "id" }),
                            search.createColumn({ name: "custrecord_2w_as_dpf_numlinea", label: "numlinea" }),
                            search.createColumn({ name: "custrecord_2w_as_dpf_prestador", label: "id_prestador" }),
                            search.createColumn({ name: "name", join: "CUSTRECORD_2W_AS_DPF_PRESTADOR", label: "nombre_prestador" }),
                            search.createColumn({ name: "custrecord_2w_as_dpf_financiador", label: "id_financiador" }),
                            search.createColumn({ name: "entityid", join: "CUSTRECORD_2W_AS_DPF_FINANCIADOR", label: "nombre_financiador" }),
                            search.createColumn({ name: "custrecord_2w_as_dpf_glosa", label: "glosa" }),
                            search.createColumn({ name: "custrecord_2w_as_dpf_montoneto", label: "monto_neto" }),
                            search.createColumn({ name: "custrecord_2w_as_dpf_montoexento", label: "monto_exento" }),
                            search.createColumn({ name: "custrecord_2w_as_dpf_montoiva", label: "monto_iva" }),
                            search.createColumn({ name: "custrecord_2w_as_dpf_montototal", label: "monto_total" }),
                            search.createColumn({ name: "custrecord_2w_as_dpf_crgcorrel", label: "crg_correl" }),
                            search.createColumn({ name: "custrecord_2w_as_dpf_ov_origen", label: "ov_origen" }),
                            search.createColumn({ name: "tranid", join: "CUSTRECORD_2W_AS_DPF_OV_ORIGEN", label: "ov_nombre" })
                        ]
                };

                // Ejecutar busqueda
                var result = dao.obtenerResultados(objSearch);

                // Valida que la busqueda retorne resultados
                if (result.length > 0) {
                    return result;
                } else {
                    log.error('obtenerDetalles - detalles de prefactura no encontrados', 'id_prefactura: ' + id_prefactura);
                    return null;
                }

            } catch (error) {
                throw error;
            }
        }

        function eliminarDetalle(id) {

            try {

                log.audit("eliminarDetalle - id", id);

                record.delete({
                    type: "customrecord_2w_as_prefactura_detalles",
                    id: id
                });

                return id;

            } catch (error) {
                throw error;
            }

        }

        const update = (id, values) => {
            try {
                if (!id) throw Error("No se puede actualizar la prefactura, no esta definido el id del registro");
                const recordId = record.submitFields({
                    type: "",
                    id: id,
                    values: values
                });
                return recordId;
            } catch (error) {
                log.error("prefactura update", error);
                throw error;
            }
        };

        return {
            update,
            crear,
            editar,
            eliminar,
            buscar,
            obtenerDetalles,
            eliminarDetalle
        };
    }
);
