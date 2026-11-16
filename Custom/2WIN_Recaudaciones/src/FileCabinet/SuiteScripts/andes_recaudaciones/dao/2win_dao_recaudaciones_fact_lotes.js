/**
 * @NApiVersion 2.1
 * @NModuleScope SameAccount
 */
define(["N/record", "N/search", "N/log", "N/runtime", "./InvoiceDAO", "../libs/2win_lib_recaudaciones_fact_lotes"],
function (record, search, nLog, runtime, InvoiceDAO, libLotes) {
    const CAMPOS = libLotes.CAMPOS;
    function buscarPorClave(tipo, processKey) {
        const columna = search.createColumn({ name: "internalid", summary: search.Summary.GROUP });
        const filas = search.create({ type: tipo,
            filters: [[CAMPOS.proceso, "is", processKey]],
            columns: [columna] }).run().getRange({ start: 0, end: 2 });
        if (filas.length > 1) throw new Error(`Hay varias transacciones con clave ${processKey}`);
        return filas.length ? filas[0].getValue(columna) : null;
    }

    function obtenerAvance(tipo, processKey) {
        const id = buscarPorClave(tipo === "NOTA_CREDITO" ? "creditmemo" : "invoice", processKey);
        if (!id) return null;
        if (tipo === "NOTA_CREDITO") return { documentoId: id };
        const campos = search.lookupFields({ type: "invoice", id: id, columns: [CAMPOS.avance, CAMPOS.cargando, "approvalstatus"] });
        return { documentoId: id, avance: Number(campos[CAMPOS.avance]) || 0,
            porLotes: Number(campos[CAMPOS.avance]) > 0 || libLotes.esVerdadero(campos[CAMPOS.cargando]), cargando: libLotes.esVerdadero(campos[CAMPOS.cargando]),
            aprobado: !!(campos.approvalstatus && campos.approvalstatus.length && Number(campos.approvalstatus[0].value) === 2) };
    }

    function comprobarNumero(actual, esperado, nombre) {
        if (!Number.isFinite(Number(actual)) || !Number.isFinite(Number(esperado)) ||
            Math.abs(Number(actual) - Number(esperado)) > 0.0000001) {
            throw new Error(`${nombre}: se esperaba ${esperado}, se encontró ${actual}`);
        }
    }

    function validarLineas(registro, preparado, cantidad, diagnostico) {
        const items = preparado.estado.datosCreacion.items;
        const total = registro.getLineCount({ sublistId: "item" });
        if (total !== cantidad || total > items.length) throw new Error(`Cantidad de líneas incompatible: ${total}/${cantidad}`);
        for (let i = 0; i < cantidad; i++) {
            if (diagnostico) diagnostico.lineaActual = i + 1;
            const obtener = (campo) => {
                if (diagnostico) diagnostico.operacion = `getSublistValue:${campo}`;
                return registro.getSublistValue({ sublistId: "item", fieldId: campo, line: i });
            };
            const item = items[i];
            if (String(obtener(CAMPOS.linea)) !== `${preparado.processKey}:${i + 1}` ||
                String(obtener("item")) !== String(item.item) ||
                String(obtener("custcol_2w_folio") || "") !== String(item.folioBoleta || "")) {
                throw new Error(`Se modificó la identidad de la línea ${i + 1}`);
            }
            comprobarNumero(obtener("amount"), item.rate || 0, `Importe línea ${i + 1}`);
            comprobarNumero(obtener("tax1amt") || 0, item.tax1amt || 0, `Impuesto línea ${i + 1}`);
            comprobarNumero(obtener("custcol_2win_as_identificador_fila") || 0, 0, `Identificador línea ${i + 1}`);
        }
    }

    function cargarValidado(id, preparado, preparadoId) {
        const registro = record.load({ type: record.Type.INVOICE, id: id, isDynamic: true });
        if (String(registro.getValue({ fieldId: CAMPOS.proceso })) !== preparado.processKey) {
            throw new Error(`La transacción ${id} no pertenece a esta carga por lotes`);
        }
        return registro;
    }

    function cargarLote(preparado, preparadoId, inicio, cantidad) {
        if (preparado.tipo === "NOTA_CREDITO") throw new Error("NC por lotes no habilitada: requiere validar aprobación sin contabilización");
        const datos = preparado.estado.datosCreacion;
        const total = datos.items.length;
        if (!total || total > 10000) throw new Error(`Cantidad de líneas no soportada por esta vía: ${total}`);
        const fin = Math.min(inicio + cantidad, total);
        if (!Number.isSafeInteger(inicio) || inicio < 0 || inicio >= total || fin <= inicio) throw new Error("Rango de lote inválido");
        const inicioLote = Date.now();
        const unidadesIniciales = runtime.getCurrentScript().getRemainingUsage();
        let inicioEtapa = inicioLote;
        let inicioBloque = inicioLote;
        let id = null;
        const diagnostico = { etapa: null, operacion: null, lineaActual: null, lineasCompletadas: 0 };
        function detalle(evento) {
            const ahora = Date.now();
            return { fechaUtc: new Date(ahora).toISOString(),
                processKey: preparado.processKey, folio: datos.folioBoleta, documentoId: id,
                desdeLinea: inicio + 1, hastaLinea: fin, totalLineas: total, ...diagnostico, evento: evento,
                duracionMs: ahora - inicioEtapa, acumuladoMs: ahora - inicioLote,
                duracionBloqueMs: ahora - inicioBloque,
                unidadesConsumidas: unidadesIniciales - runtime.getCurrentScript().getRemainingUsage(),
                unidadesRestantes: runtime.getCurrentScript().getRemainingUsage() };
        }
        function registrar(evento) {
            nLog.audit("facturacion lotes DAO - tiempo", detalle(evento));
            inicioBloque = Date.now();
        }
        function medir(etapa, operacion, ejecutar) {
            diagnostico.etapa = etapa;
            diagnostico.operacion = operacion;
            inicioEtapa = Date.now();
            inicioBloque = inicioEtapa;
            registrar("inicio");
            const resultado = ejecutar();
            registrar("fin");
            return resultado;
        }
        try {
            id = medir("buscarTransaccion", "search", () => buscarPorClave("invoice", preparado.processKey));
            if (!id) {
                if (inicio !== 0) throw new Error("No se encontró la transacción del primer lote");
                id = medir("crearPrimerLote", "InvoiceDAO.createInvoice", () => InvoiceDAO.createInvoice(Object.assign({}, datos, {
                    items: datos.items.slice(0, fin),
                    cargaPorLotes: { total: total, preparadoId: preparadoId }
                })));
            } else {
                const registro = medir("cargarRegistro", "record.load", () => cargarValidado(id, preparado, preparadoId));
                diagnostico.etapa = "validarCabecera";
                diagnostico.operacion = "getValue";
                const avance = Number(registro.getValue({ fieldId: CAMPOS.avance }));
                if (Number(registro.getValue({ fieldId: "approvalstatus" })) !== 1 ||
                    !libLotes.esVerdadero(registro.getValue({ fieldId: CAMPOS.cargando }))) {
                    throw new Error(`La transacción ${id} dejó de estar pendiente durante la carga`);
                }
                if (avance !== inicio && avance !== fin) throw new Error(`Avance incompatible: ${avance}; lote ${inicio}-${fin}`);
                medir("validarLineas", "getLineCount", () => validarLineas(registro, preparado, avance, diagnostico));
                if (avance === inicio) {
                    medir("agregarLineas", "selectNewLine", () => {
                        for (let i = inicio; i < fin; i++) {
                            diagnostico.lineaActual = i + 1;
                            const item = datos.items[i];
                            diagnostico.operacion = "selectNewLine";
                            registro.selectNewLine({ sublistId: "item" });
                            diagnostico.operacion = "setCurrentSublistValue:item";
                            registro.setCurrentSublistValue({ sublistId: "item", fieldId: "item", value: item.item });
                            diagnostico.operacion = "setCurrentSublistValue:amount";
                            registro.setCurrentSublistValue({ sublistId: "item", fieldId: "amount", value: item.rate || 0 });
                            diagnostico.operacion = "setCurrentSublistValue:tax1amt";
                            registro.setCurrentSublistValue({ sublistId: "item", fieldId: "tax1amt", value: item.tax1amt || 0 });
                            diagnostico.operacion = "setCurrentSublistValue:custcol_2w_folio";
                            if (item.folioBoleta) registro.setCurrentSublistValue({ sublistId: "item", fieldId: "custcol_2w_folio", value: item.folioBoleta });
                            diagnostico.operacion = "setCurrentSublistValue:custcol_2win_as_identificador_fila";
                            registro.setCurrentSublistValue({ sublistId: "item", fieldId: "custcol_2win_as_identificador_fila", value: 0 });
                            diagnostico.operacion = "setCurrentSublistValue:" + CAMPOS.linea;
                            registro.setCurrentSublistValue({ sublistId: "item", fieldId: CAMPOS.linea, value: `${preparado.processKey}:${i + 1}` });
                            diagnostico.operacion = "commitLine";
                            registro.commitLine({ sublistId: "item" });
                            diagnostico.lineasCompletadas = i + 1 - inicio;
                            if (diagnostico.lineasCompletadas % 200 === 0 || i + 1 === fin) registrar("avance");
                        }
                    });
                    diagnostico.operacion = "setValue:avance";
                    registro.setValue({ fieldId: CAMPOS.avance, value: fin });
                    medir("guardarRegistro", "record.save", () => registro.save({ enableSourcing: false, ignoreMandatoryFields: true }));
                }
            }
            // Confirmar cabecera con lookupFields, sin volver a cargar miles de líneas.
            const guardado = medir("confirmarGuardado", "search.lookupFields", () => search.lookupFields({ type: "invoice", id: id,
                columns: ["approvalstatus", CAMPOS.cargando, CAMPOS.avance, CAMPOS.proceso] }));
            if (!guardado.approvalstatus.length || Number(guardado.approvalstatus[0].value) !== 1 ||
                !libLotes.esVerdadero(guardado[CAMPOS.cargando]) || Number(guardado[CAMPOS.avance]) !== fin ||
                String(guardado[CAMPOS.proceso]) !== preparado.processKey) {
                throw new Error(`El lote guardado de ${id} no conserva el estado pendiente esperado`);
            }
            return { documentoId: id, avance: fin, completo: fin === total };
        } catch (error) {
            nLog.error("facturacion lotes DAO - error", { ...detalle("error"), nombre: error.name,
                mensaje: error.message, codigo: error.code, errorId: error.id, causa: error.cause, stack: error.stack });
            throw error;
        }
    }

    function aprobar(preparado, preparadoId) {
        const id = buscarPorClave("invoice", preparado.processKey);
        if (!id) throw new Error("No existe la transacción que se debe aprobar");
        const registro = cargarValidado(id, preparado, preparadoId);
        const items = preparado.estado.datosCreacion.items;
        validarLineas(registro, preparado, items.length);
        comprobarNumero(registro.getValue({ fieldId: CAMPOS.avance }), items.length, "Avance final");
        const subtotal = items.reduce((suma, item) => suma + Number(item.rate || 0), 0);
        const impuesto = items.reduce((suma, item) => suma + Number(item.tax1amt || 0), 0);
        comprobarNumero(registro.getValue({ fieldId: "subtotal" }), subtotal, "Subtotal final");
        comprobarNumero(registro.getValue({ fieldId: "taxtotal" }) || 0, impuesto, "Impuestos finales");
        comprobarNumero(registro.getValue({ fieldId: "total" }), subtotal + impuesto, "Total final");
        const aprobado = Number(registro.getValue({ fieldId: "approvalstatus" })) === 2;
        if (aprobado) {
            if (libLotes.esVerdadero(registro.getValue({ fieldId: CAMPOS.cargando }))) {
                throw new Error("La transacción fue aprobada fuera de la finalización de lotes");
            }
        } else {
            if (Number(registro.getValue({ fieldId: "approvalstatus" })) !== 1) throw new Error("La transacción no está pendiente de aprobación");
            registro.setValue({ fieldId: CAMPOS.cargando, value: false });
            registro.setValue({ fieldId: "approvalstatus", value: 2 });
            registro.save({ enableSourcing: false, ignoreMandatoryFields: true });
        }
        const guardado = cargarValidado(id, preparado, preparadoId);
        if (Number(guardado.getValue({ fieldId: "approvalstatus" })) !== 2 ||
            libLotes.esVerdadero(guardado.getValue({ fieldId: CAMPOS.cargando }))) throw new Error("No se confirmó la aprobación final");
        validarLineas(guardado, preparado, items.length);
        comprobarNumero(guardado.getValue({ fieldId: "total" }), subtotal + impuesto, "Total después de aprobación");
        return id;
    }

    function validarReferencia(tipo, documento) {
        if (tipo !== "NOTA_CREDITO" || !documento.folioRef) return;
        const id = InvoiceDAO.findInvoiceByFolio(documento.folioRef);
        if (!id) return; // Conservar las validaciones originales de referencias ausentes.
        const valores = search.lookupFields({ type: "invoice", id: id, columns: [CAMPOS.cargando, CAMPOS.avance, "approvalstatus"] });
        if ((Number(valores[CAMPOS.avance]) > 0 || libLotes.esVerdadero(valores[CAMPOS.cargando])) &&
            (libLotes.esVerdadero(valores[CAMPOS.cargando]) ||
            !valores.approvalstatus.length || Number(valores.approvalstatus[0].value) !== 2)) {
            throw new Error(`La factura referenciada ${documento.folioRef} todavía no completó su carga y aprobación`);
        }
    }

    return { validarLineas, buscarPorClave, obtenerAvance, cargarLote, aprobar, validarReferencia };
});
