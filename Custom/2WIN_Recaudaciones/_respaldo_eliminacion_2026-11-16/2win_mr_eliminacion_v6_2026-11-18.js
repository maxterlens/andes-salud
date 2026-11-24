/**
 *@NApiVersion 2.1
 *@NScriptType MapReduceScript
 *
 * Eliminación de transacciones y prefacturas de las interfaces 2WIN.
 * Lo invocan:
 *   - 2win_sl_eliminacion_caja.js         (eliminación individual)
 *   - 2win_sl_eliminacion_caja_masiva.js  (eliminación masiva por CSV)
 *
 * Parámetro de entrada (custscript_2w_mr_eliminacion_cache_id): JSON con la lista
 *   [{ id, tipoRegistro, flujo, subsidiaria? }, ...]
 *
 * Reglas de eliminación:
 *   - invoice: se buscan los pagos aplicados y, DESDE CADA PAGO, se desmarca la factura
 *              (los pagos quedan huérfanos, no se eliminan). Las NC aplicadas se
 *              desaplican desde la NC. En las aplicaciones de depósito (DepAppl) se desmarca
 *              la factura desde la aplicación; si la aplicación queda sin facturas, se elimina
 *              (el depósito del cliente no se toca). Luego se elimina la factura.
 *   - invoice (solo flujo "facturacion"): además de lo anterior, se eliminan las NC cuyo
 *              "Creado desde" es la factura y los asientos que pagan la factura (vinculados
 *              directamente o aplicados junto a la factura en un pago). Antes de modificar nada
 *              se valida todo; si algo no puede resolverse no se toca ningún registro.
 *   - customerpayment: se elimina; si NetSuite no lo permite, se desaplican todas sus
 *              líneas y se vuelve a intentar.
 *   - journalentry / advintercompanyjournalentry: se buscan los pagos que tengan aplicado
 *              su crédito, se desmarca desde el pago y luego se elimina el asiento.
 *   - prefactura: se elimina el registro customrecord_2w_as_prefactura.
 *   - otros tipos: eliminación directa.
 *   - Flujo "facturacion" con subsidiaria informada: no se elimina nada que no pertenezca
 *     a esa subsidiaria.
 */
