/**
 * @NApiVersion 2.1
 */
define([
    "../dao/CustomerDAO",
    "../dao/SalesOrderDAO",
    "../dao/InvoiceDAO",
    "../dao/CreditMemoDAO",
    "../dao/JournalEntryDAO",
    "../dao/PaymentDAO",
    "../dao/MappingDAO",
    "../libs/subsidiaria",
    "../dao/2win_dao_subsidiaria",
    "../libs/utils",
    "../constants/2win_constants",
    "N/log",
    "../dao/2win_dao_draft"
], function (
    CustomerDAO,
    SalesOrderDAO,
    InvoiceDAO,
    CreditMemoDAO,
    JournalEntryDAO,
    PaymentDAO,
    MappingDAO,
    { getSubsidiaria, getRepresentingCustomer },
    { validarSubsidiarias },
    utils,
    { getFlow },
    nLog,
    { searchAllTransactionsByCaja, searchTransactionByMovementNumber, deleteTransactionById, searchCierreCaja, searchAllCierresCaja, reverseTransaction, filterOutInvoices, deleteTransaction }
) {
    function procesarCajaRecaudacion(jsonInput) {
        nLog.audit("INICIO procesarCajaRecaudacion", "Iniciando procesamiento de caja de recaudación");

        const resultado = {
            exito: true,
            errores: [],
            mensaje: ""
        };

        try {
            // Validación inicial similar a flujo.js
            if (!jsonInput || !jsonInput.cajas) {
                nLog.error("Error de validación", "Datos inválidos: formato incorrecto");
                throw new Error("Datos inválidos: formato incorrecto");
            }

            // Log optimizado: solo auditoría, no debug
            nLog.audit("Validación OK", `Procesando ${jsonInput.cajas.length} cajas`);

            jsonInput.cajas.forEach((caja, index) => {
                procesarCaja(caja, resultado);
            });

            if (resultado.errores.length > 0) {
                resultado.exito = false;
                resultado.mensaje = "Procesamiento completado con errores";
                nLog.error("Procesamiento con errores", `Se encontraron ${resultado.errores.length} errores durante el procesamiento`);
            } else {
                resultado.mensaje = "Procesamiento completado exitosamente";
                nLog.audit("Procesamiento exitoso", "Todas las cajas fueron procesadas sin errores");
            }
        } catch (e) {
            nLog.error("Error General Procesamiento", e);
            resultado.exito = false;
            resultado.errores.push(e.message);
        }

        nLog.audit("FIN procesarCajaRecaudacion", `Resultado: ${resultado.exito ? "ÉXITO" : "ERROR"}, Mensaje: ${resultado.mensaje}`);
        return resultado;
    }

    function procesarCaja(caja, resultado) {
        nLog.audit("INICIO procesarCaja", "Iniciando procesamiento de caja individual");

        // Pre-cargar todos los datos de la caja
        const datos = preCargarDatosCaja(caja);

        // [RF2] Iteración de movimientos (detalles)
        if (datos.detalles) {
            datos.detalles.forEach((movimiento) => {
                try {
                    procesarMovimiento(
                        movimiento,
                        datos.fechaGlobal,
                        datos.subsidiariaCaja,
                        datos.unidadCaja,
                        resultado,
                        datos.encabezado.razonSocialCaja,
                        datos.aperturaCaja,
                        datos.CajeroCierreCaja,
                        datos.encabezado,
                        datos.todasLasTransacciones,
                        datos.todosLosCierres
                    );
                } catch (e) {
                    nLog.error("Error Movimiento", `Movimiento ${movimiento.numeroMovimiento}: ${e.message}`);
                    resultado.errores.push({
                        movimiento: movimiento.numeroMovimiento,
                        error: e.message,
                        encabezado: datos.encabezado
                    });
                }
            });
        }

        // Reversar cierres previos antes de crear nuevos
        reversarCierresPrevios(datos.todosLosCierres, resultado, datos.encabezado);

        // Crear nuevo cierre de caja
        procesarCierreCaja(datos.encabezado, datos.fechaGlobal, datos.subsidiariaCaja);
    }

    /**
     * Pre-carga todos los datos necesarios para procesar una caja.
     * Incluye: encabezado, subsidiaria, transacciones existentes y cierres.
     * @param {Object} caja - Objeto caja con encabezado y detalle
     * @returns {Object} Datos pre-cargados de la caja
     */
    function preCargarDatosCaja(caja) {
        nLog.audit("INICIO preCargarDatosCaja", "Pre-cargando datos de caja");

        const encabezado = caja.encabezado;
        const subsidiariaCaja = getSubsidiaria(utils.formatearRut(encabezado.razonSocialCaja));
        const fechaGlobal = encabezado.fechaCaja;
        const unidadCaja = encabezado.unidadCaja;
        const aperturaCaja = encabezado.aperturaCaja;
        const CajeroCierreCaja = encabezado.CajeroCierreCaja;

        // Cargar todas las transacciones de la caja de una vez
        const todasLasTransacciones = searchAllTransactionsByCaja({
            caja: unidadCaja,
            fechaCaja: fechaGlobal,
            aperturaCaja: aperturaCaja,
            razonSocialCaja: encabezado.razonSocialCaja
        });

        // Cargar todos los cierres de caja de una vez
        const todosLosCierres = searchAllCierresCaja({
            caja: unidadCaja,
            fechaCaja: fechaGlobal,
            aperturaCaja: aperturaCaja,
            razonSocialCaja: encabezado.razonSocialCaja
        });

        return {
            encabezado,
            subsidiariaCaja,
            fechaGlobal,
            unidadCaja,
            aperturaCaja,
            CajeroCierreCaja,
            detalles: caja.detalle,
            todasLasTransacciones,
            todosLosCierres
        };
    }

    /**
     * Reversa todos los cierres de caja previos encontrados.
     * @param {Array} todosLosCierres - Array de cierres pre-cargados
     * @param {Object} resultado - Objeto de resultado para acumular errores
     * @param {Object} encabezado - Encabezado de la caja para contexto de errores
     */
    function reversarCierresPrevios(todosLosCierres, resultado, encabezado) {
        if (todosLosCierres && todosLosCierres.length > 0) {
            nLog.audit("Revirtiendo cierres de caja", `Se encontraron ${todosLosCierres.length} cierres previos para reversar`);
            todosLosCierres.forEach((cierre) => {
                try {
                    reverseTransaction(cierre.id, cierre.type);
                    nLog.debug("Cierre reversado", `ID: ${cierre.id}, Tipo: ${cierre.type}`);
                } catch (error) {
                    nLog.error("Error reversando cierre", `ID: ${cierre.id}, Error: ${error.message}`);
                    resultado.errores.push({
                        tipo: "Cierre de Caja",
                        id: cierre.id,
                        error: error.message,
                        encabezado
                    });
                }
            });
        }
    }

    /**
     * Agrupa líneas de journal entry por account y folio, sumando montos
     * @param {Array} lines - Array de líneas con account, debit, credit, folio
     * @returns {Array} Array de líneas agrupadas
     */
    function agruparLineasPorAccountYFolio(lines) {
        const grupos = {};

        lines.forEach((linea) => {
            const key = `${linea.account}_${linea.folio || ""}`;
            if (!grupos[key]) {
                grupos[key] = {
                    ...linea,
                    debit: 0,
                    credit: 0
                };
            }
            grupos[key].debit += parseFloat(linea.debit) || 0;
            grupos[key].credit += parseFloat(linea.credit) || 0;
        });

        return Object.values(grupos).filter((l) => l.debit > 0 || l.credit > 0);
    }

    function procesarMovimiento(
        movimiento,
        fechaTransaccion,
        subsidiariaCaja,
        unidadCaja,
        resultado,
        razonSocialCaja,
        aperturaCaja,
        CajeroCierreCaja,
        encabezado,
        todasLasTransacciones,
        todosLosCierres
    ) {
        // nLog.debug("", `--- Procesando Movimiento: ${movimiento.numeroMovimiento} ---`); // Reducido para optimización

        // ========================================
        // VALIDACIÓN DE DUPLICADOS POR MOVIMIENTO - OPTIMIZADO
        // ========================================
        // Usar transacciones pre-cargadas en lugar de buscar por cada movimiento
        const transaccionesExistentes = todasLasTransacciones[movimiento.numeroMovimiento] || [];
        const existeTransaccion = transaccionesExistentes && transaccionesExistentes.length > 0;
        const modoAnulacion = movimiento.MovimientoAnulado;

        // Lógica de deduplicación según modo de operación
        if (modoAnulacion === "N") {
            // MODO CREACIÓN: Si ya existe la transacción, saltar para evitar duplicado
            if (existeTransaccion) {
                // Log de auditoría mantenido para tracking
                return; // SKIP - evitar duplicado
            }
        } else if (modoAnulacion === "A") {
            // MODO ANULACIÓN: Si no existe transacción previa, no hay nada que anular
            if (!existeTransaccion) {
                return; // SKIP - nada que anular
            }
        }
        // ========================================
        // FIN VALIDACIÓN DE DUPLICADOS
        // ========================================

        // Variable para controlar si es edición (necesita reprocesar sin boletas)
        let esEdicion = false;
        // Array para almacenar IDs de facturas creadas (para aplicar pagos después)
        const facturasCreadas = [];
        let invoiceId = null;
        const folioBoletas = [];
        //flujo de anulacion de pagos
        if (movimiento.MovimientoAnulado === "A" || movimiento.MovimientoAnulado === "E") {
            let listTransactions = transaccionesExistentes;
            listTransactions = Object.values(
                listTransactions.reduce((acc, item) => {
                    acc[item.id] = item;
                    return acc;
                }, {})
            );
            if (movimiento.MovimientoAnulado === "A") {
                // ANULACIÓN: Reversar todas las transacciones (incluye boletas)
                listTransactions.forEach((transaccion) => {
                    reverseTransaction(transaccion.id, transaccion.recordtype);
                });
            } else if (movimiento.MovimientoAnulado === "E") {
                // EDICIÓN: Reversar TODO menos boletas (invoices), luego procesar sin boletas
                esEdicion = true;
                const transaccionesSinBoletas = filterOutInvoices(listTransactions);

                const boletas = listTransactions.filter((t) => t.recordtype === "invoice");
                boletas.forEach((boleta) => {
                    deleteTransactionById(boleta.id, boleta.recordtype);
                    facturasCreadas.push({
                        id: boleta.id,
                        subsidiaria: boleta.subsidiary,
                        folio: boleta.custbody_2winfolioacepta,
                        monto: boleta.amount
                    });
                });

                transaccionesSinBoletas.forEach((transaccion) => {
                    if (transaccion.recordtype === "journalentry" || transaccion.recordtype === "advintercompanyjournalentry") deleteTransactionById(transaccion.id, transaccion.recordtype);
                    reverseTransaction(transaccion.id, transaccion.recordtype);
                });
            }

            const cajeroRut = utils.formatearRut(CajeroCierreCaja);
            // Usar cierres pre-cargados en lugar de buscar por cada movimiento
            const cierres = todosLosCierres.filter((cierre) => {
                // Filtrar por cajero si es necesario
                const cajeroCierre = cierre.custentity_2wrut; // Campo de RUT del cajero
                return cajeroCierre === cajeroRut;
            });
            cierres.forEach((transaccion) => {
                // En edición también reversamos los cierres
                if (movimiento.MovimientoAnulado === "A" || esEdicion) {
                    reverseTransaction(transaccion.id, transaccion.type);
                }
                // else {
                //     deleteTransactionById(transaccion.id, transaccion.type);
                // }
            });

            if (movimiento.MovimientoAnulado === "A") {
                // Solo anulación, no continuar con procesamiento
                return;
            }
            // Si es edición ("E"), continuar procesando pero SIN boletas
        }
        // [RF4] Validación de Paciente
        const customerId = movimiento.IdPaciente
            ? CustomerDAO.upsertCustomer({
                  IdPaciente: movimiento.IdPaciente,
                  subsidiaria: subsidiariaCaja
              })
            : MappingDAO.getItemMapping({ categoria: getFlow("VentaDirecta") })?.cliente; // Cliente genérico para movimientos sin paciente --- MODIFICAR

        if (!customerId) {
            throw new Error(`Paciente con ID ${movimiento.IdPaciente} no encontrado en NetSuite`);
        }

        // [RF4] Validación de Cuenta Paciente / Creación de SO Genérica
        let salesOrderId = SalesOrderDAO.findOpenOrder(customerId, subsidiariaCaja, movimiento.CuentaPaciente);
        if (!movimiento.IdPaciente) salesOrderId = ""; //force null si no hay paciente
        if (!salesOrderId && movimiento.IdPaciente) throw new Error(`No se encontró Orden de Venta abierta para Cliente ${customerId} y Cuenta Paciente ${movimiento.CuentaPaciente}`);

        // ---------------------------------------------------------
        // [RF3, RF4.1, RF5] PROCESAMIENTO DE BOLETAS Y EGRESOS/INGRESOS
        // ---------------------------------------------------------
        // En edición, las boletas NO se procesan (ya que nunca se modifican)
        if (esEdicion) {
            // Omitiendo procesamiento de boletas en edición
        } else if (movimiento.boletasEmitidas && movimiento.boletasEmitidas.length > 0) {
            movimiento.boletasEmitidas.forEach((boleta) => {
                try {
                    // [RF4.1] Validar marca de Anticipo
                    if (utils.esSi(boleta.Anticipo)) {
                        const subsidiariaId = getSubsidiaria(utils.formatearRut(boleta.razonSocialCobro));
                        let salesOrderIdOtro = SalesOrderDAO.findOpenOrder(customerId, subsidiariaId, movimiento.CuentaPaciente);
                        if (!salesOrderIdOtro) {
                            nLog.debug("Creando nueva orden de venta", "No se encontró orden existente, creando nueva");

                            salesOrderIdOtro = SalesOrderDAO.createOrder({
                                customerId: customerId,
                                fechaTransaccion: fechaTransaccion,
                                ficha: movimiento.Ficha,
                                prefactura: movimiento.prefactura,
                                cuentaPaciente: movimiento.CuentaPaciente,
                                subsidiaria: subsidiariaCaja,
                                items: []
                            });
                        }
                        let lineasFactura = [];
                        const { articuloBoleta, cuentaCobrarBoleta } = MappingDAO.getItemMapping({ categoria: getFlow("BoletasEmitidasAnticipo") });
                        //especificar que item se usara para anticipos
                        lineasFactura.push({ item: articuloBoleta, rate: parseFloat(boleta.montoNeto) || parseFloat(boleta.montoExento), tax1amt: parseFloat(boleta.montoIva) });
                        // Generar Invoice Standalone

                        invoiceId = InvoiceDAO.createInvoice({
                            customerId: customerId,
                            account: cuentaCobrarBoleta,
                            fechaTransaccion: fechaTransaccion,
                            ficha: movimiento.Ficha,
                            prefactura: movimiento.prefactura,
                            cuentaPaciente: movimiento.CuentaPaciente,
                            folioBoleta: boleta.folioBoleta,
                            razonSocialCobro: subsidiariaId,
                            esAnticipo: utils.esSi(boleta.Anticipo),
                            montoNeto: boleta.montoNeto,
                            montoExento: boleta.montoExento,
                            montoIva: boleta.montoIva,
                            montoTotal: boleta.montoTotal,
                            tipoDocumento: boleta.tipoDocumento,
                            items: lineasFactura,
                            // Campos adicionales del CSV
                            idPaciente: movimiento.IdPaciente,
                            paciente: customerId,
                            previsionPaciente: movimiento.previsionPaciente,
                            previsionNombre: movimiento.previsionNombre,
                            nroAdhesion: movimiento.nroAdhesion,
                            nroRegistro: movimiento.nroRegistro,
                            tipoAtencion: movimiento.tipoAtencion,
                            convenioCod: movimiento.convenioCod,
                            convenioNom: movimiento.convenioNom,
                            // Campos de caja
                            aperturaCaja: aperturaCaja,
                            unidadCaja: unidadCaja,
                            razonSocialCaja: razonSocialCaja,
                            fechaCaja: fechaTransaccion,
                            numeroMovimiento: movimiento.numeroMovimiento,

                            transaccionOrigen: salesOrderIdOtro
                        });

                        facturasCreadas.push({
                            id: invoiceId,
                            subsidiaria: subsidiariaId,
                            folio: boleta.folioBoleta,
                            monto: boleta.montoTotal
                        });
                    } else {
                        nLog.debug("Boleta no es anticipo", `Folio: ${boleta.folioBoleta} - Procesando como boleta normal`);
                        let lineasFactura = [];
                        const { articuloBoleta, cuentaCobrarBoleta } = MappingDAO.getItemMapping({
                            categoria: getFlow("BoletasEmitidas")
                        });
                        const invoiceSubsidiariaId = getSubsidiaria(utils.formatearRut(boleta.razonSocialCobro));

                        if (movimiento.IdPaciente)
                            lineasFactura.push({
                                item: articuloBoleta,
                                rate: parseFloat(boleta.montoNeto) || parseFloat(boleta.montoExento),
                                tax1amt: parseFloat(boleta.montoIva),
                                folio: movimiento.CuentaPaciente
                            });

                        //iterar ingresos y egresos afectos a boleta
                        // [RF5] Si no es anticipo, buscar Ingresos/Egresos AFECTOS a boleta
                        // Agregar Egresos Afectos (Restan valor o son ítems negativos/descuentos)
                        if (movimiento.detalleEgresos) {
                            movimiento.detalleEgresos.forEach((egreso) => {
                                if (utils.esSi(egreso.afectoBoleta)) {
                                    try {
                                        const { articuloBoleta: articuloEgreso } = MappingDAO.getItemMapping({
                                            categoria: getFlow("DetalleEgresos"),
                                            codigo: egreso.codigoEgreso
                                        });
                                        const subsidiariaId = getSubsidiaria(utils.formatearRut(egreso.razonSocialCobro));
                                        if (invoiceSubsidiariaId === subsidiariaId) {
                                            if(!articuloEgreso) throw new Error(`No se encontró artículo para código de egreso ${egreso.codigoEgreso} en categoría DetalleEgresos`);
                                            lineasFactura.push({
                                                item: articuloEgreso,
                                                rate: -1 * (parseFloat(egreso.montoNeto) || parseFloat(egreso.montoExento) || parseFloat(egreso.montoTotal)),
                                                tax1amt: -1 * parseFloat(egreso.montoIva)
                                            });
                                        }
                                    } catch (error) {
                                        nLog.error(
                                            "Error creando factura de egreso afecto a boleta",
                                            `Folio Boleta: ${boleta.folioBoleta}, Código Egreso: ${egreso.codigoEgreso}, Monto: ${egreso.montoTotal} - Error: ${error.message}`
                                        );
                                        resultado.errores.push({
                                            movimiento: movimiento.numeroMovimiento,
                                            tipo: "Factura Egreso Afecto Boleta",
                                            folio: boleta.folioBoleta,
                                            codigoEgreso: egreso.codigoEgreso,
                                            error: error.message,
                                            encabezado
                                        });
                                        throw error; // Si el egreso afecto a boleta tiene un error, se detiene el procesamiento de esa boleta para evitar inconsistencias en la factura. Las demás boletas seguirán procesándose.
                                    }
                                }
                            });
                        }
                        // Agregar Ingresos Afectos (Suman valor)
                        if (movimiento.detalleIngresos) {
                            movimiento.detalleIngresos.forEach((ingreso) => {
                                if (utils.esSi(ingreso.afectoBoleta)) {
                                    try {
                                        const { articuloBoleta: articuloIngreso } = MappingDAO.getItemMapping({
                                            categoria: getFlow("DetalleIngresos"),
                                            codigo: ingreso.codigoIngreso
                                        });
                                        const subsidiariaId = getSubsidiaria(utils.formatearRut(ingreso.razonSocialCobro));
                                        
                                        if (invoiceSubsidiariaId === subsidiariaId) {
                                            if(!articuloIngreso) throw new Error(`No se encontró artículo para código de ingreso ${ingreso.codigoIngreso} en categoría DetalleIngresos`);
                                            lineasFactura.push({
                                                item: articuloIngreso,
                                                rate: parseFloat(ingreso.montoNeto) || parseFloat(ingreso.montoExento) || parseFloat(ingreso.montoTotal),
                                                tax1amt: parseFloat(ingreso.montoIva)
                                            });
                                        }
                                    } catch (error) {
                                        nLog.error(
                                            "Error creando factura de ingreso afecto a boleta",
                                            `Folio Boleta: ${boleta.folioBoleta}, Código Ingreso: ${ingreso.codigoIngreso}, Monto: ${ingreso.montoTotal} - Error: ${error.message}`
                                        );
                                        resultado.errores.push({
                                            movimiento: movimiento.numeroMovimiento,
                                            tipo: "Factura Ingreso Afecto Boleta",
                                            folio: boleta.folioBoleta,
                                            codigoIngreso: ingreso.codigoIngreso,
                                            error: error.message,
                                            encabezado
                                        });
                                        throw error; // Si el ingreso afecto a boleta tiene un error, se detiene el procesamiento de esa boleta para evitar inconsistencias en la factura. Las demás boletas seguirán procesándose.
                                    }
                                }
                            });
                        }

                        // Generar Invoice Standalone

                        invoiceId = InvoiceDAO.createInvoice({
                            customerId: customerId,
                            account: cuentaCobrarBoleta,
                            fechaTransaccion: fechaTransaccion,
                            ficha: movimiento.Ficha,
                            prefactura: movimiento.prefactura,
                            cuentaPaciente: movimiento.CuentaPaciente,
                            folioBoleta: boleta.folioBoleta,
                            razonSocialCobro: invoiceSubsidiariaId,
                            esAnticipo: utils.esSi(boleta.Anticipo),
                            montoNeto: boleta.montoNeto,
                            montoExento: boleta.montoExento,
                            montoIva: boleta.montoIva,
                            montoTotal: boleta.montoTotal,
                            tipoDocumento: boleta.tipoDocumento,
                            items: lineasFactura,
                            // Campos adicionales del CSV
                            idPaciente: movimiento.IdPaciente,
                            paciente: customerId,
                            previsionPaciente: movimiento.previsionPaciente,
                            previsionNombre: movimiento.previsionNombre,
                            nroAdhesion: movimiento.nroAdhesion,
                            nroRegistro: movimiento.nroRegistro,
                            tipoAtencion: movimiento.tipoAtencion,
                            convenioCod: movimiento.convenioCod,
                            convenioNom: movimiento.convenioNom,
                            // Campos de caja
                            aperturaCaja: aperturaCaja,
                            unidadCaja: unidadCaja,
                            razonSocialCaja: razonSocialCaja,
                            fechaCaja: fechaTransaccion,
                            numeroMovimiento: movimiento.numeroMovimiento,

                            transaccionOrigen: salesOrderId
                        });

                        facturasCreadas.push({
                            id: invoiceId,
                            subsidiaria: invoiceSubsidiariaId,
                            folio: boleta.folioBoleta,
                            monto: boleta.montoTotal
                        });
                    }
                    folioBoletas.push(boleta.folioBoleta);
                } catch (error) {
                    nLog.error("Error creando factura de boleta", `Folio: ${boleta.folioBoleta}, Monto: ${boleta.montoTotal} - Error: ${error.message}`);
                    resultado.errores.push({
                        movimiento: movimiento.numeroMovimiento,
                        tipo: "Factura Boleta",
                        folio: boleta.folioBoleta,
                        error: error.message,
                        encabezado
                    });
                    // Continúa con la siguiente boleta
                }
            });
        }

        // ---------------------------------------------------------
        // [RF5.1] CARGOS COBRADOS ANTICIPO - OPTIMIZADO CON AGRUPACIÓN
        // ---------------------------------------------------------
        if (movimiento.cargosCobradosAnticipo && movimiento.cargosCobradosAnticipo.length > 0) {
            nLog.debug("Procesando cargos cobrados anticipo", `Se encontraron ${movimiento.cargosCobradosAnticipo.length} cargos para procesar`);

            const linesOrigenRaw = {};
            movimiento.cargosCobradosAnticipo.forEach((cargo) => {
                const { razonSocialCobro, folioAnticipo, montoNeto, montoExento, TipoAnticipo } = cargo;
                if (TipoAnticipo !== "IMPUTACION") return;
                const subsidiariaId = getSubsidiaria(utils.formatearRut(razonSocialCobro));
                const { cuentaContableDebito: cuentaDebito } = MappingDAO.getItemMapping({
                    categoria: getFlow("CargosCobradosAnticipos")
                });
                const { cuentaContableCredito: cuentaCredito } = MappingDAO.getItemMapping({
                    categoria: getFlow("BonosEmitidos")
                });
                if (!linesOrigenRaw[subsidiariaId]) {
                    linesOrigenRaw[subsidiariaId] = [];
                }
                linesOrigenRaw[subsidiariaId].push({
                    account: cuentaDebito,
                    debit: Number(montoNeto) || Number(montoExento),
                    credit: 0,
                    entity: customerId,
                    folio: folioAnticipo,
                    memo: `Cargo Anticipo - Tipo: ${TipoAnticipo}`
                });
                linesOrigenRaw[subsidiariaId].push({
                    account: cuentaCredito,
                    debit: 0,
                    entity: customerId,
                    credit: Number(montoNeto) || Number(montoExento),
                    folio: folioAnticipo,
                    memo: `Cargo Anticipo - Tipo: ${TipoAnticipo}`
                });
            });
            Object.keys(linesOrigenRaw).forEach((subsidiariaId) => {
                const lineasOrigen = agruparLineasPorAccountYFolio(linesOrigenRaw[subsidiariaId]);
                const memo = `Cargos Cobrados Anticipo - (Consolidado)`;

                JournalEntryDAO.createJournalEntry({
                    fechaTransaccion: fechaTransaccion,
                    subsidiaria: subsidiariaId,
                    // tipoDeDiario: tipoAsiento,
                    memo: memo,
                    lines: lineasOrigen,
                    aperturaCaja: aperturaCaja,
                    unidadCaja: unidadCaja,
                    razonSocialCaja: razonSocialCaja,
                    fechaCaja: fechaTransaccion,
                    numeroMovimiento: movimiento.numeroMovimiento,
                    cuentaPaciente: movimiento.CuentaPaciente,
                    fichaPaciente: movimiento.Ficha,
                    convenioPaciente: movimiento.convenioPaciente,
                    idPaciente: movimiento.IdPaciente,
                    reversoPago: movimiento.reversoPago,
                    transaccionOrigen: salesOrderId
                });
            });
        }

        // ---------------------------------------------------------
        // [RF6] NOTAS DE CRÉDITO
        // ---------------------------------------------------------
        if (movimiento.NCEmitidas && movimiento.NCEmitidas.length > 0) {
            movimiento.NCEmitidas.forEach((nc) => {
                try {
                    let creditoItem;
                    if (nc.anticipo === "S") {
                        creditoItem = MappingDAO.getItemMapping({ categoria: getFlow("BoletasEmitidasAnticipo") }).articuloBoleta;
                    } else {
                        creditoItem = MappingDAO.getItemMapping({ categoria: getFlow("BoletasEmitidas") }).articuloBoleta;
                    }

                    const subsidiariaId = getSubsidiaria(utils.formatearRut(nc.rutReceptor));
                    const ncId = CreditMemoDAO.createCreditMemo({
                        customerId: customerId,
                        fechaTransaccion: fechaTransaccion,
                        folioNC: nc.folioNC,
                        rutReceptor: nc.rutReceptor,
                        razonSocialCobro: subsidiariaId,
                        esAnticipo: nc.anticipo,
                        montoNeto: nc.montoNeto,
                        montoExento: nc.montoExento,
                        montoIva: nc.montoIva,
                        montoTotal: nc.montoTotal,
                        creditoItem: creditoItem,
                        cuentaPaciente: movimiento.CuentaPaciente,
                        // Referencia a documento original
                        tipoDocRef: nc.tipoDocRef,
                        folioRef: nc.folioRef,
                        fechaRef: nc.fechaRef,
                        codRef: nc.codRef,
                        // Campos adicionales del CSV
                        idPaciente: movimiento.IdPaciente,
                        paciente: customerId,
                        previsionPaciente: movimiento.previsionPaciente,
                        previsionNombre: movimiento.previsionNombre,
                        nroAdhesion: movimiento.nroAdhesion,
                        nroRegistro: movimiento.nroRegistro,
                        tipoAtencion: movimiento.tipoAtencion,
                        convenioCod: movimiento.convenioCod,
                        convenioNom: movimiento.convenioNom,
                        // Campos de caja
                        aperturaCaja: aperturaCaja,
                        unidadCaja: unidadCaja,
                        razonSocialCaja: razonSocialCaja,
                        fechaCaja: fechaTransaccion,
                        numeroMovimiento: movimiento.numeroMovimiento,

                        transaccionOrigen: salesOrderId
                    });

                    // Si tiene referencia a factura, aplicar NC contra la factura
                    if (nc.folioRef) {
                        try {
                            CreditMemoDAO.aplicarNCContraFactura(ncId, nc.folioRef);
                        } catch (errorAplicacion) {
                            nLog.error("Error aplicando NC contra factura", `Folio NC: ${nc.folioNC}, Folio Ref: ${nc.folioRef} - Error: ${errorAplicacion.message}`);
                            resultado.errores.push({
                                movimiento: movimiento.numeroMovimiento,
                                tipo: "Aplicación NC contra Factura",
                                folioNC: nc.folioNC,
                                folioRef: nc.folioRef,
                                error: errorAplicacion.message,
                                encabezado
                            });
                        }
                    }
                } catch (error) {
                    nLog.error("Error creando nota de crédito", `Folio NC: ${nc.folioNC}, Monto: ${nc.montoTotal} - Error: ${error.message}`);
                    resultado.errores.push({
                        movimiento: movimiento.numeroMovimiento,
                        tipo: "Nota de Crédito",
                        folioNC: nc.folioNC,
                        error: error.message,
                        encabezado
                    });
                }
            });
        }

        // ---------------------------------------------------------
        // [RF7 & RF8] BONOS EMITIDOS Y ANULADOS - OPTIMIZADO CON AGRUPACIÓN
        // ---------------------------------------------------------
        const procesarBonos = (listaBonos, esAnulacion) => {
            if (!listaBonos || listaBonos.length === 0) return;
            const bonoBonif = [];
            const bonoCopago = {};
            const bonoNormal = {};
            /**
             * {
                "folioBono": "654354",
                "razonSocialCobro": "762619059",
                "montoNeto": "0.00",
                "montoExento": "43543.00",
                "montoIva": "0.00",
                "montoTotal": "43543",
                "copagoBono": "22350",
                "copagoCobrado": "SI",
                "bonifAdicional": "5433",
                "bonifRelacionada": "SI",
                "fechaEmision": "2026-01-05 00:00:00.0",
                "rutPrevision": "965728007",
                "tipoBono": "IMED",
                "rutEntidadFacturar": ""
            }
             */
            listaBonos.forEach((bono) => {
                if (bono.copagoBono && parseFloat(bono.copagoBono) > 0) {
                    if (!bonoCopago[bono.razonSocialCobro]) {
                        bonoCopago[bono.razonSocialCobro] = [];
                    }
                    if (utils.esSi(bono.copagoCobrado)) bonoCopago[bono.razonSocialCobro].push(bono);
                }
                if (bono.bonifAdicional && parseFloat(bono.bonifAdicional) > 0) {
                    bonoBonif.push(bono);
                }
                if (!bonoNormal[bono.razonSocialCobro]) {
                    bonoNormal[bono.razonSocialCobro] = [];
                }
                bonoNormal[bono.razonSocialCobro].push(bono);
            });
            nLog.audit("bonoBonif", bonoBonif);
            try {
                if (bonoBonif && bonoBonif.length > 0) {
                    let isIntercompany = false;
                    const linesOrigenRaw = [];
                    const linesDestinoRaw = [];
                    bonoBonif.forEach((bono) => {
                        const razonSocial = bono.razonSocialCobro;
                        if (utils.esSi(bono.bonifRelacionada)) {
                            isIntercompany = true;
                            const subsidiariaId = getSubsidiaria(utils.formatearRut(razonSocial));
                            const { cuentaContableDebito: cuentaDebito } = MappingDAO.getItemMapping({
                                categoria: getFlow("BonificacionAdicional")
                            });
                            const { cuentaContableCredito: countracredito } = MappingDAO.getItemMapping({
                                categoria: esAnulacion ? getFlow("BonosAnuladosConCopago") : getFlow("BonosEmitidosConCopago")
                            });
                            const { cuentaContableCredito: icCuentaCredito } = MappingDAO.getItemMapping({ categoria: getFlow("InterCompany"), subsidiaria: subsidiariaCaja });
                            const { cuentaContableDebito: icCuentaDebito } = MappingDAO.getItemMapping({ categoria: getFlow("InterCompany"), subsidiaria: subsidiariaId });
                            const { cliente } = MappingDAO.getItemMapping({
                                categoria: getFlow("BonificacionAdicionalCliente")
                            });
                            // Obtener representing customer de subsidiaria cruzada para cuentas intercompany
                            const repCustomerOrigen = getRepresentingCustomer(subsidiariaId);
                            const repCustomerDestino = getRepresentingCustomer(subsidiariaCaja);
                            linesOrigenRaw.push(
                                {
                                    account: icCuentaCredito,
                                    credit: parseFloat(bono.bonifAdicional),
                                    entity: repCustomerOrigen,
                                    subsidiaria: subsidiariaCaja,
                                    folio: bono.folioBono,
                                    memo: "Bonificacion Adicional Relacionada"
                                },
                                {
                                    account: cuentaDebito,
                                    debit: parseFloat(bono.bonifAdicional),
                                    entity: cliente,
                                    subsidiaria: subsidiariaCaja,
                                    folio: bono.folioBono,
                                    memo: "Bonificacion Adicional Relacionada"
                                }
                            );
                            linesDestinoRaw.push(
                                {
                                    account: icCuentaDebito,
                                    debit: parseFloat(bono.bonifAdicional),
                                    entity: repCustomerDestino,
                                    subsidiaria: subsidiariaId,
                                    folio: bono.folioBono,
                                    memo: "Bonificacion Adicional Relacionada"
                                },
                                {
                                    account: countracredito,
                                    credit: parseFloat(bono.bonifAdicional),
                                    entity: customerId,
                                    subsidiaria: subsidiariaId,
                                    folio: bono.folioBono,
                                    memo: "Bonificacion Adicional Relacionada"
                                }
                            );
                        } else {
                            const subsidiariaId = getSubsidiaria(utils.formatearRut(razonSocial));
                            const { cuentaContableDebito } = MappingDAO.getItemMapping({
                                categoria: esAnulacion ? getFlow("BonosAnuladosConBonifAdicional") : getFlow("BonificacionAdicional")
                            });
                            const { cuentaContableCredito } = MappingDAO.getItemMapping({
                                categoria: esAnulacion ? getFlow("BonosAnuladosConCopago") : getFlow("BonosEmitidosConCopago")
                            });
                            const { cliente } = MappingDAO.getItemMapping({
                                categoria: getFlow("BonificacionAdicionalCliente")
                            });
                            linesOrigenRaw.push(
                                {
                                    account: cuentaContableCredito,
                                    subsidiaria: subsidiariaId,
                                    credit: parseFloat(bono.bonifAdicional),
                                    entity: customerId,
                                    folio: bono.folioBono,
                                    memo: "Bonificacion Adicional No Relacionada"
                                },
                                {
                                    account: cuentaContableDebito,
                                    subsidiaria: subsidiariaId,
                                    debit: parseFloat(bono.bonifAdicional),
                                    entity: cliente,
                                    folio: bono.folioBono,
                                    memo: "Bonificacion Adicional No Relacionada"
                                }
                            );
                        }
                    });
                    const lineasOrigen = agruparLineasPorAccountYFolio(linesOrigenRaw);
                    const lineasDestino = agruparLineasPorAccountYFolio(linesDestinoRaw);
                    const memo = `Bonos Bonificación Adicional - (Consolidado)`;
                    if (isIntercompany) {
                        JournalEntryDAO.createIntercompanyJournalEntry({
                            fechaTransaccion: fechaTransaccion,
                            subsidiaria: subsidiariaCaja,
                            // tipoDeDiario: tipoAsiento,
                            memo: memo,
                            linesOrigen: lineasOrigen,
                            linesDestino: lineasDestino,
                            aperturaCaja: aperturaCaja,
                            unidadCaja: unidadCaja,
                            razonSocialCaja: razonSocialCaja,
                            fechaCaja: fechaTransaccion,
                            numeroMovimiento: movimiento.numeroMovimiento,
                            cuentaPaciente: movimiento.CuentaPaciente,
                            fichaPaciente: movimiento.Ficha,
                            convenioPaciente: movimiento.convenioPaciente,
                            idPaciente: movimiento.IdPaciente,
                            reversoPago: movimiento.reversoPago,
                            transaccionOrigen: salesOrderId
                        });
                    } else {
                        JournalEntryDAO.createJournalEntry({
                            fechaTransaccion: fechaTransaccion,
                            subsidiaria: subsidiariaCaja,
                            // tipoDeDiario: tipoAsiento,
                            memo: memo,
                            lines: lineasOrigen,
                            aperturaCaja: aperturaCaja,
                            unidadCaja: unidadCaja,
                            razonSocialCaja: razonSocialCaja,
                            fechaCaja: fechaTransaccion,
                            numeroMovimiento: movimiento.numeroMovimiento,
                            cuentaPaciente: movimiento.CuentaPaciente,
                            fichaPaciente: movimiento.Ficha,
                            convenioPaciente: movimiento.convenioPaciente,
                            idPaciente: movimiento.IdPaciente,
                            reversoPago: movimiento.reversoPago,
                            transaccionOrigen: salesOrderId
                        });
                    }
                }

                // Procesar bonos normales
                Object.keys(bonoNormal).forEach((razonSocial) => {
                    const bonos = bonoNormal[razonSocial];
                    const subsidiariaId = getSubsidiaria(utils.formatearRut(razonSocial));
                    const { cuentaContableCredito, cuentaContableDebito, tipoAsiento } = MappingDAO.getItemMapping({
                        categoria: esAnulacion ? getFlow("BonosAnulados") : getFlow("BonosEmitidos")
                    });

                    const memo = `Bonos Normales - (Consolidado)`;
                    const lineasRaw = [];
                    bonos.forEach((bono) => {
                        const customerPrevision = CustomerDAO.getByRut(utils.formatearRut(bono.rutPrevision));
                        lineasRaw.push(
                            { account: cuentaContableCredito, credit: Number(bono.montoExento) + Number(bono.montoNeto), entity: customerId, folio: movimiento.CuentaPaciente, memo: "Bono Emitido" },
                            { account: cuentaContableDebito, debit: parseFloat(bono.montoTotal), entity: customerPrevision, folio: bono.folioBono, memo: "Bono Emitido" }
                        );
                        // Solo agregar línea de IVA si el monto es mayor a 0
                        if (Number(bono.montoIva) > 0) {
                            const { cuentaContableCredito: cuentaIva } = MappingDAO.getItemMapping({
                                categoria: getFlow("BonoIva")
                            });
                            lineasRaw.push({ account: cuentaIva, credit: Number(bono.montoIva), entity: customerId, folio: bono.folioBono, memo: "Bono Emitido" });
                        }
                    });
                    const lineasAgrupadas = agruparLineasPorAccountYFolio(lineasRaw);

                    JournalEntryDAO.createJournalEntry({
                        fechaTransaccion: fechaTransaccion,
                        subsidiaria: subsidiariaId,
                        tipoDeDiario: tipoAsiento,
                        memo: memo,
                        lines: lineasAgrupadas,
                        aperturaCaja: aperturaCaja,
                        unidadCaja: unidadCaja,
                        razonSocialCaja: razonSocialCaja,
                        fechaCaja: fechaTransaccion,
                        numeroMovimiento: movimiento.numeroMovimiento,

                        cuentaPaciente: movimiento.CuentaPaciente,
                        fichaPaciente: movimiento.Ficha,
                        convenioPaciente: movimiento.convenioPaciente,
                        idPaciente: movimiento.IdPaciente,
                        reversoPago: movimiento.reversoPago,
                        transaccionOrigen: salesOrderId
                    });
                });
            } catch (error) {
                nLog.error("Error creando journal entry de bonos con copago", `Error: ${error.message}`);
                resultado.errores.push({
                    movimiento: movimiento.numeroMovimiento,
                    tipo: "Journal Entry Bonos con Copago",
                    error: error.message,
                    encabezado
                });
            }
        };

        procesarBonos(movimiento.bonosEmitidos, false);
        procesarBonos(movimiento.bonosAnulados, true);

        // ---------------------------------------------------------
        // [RF9] COBERTURAS - OPTIMIZADO CON AGRUPACIÓN
        // ---------------------------------------------------------
        if (movimiento.coberturasEmitidas && movimiento.coberturasEmitidas.length > 0) {
            nLog.debug("Procesando coberturas emitidas", `Se encontraron ${movimiento.coberturasEmitidas.length} coberturas para procesar`);

            // Procesar coberturas normales consolidadas

            // Agrupar coberturas normales por subsidiaria, tipo financiador y folio
            const gruposCoberturas = {};
            /**
             * {
              "folio": "1111",
              "razonSocialCobro": "762619059",
              "montoNeto": "0.00",
              "montoExento": "450790.00",
              "montoIva": "0.00",
              "montoTotal": "450790",
              "rutFinanciador": "61602275K",
              "tipoFinanciador": "OTROS CONVENIOS"
            }
             */
            const { cuentaContableCredito } = MappingDAO.getItemMapping({
                categoria: getFlow("CoberturasEmitidas")
            });
            const { cuentaContableDebito } = MappingDAO.getItemMapping({
                categoria: getFlow("CoberturasEmitidas")
            });
            const { cuentaContableCredito: cuentaIva } = MappingDAO.getItemMapping({
                categoria: getFlow("BonoIva")
            });
            movimiento.coberturasEmitidas.forEach((cobertura) => {
                const key = cobertura.razonSocialCobro;
                if (!gruposCoberturas[key]) {
                    gruposCoberturas[key] = {
                        subsidiaria: getSubsidiaria(utils.formatearRut(cobertura.razonSocialCobro)),
                        lineas: [],
                        aperturaCaja: aperturaCaja,
                        unidadCaja: unidadCaja,
                        razonSocialCaja: razonSocialCaja,
                        fechaCaja: fechaTransaccion,
                        numeroMovimiento: movimiento.numeroMovimiento
                    };
                }
                gruposCoberturas[key].lineas.push({
                    folio: cobertura.folio,
                    entity: CustomerDAO.getByRut(utils.formatearRut(cobertura.rutFinanciador)),
                    account: cuentaContableDebito,
                    debit: parseFloat(cobertura.montoTotal),
                    subsidiaria: gruposCoberturas[key].subsidiaria,
                    memo: "Cobertura"
                });
                gruposCoberturas[key].lineas.push({
                    folio: movimiento.CuentaPaciente,
                    account: cuentaContableCredito,
                    entity: customerId,
                    credit: parseFloat(cobertura.montoNeto) + parseFloat(cobertura.montoExento),
                    subsidiaria: gruposCoberturas[key].subsidiaria,
                    memo: "Cobertura"
                });
                if (cobertura.montoIva && parseFloat(cobertura.montoIva) > 0) {
                    gruposCoberturas[key].lineas.push({
                        folio: cobertura.folio,
                        account: cuentaIva,
                        entity: CustomerDAO.getByRut(utils.formatearRut(cobertura.rutFinanciador)),
                        credit: parseFloat(cobertura.montoIva),
                        subsidiaria: gruposCoberturas[key].subsidiaria,
                        memo: "IVA Cobertura"
                    });
                }
            });

            nLog.debug("Coberturas normales agrupadas", `Se generaron ${Object.keys(gruposCoberturas).length} grupos consolidados`);

            // Procesar cada grupo consolidado de coberturas normales
            Object.keys(gruposCoberturas).forEach((subsidiaria) => {
                try {
                    const coberturas = gruposCoberturas[subsidiaria];
                    //Se debe corregir

                    if (cuentaContableDebito && cuentaContableCredito) {
                        // Generar memo consolidado
                        const memo = `Coberturas - (Consolidado)`;

                        // Crear journal entry consolidado
                        JournalEntryDAO.createJournalEntry({
                            fechaTransaccion: fechaTransaccion,
                            subsidiaria: subsidiariaCaja,
                            memo: memo,
                            lines: agruparLineasPorAccountYFolio(coberturas.lineas),
                            aperturaCaja: aperturaCaja,
                            unidadCaja: unidadCaja,
                            razonSocialCaja: razonSocialCaja,
                            fechaCaja: fechaTransaccion,
                            numeroMovimiento: movimiento.numeroMovimiento,

                            cuentaPaciente: movimiento.CuentaPaciente,
                            fichaPaciente: movimiento.Ficha,
                            convenioPaciente: movimiento.convenioPaciente,
                            idPaciente: movimiento.IdPaciente,
                            reversoPago: movimiento.reversoPago
                        });

                        nLog.audit("Journal Entry Consolidado - Coberturas", `Subsidiaria: ${subsidiaria}, Monto Total: ${coberturas.lineas}`);
                    }
                } catch (error) {
                    nLog.error("Error creando journal entry consolidado de coberturas", `Subsidiaria: ${subsidiaria} - Error: ${error.message}`);
                    resultado.errores.push({
                        movimiento: movimiento.numeroMovimiento,
                        tipo: "Journal Entry Coberturas",
                        subsidiaria: subsidiaria,
                        error: error.message,
                        encabezado
                    });
                }
            });
        }

        // ---------------------------------------------------------
        // [RF10] FORMAS DE PAGO (RECAUDACIÓN) - UN SOLO JOURNAL PARA TODOS LOS PAGOS
        // ---------------------------------------------------------
        if (movimiento.formaPago && movimiento.formaPago.length > 0) {
            const journalEntriesPago = {};
            const consolidado = {};
            let requiereIntercompany = false;

            // Array para guardar todas las NC que deben cruzarse contra el Journal Entry creado
            const ncsParaAplicarAJournal = [];
            const mapJournalIds = {};

            movimiento.formaPago.forEach((pago) => {
                try {
                    const subsidiariaDestino = getSubsidiaria(utils.formatearRut(pago.razonSocialDoc.trim()));
                    const subsidiariaIdOrigen = getSubsidiaria(utils.formatearRut(pago.rutPrestador.trim()));
                    const esIntercompany = subsidiariaDestino !== subsidiariaIdOrigen;
                    requiereIntercompany = requiereIntercompany || esIntercompany;

                    const claveConsolidacion = subsidiariaIdOrigen;

                    if (!consolidado[claveConsolidacion]) {
                        consolidado[claveConsolidacion] = {
                            lineasEstandar: [],
                            linesOrigen: [],
                            linesDestino: [],
                            subsidiariaId: subsidiariaDestino,
                            subsidiariaIdOrigen: subsidiariaIdOrigen,
                            memo: `Pago Consolidado`,
                            tipoPago: pago.tipo
                        };
                    }

                    // CASO 1: EL PAGO ES UNA NOTA DE CRÉDITO
                    if (pago.tipo && pago.tipo.includes("NC")) {
                        if (pago.tipoDocPago === "DEVOLUCION") return; // Si necesitas procesar devoluciones, quita este return y mapéalas abajo

                        // CONDICIÓN: Si es intercompany, o si es un pago a un Documento NO transaccional (Copago, Redondeo, Devolución)
                        if (esIntercompany || ["COPAGO", "REDONDEO", "DEVOLUCION"].includes(pago.tipoDocPago)) {
                            const { cuentaContableDebito: ncCuentaDebito } = MappingDAO.getItemMapping({
                                categoria: getFlow("FormaPago"),
                                formaPagoTipo: pago.tipo.trim()
                            });

                            let cuentaCredito;
                            if (pago.tipoDocPago === "COPAGO") {
                                cuentaCredito = MappingDAO.getItemMapping({ categoria: getFlow("BonosEmitidosConCopago") }).cuentaContableCredito;
                            } else if (pago.tipoDocPago === "REDONDEO") {
                                cuentaCredito = MappingDAO.getItemMapping({ categoria: getFlow("Redondeo") }).cuentaContableCredito;
                            } else if (pago.tipoDocPago === "DEVOLUCION") {
                                cuentaCredito = MappingDAO.getItemMapping({ categoria: getFlow("Devolucion"), codigo: "devolucion" }).cuentaContableCredito;
                            } else {
                                cuentaCredito = MappingDAO.getItemMapping({ categoria: getFlow("BoletasEmitidas") }).cuentaCobrarBoleta;
                            }

                            if (esIntercompany) {
                                const { cuentaContableCredito: icCuentaCredito } = MappingDAO.getItemMapping({
                                    categoria: getFlow("InterCompany"),
                                    subsidiaria: subsidiariaIdOrigen === subsidiariaCaja ? subsidiariaIdOrigen : subsidiariaDestino
                                });
                                const { cuentaContableDebito: icCuentaDebito } = MappingDAO.getItemMapping({
                                    categoria: getFlow("InterCompany"),
                                    subsidiaria: subsidiariaDestino === subsidiariaCaja ? subsidiariaIdOrigen : subsidiariaDestino
                                });

                                const repCustomerOrigen = getRepresentingCustomer(subsidiariaDestino);
                                const repCustomerDestino = getRepresentingCustomer(subsidiariaIdOrigen);

                                // LÍNEAS ORIGEN
                                consolidado[claveConsolidacion].linesOrigen.push({
                                    account: ncCuentaDebito,
                                    debit: parseFloat(pago.montoPago),
                                    entity: customerId,
                                    subsidiaria: subsidiariaIdOrigen,
                                    folio: pago.folioTipoPago,
                                    memo: `Forma Pago - ${pago.tipo} - ${pago.tipoDocPago}`
                                });
                                consolidado[claveConsolidacion].linesOrigen.push({
                                    account: icCuentaCredito,
                                    credit: parseFloat(pago.montoPago),
                                    entity: repCustomerOrigen,
                                    subsidiaria: subsidiariaIdOrigen,
                                    folio: pago.folioDoc,
                                    memo: `Intercompany - ${pago.tipo}`
                                });

                                // LÍNEAS DESTINO
                                consolidado[claveConsolidacion].linesDestino.push({
                                    account: icCuentaDebito,
                                    debit: parseFloat(pago.montoPago),
                                    entity: repCustomerDestino,
                                    subsidiaria: subsidiariaDestino,
                                    folio: pago.folioDoc,
                                    memo: `Intercompany - ${pago.tipo}`
                                });
                                consolidado[claveConsolidacion].linesDestino.push({
                                    account: cuentaCredito,
                                    credit: parseFloat(pago.montoPago),
                                    entity: customerId,
                                    subsidiaria: subsidiariaDestino,
                                    folio: pago.folioDoc,
                                    memo: `Forma Pago - ${pago.tipo} - ${pago.tipoDocPago}`
                                });
                            } else {
                                // ES MISMA SUBSIDIARIA, PAGA UN JE (COPAGO/DEVOLUCIÓN) -> SE HACE POR JOURNAL ESTÁNDAR
                                consolidado[claveConsolidacion].lineasEstandar.push({
                                    account: ncCuentaDebito,
                                    debit: parseFloat(pago.montoPago),
                                    entity: customerId,
                                    folio: pago.folioTipoPago,
                                    memo: `Forma Pago NC - ${pago.tipo}`,
                                    subsidiaria: subsidiariaDestino
                                });
                                consolidado[claveConsolidacion].lineasEstandar.push({
                                    account: cuentaCredito,
                                    credit: parseFloat(pago.montoPago),
                                    entity: customerId,
                                    folio: pago.folioDoc,
                                    memo: `Aplicacion NC - ${pago.tipoDocPago}`,
                                    subsidiaria: subsidiariaDestino
                                });
                            }

                            // ¡AQUÍ ESTÁ LA MAGIA! Guardamos esta NC para cruzarla con el Asiento después de crearlo.
                            ncsParaAplicarAJournal.push({
                                folioNC: pago.folioTipoPago,
                                claveConsolidacion: claveConsolidacion
                            });
                        } else {
                            // ES MISMA SUBSIDIARIA Y PAGA UNA FACTURA (BOEE/BOAE) -> APLICACIÓN NATIVA DIRECTA (No lleva Journal)
                            CreditMemoDAO.aplicarNCComoFormaPago(pago.folioTipoPago, pago.folioDoc);
                        }
                    }
                    // CASO 2: PAGO INGRESO
                    else if (pago.tipoDocPago.toUpperCase() === "PAGOINGRESO") {
                        let mappingNormal = MappingDAO.getItemMapping({
                            categoria: getFlow("FormaPago"),
                            formaPagoTipo: pago.tipo
                        });
                        let cuentaDebito = mappingNormal.cuentaContableDebito;

                        consolidado[claveConsolidacion].linesOrigen.push({
                            account: cuentaDebito,
                            debit: parseFloat(pago.montoPago),
                            entity: CustomerDAO.getByRut(utils.formatearRut(pago.rutPago)),
                            subsidiaria: subsidiariaIdOrigen,
                            folio: pago.folioTipoPago,
                            memo: `Forma Pago - ${pago.tipo}`
                        });

                        if (esIntercompany) {
                            const { cuentaContableCredito: icCuentaCredito } = MappingDAO.getItemMapping({
                                categoria: getFlow("InterCompany"),
                                subsidiaria: subsidiariaIdOrigen === subsidiariaCaja ? subsidiariaIdOrigen : subsidiariaDestino
                            });
                            const repCustomerOrigen = getRepresentingCustomer(subsidiariaDestino);

                            consolidado[claveConsolidacion].linesOrigen.push({
                                account: icCuentaCredito,
                                credit: parseFloat(pago.montoPago),
                                entity: repCustomerOrigen,
                                subsidiaria: subsidiariaIdOrigen,
                                folio: pago.folioTipoPago,
                                memo: `Forma Pago - ${pago.tipo}`
                            });
                        }

                        movimiento.detalleIngresos.forEach((ingreso) => {
                            if (ingreso.roiFolio === pago.folioDoc && ingreso.afectoBoleta === "N") {
                                let mappingIngreso = MappingDAO.getItemMapping({
                                    categoria: getFlow("DetalleIngresos"),
                                    codigo: ingreso.codigoIngreso
                                });
                                let cuentaCredito = mappingIngreso.cuentaContableCredito;

                                consolidado[claveConsolidacion].linesDestino.push({
                                    account: cuentaCredito,
                                    credit: parseFloat(ingreso.montoNeto) + parseFloat(ingreso.montoExento) || parseFloat(ingreso.montoTotal),
                                    entity: CustomerDAO.getByRut(utils.formatearRut(ingreso.roiRut)),
                                    subsidiaria: getSubsidiaria(utils.formatearRut(ingreso.razonSocialCobro)),
                                    folio: pago.folioDoc,
                                    memo: `Forma Pago - INGRESO`
                                });

                                if (ingreso.montoIva && parseFloat(ingreso.montoIva) > 0) {
                                    const { cuentaContableCredito: cuentaIva } = MappingDAO.getItemMapping({ categoria: getFlow("BonoIva") });
                                    consolidado[claveConsolidacion].linesDestino.push({
                                        account: cuentaIva,
                                        credit: parseFloat(ingreso.montoIva),
                                        entity: CustomerDAO.getByRut(utils.formatearRut(ingreso.roiRut)),
                                        subsidiaria: getSubsidiaria(utils.formatearRut(ingreso.razonSocialCobro)),
                                        folio: pago.folioDoc,
                                        memo: `Forma Pago - INGRESO IVA`
                                    });
                                }

                                if (esIntercompany) {
                                    const { cuentaContableDebito: icCuentaDebito } = MappingDAO.getItemMapping({
                                        categoria: getFlow("InterCompany"),
                                        subsidiaria: subsidiariaDestino === subsidiariaCaja ? subsidiariaIdOrigen : subsidiariaDestino
                                    });
                                    const repCustomerDestino = getRepresentingCustomer(subsidiariaIdOrigen);

                                    consolidado[claveConsolidacion].linesDestino.push({
                                        account: icCuentaDebito,
                                        debit: parseFloat(ingreso.montoTotal),
                                        entity: repCustomerDestino,
                                        subsidiaria: subsidiariaDestino,
                                        folio: pago.folioDoc,
                                        memo: `Forma Pago - INGRESO`
                                    });
                                }
                            }
                        });
                    }
                    // CASO 3: PAGO MONETARIO NORMAL (EFECTIVO, TARJETAS, ETC)
                    else {
                        let cuentaDebito, cuentaCredito;
                        let mappingNormal = MappingDAO.getItemMapping({
                            categoria: getFlow("FormaPago"),
                            formaPagoTipo: pago.tipo
                        });
                        cuentaDebito = mappingNormal.cuentaContableDebito;

                        const mappingBoletas = MappingDAO.getItemMapping({ categoria: getFlow("BoletasEmitidas") });
                        cuentaCredito = mappingBoletas.cuentaCobrarBoleta;

                        if (pago.tipoDocPago === "COPAGO") {
                            cuentaCredito = MappingDAO.getItemMapping({ categoria: getFlow("BonosEmitidosConCopago") }).cuentaContableCredito;
                        } else if (pago.tipoDocPago === "REDONDEO") {
                            cuentaCredito = MappingDAO.getItemMapping({ categoria: getFlow("Redondeo") }).cuentaContableCredito;
                        } else if (pago.tipoDocPago === "DEVOLUCION") {
                            cuentaCredito = MappingDAO.getItemMapping({ categoria: getFlow("Devolucion"), codigo: "devolucion" }).cuentaContableCredito;
                        }

                        if (pago.tipo.indexOf("-") > -1) {
                            const tipoPago = pago.tipo.split("-").map((e) => e.trim());
                            if (pago.tipo.toUpperCase().includes("EGRESO")) {
                                mappingNormal = MappingDAO.getItemMapping({
                                    categoria: getFlow("DetalleEgresos"),
                                    codigo: tipoPago[0]
                                });
                            }
                            cuentaDebito = mappingNormal.cuentaContableDebito;
                        }

                        const entidadPago = pago.rutPago ? CustomerDAO.getByRut(utils.formatearRut(pago.rutPago)) : "";

                        if (esIntercompany) {
                            const { cuentaContableCredito: icCuentaCredito } = MappingDAO.getItemMapping({
                                categoria: getFlow("InterCompany"),
                                subsidiaria: subsidiariaIdOrigen === subsidiariaCaja ? subsidiariaIdOrigen : subsidiariaDestino
                            });
                            const { cuentaContableDebito: icCuentaDebito } = MappingDAO.getItemMapping({
                                categoria: getFlow("InterCompany"),
                                subsidiaria: subsidiariaDestino === subsidiariaCaja ? subsidiariaIdOrigen : subsidiariaDestino
                            });

                            const repCustomerOrigen = getRepresentingCustomer(subsidiariaDestino);
                            const repCustomerDestino = getRepresentingCustomer(subsidiariaIdOrigen);

                            consolidado[claveConsolidacion].linesOrigen.push(
                                {
                                    account: cuentaDebito,
                                    debit: parseFloat(pago.montoPago),
                                    entity: entidadPago,
                                    subsidiaria: subsidiariaIdOrigen,
                                    folio: pago.folioTipoPago,
                                    memo: `Forma Pago - ${pago.tipo}`
                                },
                                {
                                    account: icCuentaCredito,
                                    credit: parseFloat(pago.montoPago),
                                    entity: repCustomerOrigen,
                                    subsidiaria: subsidiariaIdOrigen,
                                    folio: pago.folioDoc,
                                    memo: `Forma Pago - ${pago.tipo}`
                                }
                            );

                            consolidado[claveConsolidacion].linesDestino.push(
                                {
                                    account: icCuentaDebito,
                                    debit: parseFloat(pago.montoPago),
                                    entity: repCustomerDestino,
                                    subsidiaria: subsidiariaDestino,
                                    folio: pago.folioDoc,
                                    memo: `Forma Pago - ${pago.tipo}`
                                },
                                {
                                    account: cuentaCredito,
                                    credit: parseFloat(pago.montoPago),
                                    entity: customerId,
                                    subsidiaria: subsidiariaDestino,
                                    folio: pago.folioDoc,
                                    memo: `Forma Pago - ${pago.tipo}`
                                }
                            );
                        } else {
                            // LÍNEA ESTÁNDAR MISMA SUBSIDIARIA
                            consolidado[claveConsolidacion].lineasEstandar.push(
                                {
                                    account: cuentaDebito,
                                    debit: parseFloat(pago.montoPago),
                                    entity: entidadPago,
                                    folio: pago.folioTipoPago,
                                    memo: `Forma Pago - ${pago.tipo} - ${pago.tipoDocPago}`,
                                    subsidiaria: subsidiariaDestino
                                },
                                {
                                    account: cuentaCredito,
                                    credit: parseFloat(pago.montoPago),
                                    entity: customerId,
                                    folio: pago.folioDoc,
                                    memo: `Forma Pago - ${pago.tipo} - ${pago.tipoDocPago}`,
                                    subsidiaria: subsidiariaDestino
                                }
                            );
                        }
                    }
                } catch (error) {
                    nLog.error("Error procesando forma de pago", `Tipo: ${pago.tipo}, Monto: ${pago.montoPago}, Folio: ${pago.folioTipoPago || pago.folioNC} - Error: ${error.message}`);
                    resultado.errores.push({
                        movimiento: movimiento.numeroMovimiento,
                        tipo: "Forma de Pago",
                        tipoPago: pago.tipo,
                        folio: pago.folioTipoPago || pago.folioNC,
                        error: error.message,
                        encabezado
                    });
                }
            });

            // CREAR JOURNAL ENTRIES CONSOLIDADOS
            Object.keys(consolidado).forEach((subsidiariaOrigen) => {
                const datos = consolidado[subsidiariaOrigen];

                if (requiereIntercompany && datos.linesOrigen.length > 0 && datos.linesDestino.length > 0) {
                    datos.linesOrigen.push(...datos.lineasEstandar);
                    const lineasOrigenAgrupadas = agruparLineasPorAccountYFolio(datos.linesOrigen);
                    const lineasDestinoAgrupadas = agruparLineasPorAccountYFolio(datos.linesDestino);

                    const idJournalPago = JournalEntryDAO.createIntercompanyJournalEntry({
                        fechaTransaccion: fechaTransaccion,
                        subsidiaria: subsidiariaOrigen,
                        memo: `Pago Consolidado`,
                        linesOrigen: lineasOrigenAgrupadas,
                        linesDestino: lineasDestinoAgrupadas,
                        aperturaCaja: aperturaCaja,
                        unidadCaja: unidadCaja,
                        razonSocialCaja: razonSocialCaja,
                        fechaCaja: fechaTransaccion,
                        numeroMovimiento: movimiento.numeroMovimiento,
                        cuentaPaciente: movimiento.CuentaPaciente,
                        fichaPaciente: movimiento.Ficha,
                        convenioPaciente: movimiento.convenioPaciente,
                        idPaciente: movimiento.IdPaciente,
                        reversoPago: movimiento.reversoPago,
                        transaccionOrigen: salesOrderId
                    });
                    journalEntriesPago[subsidiariaOrigen] = [idJournalPago];
                    mapJournalIds[subsidiariaOrigen] = idJournalPago; // Guardamos el ID para cruzarlo con las NC
                } else if (datos.lineasEstandar.length > 0) {
                    const lineasEstandarAgrupadas = agruparLineasPorAccountYFolio(datos.lineasEstandar);

                    const idJournalPago = JournalEntryDAO.createJournalEntry({
                        fechaTransaccion: fechaTransaccion,
                        subsidiaria: datos.lineasEstandar[0].subsidiaria,
                        folioBoleta: subsidiariaOrigen,
                        memo: datos.lineasEstandar[0].memo,
                        lines: lineasEstandarAgrupadas,
                        aperturaCaja: aperturaCaja,
                        unidadCaja: unidadCaja,
                        razonSocialCaja: razonSocialCaja,
                        fechaCaja: fechaTransaccion,
                        numeroMovimiento: movimiento.numeroMovimiento,
                        cuentaPaciente: movimiento.CuentaPaciente,
                        fichaPaciente: movimiento.Ficha,
                        convenioPaciente: movimiento.convenioPaciente,
                        idPaciente: movimiento.IdPaciente,
                        reversoPago: movimiento.reversoPago,
                        transaccionOrigen: salesOrderId
                    });
                    journalEntriesPago[subsidiariaOrigen] = [idJournalPago];
                    mapJournalIds[subsidiariaOrigen] = idJournalPago; // Guardamos el ID para cruzarlo con las NC
                }
            });

            // APLICACIÓN DE NC A LOS JOURNAL ENTRIES CREADOS
            if (ncsParaAplicarAJournal.length > 0) {
                ncsParaAplicarAJournal.forEach((ncData) => {
                    try {
                        const jeId = mapJournalIds[String(ncData.claveConsolidacion)];
                        if (jeId) {
                            // Se utiliza esta función para aplicar la NC contra la línea de Journal que acabamos de crear
                            CreditMemoDAO.aplicarNCIntercompany(ncData.folioNC, jeId);
                            nLog.debug("NC Aplicada a Journal exitosamente", `NC: ${ncData.folioNC} -> JE: ${jeId}`);
                        }
                    } catch (error) {
                        nLog.error("Error aplicando NC a Journal", `NC: ${ncData.folioNC} - Error: ${error.message}`);
                    }
                });
            }

            // APLICAR RESTO DE PAGOS (Efectivo, Tarjetas, IC) A FACTURAS (Boletas)
            const allJournalEntries = [].concat(...Object.values(journalEntriesPago));
            if (allJournalEntries.length > 0) {
                const facturasPorSubsidiaria = {};

                Object.keys(journalEntriesPago).forEach((subsidiariaOrigen) => {
                    const datosConsolidados = consolidado[subsidiariaOrigen];
                    const foliosDoc = [...datosConsolidados.linesOrigen, ...datosConsolidados.lineasEstandar, ...datosConsolidados.linesDestino].map((linea) => Number(linea.folio));
                    const foliosSet = new Set(foliosDoc);

                    // Si alguna de las líneas del JE hace match con una Factura (BOAE/BOEE), se prepara el pago.
                    const facturas = facturasCreadas.filter((inv) => foliosSet.has(Number(inv.folio)));
                    if (facturas.length === 0) return;

                    facturas.forEach((factura) => {
                        const subsidiaria = factura.subsidiaria;
                        if (!facturasPorSubsidiaria[subsidiaria]) facturasPorSubsidiaria[subsidiaria] = [];
                        facturasPorSubsidiaria[subsidiaria].push(factura);
                    });
                });

                Object.keys(facturasPorSubsidiaria).forEach((subsidiaria) => {
                    PaymentDAO.createPayment({
                        customerId: customerId,
                        fechaTransaccion: fechaTransaccion,
                        subsidiaria: subsidiaria,
                        invoicesToPay: facturasPorSubsidiaria[subsidiaria],
                        journalEntriesPago: allJournalEntries
                    });
                });
            }
        }

        // ========================================
        // VALIDACIÓN POST-PROCESAMIENTO DE BOLETAS
        // MovimientoAnulado === "N" (Nuevo): Todas las boletas DEBEN estar completamente pagadas
        // MovimientoAnulado === "A" (Anulación): Las boletas pueden quedar pendientes de pago
        // ========================================
        if (movimiento.MovimientoAnulado === "N" && facturasCreadas.length > 0) {
            nLog.audit("validacionBoletas - verificando saldos", `Movimiento: ${movimiento.numeroMovimiento}, Facturas: ${facturasCreadas.length}`);
            facturasCreadas.forEach((factura) => {
                try {
                    const saldo = InvoiceDAO.verificarSaldoPendiente(factura.id);
                    if (saldo.saldoPendiente > 0) {
                        nLog.error("validacionBoletas - boleta no aplicada", `Folio: ${factura.folio}, Saldo pendiente: ${saldo.saldoPendiente}, Total: ${saldo.montoTotal}`);
                        resultado.errores.push({
                            movimiento: movimiento.numeroMovimiento,
                            tipo: "Boleta No Aplicada",
                            folio: factura.folio,
                            error: `Boleta folio ${factura.folio} no fue completamente pagada. Saldo pendiente: ${saldo.saldoPendiente} de ${saldo.montoTotal}`,
                            encabezado
                        });
                    } else {
                        nLog.audit("validacionBoletas - boleta aplicada correctamente", `Folio: ${factura.folio}`);
                    }
                } catch (errorValidacion) {
                    nLog.error("validacionBoletas - error al verificar saldo", `Folio: ${factura.folio}, Error: ${errorValidacion.message}`);
                    resultado.errores.push({
                        movimiento: movimiento.numeroMovimiento,
                        tipo: "Validación Boleta",
                        folio: factura.folio,
                        error: `Error al verificar saldo de boleta folio ${factura.folio}: ${errorValidacion.message}`,
                        encabezado
                    });
                }
            });
        }
    }

    function procesarCierreCaja(encabezado, fecha, subsidiaria) {
        nLog.audit("INICIO procesarCierreCaja", `Procesando ${1} cierres de caja`);
        const montoCierreCajaSobrante = Number(encabezado.montoCierreCajaSobrante) || 0;
        const montoCierreCajaFaltante = Number(encabezado.montoCierreCajaFaltante) || 0;
        const cajero = CustomerDAO.getByRut(utils.formatearRut(encabezado.CajeroCierreCaja));
        if (montoCierreCajaSobrante > 0 || montoCierreCajaFaltante > 0) {
            const esSobrante = montoCierreCajaSobrante > 0;

            const { cuentaContableCredito, cuentaContableDebito, tipoAsiento } = MappingDAO.getItemMapping({ categoria: getFlow("CierreCaja") });
            const { cuentaContableDebito: cuentaEfectivo } = MappingDAO.getItemMapping({
                categoria: getFlow("FormaPago"),
                formaPagoTipo: "EFECTIVO"
            });

            if ((cuentaContableDebito && cuentaContableCredito, cuentaEfectivo)) {
                const lines = [];
                if (esSobrante) {
                    lines.push({ account: cuentaEfectivo, debit: montoCierreCajaSobrante, entity: cajero });
                    lines.push({ account: cuentaContableCredito, credit: montoCierreCajaSobrante, entity: cajero });
                } else {
                    lines.push({ account: cuentaContableDebito, debit: montoCierreCajaFaltante, entity: cajero });
                    lines.push({ account: cuentaEfectivo, credit: montoCierreCajaFaltante, entity: cajero });
                }

                JournalEntryDAO.createJournalEntry({
                    fechaTransaccion: fecha,
                    subsidiaria: subsidiaria,
                    tipoDeDiario: tipoAsiento,
                    memo: `Cierre Caja General - ${esSobrante ? "Sobrante" : "Faltante"} - Cajero: ${encabezado.CajeroCierreCaja}`,
                    lines: lines,
                    aperturaCaja: encabezado.aperturaCaja,
                    unidadCaja: encabezado.unidadCaja,
                    razonSocialCaja: encabezado.razonSocialCaja,
                    fechaCaja: fecha,
                    numeroMovimiento: 0
                });
            }
        }
    }

    /**
     * Elimina físicamente todas las transacciones de un movimiento específico.
     * Se invoca cuando el procesamiento de un movimiento falla, para evitar transacciones huérfanas.
     * El orden de eliminación es: Payments → Credit Memos → Invoices → Journal Entries
     * @param {Object} datos - Datos pre-cargados de la caja (encabezado, unidadCaja, etc.)
     * @param {string|number} numeroMovimiento - Número de movimiento a limpiar
     * @returns {Object} Resumen de la limpieza { eliminadas: [], fallidas: [] }
     */
    function limpiarTransaccionesMovimiento(datos, numeroMovimiento) {
        const resumen = {
            eliminadas: [],
            fallidas: []
        };

        try {
            nLog.audit("limpiarTransaccionesMovimiento - INICIO", `Buscando transacciones para movimiento ${numeroMovimiento}`);

            // Buscar todas las transacciones del movimiento en la base de datos
            const transacciones = searchTransactionByMovementNumber({
                caja: datos.unidadCaja,
                fechaCaja: datos.fechaGlobal,
                aperturaCaja: datos.aperturaCaja,
                razonSocialCaja: datos.encabezado.razonSocialCaja,
                movementNumber: numeroMovimiento
            });

            if (!transacciones || transacciones.length === 0) {
                nLog.audit("limpiarTransaccionesMovimiento", `No se encontraron transacciones para movimiento ${numeroMovimiento}`);
                return resumen;
            }

            nLog.audit("limpiarTransaccionesMovimiento", `Se encontraron ${transacciones.length} transacciones para eliminar del movimiento ${numeroMovimiento}`);

            // Orden de eliminación: Payments → Credit Memos → Invoices → Journal Entries
            const ordenPrioridad = {
                customerpayment: 1,
                creditmemo: 2,
                invoice: 3,
                journalentry: 4,
                advintercompanyjournalentry: 5
            };

            // Ordenar por prioridad (menor número = se elimina primero)
            const transaccionesOrdenadas = transacciones.sort((a, b) => {
                const prioridadA = ordenPrioridad[a.recordtype] || 99;
                const prioridadB = ordenPrioridad[b.recordtype] || 99;
                return prioridadA - prioridadB;
            });

            // Eliminar cada transacción en orden
            transaccionesOrdenadas.forEach((transaccion) => {
                const eliminada = deleteTransaction(transaccion.id, transaccion.recordtype);
                if (eliminada) {
                    resumen.eliminadas.push({ id: transaccion.id, tipo: transaccion.recordtype });
                } else {
                    resumen.fallidas.push({ id: transaccion.id, tipo: transaccion.recordtype });
                }
            });

            nLog.audit("limpiarTransaccionesMovimiento - FIN", `Movimiento ${numeroMovimiento}: Eliminadas ${resumen.eliminadas.length}, Fallidas ${resumen.fallidas.length}`);
        } catch (error) {
            nLog.error("limpiarTransaccionesMovimiento - error", error);
        }

        return resumen;
    }

    return {
        procesarCajaRecaudacion: procesarCajaRecaudacion,
        // Funciones expuestas para uso desde Map/Reduce (procesamiento individual por movimiento)
        preCargarDatosCaja: preCargarDatosCaja,
        procesarMovimiento: procesarMovimiento,
        reversarCierresPrevios: reversarCierresPrevios,
        procesarCierreCaja: procesarCierreCaja,
        limpiarTransaccionesMovimiento: limpiarTransaccionesMovimiento
    };
});
