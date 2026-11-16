/**
 * @NApiVersion 2.1
 * @NModuleScope SameAccount
 */
define(["./2win_dom_facturacion", "../dao/2win_dao_recaudaciones_fact_lotes", "../dao/2win_dao_estado_recaudaciones_fact_lotes",
    "../dao/2win_dao_file", "../libs/2win_lib_recaudaciones_fact_lotes", "../dao/2win_dao_recaudaciones_nc_rma"],
function (domFacturacion, daoLotes, daoEstado, daoFile, libLotes, daoRma) {
    const PASOS_APLICACION = ["APLICAR", "APLICAR_NOTA_CREDITO", "CREAR_ASIENTO", "CREAR_PAGO"];

    function siguienteOperacion(estado) {
        for (const tipo of libLotes.TIPOS) {
            const documentos = estado.documentos.filter((documento) => documento.tipo === tipo);
            const creacion = documentos.find((documento) => ![...PASOS_APLICACION, "TERMINADO", "ERROR"].includes(documento.paso));
            if (creacion) return creacion;
            const aplicacion = documentos.find((documento) => PASOS_APLICACION.includes(documento.paso));
            if (aplicacion) return aplicacion;
        }
        return null;
    }

    function obtenerPreparado(estado, documento) {
        const preparado = daoEstado.leerJson(documento.preparadoId);
        if (String(preparado.archivoId) !== String(estado.archivoId) || preparado.processKey !== documento.processKey ||
            preparado.tipo !== documento.tipo || preparado.indice !== documento.indice || !preparado.estado) {
            throw new Error("Los datos preparados no corresponden al documento");
        }
        return preparado;
    }

    function ejecutarOperacion(estado, documento) {
        if (documento.paso === "PREPARAR") {
            const admiteRma = estado.configuracion.ncRmaVersion === 1;
            if (documento.tipo === "NOTA_CREDITO" && documento.lineas > estado.configuracion.umbral && !admiteRma) {
                throw new Error("NC sobre el umbral: carga parcial deshabilitada hasta validar aprobación sin contabilización en el ambiente");
            }
            const contenido = JSON.parse(daoFile.cargarArchivo(estado.archivoId).contenido);
            const original = contenido[libLotes.DOCUMENTOS[documento.tipo]][documento.indice];
            daoLotes.validarReferencia(documento.tipo, original);
            const tipoRegistro = documento.tipo === "NOTA_CREDITO" ? "creditmemo" : "invoice";
            const existenteId = daoLotes.buscarPorClave(tipoRegistro, documento.processKey);
            if (existenteId) {
                const avance = daoLotes.obtenerAvance(documento.tipo, documento.processKey);
                if (avance.porLotes && (!avance.aprobado || avance.cargando)) {
                    throw new Error("Existe una carga parcial: debe recuperarse su checkpoint original antes de preparar otra vez");
                }
            }
            // No se modifica la preparación contable. La transacción aún no se crea aquí.
            const preparado = domFacturacion.prepararDocumento(documento.tipo, original, documento.processKey, existenteId, true);
            if (!preparado) throw new Error("No se pudo preparar el documento");
            if (preparado.lineasJournal && preparado.lineasJournal.length > 10000) {
                throw new Error(`El asiento auxiliar requiere ${preparado.lineasJournal.length} líneas; su división no forma parte de la carga por lotes`);
            }
            const items = preparado.datosCreacion && preparado.datosCreacion.items;
            documento.ncRma = admiteRma && !existenteId && !!items && items.length > 0 &&
                libLotes.usarRmaParaNc(documento.tipo, Math.max(documento.lineas, items.length), estado.configuracion);
            documento.porLotes = !existenteId && !!items && (documento.lineas > estado.configuracion.umbral || items.length > estado.configuracion.umbral);
            if (documento.ncRma) documento.porLotes = true;
            if (documento.porLotes && documento.tipo === "NOTA_CREDITO" && !documento.ncRma) throw new Error("NC por lotes no habilitada");
            if (documento.porLotes && items.length > 10000) throw new Error("El documento supera las 10.000 líneas accesibles por SuiteScript");
            documento.totalLineas = items ? items.length : 0;
            documento.documentoId = existenteId || preparado.documentoId || null;
            documento.avance = 0;
            const cabecera = { folioDoc: original.folioDoc, tipoDocumento: original.tipoDocumento, razonSocial: original.razonSocial,
                FechaDocumento: original.FechaDocumento, RutCliente: original.RutCliente, folioRef: original.folioRef };
            documento.preparadoId = daoEstado.guardarJson(`${documento.processKey}-preparado-${Date.now()}.json`, {
                archivoId: estado.archivoId, tipo: documento.tipo, indice: documento.indice, processKey: documento.processKey,
                documento: cabecera, estado: preparado,
                ...(documento.ncRma ? { rma: { formulario: libLotes.enteroPositivo(
                    estado.configuracion.formularioRma, "recaudaciones_facturacion_formulario_rma") } } : {})
            }, estado.folder);
            documento.paso = documento.ncRma ? "CARGAR_RMA" : documento.porLotes ? "CARGAR" : "CREAR";
            return;
        }
        const preparado = obtenerPreparado(estado, documento);
        if (["CARGAR_RMA", "APROBAR_RMA", "TRANSFORMAR_NC"].includes(documento.paso)) {
            if (!documento.ncRma || documento.tipo !== "NOTA_CREDITO") throw new Error("Operación RMA fuera de la vía NC");
            if (documento.paso === "CARGAR_RMA") {
                Object.assign(documento, daoRma.cargarLote(preparado, documento.avance, estado.configuracion.lineasPorLote));
                if (documento.avance === documento.totalLineas) documento.paso = "APROBAR_RMA";
            } else if (documento.paso === "APROBAR_RMA") {
                Object.assign(documento, daoRma.aprobar(preparado));
                documento.paso = "TRANSFORMAR_NC";
            } else {
                Object.assign(documento, daoRma.transformar(preparado, documento));
                documento.paso = "APLICAR";
            }
        } else if (documento.paso === "CREAR") {
            const tipoRegistro = documento.tipo === "NOTA_CREDITO" ? "creditmemo" : "invoice";
            const id = daoLotes.buscarPorClave(tipoRegistro, documento.processKey);
            documento.documentoId = id || preparado.estado.documentoId || null;
            if (!documento.documentoId && preparado.estado.datosCreacion) {
                documento.documentoId = domFacturacion.crearDocumento(documento.tipo, preparado.estado.datosCreacion);
            }
            documento.paso = "APLICAR";
        } else if (documento.paso === "CARGAR") {
            const resultado = daoLotes.cargarLote(preparado, documento.preparadoId, documento.avance, estado.configuracion.lineasPorLote);
            documento.documentoId = resultado.documentoId;
            documento.avance = resultado.avance;
            if (resultado.completo) documento.paso = "APROBAR";
        } else if (documento.paso === "APROBAR") {
            documento.documentoId = daoLotes.aprobar(preparado, documento.preparadoId);
            documento.paso = "APLICAR";
        } else if (documento.paso === "APLICAR") {
            if (documento.ncRma) {
                const confirmado = daoRma.confirmarNc(preparado, documento, true);
                if (!confirmado) throw new Error("No existe la NC transformada para aplicar");
                Object.assign(documento, confirmado);
            } else if (documento.porLotes) {
                // Revalidar antes de aplicar, incluso en una ejecución reiniciada.
                documento.documentoId = daoLotes.aprobar(preparado, documento.preparadoId);
            }
            daoLotes.validarReferencia(documento.tipo, preparado.documento);
            documento.paso = documento.tipo === "NOTA_DEBITO" ? "APLICAR_NOTA_CREDITO" :
                (preparado.estado.totalJournalCopago > 0 ? "CREAR_ASIENTO" :
                    (documento.tipo === "NOTA_CREDITO" ? "CREAR_PAGO" : "TERMINADO"));
        } else if (["APLICAR_NOTA_CREDITO", "CREAR_ASIENTO", "CREAR_PAGO"].includes(documento.paso)) {
            preparado.estado.documentoId = documento.documentoId;
            const etapaAplicacion = documento.paso === "APLICAR_NOTA_CREDITO" ? "NOTA_CREDITO" :
                (documento.paso === "CREAR_ASIENTO" ? "ASIENTO" : "PAGO");
            domFacturacion.aplicarDocumento(documento.tipo, preparado.documento, preparado.estado, documento.processKey,
                daoLotes.buscarPorClave("journalentry", `${documento.processKey}:journal`),
                daoLotes.buscarPorClave("customerpayment", `${documento.processKey}:payment`), etapaAplicacion);
            documento.paso = etapaAplicacion === "NOTA_CREDITO" ?
                (preparado.estado.totalJournalCopago > 0 ? "CREAR_ASIENTO" : "TERMINADO") :
                (etapaAplicacion === "ASIENTO" ? "CREAR_PAGO" : "TERMINADO");
        } else {
            throw new Error(`Operación de lotes desconocida: ${documento.paso}`);
        }
    }

    function registrarError(estado, documento, error, etapa) {
        if (documento && ["CARGAR", "APROBAR", "CREAR", ...PASOS_APLICACION].includes(documento.paso)) {
            try {
                const guardado = daoLotes.obtenerAvance(documento.tipo, documento.processKey);
                if (guardado) {
                    documento.documentoId = guardado.documentoId;
                    // El cursor del próximo intento se conserva: cargarLote reconoce el save ya realizado.
                    documento.lineasConfirmadas = guardado.avance;
                }
            } catch (errorConsulta) {
                documento.resultadoIncierto = true;
            }
        }
        const mensaje = error && error.message ? error.message : String(error);
        const detalle = { tipo: documento ? documento.tipo : "PROCESO", folio: documento && documento.folio,
            processKey: documento && documento.processKey, documentoId: documento && documento.documentoId,
            etapa: etapa, operacion: documento && documento.paso,
            lineasConfirmadas: documento && (documento.lineasConfirmadas == null ? documento.avance : documento.lineasConfirmadas),
            error: mensaje };
        if (documento) {
            documento.paso = "ERROR";
            documento.error = detalle;
        }
        estado.errores.push({ exito: false, errores: [detalle] });
        return detalle;
    }

    return { siguienteOperacion, ejecutarOperacion, registrarError };
});
