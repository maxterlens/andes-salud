/**
 * @NApiVersion 2.1
 * @module ./2win_dao_factura.js
 * @NModuleScope Public
 */
define(["./2win_dao_tipo_dte", "./2win_dao", "N/search", "N/log", "N/record", "../lib/2win_lib_peticion", "../lib/moment"], function (daoTipoDte, dao, search, nLog, record, libPeticion, moment) {

    /**
     * @function recuperarCamposRegistro - Recupera los campos de registro en NetSuite.
     * @param {record.Record} parametro - Registro de NetSuite del cual se recuperan los campos.
     * @returns {Object} - Objeto con los campos del registro.
     */
    function recuperarCamposRegistro(parametro) {
        try {
            nLog.audit("recuperarCamposRegistro - parametro", parametro);

            // parametro = record.load({ type: record.Type.INVOICE, id: parametro.idFactura, isDynamic: true });

            // Objeto para almacenar datos de factura pagada
            let facturaPagada = {};

            // Recuperar campos del cuerpo del registro
            let idEmpresaFactura = parametro.getValue({ fieldId: "subsidiary" });
            let fechaUltimaModificacion = parametro.getValue({ fieldId: "lastmodifieddate" });
            let idTipoDte = parametro.getValue({ fieldId: "custbody_2wintipodtesii" });
            let folioFactura = parametro.getValue({ fieldId: "custbody_2winfolioacepta" });

            // Validar si se recupero tipo dte
            if (!idTipoDte || idTipoDte == "") {
                throw new Error ("Factura consultada no tiene valor para tipo dte")
            }

            nLog.debug("recuperarCamposRegistro - campos", {
                idEmpresaFactura: idEmpresaFactura,
                fechaUltimaModificacion: fechaUltimaModificacion,
                idTipoDte: idTipoDte,
                folioFactura: folioFactura
            });

            // Recuperar rut de subsidiaria (empresa) asociada a la factura
            let rutEmpresa = search.lookupFields({
                type: "subsidiary",
                id: idEmpresaFactura,
                columns: ["custrecord_2winrutsubsiudiaria"]
            });
            nLog.debug("recuperarCamposRegistro - rutEmpresa", { rutEmpresa: rutEmpresa });

            // Recuperar datos de tipo dte en base a los cuales se definira valor de tipoFactura
            let datosTipoDte = daoTipoDte.busquedaRegistroPorId(idTipoDte);

            // Validar si se recupero rut de empresa
            if (rutEmpresa && rutEmpresa.custrecord_2winrutsubsiudiaria.length > 0) {
                // Aislar y limpiar valor de campos con rut para enviar sin guiones o espacios y solo alfanumericos
                let rutEmpresaLimpio = rutEmpresa.custrecord_2winrutsubsiudiaria.replace(/[^0-9A-Za-z]/g, "");
                nLog.debug("recuperarCamposRegistro - rut", {
                    rutEmpresaLimpio: rutEmpresaLimpio
                });

                let tipoFactura = "";
                // Validar nombre y codigo dte para asignar valor a tipoFactura
                if (datosTipoDte[0].name.includes("Afecta") && datosTipoDte[0].custrecord_2w_codigo_dte_2 === "33") {
                    tipoFactura = "Afecta";
                } else if (datosTipoDte[0].name.includes("Exenta") && datosTipoDte[0].custrecord_2w_codigo_dte_2 === "34") {
                    tipoFactura = "Exenta";
                }

                // Definir objeto con datos recuperados de factura pagada
                facturaPagada = {
                    rutSociedad: rutEmpresaLimpio,
                    folioFactura: folioFactura, /**@description - Folio de la factura que se esta pagando */ 
                    // fechaPago: moment(fechaUltimaModificacion).format("YYYYMMDD"),
                    tipoFactura: tipoFactura,
                };
            } else {
                throw new Error(`No se encontró empresa con id: ${idEmpresaFactura}`);
            }

            nLog.debug("recuperarCamposRegistro - facturaPagada", { facturaPagada: facturaPagada });
            return facturaPagada;
        } catch (error) {
            nLog.error("recuperarCamposRegistro - error", error);
            throw error;
        }
    }

    /**
     * @function crearFactura - Crea una nueva factura en NetSuite
     * @param {Object} datosFactura - Datos necesarios para crear la factura
     * @param {string} datosFactura.subsidiary - ID de la subsidiaria
     * @param {string} datosFactura.entity - ID del cliente
     * @param {string} datosFactura.trandate - Fecha de la transacción
     * @param {Array} datosFactura.lineItems - Array de líneas de la factura
     * @returns {Object} - Resultado de la creación con ID generado
     */
    function crearFactura(datosFactura) {
        try {
            nLog.debug("crearFactura - datosFactura", datosFactura);

            // Crear nueva factura
            let nuevaFactura = record.create({
                type: record.Type.INVOICE,
                isDynamic: true
            });

            // Establecer campos del encabezado
            if (datosFactura.subsidiary) nuevaFactura.setValue("subsidiary", datosFactura.subsidiary);
            if (datosFactura.entity) nuevaFactura.setValue("entity", datosFactura.entity);
            if (datosFactura.trandate) nuevaFactura.setValue("trandate", datosFactura.trandate);
            if (datosFactura.memo) nuevaFactura.setValue("memo", datosFactura.memo);

            // Agregar líneas de items
            if (datosFactura.lineItems && Array.isArray(datosFactura.lineItems)) {
                datosFactura.lineItems.forEach(function (item) {
                    nuevaFactura.selectNewLine({ sublistId: "item" });
                    if (item.item) nuevaFactura.setCurrentSublistValue({ sublistId: "item", fieldId: "item", value: item.item });
                    if (item.quantity) nuevaFactura.setCurrentSublistValue({ sublistId: "item", fieldId: "quantity", value: item.quantity });
                    if (item.rate) nuevaFactura.setCurrentSublistValue({ sublistId: "item", fieldId: "rate", value: item.rate });
                    nuevaFactura.commitLine({ sublistId: "item" });
                });
            }

            // Guardar la factura
            let idFactura = nuevaFactura.save();

            nLog.audit("crearFactura - factura creada", { id: idFactura });

            return {
                success: true,
                id: idFactura,
                message: "Factura creada exitosamente"
            };
        } catch (error) {
            nLog.error("crearFactura - error", error);
            throw error;
        }
    }

    /**
     * @function actualizarFactura - Actualiza una factura existente
     * @param {string} idFactura - ID interno de la factura a actualizar
     * @param {Object} datosFactura - Campos a actualizar
     * @returns {Object} - Resultado de la actualización
     */
    function actualizarFactura(idFactura, datosFactura) {
        try {
            nLog.debug("actualizarFactura - parametros", { idFactura: idFactura, datosFactura: datosFactura });

            // Cargar la factura existente
            let facturaActualizar = record.load({
                type: record.Type.INVOICE,
                id: idFactura,
                isDynamic: true
            });

            // Actualizar campos del encabezado
            if (datosFactura.memo) facturaActualizar.setValue("memo", datosFactura.memo);
            if (datosFactura.trandate) facturaActualizar.setValue("trandate", datosFactura.trandate);

            // Actualizar líneas si es necesario (solo para nuevas líneas)
            if (datosFactura.newLineItems && Array.isArray(datosFactura.newLineItems)) {
                datosFactura.newLineItems.forEach(function (item) {
                    facturaActualizar.selectNewLine({ sublistId: "item" });
                    if (item.item) facturaActualizar.setCurrentSublistValue({ sublistId: "item", fieldId: "item", value: item.item });
                    if (item.quantity) facturaActualizar.setCurrentSublistValue({ sublistId: "item", fieldId: "quantity", value: item.quantity });
                    if (item.rate) facturaActualizar.setCurrentSublistValue({ sublistId: "item", fieldId: "rate", value: item.rate });
                    facturaActualizar.commitLine({ sublistId: "item" });
                });
            }

            // Guardar cambios
            let idActualizado = facturaActualizar.save();

            nLog.audit("actualizarFactura - factura actualizada", { id: idActualizado });

            return {
                success: true,
                id: idActualizado,
                message: "Factura actualizada exitosamente"
            };
        } catch (error) {
            nLog.error("actualizarFactura - error", error);
            throw error;
        }
    }

    /**
     * @function anularFactura - Anula una factura (método de eliminación lógica)
     * @param {string} idFactura - ID interno de la factura a anular
     * @returns {Object} - Resultado de la anulación
     */
    function anularFactura(idFactura) {
        try {
            nLog.debug("anularFactura - idFactura", idFactura);

            // Cargar la factura
            let facturaAnular = record.load({
                type: record.Type.INVOICE,
                id: idFactura,
                isDynamic: false
            });

            // Verificar que no esté ya aprobada
            let status = facturaAnular.getValue("status");
            if (status === "Voided" || status === "Open") {
                // Aplicar anulación
                facturaAnular.setValue("tobevoided", true);
                facturaAnular.save();

                nLog.audit("anularFactura - factura anulada", { id: idFactura });

                return {
                    success: true,
                    id: idFactura,
                    message: "Factura anulada exitosamente"
                };
            } else {
                throw new Error(`Factura ${idFactura} no puede ser anulada. Estado actual: ${status}`);
            }
        } catch (error) {
            nLog.error("anularFactura - error", error);
            throw error;
        }
    }

    /**
     * @function obtenerFacturaDetallada - Obtiene información detallada de una factura
     * @param {string} idFactura - ID interno de la factura
     * @returns {Object} - Información completa de la factura
     */
    function obtenerFacturaDetallada(idFactura) {
        try {
            nLog.debug("obtenerFacturaDetallada - idFactura", idFactura);

            // Cargar la factura completa
            let facturaDetalle = record.load({
                type: record.Type.INVOICE,
                id: idFactura,
                isDynamic: false
            });

            // Extraer información del header
            let facturaInfo = {
                internalid: facturaDetalle.getValue("id"),
                tranid: facturaDetalle.getValue("tranid"),
                trandate: facturaDetalle.getValue("trandate"),
                subsidiary: facturaDetalle.getValue("subsidiary"),
                entity: facturaDetalle.getValue("entity"),
                status: facturaDetalle.getValue("status"),
                amount: facturaDetalle.getValue("amount"),
                amountpaid: facturaDetalle.getValue("amountpaid"),
                amountremaining: facturaDetalle.getValue("amountremaining"),
                lineItems: []
            };

            // Extraer líneas de items
            let linesCount = facturaDetalle.getLineCount("item");
            for (let i = 0; i < linesCount; i++) {
                facturaInfo.lineItems.push({
                    item: facturaDetalle.getSublistValue("item", "item", i),
                    quantity: facturaDetalle.getSublistValue("item", "quantity", i),
                    rate: facturaDetalle.getSublistValue("item", "rate", i),
                    amount: facturaDetalle.getSublistValue("item", "amount", i)
                });
            }

            nLog.audit("obtenerFacturaDetallada - informacion obtenida", facturaInfo);

            return {
                success: true,
                data: facturaInfo
            };
        } catch (error) {
            nLog.error("obtenerFacturaDetallada - error", error);
            throw error;
        }
    }

    return {
        recuperarCamposRegistro: recuperarCamposRegistro,
        crearFactura: crearFactura,
        actualizarFactura: actualizarFactura,
        anularFactura: anularFactura,
        obtenerFacturaDetallada: obtenerFacturaDetallada
    };
});
