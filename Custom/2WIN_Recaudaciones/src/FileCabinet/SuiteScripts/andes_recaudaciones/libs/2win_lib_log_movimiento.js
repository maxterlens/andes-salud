/**
 * @desc Librería para registrar la creación de registros asociados a un movimiento de caja.
 * @NApiVersion 2.1
 * @NModuleScope Public
 * @author 2WIN
 */
define(["N/record", "N/search", "N/log"], function (record, search, nLog) {
    /**
     * Constantes para tipos de registro
     */
    const TIPO_REGISTRO = {
        INVOICE: "1", // Invoice
        CREDIT_MEMO: "2", // Credit Memo
        JOURNAL_ENTRY: "3", // Journal Entry
        PAYMENT: "4", // Customer Payment
        SALES_ORDER: "5" // Sales Order
    };

    /**
     * Constantes para estados
     */
    const ESTADO = {
        EXITO: "Éxito",
        ERROR: "Error"
    };

    /**
     * @function registrar
     * @description Registra la creación de un registro asociado a un movimiento
     * @param {Object} params - Parámetros para el registro
     * @param {Number} params.salesOrderId - ID de la orden de venta origen (requerido)
     * @param {String} params.numeroMovimiento - Número del movimiento procesado
     * @param {String} params.tipoRegistro - Tipo de registro creado (usar constantes TIPO_REGISTRO)
     * @param {Number} params.idRegistroCreado - Internal ID del registro creado
     * @param {String} [params.referencia] - Folio o referencia del documento
     * @param {String} [params.detalle] - Descripción adicional
     * @param {String} [params.estado] - Estado del registro (default: Éxito)
     * @returns {Number} - ID del registro de log creado
     */
    function registrar(params) {
        try {
            nLog.debug("registrar - params", JSON.stringify(params));

            if (!params.salesOrderId) {
                throw new Error("salesOrderId es requerido para registrar el log");
            }

            if (!params.tipoRegistro) {
                throw new Error("tipoRegistro es requerido para registrar el log");
            }

            if (!params.idRegistroCreado) {
                throw new Error("idRegistroCreado es requerido para registrar el log");
            }

            const logRecord = record.create({
                type: "customrecord_2w_as_log_movimiento",
                isDynamic: true
            });

            // Campos obligatorios
            logRecord.setValue({
                fieldId: "custrecord_2w_log_orden_venta",
                value: params.salesOrderId
            });

            logRecord.setValue({
                fieldId: "custrecord_2w_log_tipo_registro",
                value: params.tipoRegistro
            });

            logRecord.setValue({
                fieldId: "custrecord_2w_log_id_registro",
                value: params.idRegistroCreado
            });

            // Campos opcionales
            if (params.numeroMovimiento) {
                logRecord.setValue({
                    fieldId: "custrecord_2w_log_num_movimiento",
                    value: params.numeroMovimiento
                });
            }

            logRecord.setValue({
                fieldId: "custrecord_2w_log_fecha_creacion",
                value: new Date()
            });

            logRecord.setValue({
                fieldId: "custrecord_2w_log_estado",
                value: params.estado || ESTADO.EXITO
            });

            if (params.referencia) {
                logRecord.setValue({
                    fieldId: "custrecord_2w_log_referencia",
                    value: params.referencia
                });
            }

            if (params.detalle) {
                logRecord.setValue({
                    fieldId: "custrecord_2w_log_detalle",
                    value: params.detalle
                });
            }

            const logId = logRecord.save({ enableSourcing: true });
            nLog.audit("registrar - Log creado", `ID: ${logId}`);

            return logId;
        } catch (error) {
            nLog.error("registrar - error", error.message);
            throw error;
        }
    }

    /**
     * @function registrarError
     * @description Registra un error en la creación de un registro
     * @param {Object} params - Parámetros para el registro de error
     * @param {Number} params.salesOrderId - ID de la orden de venta origen
     * @param {String} params.numeroMovimiento - Número del movimiento
     * @param {String} params.tipoRegistro - Tipo de registro que falló
     * @param {String} params.mensajeError - Mensaje de error
     * @param {String} [params.referencia] - Folio o referencia
     * @returns {Number} - ID del registro de log creado
     */
    function registrarError(params) {
        return registrar({
            salesOrderId: params.salesOrderId,
            numeroMovimiento: params.numeroMovimiento,
            tipoRegistro: params.tipoRegistro,
            idRegistroCreado: 0,
            referencia: params.referencia || "",
            detalle: params.mensajeError,
            estado: ESTADO.ERROR
        });
    }

    /**
     * @function obtenerPorOrdenVenta
     * @description Obtiene todos los logs asociados a una orden de venta
     * @param {Number} salesOrderId - ID de la orden de venta
     * @returns {Array} - Lista de registros de log
     */
    function obtenerPorOrdenVenta(salesOrderId) {
        try {
            nLog.debug("obtenerPorOrdenVenta", `Sales Order ID: ${salesOrderId}`);

            const resultados = [];

            const logSearch = search.create({
                type: "customrecord_2w_as_log_movimiento",
                filters: [["custrecord_2w_log_orden_venta", "anyof", salesOrderId]],
                columns: [
                    search.createColumn({ name: "internalid", label: "id" }),
                    search.createColumn({ name: "custrecord_2w_log_num_movimiento", label: "numeroMovimiento" }),
                    search.createColumn({ name: "custrecord_2w_log_tipo_registro", label: "tipoRegistro" }),
                    search.createColumn({ name: "custrecord_2w_log_id_registro", label: "idRegistroCreado" }),
                    search.createColumn({ name: "custrecord_2w_log_fecha_creacion", label: "fechaCreacion" }),
                    search.createColumn({ name: "custrecord_2w_log_estado", label: "estado" }),
                    search.createColumn({ name: "custrecord_2w_log_referencia", label: "referencia" }),
                    search.createColumn({ name: "custrecord_2w_log_detalle", label: "detalle" })
                ]
            });

            logSearch.run().each(function (result) {
                resultados.push({
                    id: result.getValue({ name: "internalid" }),
                    numeroMovimiento: result.getValue({ name: "custrecord_2w_log_num_movimiento" }),
                    tipoRegistro: result.getText({ name: "custrecord_2w_log_tipo_registro" }),
                    idRegistroCreado: result.getValue({ name: "custrecord_2w_log_id_registro" }),
                    fechaCreacion: result.getValue({ name: "custrecord_2w_log_fecha_creacion" }),
                    estado: result.getValue({ name: "custrecord_2w_log_estado" }),
                    referencia: result.getValue({ name: "custrecord_2w_log_referencia" }),
                    detalle: result.getValue({ name: "custrecord_2w_log_detalle" })
                });
                return true;
            });

            nLog.debug("obtenerPorOrdenVenta - resultados", `Se encontraron ${resultados.length} registros`);
            return resultados;
        } catch (error) {
            nLog.error("obtenerPorOrdenVenta - error", error.message);
            throw error;
        }
    }

    /**
     * @function obtenerPorNumeroMovimiento
     * @description Obtiene todos los logs asociados a un número de movimiento
     * @param {String} numeroMovimiento - Número del movimiento
     * @returns {Array} - Lista de registros de log
     */
    function obtenerPorNumeroMovimiento(numeroMovimiento) {
        try {
            nLog.debug("obtenerPorNumeroMovimiento", `Número: ${numeroMovimiento}`);

            const resultados = [];

            const logSearch = search.create({
                type: "customrecord_2w_as_log_movimiento",
                filters: [["custrecord_2w_log_num_movimiento", "is", numeroMovimiento]],
                columns: [
                    search.createColumn({ name: "internalid", label: "id" }),
                    search.createColumn({ name: "custrecord_2w_log_orden_venta", label: "ordenVenta" }),
                    search.createColumn({ name: "custrecord_2w_log_tipo_registro", label: "tipoRegistro" }),
                    search.createColumn({ name: "custrecord_2w_log_id_registro", label: "idRegistroCreado" }),
                    search.createColumn({ name: "custrecord_2w_log_fecha_creacion", label: "fechaCreacion" }),
                    search.createColumn({ name: "custrecord_2w_log_estado", label: "estado" }),
                    search.createColumn({ name: "custrecord_2w_log_referencia", label: "referencia" }),
                    search.createColumn({ name: "custrecord_2w_log_detalle", label: "detalle" })
                ]
            });

            logSearch.run().each(function (result) {
                resultados.push({
                    id: result.getValue({ name: "internalid" }),
                    ordenVenta: result.getValue({ name: "custrecord_2w_log_orden_venta" }),
                    tipoRegistro: result.getText({ name: "custrecord_2w_log_tipo_registro" }),
                    idRegistroCreado: result.getValue({ name: "custrecord_2w_log_id_registro" }),
                    fechaCreacion: result.getValue({ name: "custrecord_2w_log_fecha_creacion" }),
                    estado: result.getValue({ name: "custrecord_2w_log_estado" }),
                    referencia: result.getValue({ name: "custrecord_2w_log_referencia" }),
                    detalle: result.getValue({ name: "custrecord_2w_log_detalle" })
                });
                return true;
            });

            nLog.debug("obtenerPorNumeroMovimiento - resultados", `Se encontraron ${resultados.length} registros`);
            return resultados;
        } catch (error) {
            nLog.error("obtenerPorNumeroMovimiento - error", error.message);
            throw error;
        }
    }

    return {
        TIPO_REGISTRO: TIPO_REGISTRO,
        ESTADO: ESTADO,
        registrar: registrar,
        registrarError: registrarError,
        obtenerPorOrdenVenta: obtenerPorOrdenVenta,
        obtenerPorNumeroMovimiento: obtenerPorNumeroMovimiento
    };
});
