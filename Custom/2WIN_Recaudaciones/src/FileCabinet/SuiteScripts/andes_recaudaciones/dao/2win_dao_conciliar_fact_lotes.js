/**
 * Lecturas previas a reintentos del Scheduled. No escribe transacciones.
 * @NApiVersion 2.1
 * @NModuleScope SameAccount
 */
define(["N/record", "./2win_dao_recaudaciones_fact_lotes", "./CreditMemoDAO", "./InvoiceDAO",
    "../libs/2win_lib_recaudaciones_fact_lotes", "./2win_dao_recaudaciones_nc_rma", "./CustomerDAO", "../libs/subsidiaria", "../libs/utils"], function (record, daoLotes, CreditMemoDAO, InvoiceDAO, lib, daoRma, CustomerDAO, subsidiaria, utils) {
    function iguales(actual, esperado, campo) {
        if (String(actual == null ? "" : actual) !== String(esperado == null ? "" : esperado)) throw new Error(`Resultado incompatible: ${campo}`);
    }
    function importe(actual, esperado, campo) {
        if (!Number.isFinite(Number(actual)) || !Number.isFinite(Number(esperado)) || Math.abs(Number(actual) - Number(esperado)) > 0.0000001) {
            throw new Error(`Importe incompatible: ${campo}`);
        }
    }
    function cargar(tipo, clave) {
        const id = daoLotes.buscarPorClave(tipo, clave);
        if (!id) return null;
        const registro = record.load({ type: tipo, id: id, isDynamic: true });
        iguales(registro.getValue({ fieldId: lib.CAMPOS.proceso }), clave, "processKey");
        if (lib.esVerdadero(registro.getValue({ fieldId: "voided" }))) throw new Error("La transacción guardada fue anulada");
        return { id: id, registro: registro };
    }
    function cabecera(registro, datos) {
        if (!datos) throw new Error("No hay datos preparados para comprobar el resultado");
        iguales(registro.getValue({ fieldId: "entity" }), datos.customerId, "cliente");
        iguales(registro.getValue({ fieldId: "subsidiary" }), datos.razonSocialCobro || 1, "subsidiaria");
        iguales(registro.getValue({ fieldId: "custbody_2winfolioacepta" }), datos.folioBoleta || datos.folioNC, "folio");
    }
    function confirmarLote(tarea, preparado) {
        const existente = cargar("invoice", tarea.processKey);
        if (!existente) {
            if (tarea.desde !== 1) throw new Error("No existe la factura del lote anterior");
            return null;
        }
        const r = existente.registro;
        cabecera(r, preparado.estado.datosCreacion);
        iguales(Number(r.getValue({ fieldId: "approvalstatus" })), 1, "aprobación durante carga");
        if (!lib.esVerdadero(r.getValue({ fieldId: lib.CAMPOS.cargando }))) throw new Error("La factura ya no está en carga");
        const avance = Number(r.getValue({ fieldId: lib.CAMPOS.avance }));
        if (avance !== tarea.desde - 1 && avance !== tarea.hasta) throw new Error("Cursor guardado incompatible con el hijo");
        daoLotes.validarLineas(r, preparado, avance);
        return avance === tarea.hasta ? { documentoId: existente.id, avance: avance } : null;
    }
    function confirmarCreacion(tarea, preparado, documento) {
        const datos = preparado.estado.datosCreacion;
        if (!datos && !documento.documentoId) return {}; // La lógica existente permite documentos sin líneas.
        const tipo = tarea.tipo === "NOTA_CREDITO" ? "creditmemo" : "invoice";
        const existente = cargar(tipo, tarea.processKey);
        if (!existente) return null;
        const r = existente.registro;
        cabecera(r, datos);
        if (tipo === "invoice") iguales(Number(r.getValue({ fieldId: "approvalstatus" })), 2, "aprobación de creación completa");
        const items = datos.items || [];
        iguales(r.getLineCount({ sublistId: "item" }), items.length, "cantidad de líneas");
        items.forEach(function (item, i) {
            const obtener = campo => r.getSublistValue({ sublistId: "item", fieldId: campo, line: i });
            iguales(obtener("item"), item.item, `artículo ${i + 1}`);
            importe(obtener("amount"), item.rate || 0, `línea ${i + 1}`);
            importe(obtener("tax1amt") || 0, item.tax1amt || 0, `impuesto ${i + 1}`);
        });
        return { documentoId: existente.id };
    }
    function confirmarAsiento(tarea, preparado) {
        const existente = cargar("journalentry", `${tarea.processKey}:journal`);
        if (!existente) return null;
        const r = existente.registro;
        const lineas = preparado.estado.lineasJournal;
        if (preparado.estado.datosCreacion) iguales(r.getValue({ fieldId: "subsidiary" }),
            preparado.estado.datosCreacion.razonSocialCobro || 1, "subsidiaria del asiento");
        iguales(Number(r.getValue({ fieldId: "approvalstatus" })), 2, "aprobación del asiento");
        iguales(r.getLineCount({ sublistId: "line" }), lineas.length, "líneas del asiento");
        lineas.forEach(function (linea, i) {
            const obtener = campo => r.getSublistValue({ sublistId: "line", fieldId: campo, line: i });
            iguales(obtener("account"), linea.account, `cuenta ${i}`);
            importe(obtener("debit") || 0, linea.debit || 0, `débito ${i}`);
            importe(obtener("credit") || 0, linea.credit || 0, `crédito ${i}`);
            if (linea.entity) iguales(obtener("entity"), linea.entity, `entidad ${i}`);
            if (linea.folio) iguales(obtener("custcol_2w_folio"), linea.folio, `folio ${i}`);
        });
        return { journalId: existente.id };
    }
    function aplicaciones(r, sublista, esperados) {
        const encontrados = {};
        for (let i = 0; i < r.getLineCount({ sublistId: sublista }); i++) {
            if (!lib.esVerdadero(r.getSublistValue({ sublistId: sublista, fieldId: "apply", line: i }))) continue;
            const id = String(r.getSublistValue({ sublistId: sublista, fieldId: "doc", line: i }));
            const esperado = esperados.find(x => String(x.id) === id);
            if (!esperado) throw new Error(`Aplicación ajena al pago: ${id}`);
            if (esperado.amount) importe(r.getSublistValue({ sublistId: sublista, fieldId: "amount", line: i }), esperado.amount, `aplicación ${id}`);
            encontrados[id] = true;
        }
        esperados.forEach(x => { if (x.amount !== 0 && !encontrados[String(x.id)]) throw new Error(`Aplicación no confirmada: ${x.id}`); });
    }
    function confirmarPago(tarea, preparado, documento) {
        const existente = cargar("customerpayment", `${tarea.processKey}:payment`);
        if (!existente) return null;
        const estado = preparado.estado;
        const journalId = daoLotes.buscarPorClave("journalentry", `${tarea.processKey}:journal`);
        if (estado.totalJournalCopago > 0 && !journalId) throw new Error("No existe el asiento previo al pago");
        const r = existente.registro;
        importe(r.getValue({ fieldId: "payment" }) || 0, 0, "pago sin efectivo");
        if (preparado.estado.datosCreacion) {
            iguales(r.getValue({ fieldId: "customer" }), preparado.estado.datosCreacion.customerId, "cliente del pago");
            iguales(r.getValue({ fieldId: "subsidiary" }), preparado.estado.datosCreacion.razonSocialCobro || 1, "subsidiaria del pago");
        }
        if (tarea.tipo === "NOTA_CREDITO") {
            const conCopago = estado.totalJournalCopago > 0;
            aplicaciones(r, "apply", [{ id: estado.invoiceId, amount: conCopago ? estado.totalNotaCredito - estado.diferencia : estado.totalNotaCredito },
                ...(conCopago ? [{ id: journalId }] : [])]);
            aplicaciones(r, "credit", [documento.documentoId, ...(conCopago ? estado.journalIds : [])].map(id => ({ id: id })));
        } else {
            const customerId = CustomerDAO.getByRut(utils.formatearRut(preparado.documento.RutCliente));
            const subsidiariaId = subsidiaria.getSubsidiaria(utils.formatearRut(preparado.documento.razonSocial));
            const invoiceId = tarea.tipo === "NOTA_DEBITO" ? InvoiceDAO.findInvoiceByFolio(preparado.documento.folioDoc, customerId, subsidiariaId) : documento.documentoId;
            if (tarea.tipo === "NOTA_DEBITO" && !invoiceId) {
                throw new Error(`No se encontró factura asociada al folio ${preparado.documento.folioDoc} para el cliente ID ${customerId} y subsidiaria ID ${subsidiariaId}`);
            }
            aplicaciones(r, "apply", [{ id: invoiceId, amount: estado.diferencia }]);
            aplicaciones(r, "credit", [{ id: journalId }]);
        }
        return { paymentId: existente.id };
    }
    function confirmarNotaCredito(preparado, documento) {
        if (!documento.documentoId) return {}; // Condición original de la aplicación ND.
        const customerId = CustomerDAO.getByRut(utils.formatearRut(preparado.documento.RutCliente));
        const subsidiariaId = subsidiaria.getSubsidiaria(utils.formatearRut(preparado.documento.razonSocial));
        const id = CreditMemoDAO.getCreditIdByFolio(preparado.documento.folioRef, customerId, subsidiariaId);
        if (!id) {
            throw new Error(`No se encontró NC asociada al folio ${preparado.documento.folioRef} para el cliente ID ${customerId} y subsidiaria ID ${subsidiariaId}`);
        }
        const r = record.load({ type: "creditmemo", id: id, isDynamic: true });
        const destino = record.load({ type: "invoice", id: documento.documentoId, isDynamic: true });
        iguales(r.getValue({ fieldId: "entity" }), destino.getValue({ fieldId: "entity" }), "cliente de NC/ND");
        let anterioresSinAplicar = true;
        for (let i = 0; i < r.getLineCount({ sublistId: "apply" }); i++) {
            const doc = r.getSublistValue({ sublistId: "apply", fieldId: "doc", line: i });
            const aplicado = lib.esVerdadero(r.getSublistValue({ sublistId: "apply", fieldId: "apply", line: i }));
            if (String(doc) === String(documento.documentoId)) return aplicado && anterioresSinAplicar ? { creditMemoId: id } : null;
            anterioresSinAplicar = anterioresSinAplicar && !aplicado;
        }
        // El DAO original no guarda cuando el destino no está en la sublista.
        // Tras un aborto no es posible distinguir ausencia original de aplicación externa: no repetir a ciegas.
        throw new Error("No se puede conciliar la aplicación NC: destino ausente en la sublista");
    }
    function comprobar(tarea, preparado, documento) {
        switch (tarea.operacion) {
            case "CARGAR_RMA":
            case "APROBAR_RMA":
            case "TRANSFORMAR_NC": return daoRma.comprobar(tarea, preparado, documento);
            case "CARGAR": return confirmarLote(tarea, preparado);
            case "CREAR": return confirmarCreacion(tarea, preparado, documento);
            case "APROBAR": {
                const avance = daoLotes.obtenerAvance(tarea.tipo, tarea.processKey);
                if (!avance || !avance.aprobado || avance.cargando) return null;
                const existente = cargar("invoice", tarea.processKey);
                if (!existente) throw new Error("Desapareció la factura aprobada");
                const r = existente.registro;
                const items = preparado.estado.datosCreacion.items;
                cabecera(r, preparado.estado.datosCreacion);
                iguales(Number(r.getValue({ fieldId: "approvalstatus" })), 2, "aprobación final");
                if (lib.esVerdadero(r.getValue({ fieldId: lib.CAMPOS.cargando }))) throw new Error("La factura volvió a carga");
                iguales(Number(r.getValue({ fieldId: lib.CAMPOS.avance })), items.length, "avance final");
                daoLotes.validarLineas(r, preparado, items.length);
                const subtotal = items.reduce((suma, item) => suma + Number(item.rate || 0), 0);
                const impuesto = items.reduce((suma, item) => suma + Number(item.tax1amt || 0), 0);
                importe(r.getValue({ fieldId: "subtotal" }), subtotal, "subtotal final");
                importe(r.getValue({ fieldId: "taxtotal" }) || 0, impuesto, "impuesto final");
                importe(r.getValue({ fieldId: "total" }), subtotal + impuesto, "total final");
                return { documentoId: existente.id };
            }
            case "CREAR_ASIENTO": return confirmarAsiento(tarea, preparado);
            case "CREAR_PAGO": return confirmarPago(tarea, preparado, documento);
            case "APLICAR_NOTA_CREDITO": return confirmarNotaCredito(preparado, documento);
            default: return null;
        }
    }
    return { comprobar };
});