define(["N/runtime", "N/log", "N/record", "N/query", "N/cache", "../dao/2win_dao_draft"], function (
    runtime,
    nLog,
    record,
    query,
    cache,
    { unapplyCreditMemo }
) {
    // Orden de procesamiento: primero lo que "amarra" a otros registros
    const PRIORIDAD_TIPO = {
        customerpayment: 1,
        invoice: 2,
        creditmemo: 3,
        journalentry: 4,
        advintercompanyjournalentry: 5,
        prefactura: 7
    };

    // Flujo Facturación: las NC antes que las facturas
    const PRIORIDAD_TIPO_FACTURACION = {
        customerpayment: 1,
        creditmemo: 2,
        invoice: 3,
        journalentry: 4,
        advintercompanyjournalentry: 5,
        prefactura: 7
    };

    const TIPOS_ASIENTO = ["journalentry", "advintercompanyjournalentry"];

    /* ------------------------------------------------------------------ */
    /* Utilidades                                                          */
    /* ------------------------------------------------------------------ */

    function esVerdadero(valor) {
        return valor === true || valor === "T";
    }

    function ejecutarQuery(sql, params) {
        return query.runSuiteQL({ query: sql, params: params || [] }).asMappedResults();
    }

    /**
     * Traduce errores comunes de NetSuite a un mensaje entendible para soporte
     */
    function describirError(e) {
        const mensaje = String((e && e.message) || e).replace(/<[^>]+>/g, "");
        const texto = mensaje.toLowerCase();
        if (texto.indexOf("period") !== -1 || texto.indexOf("período") !== -1 || texto.indexOf("periodo") !== -1) {
            return `${mensaje} (Posible periodo contable cerrado/bloqueado)`;
        }
        if (texto.indexOf("deposit") !== -1 || texto.indexOf("depósito") !== -1 || texto.indexOf("deposito") !== -1) {
            return `${mensaje} (El pago está incluido en un depósito; primero debe quitarse del depósito)`;
        }
        return mensaje;
    }

    function noExiste(e) {
        return e && (e.name === "RCRD_DSNT_EXIST" || e.name === "INVALID_RCRD_ID");
    }

    /**
     * Obtiene las subsidiarias de la transacción (línea principal)
     */
    function obtenerSubsidiarias(transactionId) {
        const filas = ejecutarQuery(
            `SELECT DISTINCT tl.subsidiary AS subsidiaria
               FROM transactionline tl
              WHERE tl.transaction = ? AND tl.mainline = 'T'`,
            [transactionId]
        );
        return filas.map((f) => String(f.subsidiaria));
    }

    /**
     * Busca transacciones de un tipo (CustPymt, CustCred) vinculadas a la transacción indicada
     * (pagos o NC aplicados a una factura, o pagos que aplican el crédito de un asiento).
     * Se consultan los vínculos a nivel cabecera y a nivel línea.
     */
    function buscarVinculadas(transactionId, tipoVinculado) {
        const ids = {};
        const consultas = [
            `SELECT DISTINCT l.nextdoc AS id
               FROM NextTransactionLink l
              INNER JOIN transaction t ON t.id = l.nextdoc
              WHERE l.previousdoc = ? AND t.type = ?`,
            `SELECT DISTINCT l.nextdoc AS id
               FROM NextTransactionLineLink l
              INNER JOIN transaction t ON t.id = l.nextdoc
              WHERE l.previousdoc = ? AND t.type = ?`
        ];
        consultas.forEach((sql) => {
            try {
                ejecutarQuery(sql, [transactionId, tipoVinculado]).forEach((f) => {
                    if (f.id && String(f.id) !== String(transactionId)) ids[f.id] = true;
                });
            } catch (e) {
                nLog.error("buscarVinculadas - error en consulta", `Transacción ${transactionId}, tipo buscado ${tipoVinculado}: ${e.message}`);
            }
        });
        const resultado = Object.keys(ids).map(Number);
        nLog.debug("buscarVinculadas", { transactionId, tipoVinculado, resultado });
        return resultado;
    }

    /**
     * Lista todas las transacciones vinculadas a una transacción (en ambas direcciones),
     * para explicar en el log por qué NetSuite no permite eliminarla.
     */
    function describirVinculos(transactionId) {
        try {
            const filas = ejecutarQuery(
                `SELECT DISTINCT t.id, t.tranid, t.type, l.linktype,
                        CASE WHEN l.previousdoc = ? THEN 'siguiente' ELSE 'anterior' END AS direccion
                   FROM NextTransactionLink l
                  INNER JOIN transaction t
                          ON t.id = CASE WHEN l.previousdoc = ? THEN l.nextdoc ELSE l.previousdoc END
                  WHERE l.previousdoc = ? OR l.nextdoc = ?`,
                [transactionId, transactionId, transactionId, transactionId]
            );
            if (filas.length === 0) return "sin vínculos en NextTransactionLink";
            return filas.map((f) => `${f.tranid || ""} (${f.type}, ID ${f.id}, ${f.linktype || ""}, ${f.direccion})`).join("; ");
        } catch (e) {
            return `no se pudieron consultar los vínculos: ${e.message}`;
        }
    }

    function esErrorPorVinculos(e) {
        const texto = String((e && e.message) || "").toLowerCase();
        return texto.indexOf("vinculada") !== -1 || texto.indexOf("linked") !== -1 || texto.indexOf("dependent") !== -1;
    }

    /* ------------------------------------------------------------------ */
    /* Desaplicación desde el pago                                          */
    /* ------------------------------------------------------------------ */

    function desmarcarLineas(pago, sublistId, filtro) {
        let desmarcadas = 0;
        const total = pago.getLineCount({ sublistId });
        for (let i = 0; i < total; i++) {
            const aplicada = esVerdadero(pago.getSublistValue({ sublistId, fieldId: "apply", line: i }));
            if (!aplicada) continue;
            const doc = pago.getSublistValue({ sublistId, fieldId: "doc", line: i });
            if (!filtro || filtro(doc)) {
                pago.selectLine({ sublistId, line: i });
                pago.setCurrentSublistValue({ sublistId, fieldId: "apply", value: false });
                pago.commitLine({ sublistId });
                desmarcadas++;
            }
        }
        return desmarcadas;
    }

    function sumarAplicado(pago, sublistId) {
        let suma = 0;
        const total = pago.getLineCount({ sublistId });
        for (let i = 0; i < total; i++) {
            if (esVerdadero(pago.getSublistValue({ sublistId, fieldId: "apply", line: i }))) {
                suma += Number(pago.getSublistValue({ sublistId, fieldId: "amount", line: i })) || 0;
            }
        }
        return suma;
    }

    /**
     * Desmarca, DESDE EL PAGO, la transacción indicada (factura en "Aplicar" o asiento en "Créditos").
     * - Pago de $0 (cruce con el crédito de un asiento): se desmarca todo, queda huérfano.
     * - Pago con monto: se desmarca solo la transacción indicada y, si el pago queda
     *   descuadrado, se desmarca lo necesario para que NetSuite permita guardarlo.
     * El pago NO se elimina.
     */
    function desaplicarDesdePago(pagoId, transactionId) {
        const pago = record.load({ type: record.Type.CUSTOMER_PAYMENT, id: pagoId, isDynamic: true });
        const montoPago = Number(pago.getValue({ fieldId: "payment" })) || 0;
        const esMismoDoc = (doc) => String(doc) === String(transactionId);
        let desmarcadas = 0;

        if (montoPago === 0) {
            // Pago de cruce: solo existe para unir el crédito del asiento con la factura
            desmarcadas += desmarcarLineas(pago, "apply");
            desmarcadas += desmarcarLineas(pago, "credit");
        } else {
            desmarcadas += desmarcarLineas(pago, "apply", esMismoDoc);
            desmarcadas += desmarcarLineas(pago, "credit", esMismoDoc);

            const facturas = sumarAplicado(pago, "apply");
            const creditos = sumarAplicado(pago, "credit");
            if (creditos > facturas) {
                // Créditos sin factura que cubrir: se liberan
                desmarcadas += desmarcarLineas(pago, "credit");
            } else if (facturas > montoPago + creditos) {
                // Se quitó un crédito y el pago ya no alcanza: se liberan las facturas
                desmarcadas += desmarcarLineas(pago, "apply");
            }
        }

        if (desmarcadas === 0) {
            nLog.audit("desaplicarDesdePago", `Pago ${pagoId}: no tenía aplicada la transacción ${transactionId}`);
            return;
        }

        try {
            pago.save({ ignoreMandatoryFields: true });
        } catch (e) {
            throw new Error(`No se pudo desaplicar el pago ${pagoId}: ${describirError(e)}`);
        }
        nLog.audit("desaplicarDesdePago", `Pago ${pagoId}: ${desmarcadas} línea(s) desmarcada(s) (transacción ${transactionId}). El pago queda sin eliminar.`);
    }

    /**
     * Desmarca la factura DESDE LA APLICACIÓN DE DEPÓSITO (depositapplication).
     * - Si la aplicación sigue aplicada a otras facturas: se guarda.
     * - Si ya no queda nada aplicado: NetSuite no permite guardarla vacía, por lo que se
     *   elimina la aplicación de depósito. El depósito del cliente no se toca (recupera su saldo).
     */
    function desaplicarDesdeAplicacionDeposito(aplicacionId, invoiceId) {
        const aplicacion = record.load({ type: record.Type.DEPOSIT_APPLICATION, id: aplicacionId, isDynamic: true });
        const desmarcadas = desmarcarLineas(aplicacion, "apply", (doc) => String(doc) === String(invoiceId));

        if (desmarcadas === 0) {
            nLog.audit("desaplicarDesdeAplicacionDeposito", `Aplicación de depósito ${aplicacionId}: no tenía aplicada la factura ${invoiceId}`);
            return;
        }

        let lineasAplicadas = 0;
        const totalLineas = aplicacion.getLineCount({ sublistId: "apply" });
        for (let i = 0; i < totalLineas; i++) {
            if (esVerdadero(aplicacion.getSublistValue({ sublistId: "apply", fieldId: "apply", line: i }))) lineasAplicadas++;
        }

        try {
            if (lineasAplicadas > 0) {
                aplicacion.save({ ignoreMandatoryFields: true });
                nLog.audit(
                    "desaplicarDesdeAplicacionDeposito",
                    `Aplicación de depósito ${aplicacionId}: factura ${invoiceId} desmarcada. Se mantiene aplicada a ${lineasAplicadas} factura(s).`
                );
            } else {
                record.delete({ type: record.Type.DEPOSIT_APPLICATION, id: aplicacionId });
                nLog.audit(
                    "desaplicarDesdeAplicacionDeposito",
                    `Aplicación de depósito ${aplicacionId} eliminada: solo aplicaba la factura ${invoiceId}. El depósito del cliente queda con saldo disponible.`
                );
            }
        } catch (e) {
            throw new Error(`No se pudo desaplicar la aplicación de depósito ${aplicacionId}: ${describirError(e)}`);
        }
    }

    /* ------------------------------------------------------------------ */
    /* Flujo FACTURACIÓN: factura con NC "creada desde" y asientos que la pagan */
    /* ------------------------------------------------------------------ */

    function tiposDeTransacciones(ids) {
        const tipos = {};
        if (!ids || ids.length === 0) return tipos;
        const marcadores = ids.map(() => "?").join(",");
        ejecutarQuery(`SELECT id, recordtype FROM transaction WHERE id IN (${marcadores})`, ids).forEach((f) => {
            tipos[String(f.id)] = f.recordtype;
        });
        return tipos;
    }

    function lineasAplicadas(registro, sublistId) {
        const docs = [];
        const total = registro.getLineCount({ sublistId });
        for (let i = 0; i < total; i++) {
            if (esVerdadero(registro.getSublistValue({ sublistId, fieldId: "apply", line: i }))) {
                docs.push(String(registro.getSublistValue({ sublistId, fieldId: "doc", line: i })));
            }
        }
        return docs;
    }

    /** NC cuyo campo "Creado desde" (createdfrom) es la factura */
    function buscarNCCreadasDesde(invoiceId) {
        return ejecutarQuery(`SELECT id FROM transaction WHERE type = 'CustCred' AND createdfrom = ?`, [invoiceId]).map((f) => Number(f.id));
    }

    /** Asientos vinculados directamente a la transacción (en cualquier dirección) */
    function buscarAsientosDirectos(transactionId) {
        try {
            return ejecutarQuery(
                `SELECT DISTINCT t.id, t.recordtype
                   FROM NextTransactionLink l
                  INNER JOIN transaction t ON t.id = CASE WHEN l.previousdoc = ? THEN l.nextdoc ELSE l.previousdoc END
                  WHERE (l.previousdoc = ? OR l.nextdoc = ?)
                    AND t.recordtype IN ('journalentry', 'advintercompanyjournalentry')`,
                [transactionId, transactionId, transactionId]
            ).map((f) => ({ id: Number(f.id), tipo: f.recordtype }));
        } catch (e) {
            nLog.error("buscarAsientosDirectos - error en consulta", `Transacción ${transactionId}: ${e.message}`);
            return [];
        }
    }

    /** Facturas vinculadas directamente a un asiento (en cualquier dirección) */
    function buscarFacturasDeAsiento(asientoId) {
        try {
            return ejecutarQuery(
                `SELECT DISTINCT t.id
                   FROM NextTransactionLink l
                  INNER JOIN transaction t ON t.id = CASE WHEN l.previousdoc = ? THEN l.nextdoc ELSE l.previousdoc END
                  WHERE (l.previousdoc = ? OR l.nextdoc = ?) AND t.type = 'CustInvc'`,
                [asientoId, asientoId, asientoId]
            ).map((f) => String(f.id));
        } catch (e) {
            nLog.error("buscarFacturasDeAsiento - error en consulta", `Asiento ${asientoId}: ${e.message}`);
            return [];
        }
    }

    /**
     * Revisa, SIN MODIFICAR NADA, todo lo vinculado a la factura y detecta lo que impediría eliminarla.
     */
    function analizarFacturaFacturacion(invoiceId) {
        const id = String(invoiceId);
        const analisis = {
            pagos: buscarVinculadas(invoiceId, "CustPymt"),
            ncAplicadas: buscarVinculadas(invoiceId, "CustCred"),
            aplicacionesDeposito: buscarVinculadas(invoiceId, "DepAppl"),
            ncCreadasDesde: buscarNCCreadasDesde(invoiceId),
            asientos: [], // [{ id, tipo, pagos: [ids de pago donde está aplicado junto a la factura] }]
            bloqueos: []
        };
        const asientosPorId = {};
        const agregarAsiento = (asientoId, tipo, pagoId) => {
            const clave = String(asientoId);
            if (!asientosPorId[clave]) {
                asientosPorId[clave] = { id: Number(asientoId), tipo: tipo, pagos: [] };
                analisis.asientos.push(asientosPorId[clave]);
            }
            if (pagoId && asientosPorId[clave].pagos.indexOf(pagoId) === -1) asientosPorId[clave].pagos.push(pagoId);
        };

        // Asientos vinculados directamente a la factura
        buscarAsientosDirectos(invoiceId).forEach((a) => agregarAsiento(a.id, a.tipo, null));

        // Asientos cuyo crédito está aplicado a la factura a través de un pago
        analisis.pagos.forEach((pagoId) => {
            const pago = record.load({ type: record.Type.CUSTOMER_PAYMENT, id: pagoId });
            const creditos = lineasAplicadas(pago, "credit");
            if (creditos.length === 0) return;
            const tipos = tiposDeTransacciones(creditos);
            const asientosDelPago = creditos.filter((doc) => TIPOS_ASIENTO.indexOf(tipos[doc]) !== -1);
            if (asientosDelPago.length === 0) return;

            const otrasFacturas = lineasAplicadas(pago, "apply").filter((doc) => doc !== id);
            if (otrasFacturas.length > 0) {
                analisis.bloqueos.push(
                    `el pago ${pagoId} aplica el/los asiento(s) [${asientosDelPago.join(", ")}] y también otras facturas [${otrasFacturas.join(", ")}]`
                );
            }
            asientosDelPago.forEach((doc) => agregarAsiento(doc, tipos[doc], pagoId));
        });

        // Un asiento solo se elimina si no paga otras facturas
        analisis.asientos.forEach((asiento) => {
            const pagosAjenos = buscarVinculadas(asiento.id, "CustPymt").filter((p) => analisis.pagos.indexOf(p) === -1);
            if (pagosAjenos.length > 0) {
                analisis.bloqueos.push(`el asiento ${asiento.id} también está aplicado en otros pagos [${pagosAjenos.join(", ")}]`);
            }
            const facturasAjenas = buscarFacturasDeAsiento(asiento.id).filter((f) => f !== id);
            if (facturasAjenas.length > 0) {
                analisis.bloqueos.push(`el asiento ${asiento.id} también está vinculado a otras facturas [${facturasAjenas.join(", ")}]`);
            }
        });

        // Una NC "creada desde" solo se elimina si no está aplicada a otros documentos
        analisis.ncCreadasDesde.forEach((ncId) => {
            const nc = record.load({ type: record.Type.CREDIT_MEMO, id: ncId });
            const otrosDocs = lineasAplicadas(nc, "apply").filter((doc) => doc !== id);
            if (otrosDocs.length > 0) {
                analisis.bloqueos.push(`la NC ${ncId} (creada desde la factura) también está aplicada a otros documentos [${otrosDocs.join(", ")}]`);
            }
        });

        return analisis;
    }

    function eliminarFacturaFacturacion(invoiceId) {
        const a = analizarFacturaFacturacion(invoiceId);
        nLog.audit(
            "eliminarFacturaFacturacion - vínculos encontrados",
            `Factura ${invoiceId}: pagos [${a.pagos.join(", ")}], NC aplicadas [${a.ncAplicadas.join(", ")}], ` +
                `NC creadas desde la factura [${a.ncCreadasDesde.join(", ")}], aplicaciones de depósito [${a.aplicacionesDeposito.join(", ")}], ` +
                `asientos que la pagan [${a.asientos.map((x) => x.id).join(", ")}]`
        );

        if (a.bloqueos.length > 0) {
            throw new Error(`No se modificó nada: ${a.bloqueos.join("; ")}`);
        }

        // 1. Pagos: se desmarca la factura y el crédito de los asientos que se eliminarán (el pago NO se elimina)
        a.pagos.forEach((pagoId) => {
            desaplicarDesdePago(pagoId, invoiceId);
            a.asientos.filter((x) => x.pagos.indexOf(pagoId) !== -1).forEach((x) => desaplicarDesdePago(pagoId, x.id));
        });

        // 2. Aplicaciones de depósito
        a.aplicacionesDeposito.forEach((aplicacionId) => desaplicarDesdeAplicacionDeposito(aplicacionId, invoiceId));

        // 3. NC aplicadas: se desaplican desde la NC
        a.ncAplicadas.forEach((ncId) => {
            try {
                unapplyCreditMemo(ncId, invoiceId);
            } catch (e) {
                throw new Error(`No se pudo desaplicar la NC ${ncId}: ${describirError(e)}`);
            }
        });

        // 4. NC creadas desde la factura: se eliminan (único caso en que se elimina una NC)
        a.ncCreadasDesde.forEach((ncId) => {
            try {
                record.delete({ type: record.Type.CREDIT_MEMO, id: ncId });
            } catch (e) {
                if (!noExiste(e)) throw new Error(`No se pudo eliminar la NC ${ncId} creada desde la factura: ${describirError(e)}`);
            }
            nLog.audit("eliminarFacturaFacturacion", `NC ${ncId} (creada desde la factura ${invoiceId}) eliminada`);
        });

        // 5. Asientos que pagaban la factura: se eliminan
        a.asientos.forEach((asiento) => {
            try {
                record.delete({ type: asiento.tipo, id: asiento.id });
            } catch (e) {
                if (!noExiste(e)) throw new Error(`No se pudo eliminar el asiento ${asiento.id}: ${describirError(e)}`);
            }
            nLog.audit("eliminarFacturaFacturacion", `Asiento ${asiento.id} (${asiento.tipo}) que pagaba la factura ${invoiceId} eliminado`);
        });

        // 6. Factura
        record.delete({ type: record.Type.INVOICE, id: invoiceId });
        return (
            `Factura eliminada (pagos desmarcados: ${a.pagos.length}, NC desaplicadas: ${a.ncAplicadas.length}, ` +
            `NC creadas desde eliminadas: ${a.ncCreadasDesde.length}, aplicaciones de depósito revisadas: ${a.aplicacionesDeposito.length}, ` +
            `asientos eliminados: ${a.asientos.length})`
        );
    }

    /* ------------------------------------------------------------------ */
    /* Eliminación por tipo                                                 */
    /* ------------------------------------------------------------------ */

    function eliminarFactura(invoiceId) {
        const pagos = buscarVinculadas(invoiceId, "CustPymt");
        const notasCredito = buscarVinculadas(invoiceId, "CustCred");
        const aplicacionesDeposito = buscarVinculadas(invoiceId, "DepAppl");
        nLog.audit(
            "eliminarFactura - vínculos encontrados",
            `Factura ${invoiceId}: pagos [${pagos.join(", ")}], NC [${notasCredito.join(", ")}], aplicaciones de depósito [${aplicacionesDeposito.join(", ")}]`
        );

        pagos.forEach((pagoId) => desaplicarDesdePago(pagoId, invoiceId));

        notasCredito.forEach((ncId) => {
            try {
                unapplyCreditMemo(ncId, invoiceId);
            } catch (e) {
                throw new Error(`No se pudo desaplicar la NC ${ncId}: ${describirError(e)}`);
            }
        });

        aplicacionesDeposito.forEach((aplicacionId) => desaplicarDesdeAplicacionDeposito(aplicacionId, invoiceId));

        record.delete({ type: record.Type.INVOICE, id: invoiceId });
        return `Factura eliminada (pagos revisados: ${pagos.length}, NC revisadas: ${notasCredito.length}, aplicaciones de depósito revisadas: ${aplicacionesDeposito.length})`;
    }

    function eliminarPago(pagoId) {
        try {
            record.delete({ type: record.Type.CUSTOMER_PAYMENT, id: pagoId });
            return "Pago eliminado";
        } catch (e) {
            if (noExiste(e)) throw e;
            nLog.audit("eliminarPago", `Pago ${pagoId}: no se pudo eliminar directo (${e.message}). Se desaplica y se reintenta.`);
        }

        const pago = record.load({ type: record.Type.CUSTOMER_PAYMENT, id: pagoId, isDynamic: true });
        const desmarcadas = desmarcarLineas(pago, "apply") + desmarcarLineas(pago, "credit");
        if (desmarcadas > 0) pago.save({ ignoreMandatoryFields: true });
        record.delete({ type: record.Type.CUSTOMER_PAYMENT, id: pagoId });
        return `Pago desaplicado (${desmarcadas} línea(s)) y eliminado`;
    }

    function eliminarAsiento(asientoId, tipo) {
        const pagos = buscarVinculadas(asientoId, "CustPymt");
        nLog.audit("eliminarAsiento - vínculos encontrados", `Asiento ${asientoId}: pagos [${pagos.join(", ")}]`);
        pagos.forEach((pagoId) => desaplicarDesdePago(pagoId, asientoId));
        record.delete({ type: tipo, id: asientoId });
        return `Asiento eliminado (pagos revisados: ${pagos.length})`;
    }

    function eliminarTransaccion(registro) {
        const transactionId = registro.id;
        const tipo = registro.tipoRegistro;
        const resultado = { exito: true, mensaje: "", transaccionId: transactionId, tipo: tipo };

        try {
            nLog.audit("Iniciando eliminación", `Tipo: ${tipo}, ID: ${transactionId}, Flujo: ${registro.flujo || ""}`);

            // Control de subsidiaria (flujo Facturación)
            if (registro.flujo === "facturacion" && registro.subsidiaria) {
                const subsidiarias = obtenerSubsidiarias(transactionId);
                if (subsidiarias.length > 0 && subsidiarias.indexOf(String(registro.subsidiaria)) === -1) {
                    resultado.exito = false;
                    resultado.mensaje = `No eliminado: pertenece a la subsidiaria ${subsidiarias.join(", ")} y la eliminación se pidió para la subsidiaria ${registro.subsidiaria}`;
                    nLog.error("Control de subsidiaria", `ID: ${transactionId} - ${resultado.mensaje}`);
                    return resultado;
                }
            }

            if (tipo === "invoice" && registro.flujo === "facturacion") {
                resultado.mensaje = eliminarFacturaFacturacion(transactionId);
            } else if (tipo === "invoice") {
                resultado.mensaje = eliminarFactura(transactionId);
            } else if (tipo === "customerpayment") {
                resultado.mensaje = eliminarPago(transactionId);
            } else if (tipo === "journalentry" || tipo === "advintercompanyjournalentry") {
                resultado.mensaje = eliminarAsiento(transactionId, tipo);
            } else {
                record.delete({ type: tipo, id: transactionId });
                resultado.mensaje = "Transacción eliminada";
            }

            nLog.audit("Eliminación exitosa", `Tipo: ${tipo}, ID: ${transactionId} - ${resultado.mensaje}`);
        } catch (e) {
            if (noExiste(e)) {
                resultado.mensaje = "Ya no existía (eliminado previamente)";
                nLog.audit("Registro inexistente", `Tipo: ${tipo}, ID: ${transactionId}`);
            } else {
                resultado.exito = false;
                resultado.mensaje = `Error: ${describirError(e)}`;
                if (esErrorPorVinculos(e)) {
                    resultado.mensaje += ` | Transacciones vinculadas: ${describirVinculos(transactionId)}`;
                }
                nLog.error("Error al eliminar transacción", `Tipo: ${tipo}, ID: ${transactionId}, Error: ${resultado.mensaje}`);
            }
        }

        return resultado;
    }

    /**
     * Elimina una prefactura
     * @param {number} prefacturaId - ID de la prefactura
     */
    function eliminarPrefactura(prefacturaId) {
        const resultado = { exito: true, mensaje: "", prefacturaId: prefacturaId };

        try {
            nLog.audit("Iniciando eliminación de prefactura", `ID: ${prefacturaId}`);
            record.delete({ type: "customrecord_2w_as_prefactura", id: prefacturaId });
            resultado.mensaje = "Prefactura eliminada exitosamente";
            nLog.audit("Eliminación de prefactura exitosa", `ID: ${prefacturaId}`);
        } catch (e) {
            if (noExiste(e)) {
                resultado.mensaje = "Ya no existía (eliminada previamente)";
            } else {
                resultado.exito = false;
                resultado.mensaje = `Error: ${describirError(e)}`;
                nLog.error("Error al eliminar prefactura", `ID: ${prefacturaId}, Error: ${resultado.mensaje}`);
            }
        }

        return resultado;
    }

    /* ------------------------------------------------------------------ */
    /* Etapas del Map/Reduce                                                */
    /* ------------------------------------------------------------------ */

    function getInputData() {
        try {
            // El parámetro conserva su nombre histórico ("cache_id") pero contiene la lista en JSON
            const parametro = runtime.getCurrentScript().getParameter({ name: "custscript_2w_mr_eliminacion_cache_id" });

            if (!parametro) {
                nLog.error("getInputData - error", "Falta parámetro custscript_2w_mr_eliminacion_cache_id");
                return [];
            }

            const datos = JSON.parse(parametro);

            // Quitar duplicados (ej. un AIJE listado una vez por subsidiaria)
            const vistos = {};
            const unicos = datos.filter((r) => {
                const clave = `${r.tipoRegistro}|${r.id}`;
                if (vistos[clave]) return false;
                vistos[clave] = true;
                return true;
            });

            // Ordenar: pagos → facturas → NC → asientos → otros → prefacturas
            const prioridad = unicos.length > 0 && unicos[0].flujo === "facturacion" ? PRIORIDAD_TIPO_FACTURACION : PRIORIDAD_TIPO;
            unicos.sort((a, b) => (prioridad[a.tipoRegistro] || 6) - (prioridad[b.tipoRegistro] || 6));

            nLog.audit("getInputData - datos", {
                recibidos: datos.length,
                aProcesar: unicos.length,
                duplicadosOmitidos: datos.length - unicos.length,
                flujo: (unicos[0] && unicos[0].flujo) || "desconocido"
            });

            return unicos;
        } catch (error) {
            nLog.error("getInputData - error", error);
            return [];
        }
    }

    /**
     * Procesa cada registro individual
     */
    function map(context) {
        try {
            const registro = JSON.parse(context.value);
            nLog.debug("map - registro", registro);

            const resultado =
                registro.tipoRegistro === "prefactura" ? eliminarPrefactura(registro.id) : eliminarTransaccion(registro);

            context.write({
                key: String(registro.id),
                value: JSON.stringify({
                    id: registro.id,
                    tipo: registro.tipoRegistro,
                    exito: resultado.exito,
                    mensaje: resultado.mensaje
                })
            });

            nLog.debug("map - resultado", resultado);
        } catch (error) {
            nLog.error("map - error", error);
            context.write({
                key: context.key,
                value: JSON.stringify({
                    id: context.key,
                    tipo: "desconocido",
                    exito: false,
                    mensaje: `Error en map: ${error.message}`
                })
            });
        }
    }

    /**
     * Genera el resumen del proceso
     */
    function summarize(summary) {
        try {
            nLog.audit("Resumen MapReduce - Iniciado", "Procesando resumen de eliminación");

            const cacheId = runtime.getCurrentScript().getParameter({ name: "custscript_2w_mr_eliminacion_cache_id" });

            const resultados = {
                totalProcesados: 0,
                exitosos: 0,
                errores: 0,
                detalle: []
            };

            summary.output.iterator().each(function (key, value) {
                const resultado = JSON.parse(value);
                resultados.totalProcesados++;
                resultados.detalle.push(resultado);
                if (resultado.exito) {
                    resultados.exitosos++;
                } else {
                    resultados.errores++;
                }
                return true;
            });

            summary.mapSummary.errors.iterator().each(function (key, error) {
                nLog.error("Error no controlado en map", `Clave: ${key}, Error: ${error}`);
                return true;
            });

            nLog.audit("Resumen MapReduce", {
                totalProcesados: resultados.totalProcesados,
                exitosos: resultados.exitosos,
                errores: resultados.errores
            });

            const conError = resultados.detalle.filter((r) => !r.exito);
            if (conError.length > 0) {
                nLog.audit("Resumen MapReduce - registros con error", JSON.stringify(conError.slice(0, 100)).substring(0, 3900));
            }

            // Se mantiene el guardado en caché del comportamiento anterior
            if (cacheId) {
                const cacheObj = cache.getCache({ name: "eliminacion_transacciones" });
                const resumenFinal = {
                    estado: "COMPLETADO",
                    fechaTermino: new Date().toISOString(),
                    resultados: resultados
                };
                cacheObj.put({
                    key: String(cacheId).substring(0, 200) + "_resultado",
                    value: JSON.stringify(resumenFinal),
                    ttl: 3600
                });
            }

            nLog.debug("Unidades restantes", runtime.getCurrentScript().getRemainingUsage());
            nLog.debug("Tiempo total de ejecución", summary.seconds + " segundos");
        } catch (error) {
            nLog.error("summarize - error", error);
        }
    }

    return {
        getInputData: getInputData,
        map: map,
        summarize: summarize
    };
});
