/**
 * RMA intermedia exclusiva para NC del Scheduled. No modifica facturas ni ND.
 * @NApiVersion 2.1
 * @NModuleScope SameAccount
 */
define(["N/record", "N/search", "N/runtime", "N/log", "./2win_dao_recaudaciones_fact_lotes",
    "./CreditMemoDAO", "../libs/2win_lib_recaudaciones_fact_lotes"],
function (record, search, runtime, nLog, daoLotes, CreditMemoDAO, lib) {
    const CAMPOS = lib.CAMPOS;
    const PENDIENTE = "A";
    const APROBADA = "B";
    const SAVE = { enableSourcing: false, ignoreMandatoryFields: true };

    function medir(preparado, etapa, trabajo) {
        const inicio = Date.now(), unidades = runtime.getCurrentScript().getRemainingUsage();
        const contexto = { processKey: preparado.processKey, folio: preparado.estado.datosCreacion.folioNC, etapa };
        nLog.audit("facturacion NC RMA - tiempo", { ...contexto, evento: "inicio" });
        try {
            const resultado = trabajo();
            nLog.audit("facturacion NC RMA - tiempo", { ...contexto, evento: "fin", duracionMs: Date.now() - inicio,
                unidadesConsumidas: unidades - runtime.getCurrentScript().getRemainingUsage() });
            return resultado;
        } catch (error) {
            nLog.error("facturacion NC RMA - error", { ...contexto, duracionMs: Date.now() - inicio,
                nombre: error.name, mensaje: error.message, stack: error.stack });
            throw error;
        }
    }
    function igual(actual, esperado, campo) {
        if (String(actual == null ? "" : actual) !== String(esperado == null ? "" : esperado)) {
            throw new Error(`RMA/NC incompatible: ${campo}; esperado ${esperado}, obtenido ${actual}`);
        }
    }
    function importe(actual, esperado, campo) {
        if (!Number.isFinite(Number(actual)) || Math.abs(Number(actual) - esperado) > 0.0000001) {
            throw new Error(`RMA/NC importe incompatible: ${campo}; esperado ${esperado}, obtenido ${actual}`);
        }
    }
    function items(preparado) {
        const datos = preparado.estado.datosCreacion;
        if (preparado.tipo !== "NOTA_CREDITO" || !datos || datos.esAnticipo === "N" ||
            !Array.isArray(datos.items) || !datos.items.length || datos.items.length > 10000) {
            throw new Error("Preparado incompatible con NC mediante RMA");
        }
        return datos.items;
    }
    function cargar(tipo, id, preparado) {
        return medir(preparado, `cargar:${tipo}:${id}`, () => record.load({ type: tipo, id, isDynamic: true }));
    }
    function cabecera(r, preparado, esRma) {
        const datos = preparado.estado.datosCreacion;
        igual(r.getValue({ fieldId: CAMPOS.proceso }), preparado.processKey + (esRma ? ":rma" : ""), "clave");
        igual(r.getValue({ fieldId: "entity" }), datos.customerId, "cliente");
        igual(r.getValue({ fieldId: "subsidiary" }), datos.razonSocialCobro, "subsidiaria");
        if (lib.esVerdadero(r.getValue({ fieldId: "voided" }))) throw new Error("La RMA/NC fue anulada");
        if (esRma) igual(r.getValue({ fieldId: "customform" }), preparado.rma.formulario, "formulario RMA");
    }
    function validarLineas(r, preparado, cantidad) {
        try {
            daoLotes.validarLineas(r, preparado, cantidad);
        } catch (error) {
            const coincidencia = /^Se modificó la identidad de la línea (\d+)$/.exec(error.message || "");
            if (coincidencia) {
                const linea = Number(coincidencia[1]), item = preparado.estado.datosCreacion.items[linea - 1];
                const diferencias = [];
                for (const [campo, esperado] of [[CAMPOS.linea, `${preparado.processKey}:${linea}`],
                    ["item", String(item.item)], ["custcol_2w_folio", String(item.folioBoleta || "")]]) {
                    const valor = r.getSublistValue({ sublistId: "item", fieldId: campo, line: linea - 1 });
                    const actual = campo === "custcol_2w_folio" ? String(valor || "") : String(valor);
                    if (actual !== esperado) diferencias.push({ campo, esperado, actual });
                }
                nLog.error("facturacion NC RMA - identidad de línea", {
                    processKey: preparado.processKey, folio: preparado.estado.datosCreacion.folioNC,
                    tipoRegistro: r.type, registroId: r.id, linea, diferencias
                });
                error.message += `; diferencias: ${JSON.stringify(diferencias)}`;
            }
            throw error;
        }
    }
    function validarCompleto(r, preparado) {
        const lineas = items(preparado);
        validarLineas(r, preparado, lineas.length);
        const subtotal = lineas.reduce((s, i) => s + Number(i.rate || 0), 0);
        const impuestos = lineas.reduce((s, i) => s + Number(i.tax1amt || 0), 0);
        importe(r.getValue({ fieldId: "subtotal" }), subtotal, "subtotal");
        importe(r.getValue({ fieldId: "taxtotal" }) || 0, impuestos, "impuestos");
        importe(r.getValue({ fieldId: "total" }), subtotal + impuestos, "total");
    }
    function buscarRma(preparado) {
        return daoLotes.buscarPorClave("returnauthorization", `${preparado.processKey}:rma`);
    }
    function validarPendiente(r) {
        igual(r.getValue({ fieldId: "orderstatus" }), PENDIENTE, "RMA pendiente de aprobación");
        if (!lib.esVerdadero(r.getValue({ fieldId: CAMPOS.cargando }))) throw new Error("La RMA ya no está en carga");
    }
    function validarAprobada(r) {
        // NetSuite puede derivar el estado según recepción; nunca aceptar cancelada/cerrada/acreditada.
        if (!["B", "D", "E", "F"].includes(String(r.getValue({ fieldId: "orderstatus" }))) ||
            lib.esVerdadero(r.getValue({ fieldId: CAMPOS.cargando }))) {
            throw new Error("La RMA no está aprobada y disponible para generar la NC");
        }
    }
    function cargarLote(preparado, inicio, cantidad) {
        const lineas = items(preparado), fin = Math.min(inicio + cantidad, lineas.length);
        lib.enteroPositivo(cantidad, "lineasPorLote");
        if (!Number.isSafeInteger(inicio) || inicio < 0 || inicio >= lineas.length) throw new Error("Rango RMA inválido");
        return medir(preparado, `lote:${inicio + 1}-${fin}`, function () {
            let id = buscarRma(preparado), r;
            if (id) r = cargar("returnauthorization", id, preparado);
            else {
                if (inicio !== 0) throw new Error("No existe la RMA del lote anterior");
                const datos = preparado.estado.datosCreacion;
                const formulario = lib.enteroPositivo(preparado.rma.formulario, "formulario RMA Credit");
                r = record.create({ type: record.Type.RETURN_AUTHORIZATION, isDynamic: true,
                    defaultValues: { customform: formulario } });
                r.setValue({ fieldId: "entity", value: datos.customerId });
                r.setValue({ fieldId: "subsidiary", value: datos.razonSocialCobro });
                r.setValue({ fieldId: "trandate", value: new Date(datos.fechaTransaccion) });
                r.setValue({ fieldId: "memo", value: `Carga de NC ${datos.folioNC}` });
                r.setValue({ fieldId: CAMPOS.proceso, value: `${preparado.processKey}:rma` });
                r.setValue({ fieldId: "externalid", value: `${preparado.processKey}:rma` });
                r.setValue({ fieldId: "orderstatus", value: PENDIENTE });
                r.setValue({ fieldId: CAMPOS.cargando, value: true });
                r.setValue({ fieldId: CAMPOS.avance, value: 0 });
            }
            cabecera(r, preparado, true);
            validarPendiente(r);
            const avance = Number(r.getValue({ fieldId: CAMPOS.avance }));
            if (avance !== inicio && avance !== fin) throw new Error("Cursor RMA incompatible con el lote");
            validarLineas(r, preparado, avance);
            if (avance === inicio) {
                const comienzo = Date.now();
                let bloque = comienzo;
                for (let i = inicio; i < fin; i++) {
                    const item = lineas[i];
                    r.selectNewLine({ sublistId: "item" });
                    r.setCurrentSublistValue({ sublistId: "item", fieldId: "item", value: item.item });
                    // El preparado de NC representa cada detalle con cantidad 1 e importe en rate.
                    // La RMA requiere precio unitario y descripción aunque la NC directa los derive.
                    r.setCurrentSublistValue({ sublistId: "item", fieldId: "quantity", value: 1 });
                    r.setCurrentSublistValue({ sublistId: "item", fieldId: "price", value: -1 });
                    r.setCurrentSublistValue({ sublistId: "item", fieldId: "rate", value: item.rate || 0 });
                    r.setCurrentSublistValue({ sublistId: "item", fieldId: "description",
                        value: item.description || item.descripcion || `Nota de crédito ${preparado.estado.datosCreacion.folioNC}` });
                    r.setCurrentSublistValue({ sublistId: "item", fieldId: "amount", value: item.rate || 0 });
                    r.setCurrentSublistValue({ sublistId: "item", fieldId: "tax1amt", value: item.tax1amt || 0 });
                    if (item.folioBoleta) r.setCurrentSublistValue({ sublistId: "item", fieldId: "custcol_2w_folio", value: item.folioBoleta });
                    r.setCurrentSublistValue({ sublistId: "item", fieldId: "custcol_2win_as_identificador_fila", value: 0 });
                    r.setCurrentSublistValue({ sublistId: "item", fieldId: CAMPOS.linea, value: `${preparado.processKey}:${i + 1}` });
                    r.commitLine({ sublistId: "item" });
                    if ((i + 1 - inicio) % 200 === 0 || i + 1 === fin) {
                        nLog.audit("facturacion NC RMA - líneas", { processKey: preparado.processKey, rmaId: id,
                            desdeLinea: inicio + 1, hastaLinea: fin, lineaActual: i + 1, totalLineas: lineas.length,
                            duracionMs: Date.now() - comienzo, duracionBloqueMs: Date.now() - bloque });
                        bloque = Date.now();
                    }
                }
                r.setValue({ fieldId: CAMPOS.avance, value: fin });
                id = medir(preparado, "guardarRma", () => r.save(SAVE));
            }
            const confirmado = comprobar({ operacion: "CARGAR_RMA", desde: inicio + 1, hasta: fin }, preparado, {});
            if (!confirmado) throw new Error("No se confirmó el lote RMA guardado");
            return confirmado;
        });
    }
    function aprobar(preparado) {
        const id = buscarRma(preparado);
        if (!id) throw new Error("No existe la RMA que se debe aprobar");
        const r = cargar("returnauthorization", id, preparado);
        cabecera(r, preparado, true);
        validarCompleto(r, preparado);
        igual(Number(r.getValue({ fieldId: CAMPOS.avance })), items(preparado).length, "avance completo");
        if (String(r.getValue({ fieldId: "orderstatus" })) === PENDIENTE) {
            validarPendiente(r);
            r.setValue({ fieldId: CAMPOS.cargando, value: false });
            r.setValue({ fieldId: "orderstatus", value: APROBADA });
            medir(preparado, "aprobarRma", () => r.save(SAVE));
        } else validarAprobada(r);
        const confirmado = comprobar({ operacion: "APROBAR_RMA" }, preparado, {});
        if (!confirmado) throw new Error("No se confirmó la aprobación RMA");
        return confirmado;
    }
    function validarNc(r, preparado, rmaId, sinAplicar) {
        cabecera(r, preparado, false);
        igual(r.getValue({ fieldId: "createdfrom" }), rmaId, "RMA de origen");
        const datos = preparado.estado.datosCreacion;
        igual(r.getValue({ fieldId: "customform" }), 163, "formulario NC");
        igual(r.getValue({ fieldId: "custbody_2winfolioacepta" }), datos.folioNC, "folio NC");
        igual(r.getValue({ fieldId: "account" }), datos.account, "cuenta NC");
        igual(r.getValue({ fieldId: "custbody_2wintipodtesii" }), 4, "tipo DTE NC");        
        validarCompleto(r, preparado);
        if (sinAplicar) {
            for (let i = 0; i < r.getLineCount({ sublistId: "apply" }); i++) {
                if (lib.esVerdadero(r.getSublistValue({ sublistId: "apply", fieldId: "apply", line: i }))) {
                    throw new Error("La NC fue aplicada antes de su tarea de aplicación");
                }
            }
        }
    }
    function confirmarNc(preparado, documento, sinAplicar) {
        const rmaId = buscarRma(preparado);
        if (!rmaId) throw new Error("No existe la RMA de origen");
        if (documento.rmaId) igual(rmaId, documento.rmaId, "RMA del estado");
        const id = daoLotes.buscarPorClave("creditmemo", preparado.processKey);
        if (id) {
            validarNc(cargar("creditmemo", id, preparado), preparado, rmaId, sinAplicar);
            return { rmaId, documentoId: id };
        }
        // Una NC ajena generada desde esta RMA requiere revisión; no transformar nuevamente.
        const otras = search.create({ type: "creditmemo", filters: [["createdfrom", "anyof", rmaId], "AND",
            ["mainline", "is", "T"]], columns: ["internalid"] }).run().getRange({ start: 0, end: 1 });
        if (otras.length) throw new Error("La RMA ya tiene una NC sin la clave esperada; revisar antes de continuar");
        return null;
    }
    function transformar(preparado, documento) {
        const existente = confirmarNc(preparado, documento, true);
        if (existente) return existente;
        const rmaId = buscarRma(preparado), rma = cargar("returnauthorization", rmaId, preparado);
        cabecera(rma, preparado, true); validarAprobada(rma); validarCompleto(rma, preparado);
        const nc = medir(preparado, "transformarRmaNc", () => record.transform({
            fromType: record.Type.RETURN_AUTHORIZATION, fromId: rmaId,
            toType: record.Type.CREDIT_MEMO, isDynamic: true, defaultValues: { customform: 163 }
        }));
        const id = medir(preparado, "completarCabeceraGuardarNc", () => CreditMemoDAO.createCreditMemo(preparado.estado.datosCreacion, {
            registroTransformado: nc,
            validarAntesGuardar(r) {
                if (String(r.getValue({ fieldId: "externalid" })) === `${preparado.processKey}:rma`) {
                    r.setValue({ fieldId: "externalid", value: "" });
                }
                r.setValue({ fieldId: "autoapply", value: false });
                r.setValue({ fieldId: CAMPOS.cargando, value: false });
                for (let i = 0; i < r.getLineCount({ sublistId: "apply" }); i++) {
                    if (lib.esVerdadero(r.getSublistValue({ sublistId: "apply", fieldId: "apply", line: i }))) {
                        r.selectLine({ sublistId: "apply", line: i });
                        r.setCurrentSublistValue({ sublistId: "apply", fieldId: "apply", value: false });
                        r.commitLine({ sublistId: "apply" });
                    }
                }
                validarNc(r, preparado, rmaId, true);
                for (let i = 0; i < items(preparado).length; i++) {
                    for (const campo of ["quantity", "tax1code"]) {
                        igual(r.getSublistValue({ sublistId: "item", fieldId: campo, line: i }),
                            rma.getSublistValue({ sublistId: "item", fieldId: campo, line: i }), `${campo} transformado línea ${i + 1}`);
                    }
                }
                nLog.audit("facturacion NC RMA - guardar NC inicio", { processKey: preparado.processKey, rmaId });
            }
        }));
        const resultado = confirmarNc(preparado, { rmaId }, true);
        if (!resultado || String(resultado.documentoId) !== String(id)) throw new Error("No se confirmó la NC transformada");
        return resultado;
    }
    function comprobar(tarea, preparado, documento) {
        if (tarea.operacion === "TRANSFORMAR_NC") return confirmarNc(preparado, documento, true);
        const id = buscarRma(preparado);
        if (!id) {
            if (tarea.operacion === "CARGAR_RMA" && tarea.desde === 1) return null;
            throw new Error("No existe la RMA esperada");
        }
        const r = cargar("returnauthorization", id, preparado);
        cabecera(r, preparado, true);
        const avance = Number(r.getValue({ fieldId: CAMPOS.avance }));
        if (tarea.operacion === "CARGAR_RMA") {
            validarPendiente(r);
            if (avance !== tarea.desde - 1 && avance !== tarea.hasta) throw new Error("Cursor RMA incompatible con el hijo");
            validarLineas(r, preparado, avance);
            return avance === tarea.hasta ? { rmaId: id, avance } : null;
        }
        if (tarea.operacion !== "APROBAR_RMA") throw new Error("Operación RMA desconocida");
        validarCompleto(r, preparado);
        igual(avance, items(preparado).length, "avance completo");
        if (String(r.getValue({ fieldId: "orderstatus" })) === PENDIENTE) { validarPendiente(r); return null; }
        validarAprobada(r);
        return { rmaId: id };
    }
    return { cargarLote, aprobar, transformar, comprobar, confirmarNc };
});
