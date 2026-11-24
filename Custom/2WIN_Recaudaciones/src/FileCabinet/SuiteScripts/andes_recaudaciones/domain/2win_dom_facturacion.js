define([
    "N/runtime",
    "N/log",
    "../dao/2win_dao_file",
    "../dao/JournalEntryDAO",
    "../dao/PaymentDAO",
    "../dao/CustomerDAO",
    "../dao/InvoiceDAO",
    "../dao/CreditMemoDAO",
    "../dao/MappingDAO",
    "../constants/2win_constants",
    "../libs/subsidiaria",
    "../libs/utils",
    "../dao/2win_dao_draft",
    "../libs/2win_lib_auditoria"
], function (
    runtime,
    nLog,
    daoFile,
    JournalEntryDAO,
    PaymentDAO,
    CustomerDAO,
    InvoiceDAO,
    CreditMemoDAO,
    MappingDAO,
    { getFlow },
    subsidiaria,
    utils,
    { reverseTransaction },
    libAuditoria
) {

    function consultarAsientosPorDetalleEnLotes(foliosPorDetalle) {
        const foliosUnicos = [...new Set(foliosPorDetalle.reduce((folios, detalle) => folios.concat(detalle), []))];
        const resultado = JournalEntryDAO.getJournalEntriesByFolioEnLotes({ folios: foliosUnicos });
        const asientosPorFolio = Object.create(null);
        resultado.asientos.forEach((asiento) => {
            // Usar la misma comparación numérica de folios que la selección del copago.
            const folio = Number(asiento.custcol_2w_folio);
            if (Number.isNaN(folio)) return;
            if (!asientosPorFolio[folio]) asientosPorFolio[folio] = [];
            asientosPorFolio[folio].push(asiento);
        });
        const asientosPorDetalle = foliosPorDetalle.map((folios) => {
            const foliosNumericos = [...new Set(folios.map(Number))];
            return foliosNumericos.reduce((asientos, folio) => asientos.concat(asientosPorFolio[folio] || []), [])
                .sort((a, b) => Number(b.id) - Number(a.id));
        });
        return { asientosPorDetalle: asientosPorDetalle, folios: foliosUnicos.length, consultas: resultado.consultas };
    }

    function precargarAsientosFactura(detalles, folioDoc, processKey, inicioPreparacion) {
        const inicioConsulta = Date.now();
        const unidadesIniciales = runtime.getCurrentScript().getRemainingUsage();
        const foliosPorDetalle = detalles.map((detalle) => {
            if (detalle.tipoDocumento !== "BONO ELECTRONICO") return [];
            const folios = [detalle.folio];
            if (Number(detalle.montoCopago) > 0) folios.push(detalle.folioCopago);
            if (Number(detalle.montoExcedente) > 0) folios.push(detalle.folioExcedente);
            return [...new Set(folios)];
        });
        const resultado = consultarAsientosPorDetalleEnLotes(foliosPorDetalle);
        const asientosPorDetalle = resultado.asientosPorDetalle;
        const faltantes = [];
        foliosPorDetalle.forEach((folios, indice) => {
            folios.forEach((folio) => {
                if (!asientosPorDetalle[indice].some((asiento) => Number(asiento.custcol_2w_folio) === Number(folio))) {
                    faltantes.push(String(folio));
                }
            });
        });
        const foliosFaltantes = [...new Set(faltantes)];
        const unidadesRestantes = runtime.getCurrentScript().getRemainingUsage();
        nLog.audit("prepararFactura - consulta asientos", {
            folio: folioDoc,
            processKey: processKey,
            etapa: "precargaAsientos",
            duracionMs: Date.now() - inicioConsulta,
            acumuladoMs: Date.now() - inicioPreparacion,
            detalles: detalles.length,
            folios: resultado.folios,
            consultas: resultado.consultas,
            faltantes: foliosFaltantes.length,
            unidadesConsumidas: unidadesIniciales - unidadesRestantes,
            unidadesRestantes: unidadesRestantes
        });
        if (foliosFaltantes.length) {
            throw new Error(`No se encontraron asientos para los folios: ${foliosFaltantes.join(", ")}`);
        }
        return asientosPorDetalle;
    }

    function precargarAsientosNotas(detalles, tipo, folioDoc, processKey) {
        const inicio = Date.now();
        const unidadesIniciales = runtime.getCurrentScript().getRemainingUsage();
        const foliosPorDetalle = detalles.map((detalle) => {
            const descuento = tipo === "NOTA_CREDITO" ? detalle.montoTotalDescuento : detalle.MontoTotalDescuento;
            if (!(detalle.tipoDocumento === "BONO ELECTRONICO" && Number(descuento) === 0 && Number(detalle.folioBono))) return [];
            const folios = [detalle.folioBono];
            if (Number(detalle.montoCopago) > 0) folios.push(detalle.folioCopago);
            if (Number(detalle.montoExcedente) > 0) folios.push(detalle.folioExcedente);
            return [...new Set(folios)];
        });
        const resultado = consultarAsientosPorDetalleEnLotes(foliosPorDetalle);
        const asientosPorDetalle = resultado.asientosPorDetalle;
        const unidadesRestantes = runtime.getCurrentScript().getRemainingUsage();
        nLog.audit("precargarAsientosNotas - consumo", {
            fase: tipo, folio: folioDoc, processKey: processKey, etapa: "precargaAsientos",
            duracionMs: Date.now() - inicio, detalles: detalles.length,
            detallesElegibles: foliosPorDetalle.filter((folios) => folios.length).length,
            folios: resultado.folios, consultas: resultado.consultas, consultasIndividuales: 0,
            unidadesConsumidas: unidadesIniciales - unidadesRestantes, unidadesRestantes: unidadesRestantes
        });
        return asientosPorDetalle;
    }

    function prepararFactura(documento, processKey, existingId, diferirCreacion) {
        const inicioPreparacion = Date.now();
        const { folioDoc, tipoDocumento, razonSocial, FechaDocumento, FechaVencimiento, RutCliente, CondicionPago, TipoFacturacion, tipoDocRef, folioRef, codRef, detalleFacturas } = documento;

        try {
            // Validar que existan detalles
            if (!detalleFacturas || !Array.isArray(detalleFacturas) || detalleFacturas.length === 0) {
                throw new Error(`Se recibieron datos de cabecera pero no hay detalles de facturación`);
            }
            const asientosPorDetalle = precargarAsientosFactura(detalleFacturas, folioDoc, processKey, inicioPreparacion);
            const inicioDatos = Date.now();
            const lineas = [];
            let totalJournalCopago = 0;
            let totalExedente = 0;
            let invoiceId;
            var datosCreacion;
            const lineasJournal = [];
            let cuentaPaciente = "";
            detalleFacturas.forEach((detalle, indice) => {
                // Obtener número de cuenta del primer detalle
                if (!cuentaPaciente && detalle.numeroCuenta) {
                    cuentaPaciente = detalle.numeroCuenta;
                }
                const {
                    glosa,
                    tipoDocumento,
                    folio,
                    numeroCuenta,
                    "Diferencia de facturacin": diferencia,
                    montoNeto,
                    montoExento,
                    montoIva,
                    montoTotal,
                    folioCopago,
                    montoCopago,
                    folioExcedente,
                    montoExcedente
                } = detalle;
                const asientos = asientosPorDetalle[indice];

                switch (tipoDocumento) {
                    case "BONO FISICO":
                    case "BONO ELECTRONICO": {
                        const { articuloBoleta } = MappingDAO.getItemMapping({ categoria: getFlow("BonosEmitidos") });
                        if(!articuloBoleta) throw new Error(`No se encontró artículo para categoría BONO ELECTRONICO`);
                        lineas.push({
                            item: articuloBoleta,
                            quantity: 1,
                            rate: Number(montoNeto) + Number(montoExento),
                            description: glosa || "Bono",
                            tax1amt: Number(montoIva) || 0,
                            folioBoleta: folio
                        });
                        break;
                    }
                    case "FICHA": {
                        const { articuloBoleta } = MappingDAO.getItemMapping({ categoria: getFlow("BoletasEmitidas") });
                        if(!articuloBoleta) throw new Error(`No se encontró artículo para categoría BOLETAS EMITIDAS`);
                        lineas.push({
                            item: articuloBoleta,
                            quantity: 1,
                            rate: Number(montoNeto) + Number(montoExento),
                            description: glosa || "Ficha",
                            tax1amt: Number(montoIva) || 0,
                            folioBoleta: folio
                        });
                        break;
                    }
                    case "CONVENIO EMPRESA": {
                        const { articuloBoleta } = MappingDAO.getItemMapping({ categoria: getFlow("BoletasEmitidas") });
                        if(!articuloBoleta) throw new Error(`No se encontró artículo para categoría BOLETAS EMITIDAS`);
                        lineas.push({
                            item: articuloBoleta,
                            quantity: 1,
                            rate: Number(montoNeto) + Number(montoExento),
                            description: glosa || "Convenio Empresa",
                            tax1amt: Number(montoIva) || 0,
                            folioBoleta: numeroCuenta
                        });
                        break;
                    }
                    case "COBERTURA": {
                        const { articuloBoleta } = MappingDAO.getItemMapping({ categoria: getFlow("CoberturasEmitidas") });
                        if(!articuloBoleta) throw new Error(`No se encontró artículo para categoría COBERTURAS EMITIDAS`);
                        lineas.push({
                            item: articuloBoleta,
                            quantity: 1,
                            rate: Number(montoNeto) + Number(montoExento),
                            description: glosa || "Cobertura",
                            tax1amt: Number(montoIva) || 0,
                            folioBoleta: folio
                        });
                        break;
                    }
                    case "DIFERENCIA": {
                        const { articuloBoleta } = MappingDAO.getItemMapping({ categoria: getFlow("DiferenciaFactura") });
                        if(!articuloBoleta) throw new Error(`No se encontró artículo para categoría DIFERENCIA FACTURA`);
                        lineas.push({
                            item: articuloBoleta,
                            quantity: 1,
                            rate: Number(montoNeto) + Number(montoExento),
                            description: glosa || "Diferencia",
                            tax1amt: Number(montoIva) || 0,
                            folioBoleta: folio
                        });
                        break;
                    }
                    default:
                        nLog.error("procesarDocumentos", `Tipo de documento no reconocido: ${tipoDocumento}`);
                }

                if (Number(montoCopago) > 0) {
                    const { cuentaContableCredito } = MappingDAO.getItemMapping({
                        categoria: getFlow("BonosEmitidosConCopago")
                    });
                    const asiento = asientos.find(
                        (e) => Number(e.custcol_2w_folio) === Number(folioCopago) && e.memo.includes("COPAGO") && Number(e.expenseaccount) === Number(cuentaContableCredito)
                    );
                    lineasJournal.push({
                        account: cuentaContableCredito,
                        debit: Number(montoCopago),
                        entity: asiento?.entity ?? "",
                        folio: folioCopago,
                        memo: `Copago Factura asociada folio ${folioDoc}`
                    });
                    totalJournalCopago = totalJournalCopago + Number(montoCopago);
                }
                if (montoExcedente > 0) {
                    const { cuentaContableDebito } = MappingDAO.getItemMapping({
                        categoria: getFlow("FormaPago"),
                        formaPagoTipo: "EXCE"
                    });
                    const asiento = asientos.find(
                        (e) => Number(e.custcol_2w_folio) === Number(folioExcedente) && e.memo.includes("EXCE") && Number(e.expenseaccount) === Number(cuentaContableDebito)
                    );
                    lineasJournal.push({
                        account: cuentaContableDebito,
                        credit: Number(montoExcedente),
                        entity: asiento?.entity ?? "",
                        folio: folioExcedente,
                        memo: `Excedente Factura asociada folio ${folioDoc}`
                    });
                    totalExedente = totalExedente + Number(montoExcedente);
                }
            });
            const diferencia = totalJournalCopago - totalExedente;
            if (diferencia !== 0) {
                lineasJournal.push({
                    account: 457,
                    ...(diferencia > 0 ? { credit: diferencia } : { debit: Math.abs(diferencia) }),
                    entity: CustomerDAO.getByRut(utils.formatearRut(RutCliente)),
                    folio: folioDoc,
                    memo: `Factura asociada folio ${folioDoc}`
                });
            }
            nLog.audit("prepararFactura - tiempo", {
                folio: folioDoc, processKey: processKey, etapa: "preparacionDatos",
                duracionMs: Date.now() - inicioDatos,
                acumuladoMs: Date.now() - inicioPreparacion, totalLineas: lineas.length
            });
            if (lineas.length > 0) {
                if (existingId) {
                    invoiceId = existingId;
                } else {
                    datosCreacion = {
                        processKey: processKey,
                        medirTiempos: true,
                        registrarError: false,
                        customerId: CustomerDAO.getByRut(utils.formatearRut(RutCliente)),
                        account: 457,
                        isFactura: true,
                        razonSocialCobro: subsidiaria.getSubsidiaria(utils.formatearRut(razonSocial)),
                        fechaTransaccion: FechaDocumento,
                        condicionesPago: CondicionPago,
                        tipoFacturacion: TipoFacturacion,
                        tipoDocRef,
                        memo: `Factura asociada folio ${folioDoc}`,
                        folioBoleta: folioDoc,
                        folioRef,
                        codRef,
                        cuentaPaciente: cuentaPaciente,
                        items: lineas,
                        montoIva: lineas.reduce((acc, linea) => acc + (linea.tax1amt || 0), 0)
                    };
                    if (!diferirCreacion) invoiceId = InvoiceDAO.createInvoice(datosCreacion);
                }
                // nLog.audit("procesarDocumentos", `Factura creada: ${invoiceId} para folioDoc: ${folioDoc}`);
            }
            return { ...(diferirCreacion ? { datosCreacion: datosCreacion } : {}), documentoId: invoiceId, lineasJournal: lineasJournal, totalJournalCopago: totalJournalCopago, diferencia: diferencia, cuentaPaciente: cuentaPaciente };
        } catch (error) {
            // El error se registra una vez en map, con el folio y la fase.
            nLog.error("prepararFactura - error", error);
            throw error;
        }
    }

    function prepararNotaCredito(documento, processKey, existingId, diferirCreacion) {
        const { folioDoc, tipoDocumento, razonSocial, FechaDocumento, FechaVencimiento, RutCliente, CondicionPago, TipoFacturacion, tipoDocRef, folioRef, codRef, detalleNC } = documento;

        try {
            // Validar que existan detalles
            if (!detalleNC || !Array.isArray(detalleNC) || detalleNC.length === 0) {
                throw new Error(`Se recibieron datos de cabecera pero no hay detalles`);
            }

            const lineas = [];
            let totalJournalCopago = 0;
            let totalExedente = 0;
            let creditMemoId;
            var datosCreacion;
            const lineasJournal = [];
            let totalNotaCredito = 0;
            let cuentaPaciente = "";
            const asientosPorDetalle = precargarAsientosNotas(detalleNC, "NOTA_CREDITO", folioDoc, processKey);
            detalleNC.forEach((detalle, indice) => {
                // Obtener número de cuenta del primer detalle
                if (!cuentaPaciente && detalle.numeroCuenta) {
                    cuentaPaciente = detalle.numeroCuenta;
                }
                const {
                    glosa,
                    tipoDocumento,
                    folioBono,
                    numeroCuenta,
                    "Diferencia de facturacin": diferencia,
                    montoNeto,
                    montoExento,
                    montoIva,
                    montoTotal,
                    folioCopago,
                    montoCopago,
                    folioExcedente,
                    montoExcedente,
                    folioCobertura,
                    montoCobertura,
                    montoNetoDescuento,
                    montoExentoDescuento,
                    montoIvaDescuento,
                    montoTotalDescuento
                } = detalle;
                const folios = [];
                let asientos = [];
                if (tipoDocumento === "BONO ELECTRONICO" && Number(montoTotalDescuento) === 0 && Number(folioBono)) {
                    folios.push(folioBono);
                    if (Number(montoCopago) > 0) folios.push(folioCopago);
                    if (Number(montoExcedente) > 0) folios.push(folioExcedente);
                    // nLog.debug("folios", folios);
                    if (folios.length === 0) throw new Error(`No hay folios: ${folios.join(", ")}`);
                    asientos = asientosPorDetalle[indice];
                    const foliosFaltantes = folios.filter((folio) => !asientos.some((asiento) => Number(asiento.custcol_2w_folio) === Number(folio)));
                    if (foliosFaltantes.length > 0) {
                        nLog.error("procesarDocumentos - asientos", `No se encontraron asientos para los folios: ${foliosFaltantes.join(", ")}`);
                        throw new Error(`No se encontraron asientos para los folios: ${foliosFaltantes.join(", ")}`);
                    }
                }
                // Verificar si hay descuento antes de evaluar el tipo de documento
                if (Number(montoNetoDescuento) + Number(montoExentoDescuento) > 0) {
                    const { articuloBoleta } = MappingDAO.getItemMapping({ categoria: getFlow("DescuentoFactura") });
                    // nLog.debug("Descuento aplicado - tipoDocumento:", tipoDocumento);
                    // nLog.debug("Descuento articuloBoleta", articuloBoleta);
                    // nLog.debug("getFlow()", getFlow("DescuentoFactura"));
                    lineas.push({
                        item: articuloBoleta,
                        quantity: 1,
                        rate: Number(montoNetoDescuento) + Number(montoExentoDescuento),
                        description: glosa || "Descuento",
                        tax1amt: Number(montoIvaDescuento) || 0,
                        folioBoleta: numeroCuenta || folioBono
                    });
                } else {
                    switch (tipoDocumento) {
                        case "BONO FISICO":
                        case "BONO ELECTRONICO": {
                            const { articuloBoleta } = MappingDAO.getItemMapping({ categoria: getFlow("BonosEmitidos") });
                            lineas.push({
                                item: articuloBoleta,
                                quantity: 1,
                                rate: Number(montoNeto) + Number(montoExento),
                                description: glosa || "Bono",
                                tax1amt: Number(montoIva) || 0,
                                folioBoleta: folioBono
                            });
                            break;
                        }
                        case "FICHA": {
                            const { articuloBoleta } = MappingDAO.getItemMapping({ categoria: getFlow("BoletasEmitidas") });
                            lineas.push({
                                item: articuloBoleta,
                                quantity: 1,
                                rate: Number(montoNeto) + Number(montoExento),
                                description: glosa || "Ficha",
                                tax1amt: Number(montoIva) || 0,
                                folioBoleta: folioBono
                            });
                            break;
                        }
                        case "CONVENIO EMPRESA": {
                            const { articuloBoleta } = MappingDAO.getItemMapping({ categoria: getFlow("BoletasEmitidas") });
                            lineas.push({
                                item: articuloBoleta,
                                quantity: 1,
                                rate: Number(montoNeto) + Number(montoExento),
                                description: glosa || "Convenio Empresa",
                                tax1amt: Number(montoIva) || 0,
                                folioBoleta: numeroCuenta
                            });
                            break;
                        }
                        case "COBERTURA": {
                            const { articuloBoleta } = MappingDAO.getItemMapping({ categoria: getFlow("CoberturasEmitidas") });
                            lineas.push({
                                item: articuloBoleta,
                                quantity: 1,
                                rate: Number(montoNeto) + Number(montoExento),
                                description: glosa || "Cobertura",
                                tax1amt: Number(montoIva) || 0,
                                folioBoleta: folioBono
                            });
                            break;
                        }
                        default:
                            nLog.error("procesarDocumentos", `Tipo de documento no reconocido: ${tipoDocumento}`);
                    }
                }

                if (Number(montoCopago) > 0) {
                    const { cuentaContableCredito } = MappingDAO.getItemMapping({
                        categoria: getFlow("BonosEmitidosConCopago")
                    });
                    const asiento = asientos.find(
                        (e) => Number(e.custcol_2w_folio) === Number(folioCopago) && e.memo.includes("COPAGO") && Number(e.expenseaccount) === Number(cuentaContableCredito)
                    );
                    lineasJournal.push({
                        account: cuentaContableCredito,
                        credit: Number(montoCopago),
                        entity: asiento?.entity ?? "",
                        folio: folioCopago,
                        memo: `Copago Nota de Credito asociada folio ${folioDoc}`
                    });
                    totalJournalCopago = totalJournalCopago + Number(montoCopago);
                }
                if (montoExcedente > 0) {
                    const { cuentaContableDebito } = MappingDAO.getItemMapping({
                        categoria: getFlow("FormaPago"),
                        formaPagoTipo: "EXCE"
                    });
                    const asiento = asientos.find(
                        (e) => Number(e.custcol_2w_folio) === Number(folioExcedente) && e.memo.includes("EXCE") && Number(e.expenseaccount) === Number(cuentaContableDebito)
                    );
                    lineasJournal.push({
                        account: cuentaContableDebito,
                        debit: Number(montoExcedente),
                        entity: asiento?.entity ?? "",
                        folio: folioExcedente,
                        memo: `Excedente Nota de Credito asociada folio ${folioDoc}`
                    });
                    totalExedente = totalExedente + Number(montoExcedente);
                }
                totalNotaCredito += Number(montoTotal) || Number(montoTotalDescuento);
            });
            const diferencia = totalJournalCopago - totalExedente;
            if (diferencia !== 0) {
                lineasJournal.push({
                    account: 457,
                    ...(diferencia > 0 ? { debit: diferencia } : { credit: Math.abs(diferencia) }),
                    entity: CustomerDAO.getByRut(utils.formatearRut(RutCliente)),
                    folio: folioDoc,
                    memo: `Nota de Credito asociada folio ${folioDoc}`
                });
            }
            const customerId = CustomerDAO.getByRut(utils.formatearRut(RutCliente));
            const subsidiariaId = subsidiaria.getSubsidiaria(utils.formatearRut(razonSocial));
            const invoiceId = InvoiceDAO.findInvoiceByFolio(folioRef, customerId, subsidiariaId);
            if (!invoiceId) {
                throw new Error(`No se encontró factura asociada al folio ${folioRef} para el cliente ID ${customerId} y subsidiaria ID ${subsidiariaId}`);
            }
            const journals = InvoiceDAO.findAppliedJournals(invoiceId);
            if (lineas.length > 0) {
                if (existingId) {
                    creditMemoId = existingId;
                } else {
                    datosCreacion = {
                        processKey: processKey,
                        customerId: customerId,
                        account: 457,
                        razonSocialCobro: subsidiariaId,
                        fechaTransaccion: FechaDocumento,
                        condicionesPago: CondicionPago,
                        tipoFacturacion: TipoFacturacion,
                        tipoDocRef,
                        memo: `Nota de Credito asociada folio ${folioDoc}`,
                        folioNC: folioDoc,
                        folioRef,
                        codRef,
                        cuentaPaciente: cuentaPaciente,
                        items: lineas
                    };
                    if (!diferirCreacion) creditMemoId = CreditMemoDAO.createCreditMemo(datosCreacion);
                }
                // nLog.audit("procesarDocumentos", `Nota de Credito creada: ${creditMemoId} para folioDoc: ${folioDoc}`);

                // journals.forEach(({ id }) => {
                //     reverseTransaction(id, "journalentry");
                // });
                // CreditMemoDAO.applyCreditMemo(creditMemoId, invoiceId, true);
            }
            return { ...(diferirCreacion ? { datosCreacion: datosCreacion } : {}), documentoId: creditMemoId, lineasJournal: lineasJournal, totalJournalCopago: totalJournalCopago, diferencia: diferencia, cuentaPaciente: cuentaPaciente, totalNotaCredito: totalNotaCredito, invoiceId: invoiceId, journalIds: journals.map(({ id }) => id) };
        } catch (error) {
            nLog.error("prepararNotaCredito - error", error);
            throw error;
        }
    }

    function prepararNotaDebito(documento, processKey, existingId, diferirCreacion) {
        const { folioDoc, tipoDocumento, razonSocial, FechaDocumento, FechaVencimiento, RutCliente, tipoDocRef, folioRef, codRef, tipoND, detalleND } = documento;

        try {
            // Validar que existan detalles
            if (!detalleND || !Array.isArray(detalleND) || detalleND.length === 0) {
                throw new Error(`Se recibieron datos de cabecera pero no hay detalles`);
            }

            const lineas = [];
            let totalJournalCopago = 0;
            let totalExedente = 0;
            let DebitNoteId;
            var datosCreacion;
            const lineasJournal = [];
            let cuentaPaciente = "";
            const asientosPorDetalle = precargarAsientosNotas(detalleND, "NOTA_DEBITO", folioDoc, processKey);
            detalleND.forEach((detalle, indice) => {
                // Obtener número de cuenta del primer detalle
                if (!cuentaPaciente && detalle.numeroCuenta) {
                    cuentaPaciente = detalle.numeroCuenta;
                }
                const {
                    glosa,
                    tipoDocumento,
                    folioBono,
                    numeroCuenta,
                    "Diferencia de facturacin": diferencia,
                    montoNeto,
                    montoExento,
                    montoIva,
                    montoTotal,
                    folioCopago,
                    montoCopago,
                    folioExcedente,
                    montoExcedente,
                    folioCobertura,
                    montoNetoDescuento,
                    MontoExentoDescuento,
                    MontoIvaDescuento,
                    MontoTotalDescuento,
                    tipoND
                } = detalle;
                const folios = [];
                let asientos = [];
                if (tipoDocumento === "BONO ELECTRONICO" && Number(MontoTotalDescuento) === 0 && Number(folioBono)) {
                    folios.push(folioBono);
                    if (Number(montoCopago) > 0) folios.push(folioCopago);
                    if (Number(montoExcedente) > 0) folios.push(folioExcedente);
                    // nLog.debug("folios", folios);
                    if (folios.length === 0) throw new Error(`No hay folios: ${folios.join(", ")}`);
                    asientos = asientosPorDetalle[indice];
                    const foliosFaltantes = folios.filter((folio) => !asientos.some((asiento) => Number(asiento.custcol_2w_folio) === Number(folio)));
                    if (foliosFaltantes.length > 0) {
                        nLog.error("procesarDocumentos - asientos", `No se encontraron asientos para los folios: ${foliosFaltantes.join(", ")}`);
                        throw new Error(`No se encontraron asientos para los folios: ${foliosFaltantes.join(", ")}`);
                    }
                }
                // Verificar si hay descuento antes de evaluar el tipo de documento
                if (Number(montoNetoDescuento) + Number(MontoExentoDescuento) > 0) {
                    const { articuloBoleta } = MappingDAO.getItemMapping({ categoria: getFlow("DescuentoFactura") });
                    // nLog.debug("Descuento aplicado - tipoDocumento:", tipoDocumento);
                    // nLog.debug("Descuento articuloBoleta", articuloBoleta);
                    // nLog.debug("getFlow()", getFlow("DescuentoFactura"));
                    lineas.push({
                        item: articuloBoleta,
                        quantity: 1,
                        rate: Number(montoNetoDescuento) + Number(MontoExentoDescuento),
                        description: glosa || "Descuento",
                        tax1amt: Number(MontoIvaDescuento) || 0,
                        folioBoleta: numeroCuenta || folioBono
                    });
                } else {
                    switch (tipoDocumento) {
                        case "BONO":
                        case "BONO FISICO":
                        case "BONO ELECTRONICO": {
                            const { articuloBoleta } = MappingDAO.getItemMapping({ categoria: getFlow("BonosEmitidos") });
                            lineas.push({
                                item: articuloBoleta,
                                quantity: 1,
                                rate: Number(montoNeto) + Number(montoExento),
                                description: glosa || "Bono",
                                tax1amt: Number(montoIva) || 0,
                                folioBoleta: folioBono
                            });
                            break;
                        }
                        case "FICHA": {
                            const { articuloBoleta } = MappingDAO.getItemMapping({ categoria: getFlow("BoletasEmitidas") });
                            lineas.push({
                                item: articuloBoleta,
                                quantity: 1,
                                rate: Number(montoNeto) + Number(montoExento),
                                description: glosa || "Ficha",
                                tax1amt: Number(montoIva) || 0,
                                folioBoleta: folioBono
                            });
                            break;
                        }
                        case "CONVENIO EMPRESA": {
                            const { articuloBoleta } = MappingDAO.getItemMapping({ categoria: getFlow("BoletasEmitidas") });
                            lineas.push({
                                item: articuloBoleta,
                                quantity: 1,
                                rate: Number(montoNeto) + Number(montoExento),
                                description: glosa || "Convenio Empresa",
                                tax1amt: Number(montoIva) || 0,
                                folioBoleta: numeroCuenta
                            });
                            break;
                        }
                        case "COBERTURA": {
                            const { articuloBoleta } = MappingDAO.getItemMapping({ categoria: getFlow("CoberturasEmitidas") });
                            lineas.push({
                                item: articuloBoleta,
                                quantity: 1,
                                rate: Number(montoNeto) + Number(montoExento),
                                description: glosa || "Cobertura",
                                tax1amt: Number(montoIva) || 0,
                                folioBoleta: folioBono
                            });
                            break;
                        }
                        case "FACTURA": {
                            const { articuloBoleta } = MappingDAO.getItemMapping({ categoria: getFlow("NotaDebitoEmitida") });
                            lineas.push({
                                item: articuloBoleta,
                                quantity: 1,
                                rate: Number(montoNeto) + Number(montoExento),
                                description: glosa || "Factura",
                                tax1amt: Number(montoIva) || 0,
                                folioBoleta: folioBono
                            });
                            break;
                        }
                        default:
                            nLog.error("procesarDocumentos", `Tipo de documento no reconocido: ${tipoDocumento}`);
                    }
                }

                if (Number(montoCopago) > 0) {
                    const { cuentaContableCredito } = MappingDAO.getItemMapping({
                        categoria: getFlow("BonosEmitidosConCopago")
                    });
                    const asiento = asientos.find(
                        (e) => Number(e.custcol_2w_folio) === Number(folioCopago) && e.memo.includes("COPAGO") && Number(e.expenseaccount) === Number(cuentaContableCredito)
                    );
                    lineasJournal.push({
                        account: cuentaContableCredito,
                        debit: Number(montoCopago),
                        entity: asiento?.entity ?? "",
                        folio: folioCopago,
                        memo: `Copago Nota de Debito asociada folio ${folioDoc}`
                    });
                    totalJournalCopago = totalJournalCopago + Number(montoCopago);
                }
                if (montoExcedente > 0) {
                    const { cuentaContableDebito } = MappingDAO.getItemMapping({
                        categoria: getFlow("FormaPago"),
                        formaPagoTipo: "EXCE"
                    });
                    const asiento = asientos.find(
                        (e) => Number(e.custcol_2w_folio) === Number(folioExcedente) && e.memo.includes("EXCE") && Number(e.expenseaccount) === Number(cuentaContableDebito)
                    );
                    lineasJournal.push({
                        account: cuentaContableDebito,
                        credit: Number(montoExcedente),
                        entity: asiento?.entity ?? "",
                        folio: folioExcedente,
                        memo: `Excedente Nota de Debito asociada folio ${folioDoc}`
                    });
                    totalExedente = totalExedente + Number(montoExcedente);
                }
            });
            const diferencia = totalJournalCopago - totalExedente;
            if (diferencia !== 0) {
                lineasJournal.push({
                    account: 457,
                    ...(diferencia > 0 ? { credit: diferencia } : { debit: Math.abs(diferencia) }),
                    entity: CustomerDAO.getByRut(utils.formatearRut(RutCliente)),
                    folio: folioDoc,
                    memo: `Nota de Debito asociada folio ${folioDoc}`
                });
            }
            if (lineas.length > 0) {
                if (existingId) {
                    DebitNoteId = existingId;
                } else {
                    datosCreacion = {
                        processKey: processKey,
                        customerId: CustomerDAO.getByRut(utils.formatearRut(RutCliente)),
                        account: 457,
                        // isFactura: true,
                        isNotaDebito: true,
                        razonSocialCobro: subsidiaria.getSubsidiaria(utils.formatearRut(razonSocial)),
                        fechaTransaccion: FechaDocumento,
                        tipoDocRef,
                        memo: `Nota de Debito asociada folio ${folioDoc}`,
                        folioBoleta: folioDoc,
                        folioRef, //referencia creditmemo
                        codRef,
                        cuentaPaciente: cuentaPaciente,
                        items: lineas
                    };
                    if (!diferirCreacion) DebitNoteId = InvoiceDAO.createInvoice(datosCreacion);
                }
                // nLog.audit("procesarDocumentos", `Nota de Debito creada: ${DebitNoteId} para folioDoc: ${folioDoc}`);
            }
            return { ...(diferirCreacion ? { datosCreacion: datosCreacion } : {}), documentoId: DebitNoteId, lineasJournal: lineasJournal, totalJournalCopago: totalJournalCopago, diferencia: diferencia, cuentaPaciente: cuentaPaciente };
        } catch (error) {
            nLog.error("prepararNotaDebito - error", error);
            throw error;
        }
    }

    function aplicarFactura(documento, estado, processKey, existingJournalId, existingPaymentId, etapaAplicacion) {
        const { folioDoc, tipoDocumento, razonSocial, FechaDocumento, FechaVencimiento, RutCliente, CondicionPago, TipoFacturacion, tipoDocRef, folioRef, codRef, detalleFacturas } = documento;
        const { documentoId: invoiceId, lineasJournal, totalJournalCopago, diferencia, cuentaPaciente } = estado;
        try {
            // Selector opcional del flujo por lotes; sin selector se conserva la aplicación completa.
            if (etapaAplicacion === "PAGO" && totalJournalCopago > 0 && !existingJournalId) {
                throw new Error("No se encontró el asiento confirmado para crear el pago");
            }
            if (totalJournalCopago > 0) {
                // nLog.debug("totales Journal", lineasJournal);
                if (etapaAplicacion !== "PAGO") {
                    let totalDebit = 0;
                    let totalCredit = 0;
                    lineasJournal.forEach((line) => {
                        if (line.debit) totalDebit += line.debit;
                        if (line.credit) totalCredit += line.credit;
                    });
                    nLog.audit("procesarDocumentos", `Total Debit: ${totalDebit}, Total Credit: ${totalCredit} para folioDoc: ${folioDoc}`);
                }
                const idJournal = existingJournalId || JournalEntryDAO.createJournalEntry({
                    processKey: `${processKey}:journal`,
                    fechaTransaccion: FechaDocumento,
                    subsidiaria: subsidiaria.getSubsidiaria(utils.formatearRut(razonSocial)),
                    memo: `Factura asociada folio ${folioDoc}`,
                    lines: lineasJournal,
                    cuentaPaciente: cuentaPaciente
                });
                nLog.audit("procesarDocumentos", `Asiento creado: ${idJournal} para folioDoc: ${folioDoc}`);
                if (etapaAplicacion === "ASIENTO") return idJournal;
                const idPayment = existingPaymentId || PaymentDAO.createPayment({
                    processKey: `${processKey}:payment`,
                    customerId: CustomerDAO.getByRut(utils.formatearRut(RutCliente)),
                    subsidiaria: subsidiaria.getSubsidiaria(utils.formatearRut(razonSocial)),
                    fechaTransaccion: FechaDocumento,
                    memo: `Pago Factura asociada folio ${folioDoc}`,
                    invoicesToPay: [{ id: invoiceId, amount: diferencia }],
                    journalEntriesPago: [idJournal]
                });
                nLog.audit("idPayment", idPayment);
            }
        } catch (error) {
            nLog.error("aplicarFactura - error", error);
            throw error;
        }
    }

    function aplicarNotaCredito(documento, estado, processKey, existingJournalId, existingPaymentId, etapaAplicacion) {
        const { folioDoc, tipoDocumento, razonSocial, FechaDocumento, FechaVencimiento, RutCliente, CondicionPago, TipoFacturacion, tipoDocRef, folioRef, codRef, detalleNC } = documento;
        const { documentoId: creditMemoId, lineasJournal, totalJournalCopago, diferencia, cuentaPaciente, totalNotaCredito, invoiceId, journalIds } = estado;
        try {
            // Selector opcional del flujo por lotes; sin selector se conserva la aplicación completa.
            if (etapaAplicacion === "PAGO" && totalJournalCopago > 0 && !existingJournalId) {
                throw new Error("No se encontró el asiento confirmado para crear el pago");
            }
            if (totalJournalCopago > 0) {
                // nLog.debug("totales Journal", lineasJournal);
                if (etapaAplicacion !== "PAGO") {
                    let totalDebit = 0;
                    let totalCredit = 0;
                    lineasJournal.forEach((line) => {
                        if (line.debit) totalDebit += line.debit;
                        if (line.credit) totalCredit += line.credit;
                    });
                    nLog.audit("procesarDocumentos", `Total Debit: ${totalDebit}, Total Credit: ${totalCredit} para folioDoc: ${folioDoc}`);
                }
                const idJournal = existingJournalId || JournalEntryDAO.createJournalEntry({
                    processKey: `${processKey}:journal`,
                    fechaTransaccion: FechaDocumento,
                    subsidiaria: subsidiaria.getSubsidiaria(utils.formatearRut(razonSocial)),
                    memo: `Nota de Credito asociada folio ${folioDoc}`,
                    lines: lineasJournal,
                    cuentaPaciente: cuentaPaciente
                });
                nLog.audit("procesarDocumentos", `Asiento creado: ${idJournal} para folioDoc: ${folioDoc}`);
                if (etapaAplicacion === "ASIENTO") return idJournal;
                // nLog.debug("totalNotaCredito - totalDebit", [totalNotaCredito, diferencia]);
                const idPayment = existingPaymentId || PaymentDAO.createPayment({
                    processKey: `${processKey}:payment`,
                    customerId: CustomerDAO.getByRut(utils.formatearRut(RutCliente)),
                    subsidiaria: subsidiaria.getSubsidiaria(utils.formatearRut(razonSocial)),
                    fechaTransaccion: FechaDocumento,
                    memo: `Pago Nota de Credito asociada folio ${folioDoc}`,
                    invoicesToPay: [{ id: invoiceId, amount: totalNotaCredito - diferencia }, { id: idJournal }],
                    journalEntriesPago: [creditMemoId, ...journalIds]
                });
                nLog.audit("idPayment", idPayment);
            } else if (!etapaAplicacion || etapaAplicacion === "PAGO") {
                const idPayment = existingPaymentId || PaymentDAO.createPayment({
                    processKey: `${processKey}:payment`,
                    customerId: CustomerDAO.getByRut(utils.formatearRut(RutCliente)),
                    subsidiaria: subsidiaria.getSubsidiaria(utils.formatearRut(razonSocial)),
                    fechaTransaccion: FechaDocumento,
                    memo: `Pago Nota de Credito asociada folio ${folioDoc}`,
                    invoicesToPay: [{ id: invoiceId, amount: totalNotaCredito }],
                    journalEntriesPago: [creditMemoId]
                });
                nLog.audit("idPayment", idPayment);
            }
        } catch (error) {
            nLog.error("aplicarNotaCredito - error", error);
            throw error;
        }
    }

    function aplicarNotaDebito(documento, estado, processKey, existingJournalId, existingPaymentId, etapaAplicacion) {
        const { folioDoc, tipoDocumento, razonSocial, FechaDocumento, FechaVencimiento, RutCliente, tipoDocRef, folioRef, codRef, tipoND, detalleND } = documento;
        const { documentoId: DebitNoteId, lineasJournal, totalJournalCopago, diferencia, cuentaPaciente } = estado;
        try {
            // Selector opcional del flujo por lotes; sin selector se conserva la aplicación completa.
            if (etapaAplicacion === "PAGO" && totalJournalCopago > 0 && !existingJournalId) {
                throw new Error("No se encontró el asiento confirmado para crear el pago");
            }
            if (DebitNoteId && (!etapaAplicacion || etapaAplicacion === "NOTA_CREDITO")) {
                // Aplicar DebitMemo a CreditMemo (folioRef)
                const creditMemoId = CreditMemoDAO.getCreditIdByFolio(folioRef,
                    CustomerDAO.getByRut(utils.formatearRut(RutCliente)),
                    subsidiaria.getSubsidiaria(utils.formatearRut(razonSocial)));
                if (creditMemoId) {
                    // nLog.debug("procesarDocumentos", `Aplicando DebitMemo ${DebitNoteId} a CreditMemo ${creditMemoId} (folioRef: ${folioRef})`);
                    CreditMemoDAO.applyCreditMemo(creditMemoId, DebitNoteId, true);
                }
            }
            if (etapaAplicacion === "NOTA_CREDITO") return;
            if (totalJournalCopago > 0) {
                // nLog.debug("totales Journal", lineasJournal);
                if (etapaAplicacion !== "PAGO") {
                    let totalDebit = 0;
                    let totalCredit = 0;
                    lineasJournal.forEach((line) => {
                        if (line.debit) totalDebit += line.debit;
                        if (line.credit) totalCredit += line.credit;
                    });
                    nLog.audit("procesarDocumentos", `Total Debit: ${totalDebit}, Total Credit: ${totalCredit} para folioDoc: ${folioDoc}`);
                }
                const idJournal = existingJournalId || JournalEntryDAO.createJournalEntry({
                    processKey: `${processKey}:journal`,
                    fechaTransaccion: FechaDocumento,
                    subsidiaria: subsidiaria.getSubsidiaria(utils.formatearRut(razonSocial)),
                    memo: `Nota de Debito asociada folio ${folioDoc}`,
                    lines: lineasJournal,
                    cuentaPaciente: cuentaPaciente
                });
                nLog.audit("procesarDocumentos", `Asiento creado: ${idJournal} para folioDoc: ${folioDoc}`);
                if (etapaAplicacion === "ASIENTO") return idJournal;

                // Aplicar journal al invoice folioDoc
                const customerId = CustomerDAO.getByRut(utils.formatearRut(RutCliente));
                const subsidiariaId = subsidiaria.getSubsidiaria(utils.formatearRut(razonSocial));
                const invoiceIdToApply = InvoiceDAO.findInvoiceByFolio(folioDoc, customerId, subsidiariaId);
                if (!invoiceIdToApply) {
                    throw new Error(`No se encontró factura asociada al folio ${folioDoc} para el cliente ID ${customerId} y subsidiaria ID ${subsidiariaId}`);
                }

                const idPayment = existingPaymentId || PaymentDAO.createPayment({
                    processKey: `${processKey}:payment`,
                    customerId: customerId,
                    subsidiaria: subsidiariaId,
                    fechaTransaccion: FechaDocumento,
                    memo: `Pago Nota de Debito asociada folio ${folioDoc}`,
                    invoicesToPay: [{ id: invoiceIdToApply, amount: diferencia }],
                    journalEntriesPago: [idJournal]
                });
                nLog.audit("idPayment", idPayment);
            }
        } catch (error) {
            nLog.error("aplicarNotaDebito - error", error);
            throw error;
        }
    }

    function prepararDocumento(tipo, documento, processKey, existingId, diferirCreacion) {
        switch (tipo) {
            case "FACTURA": return prepararFactura(documento, processKey, existingId, diferirCreacion);
            case "NOTA_CREDITO": return prepararNotaCredito(documento, processKey, existingId, diferirCreacion);
            case "NOTA_DEBITO": return prepararNotaDebito(documento, processKey, existingId, diferirCreacion);
            default: throw new Error(`Tipo de documento no reconocido: ${tipo}`);
        }
    }

    function crearDocumento(tipo, datosCreacion) {
        switch (tipo) {
            case "FACTURA":
            case "NOTA_DEBITO": return InvoiceDAO.createInvoice(datosCreacion);
            case "NOTA_CREDITO": return CreditMemoDAO.createCreditMemo(datosCreacion);
            default: throw new Error(`Tipo de documento no reconocido: ${tipo}`);
        }
    }

    function aplicarDocumento(tipo, documento, estado, processKey, existingJournalId, existingPaymentId, etapaAplicacion) {
        switch (tipo) {
            case "FACTURA": return aplicarFactura(documento, estado, processKey, existingJournalId, existingPaymentId, etapaAplicacion);
            case "NOTA_CREDITO": return aplicarNotaCredito(documento, estado, processKey, existingJournalId, existingPaymentId, etapaAplicacion);
            case "NOTA_DEBITO": return aplicarNotaDebito(documento, estado, processKey, existingJournalId, existingPaymentId, etapaAplicacion);
            default: throw new Error(`Tipo de documento no reconocido: ${tipo}`);
        }
    }

    return { prepararDocumento, crearDocumento, aplicarDocumento };
});
