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

    const procesarCajaRecaudacion = ({ cajas }) => {

        const datosEntrada = runtime.getCurrentScript().getParameter({ name: "custscript_2w_as_datos_recaudaciones_fac" });

        const archivo = daoFile.cargarArchivo(datosEntrada);
        const nombre = archivo.nombre;
        // Quitar .json de nombre archivo para aislar identificador unico de proceso
        const name = nombre.replace(/\.json$/i, "");

        // Buscar registro de auditoria por identificador unico de proceso
        let internalidRegistroAuditoria = libAuditoria.busquedaDatosAuditoria(name)[0].internalid;

        // Definir parametros a usar en actualizacion de registro auditoria existente para proceso
        let parametroActualizacionRegistroAuditoria = {
            recordtype: "customrecord_2win_auditoria",
            internalid: internalidRegistroAuditoria,
            campos: {
                "custrecord_2win_auditoria_id_script": runtime.getCurrentScript().id,
                "custrecord_2win_auditoria_etapa": procesarCajaRecaudacion.name
            }
        };

        const resultado = {
            exito: true,
            errores: [],
            mensaje: ""
        };
        cajas.forEach((caja) => {
            procesarDocumentos({ documentos: caja, resultado });
        });
        if (resultado.errores.length > 0) {
            resultado.exito = false;
            resultado.mensaje = "Procesamiento completado con errores";
            nLog.error("Procesamiento con errores", `Se encontraron ${resultado.errores.length} errores durante el procesamiento`);

            // Actualizar campos auditoria
            parametroActualizacionRegistroAuditoria.campos.custrecord_2win_auditoria_estado = "001";
            parametroActualizacionRegistroAuditoria.campos.custrecord_2win_auditoria_descripcion = resultado.errores[0].error;
        } else {
            resultado.mensaje = "Procesamiento completado exitosamente";
            nLog.audit("Procesamiento exitoso", "Todas las cajas fueron procesadas sin errores");

            // Actualizar campos auditoria
            parametroActualizacionRegistroAuditoria.campos.custrecord_2win_auditoria_descripcion = resultado.mensaje;
        }

        // Actualizar registro de auditoria
        libAuditoria.actualizarCamposRegistro(parametroActualizacionRegistroAuditoria);
        return resultado;
    };
    // Unidades minimas requeridas para intentar procesar un documento completo
    // (Invoice/CreditMemo + JE + Payment + busquedas de cliente/subsidiaria/OV + auditoria ≈ 150 unidades, con margen)
    const UNIDADES_MINIMAS_POR_DOCUMENTO = 300;

    /**
     * Recolecta todos los folios que requieren validacion de asiento, con las MISMAS condiciones
     * que usa cada seccion (facturas, NC, ND) al validar linea a linea.
     * @param {Object} documentos - Contenido del archivo
     * @returns {Array<string>} - Folios (con duplicados; el DAO los deduplica)
     */
    const recolectarFoliosAValidar = (documentos) => {
        const folios = [];
        const agregarCopagoExcedente = (detalle) => {
            if (Number(detalle.montoCopago) > 0) folios.push(detalle.folioCopago);
            if (Number(detalle.montoExcedente) > 0) folios.push(detalle.folioExcedente);
        };

        (documentos.facturasEmitidas || []).forEach(({ detalleFacturas }) => {
            (Array.isArray(detalleFacturas) ? detalleFacturas : []).forEach((detalle) => {
                if (detalle.tipoDocumento === "BONO ELECTRONICO") {
                    folios.push(detalle.folio);
                    agregarCopagoExcedente(detalle);
                }
            });
        });
        (documentos.ncEmitidas || []).forEach(({ detalleNC }) => {
            (Array.isArray(detalleNC) ? detalleNC : []).forEach((detalle) => {
                if (detalle.tipoDocumento === "BONO ELECTRONICO" && Number(detalle.montoTotalDescuento) === 0 && Number(detalle.folioBono)) {
                    folios.push(detalle.folioBono);
                    agregarCopagoExcedente(detalle);
                }
            });
        });
        (documentos.ndEmitidas || []).forEach(({ detalleND }) => {
            (Array.isArray(detalleND) ? detalleND : []).forEach((detalle) => {
                if (detalle.tipoDocumento === "BONO ELECTRONICO" && Number(detalle.MontoTotalDescuento) === 0 && Number(detalle.folioBono)) {
                    folios.push(detalle.folioBono);
                    agregarCopagoExcedente(detalle);
                }
            });
        });
        return folios;
    };

    /**
     * Verifica que queden unidades suficientes antes de procesar un documento.
     * Si no alcanzan, registra un error controlado en lugar de dejar que el reduce se caiga con SSS_USAGE_LIMIT_EXCEEDED.
     * @returns {boolean} - true si se puede procesar
     */
    const hayUnidadesSuficientes = ({ tipo, folioDoc, razonSocial, tipoDocumento, resultado }) => {
        const restantes = runtime.getCurrentScript().getRemainingUsage();
        if (restantes >= UNIDADES_MINIMAS_POR_DOCUMENTO) return true;
        nLog.error("procesarDocumentos - unidades insuficientes", `${tipo} ${folioDoc}: quedan ${restantes} unidades`);
        resultado.errores.push({
            tipo,
            folio: folioDoc,
            razonSocial,
            tipoDocumento,
            error: `Documento no procesado: unidades de ejecucion insuficientes (quedan ${restantes}, se requieren ${UNIDADES_MINIMAS_POR_DOCUMENTO})`
        });
        return false;
    };

    const procesarDocumentos = ({ documentos, resultado }) => {
        // Validacion de asientos en bloque: 1 consulta SuiteQL cada 500 folios (antes: 1 consulta por linea)
        let indiceAsientos;
        try {
            indiceAsientos = JournalEntryDAO.getJournalEntriesIndexByFolios({ folios: recolectarFoliosAValidar(documentos) });
            nLog.audit("procesarDocumentos - unidades restantes tras validar asientos", runtime.getCurrentScript().getRemainingUsage());
        } catch (error) {
            nLog.error("procesarDocumentos - error al consultar asientos", error);
            resultado.errores.push({
                tipo: "GENERAL",
                folio: "",
                razonSocial: "",
                tipoDocumento: "",
                error: `No se pudieron consultar los asientos de los folios: ${error.message}`
            });
            return;
        }

        //facturas
        documentos.facturasEmitidas.forEach((factura) => {
            const { folioDoc, tipoDocumento, razonSocial, FechaDocumento, FechaVencimiento, RutCliente, CondicionPago, TipoFacturacion, tipoDocRef, folioRef, codRef, detalleFacturas } = factura;

            try {
                if (!hayUnidadesSuficientes({ tipo: "FACTURA", folioDoc, razonSocial, tipoDocumento, resultado })) return;

                // Validar que existan detalles
                if (!detalleFacturas || !Array.isArray(detalleFacturas) || detalleFacturas.length === 0) {
                    resultado.errores.push({
                        tipo: "FACTURA",
                        folio: folioDoc,
                        razonSocial: razonSocial,
                        tipoDocumento,
                        error: `Se recibieron datos de cabecera pero no hay detalles de facturación`
                    });
                    return; // Continuar con la siguiente factura
                }
                const lineas = [];
                let totalJournalCopago = 0;
                let totalExedente = 0;
                let invoiceId;
                const lineasJournal = [];
                let cuentaPaciente = "";
                detalleFacturas.forEach((detalle) => {
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
                    let asientos = [];
                    if (tipoDocumento === "BONO ELECTRONICO") {
                        const folios = [];
                        folios.push(folio);
                        if (Number(montoCopago) > 0) folios.push(folioCopago);
                        if (Number(montoExcedente) > 0) folios.push(folioExcedente);
                        if (folios.length === 0) throw new Error(`No hay folios: ${folios.join(", ")}`);
                        // Sin consulta por linea: se lee del indice precargado (0 unidades)
                        asientos = JournalEntryDAO.getJournalEntriesFromIndex(indiceAsientos, folios);
                        const foliosFaltantes = folios.filter((folio) => !asientos.some((asiento) => Number(asiento.custcol_2w_folio) === Number(folio)));
                        if (foliosFaltantes.length > 0) {
                            nLog.error("procesarDocumentos - asientos", `No se encontraron asientos para los folios: ${foliosFaltantes.join(", ")}`);
                            throw new Error(`No se encontraron asientos para los folios: ${foliosFaltantes.join(", ")}`);
                        }
                    }

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
                if (lineas.length > 0) {
                    invoiceId = InvoiceDAO.createInvoice({
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
                    });
                    nLog.audit("procesarDocumentos", `Factura creada: ${invoiceId} para folioDoc: ${folioDoc}`);
                }
                if (totalJournalCopago > 0) {
                    nLog.debug("totales Journal", lineasJournal);
                    let totalDebit = 0;
                    let totalCredit = 0;
                    lineasJournal.forEach((line) => {
                        if (line.debit) totalDebit += line.debit;
                        if (line.credit) totalCredit += line.credit;
                    });
                    nLog.audit("procesarDocumentos", `Total Debit: ${totalDebit}, Total Credit: ${totalCredit} para folioDoc: ${folioDoc}`);
                    const idJournal = JournalEntryDAO.createJournalEntry({
                        fechaTransaccion: FechaDocumento,
                        subsidiaria: subsidiaria.getSubsidiaria(utils.formatearRut(razonSocial)),
                        memo: `Factura asociada folio ${folioDoc}`,
                        lines: lineasJournal,
                        cuentaPaciente: cuentaPaciente
                    });
                    nLog.audit("procesarDocumentos", `Asiento creado: ${idJournal} para folioDoc: ${folioDoc}`);
                    const idPayment = PaymentDAO.createPayment({
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
                nLog.error("procesarDocumentos - factura Error", error);
                resultado.errores.push({
                    tipo: "FACTURA",
                    folio: folioDoc,
                    razonSocial: razonSocial,
                    tipoDocumento,
                    error: error.message
                });
            }
        });
        //notas de credito
        documentos.ncEmitidas.forEach((ncredito) => {
            const { folioDoc, tipoDocumento, razonSocial, FechaDocumento, FechaVencimiento, RutCliente, CondicionPago, TipoFacturacion, tipoDocRef, folioRef, codRef, detalleNC } = ncredito;

            try {
                if (!hayUnidadesSuficientes({ tipo: "NOTA_CREDITO", folioDoc, razonSocial, tipoDocumento, resultado })) return;

                // Validar que existan detalles
                if (!detalleNC || !Array.isArray(detalleNC) || detalleNC.length === 0) {
                    resultado.errores.push({
                        tipo: "NOTA_CREDITO",
                        folio: folioDoc,
                        razonSocial: razonSocial,
                        tipoDocumento,
                        error: `Se recibieron datos de cabecera pero no hay detalles`
                    });
                    return; // Continuar con la siguiente nota de crédito
                }

                const lineas = [];
                let totalJournalCopago = 0;
                let totalExedente = 0;
                let creditMemoId;
                const lineasJournal = [];
                let totalNotaCredito = 0;
                let cuentaPaciente = "";
                detalleNC.forEach((detalle) => {
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
                        if (folios.length === 0) throw new Error(`No hay folios: ${folios.join(", ")}`);
                        // Sin consulta por linea: se lee del indice precargado (0 unidades)
                        asientos = JournalEntryDAO.getJournalEntriesFromIndex(indiceAsientos, folios);
                        const foliosFaltantes = folios.filter((folio) => !asientos.some((asiento) => Number(asiento.custcol_2w_folio) === Number(folio)));
                        if (foliosFaltantes.length > 0) {
                            nLog.error("procesarDocumentos - asientos", `No se encontraron asientos para los folios: ${foliosFaltantes.join(", ")}`);
                            throw new Error(`No se encontraron asientos para los folios: ${foliosFaltantes.join(", ")}`);
                        }
                    }
                    // Verificar si hay descuento antes de evaluar el tipo de documento
                    if (Number(montoNetoDescuento) + Number(montoExentoDescuento) > 0) {
                        const { articuloBoleta } = MappingDAO.getItemMapping({ categoria: getFlow("DescuentoFactura") });
                        nLog.debug("Descuento aplicado - tipoDocumento:", tipoDocumento);
                        nLog.debug("Descuento articuloBoleta", articuloBoleta);
                        nLog.debug("getFlow()", getFlow("DescuentoFactura"));
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
                const invoiceId = InvoiceDAO.findInvoiceByFolio(folioRef);
                const journals = InvoiceDAO.findAppliedJournals(invoiceId);
                if (lineas.length > 0) {
                    creditMemoId = CreditMemoDAO.createCreditMemo({
                        customerId: CustomerDAO.getByRut(utils.formatearRut(RutCliente)),
                        account: 457,
                        razonSocialCobro: subsidiaria.getSubsidiaria(utils.formatearRut(razonSocial)),
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
                    });
                    nLog.audit("procesarDocumentos", `Nota de Credito creada: ${creditMemoId} para folioDoc: ${folioDoc}`);

                    // journals.forEach(({ id }) => {
                    //     reverseTransaction(id, "journalentry");
                    // });
                    // CreditMemoDAO.applyCreditMemo(creditMemoId, invoiceId, true);
                }
                if (totalJournalCopago > 0) {
                    nLog.debug("totales Journal", lineasJournal);
                    let totalDebit = 0;
                    let totalCredit = 0;
                    lineasJournal.forEach((line) => {
                        if (line.debit) totalDebit += line.debit;
                        if (line.credit) totalCredit += line.credit;
                    });
                    nLog.audit("procesarDocumentos", `Total Debit: ${totalDebit}, Total Credit: ${totalCredit} para folioDoc: ${folioDoc}`);
                    const idJournal = JournalEntryDAO.createJournalEntry({
                        fechaTransaccion: FechaDocumento,
                        subsidiaria: subsidiaria.getSubsidiaria(utils.formatearRut(razonSocial)),
                        memo: `Nota de Credito asociada folio ${folioDoc}`,
                        lines: lineasJournal,
                        cuentaPaciente: cuentaPaciente
                    });
                    nLog.audit("procesarDocumentos", `Asiento creado: ${idJournal} para folioDoc: ${folioDoc}`);
                    nLog.debug("totalNotaCredito - totalDebit", [totalNotaCredito, diferencia]);
                    const idPayment = PaymentDAO.createPayment({
                        customerId: CustomerDAO.getByRut(utils.formatearRut(RutCliente)),
                        subsidiaria: subsidiaria.getSubsidiaria(utils.formatearRut(razonSocial)),
                        fechaTransaccion: FechaDocumento,
                        memo: `Pago Nota de Credito asociada folio ${folioDoc}`,
                        invoicesToPay: [{ id: invoiceId, amount: totalNotaCredito - diferencia }, { id: idJournal }],
                        journalEntriesPago: [creditMemoId, ...journals.map(({ id }) => id)]
                    });
                    nLog.audit("idPayment", idPayment);
                } else {
                    const idPayment = PaymentDAO.createPayment({
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
                nLog.error("procesarDocumentos - ncredito Error", error);
                resultado.errores.push({
                    tipo: "NOTA_CREDITO",
                    folio: folioDoc,
                    razonSocial: razonSocial,
                    tipoDocumento,
                    error: error.message
                });
            }
        });
        //notas de debito
        documentos.ndEmitidas.forEach((ndebito) => {
            const { folioDoc, tipoDocumento, razonSocial, FechaDocumento, FechaVencimiento, RutCliente, tipoDocRef, folioRef, codRef, tipoND, detalleND } = ndebito;

            try {
                if (!hayUnidadesSuficientes({ tipo: "NOTA_DEBITO", folioDoc, razonSocial, tipoDocumento, resultado })) return;

                // Validar que existan detalles
                if (!detalleND || !Array.isArray(detalleND) || detalleND.length === 0) {
                    resultado.errores.push({
                        tipo: "NOTA_DEBITO",
                        folio: folioDoc,
                        razonSocial: razonSocial,
                        tipoDocumento,
                        error: `Se recibieron datos de cabecera pero no hay detalles`
                    });
                    return; // Continuar con la siguiente nota de débito
                }

                const lineas = [];
                let totalJournalCopago = 0;
                let totalExedente = 0;
                let DebitNoteId;
                const lineasJournal = [];
                let cuentaPaciente = "";
                detalleND.forEach((detalle) => {
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
                        if (folios.length === 0) throw new Error(`No hay folios: ${folios.join(", ")}`);
                        // Sin consulta por linea: se lee del indice precargado (0 unidades)
                        asientos = JournalEntryDAO.getJournalEntriesFromIndex(indiceAsientos, folios);
                        const foliosFaltantes = folios.filter((folio) => !asientos.some((asiento) => Number(asiento.custcol_2w_folio) === Number(folio)));
                        if (foliosFaltantes.length > 0) {
                            nLog.error("procesarDocumentos - asientos", `No se encontraron asientos para los folios: ${foliosFaltantes.join(", ")}`);
                            throw new Error(`No se encontraron asientos para los folios: ${foliosFaltantes.join(", ")}`);
                        }
                    }
                    // Verificar si hay descuento antes de evaluar el tipo de documento
                    if (Number(montoNetoDescuento) + Number(MontoExentoDescuento) > 0) {
                        const { articuloBoleta } = MappingDAO.getItemMapping({ categoria: getFlow("DescuentoFactura") });
                        nLog.debug("Descuento aplicado - tipoDocumento:", tipoDocumento);
                        nLog.debug("Descuento articuloBoleta", articuloBoleta);
                        nLog.debug("getFlow()", getFlow("DescuentoFactura"));
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
                    DebitNoteId = InvoiceDAO.createInvoice({
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
                    });
                    nLog.audit("procesarDocumentos", `Nota de Debito creada: ${DebitNoteId} para folioDoc: ${folioDoc}`);

                    // Aplicar DebitMemo a CreditMemo (folioRef)
                    const creditMemoId = CreditMemoDAO.getCreditIdByFolio(folioRef);
                    if (creditMemoId) {
                        nLog.debug("procesarDocumentos", `Aplicando DebitMemo ${DebitNoteId} a CreditMemo ${creditMemoId} (folioRef: ${folioRef})`);
                        CreditMemoDAO.applyCreditMemo(creditMemoId, DebitNoteId, true);
                    }
                }
                if (totalJournalCopago > 0) {
                    nLog.debug("totales Journal", lineasJournal);
                    let totalDebit = 0;
                    let totalCredit = 0;
                    lineasJournal.forEach((line) => {
                        if (line.debit) totalDebit += line.debit;
                        if (line.credit) totalCredit += line.credit;
                    });
                    nLog.audit("procesarDocumentos", `Total Debit: ${totalDebit}, Total Credit: ${totalCredit} para folioDoc: ${folioDoc}`);
                    const idJournal = JournalEntryDAO.createJournalEntry({
                        fechaTransaccion: FechaDocumento,
                        subsidiaria: subsidiaria.getSubsidiaria(utils.formatearRut(razonSocial)),
                        memo: `Nota de Debito asociada folio ${folioDoc}`,
                        lines: lineasJournal,
                        cuentaPaciente: cuentaPaciente
                    });
                    nLog.audit("procesarDocumentos", `Asiento creado: ${idJournal} para folioDoc: ${folioDoc}`);

                    // Aplicar journal al invoice folioDoc
                    const invoiceIdToApply = InvoiceDAO.findInvoiceByFolio(folioDoc);

                    const idPayment = PaymentDAO.createPayment({
                        customerId: CustomerDAO.getByRut(utils.formatearRut(RutCliente)),
                        subsidiaria: subsidiaria.getSubsidiaria(utils.formatearRut(razonSocial)),
                        fechaTransaccion: FechaDocumento,
                        memo: `Pago Nota de Debito asociada folio ${folioDoc}`,
                        invoicesToPay: [{ id: invoiceIdToApply, amount: diferencia }],
                        journalEntriesPago: [idJournal]
                    });
                    nLog.audit("idPayment", idPayment);
                }
            } catch (error) {
                nLog.error("procesarDocumentos - ndebito Error", error);
                resultado.errores.push({
                    tipo: "NOTA_DEBITO",
                    folio: folioDoc,
                    razonSocial: razonSocial,
                    tipoDocumento,
                    error: error.message
                });
            }
        });
    };

    return { procesarCajaRecaudacion };
});
