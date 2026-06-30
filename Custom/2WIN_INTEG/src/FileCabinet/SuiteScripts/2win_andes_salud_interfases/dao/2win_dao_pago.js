/**
 * @NApiVersion 2.1
 * @module ./2win_dao_pago.js
 * @NModuleScope Public
 */
define(["./2win_dao", "N/search", "N/log", "N/record", "N/runtime", "../domain/2win_dom_evento", "../lib/2win_lib_peticion", "../lib/moment"], function (
    dao,
    search,
    nLog,
    record,
    runtime,
    { EventService, ExternalEventServiceAdapter, NivelEvento },
    libPeticion,
    moment
) {

    /**
     * @function enviarRegistroSimulador - Envía los datos del centro de costo a un servicio externo.
     * @param {string} url - URL del endpoint del servicio externo.
     * @param {object} cuerpoPeticion - El cuerpo de la petición a enviar.
     * @returns {object} - La respuesta del servicio externo.
     */
    function enviarRegistroSimulador(url, cuerpoPeticion) {
        try {
            nLog.audit("enviarRegistroSimulador - parametros", { url: url, cuerpoPeticion: cuerpoPeticion });

            // Ejecutar peticion POST al servicio externo
            /**@todo - Pendiente definir enpoint y token para Servio externo, por ahora se usa simulador */
            const eventService = new EventService({
                externalAdapter: new ExternalEventServiceAdapter({ url: url, token: "" })
            });
            const eventData = {
                customerId: cuerpoPeticion.id,
                action: "create",
                user: runtime.getCurrentUser().id
            };
            nLog.debug("enviarRegistroSimulador - eventData", eventData);

            const respuesta = eventService.registerEvent({
                tipo: "Send_in",
                fuente: runtime.getCurrentScript().id,
                datos: eventData,
                nivel: NivelEvento.INFO,
                relatedRecordType: cuerpoPeticion.type,
                relatedRecordId: cuerpoPeticion.id
            });
            nLog.debug("enviarRegistroSimulador - respuesta", respuesta);
            return respuesta;
        } catch (error) {
            nLog.error("enviarRegistroSimulador - error", error);
            throw error;
        }
    }

    /**
     * @function enviarRegistro - Envía los datos del centro de costo a un servicio externo.
     * @param {string} url - URL del endpoint del servicio externo.
     * @param {object} cuerpoPeticion - El cuerpo de la petición a enviar.
     * @returns {object} - La respuesta del servicio externo.
     */
    function enviarRegistro(url, cuerpoPeticion) {
        try {
            nLog.audit("enviarRegistro - parametros", { url: url, cuerpoPeticion: cuerpoPeticion });

            // Utiliza la nueva función autenticada. El tipo de petición es PUT según el DOM.
            const respuesta = libPeticion.ejecutarPeticionAutenticada("PUT", url, cuerpoPeticion);

            nLog.debug("enviarRegistro - respuesta", respuesta);
            return respuesta;
        } catch (error) {
            nLog.error("enviarRegistro - error", error);
            throw error;
        }
    }

    /**
     * @function crearPago - Crea un nuevo pago en NetSuite
     * @param {Object} datosPago - Datos necesarios para crear el pago
     * @param {string} datosPago.customer - ID del cliente
     * @param {string} datosPago.amount - Monto del pago
     * @param {string} datosPago.paymentmethod - Método de pago
     * @param {Array} datosPago.applyLines - Array de líneas de aplicación
     * @returns {Object} - Resultado de la creación con ID generado
     */
    function crearPago(datosPago) {
        try {
            nLog.debug("crearPago - datosPago", datosPago);

            // Crear nuevo pago
            let nuevoPago = record.create({
                type: record.Type.CUSTOMER_PAYMENT,
                isDynamic: true
            });

            // Establecer campos del encabezado
            if (datosPago.customer) nuevoPago.setValue("customer", datosPago.customer);
            if (datosPago.amount) nuevoPago.setValue("payment", datosPago.amount);
            if (datosPago.trandate) nuevoPago.setValue("trandate", datosPago.trandate);
            if (datosPago.memo) nuevoPago.setValue("memo", datosPago.memo);
            if (datosPago.paymentmethod) nuevoPago.setValue("paymentmethod", datosPago.paymentmethod);

            // Aplicar líneas si se especifican
            if (datosPago.applyLines && Array.isArray(datosPago.applyLines)) {
                let applySublist = nuevoPago.getSublistSubrecord({ sublistId: "apply", fieldId: "apply" });
                if (applySublist) {
                    datosPago.applyLines.forEach(function (line, index) {
                        nuevoPago.selectNewLine({ sublistId: "apply" });
                        if (line.internalid) nuevoPago.setCurrentSublistValue({ sublistId: "apply", fieldId: "internalid", value: line.internalid });
                        if (line.amount) nuevoPago.setCurrentSublistValue({ sublistId: "apply", fieldId: "amount", value: line.amount });
                        if (line.apply === true || line.apply === false) nuevoPago.setCurrentSublistValue({ sublistId: "apply", fieldId: "apply", value: line.apply });
                        nuevoPago.commitLine({ sublistId: "apply" });
                    });
                }
            }

            // Guardar el pago
            let idPago = nuevoPago.save();

            nLog.audit("crearPago - pago creado", { id: idPago });

            return {
                success: true,
                id: idPago,
                message: "Pago creado exitosamente"
            };
        } catch (error) {
            nLog.error("crearPago - error", error);
            throw error;
        }
    }

    /**
     * @function actualizarPago - Actualiza un pago existente
     * @param {string} idPago - ID interno del pago a actualizar
     * @param {Object} datosPago - Campos a actualizar
     * @returns {Object} - Resultado de la actualización
     */
    function actualizarPago(idPago, datosPago) {
        try {
            nLog.debug("actualizarPago - parametros", { idPago: idPago, datosPago: datosPago });

            // Cargar el pago existente
            let pagoActualizar = record.load({
                type: record.Type.CUSTOMER_PAYMENT,
                id: idPago,
                isDynamic: true
            });

            // Actualizar campos del encabezado
            if (datosPago.memo) pagoActualizar.setValue("memo", datosPago.memo);
            if (datosPago.trandate) pagoActualizar.setValue("trandate", datosPago.trandate);

            // Actualizar líneas de aplicación si es necesario
            if (datosPago.applyLines && Array.isArray(datosPago.applyLines)) {
                // Limpiar líneas existentes y agregar nuevas
                let linesCount = pagoActualizar.getLineCount("apply");
                for (let i = linesCount - 1; i >= 0; i--) {
                    pagoActualizar.removeLine({ sublistId: "apply", line: i });
                }

                datosPago.applyLines.forEach(function (line, index) {
                    pagoActualizar.selectNewLine({ sublistId: "apply" });
                    if (line.internalid) pagoActualizar.setCurrentSublistValue({ sublistId: "apply", fieldId: "internalid", value: line.internalid });
                    if (line.amount) pagoActualizar.setCurrentSublistValue({ sublistId: "apply", fieldId: "amount", value: line.amount });
                    if (line.apply === true || line.apply === false) pagoActualizar.setCurrentSublistValue({ sublistId: "apply", fieldId: "apply", value: line.apply });
                    pagoActualizar.commitLine({ sublistId: "apply" });
                });
            }

            // Guardar cambios
            let idActualizado = pagoActualizar.save();

            nLog.audit("actualizarPago - pago actualizado", { id: idActualizado });

            return {
                success: true,
                id: idActualizado,
                message: "Pago actualizado exitosamente"
            };
        } catch (error) {
            nLog.error("actualizarPago - error", error);
            throw error;
        }
    }

    /**
     * @function anularPago - Anula un pago (método de eliminación lógica)
     * @param {string} idPago - ID interno del pago a anular
     * @returns {Object} - Resultado de la anulación
     */
    function anularPago(idPago) {
        try {
            nLog.debug("anularPago - idPago", idPago);

            // Cargar el pago
            let pagoAnular = record.load({
                type: record.Type.CUSTOMER_PAYMENT,
                id: idPago,
                isDynamic: false
            });

            // Verificar estado
            let status = pagoAnular.getValue("status");
            if (status === "Voided" || status === "Unapproved Payment") {
                // Aplicar anulación
                pagoAnular.setValue("tobevoided", true);
                pagoAnular.save();

                nLog.audit("anularPago - pago anulado", { id: idPago });

                return {
                    success: true,
                    id: idPago,
                    message: "Pago anulado exitosamente"
                };
            } else {
                throw new Error(`Pago ${idPago} no puede ser anulado. Estado actual: ${status}`);
            }
        } catch (error) {
            nLog.error("anularPago - error", error);
            throw error;
        }
    }

    /**
     * @function obtenerPagoDetallado - Obtiene información detallada de un pago
     * @param {string} idPago - ID interno del pago
     * @returns {Object} - Información completa del pago
     */
    function obtenerPagoDetallado(idPago) {
        try {
            nLog.debug("obtenerPagoDetallado - idPago", idPago);

            // Cargar el pago completo
            let pagoDetalle = record.load({
                type: record.Type.CUSTOMER_PAYMENT,
                id: idPago,
                isDynamic: false
            });

            // Extraer información del header
            let pagoInfo = {
                internalid: pagoDetalle.getValue("id"),
                tranid: pagoDetalle.getValue("tranid"),
                trandate: pagoDetalle.getValue("trandate"),
                customer: pagoDetalle.getValue("customer"),
                paymentmethod: pagoDetalle.getValue("paymentmethod"),
                status: pagoDetalle.getValue("status"),
                amount: pagoDetalle.getValue("payment"),
                memo: pagoDetalle.getValue("memo"),
                applyLines: []
            };

            // Extraer líneas de aplicación
            let linesCount = pagoDetalle.getLineCount("apply");
            for (let i = 0; i < linesCount; i++) {
                pagoInfo.applyLines.push({
                    internalid: pagoDetalle.getSublistValue("apply", "internalid", i),
                    amount: pagoDetalle.getSublistValue("apply", "amount", i),
                    apply: pagoDetalle.getSublistValue("apply", "apply", i),
                    due: pagoDetalle.getSublistValue("apply", "due", i),
                    applydate: pagoDetalle.getSublistValue("apply", "applydate", i)
                });
            }

            nLog.audit("obtenerPagoDetallado - informacion obtenida", pagoInfo);

            return {
                success: true,
                data: pagoInfo
            };
        } catch (error) {
            nLog.error("obtenerPagoDetallado - error", error);
            throw error;
        }
    }

    /**
     * @function buscarPagosPorFactura - Busca pagos aplicados a una factura específica
     * @param {string} idFactura - ID interno de la factura
     * @returns {Array} - Lista de pagos aplicados
     */
    function buscarPagosPorFactura(idFactura) {
        try {
            nLog.debug("buscarPagosPorFactura - idFactura", idFactura);

            let objSearch = {
                type: record.Type.CUSTOMER_PAYMENT,
                filters: [["appliedtotransaction", "anyof", idFactura], "AND", ["mainline", "is", "T"]],
                columns: [
                    search.createColumn({ name: "internalid", label: "internalid" }),
                    search.createColumn({ name: "tranid", label: "tranid" }),
                    search.createColumn({ name: "trandate", label: "trandate" }),
                    search.createColumn({ name: "customer", label: "customer" }),
                    search.createColumn({ name: "payment", label: "payment" }),
                    search.createColumn({ name: "statusRef", label: "statusRef" }),
                    search.createColumn({ name: "appliedtotransaction", label: "appliedtotransaction" }),
                    search.createColumn({ name: "appliedtotransaction.amountoutstanding", label: "appliedtotransaction.amountoutstanding" }),
                    search.createColumn({ name: "appliedtolinkamount", label: "appliedtolinkamount" })
                ]
            };

            // Ejecutar busqueda
            let result = dao.obtenerResultados(objSearch);
            nLog.audit("buscarPagosPorFactura - resultados", {
                extension: result.length,
                resultado: result
            });

            return result;
        } catch (error) {
            nLog.error("buscarPagosPorFactura - error", error);
            throw error;
        }
    }

    function getRecord(id) {
        return record.load({
            type: "customerpayment",
            id: id
        });
    }

    return {
        enviarRegistroSimulador: enviarRegistroSimulador,
        enviarRegistro: enviarRegistro,
        crearPago: crearPago,
        actualizarPago: actualizarPago,
        anularPago: anularPago,
        obtenerPagoDetallado: obtenerPagoDetallado,
        buscarPagosPorFactura: buscarPagosPorFactura,
        getRecord: getRecord
    };
});
