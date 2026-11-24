/**
 * @NApiVersion 2.1
 * @NScriptType Suitelet
 * @NModuleScope SameAccount
 *
 * Eliminación masiva por archivo CSV. Soporta los mismos flujos que 2win_sl_eliminacion_caja.js:
 *   - Caja:        FECHA CAJA; UNIDAD CAJA; APERTURA CAJA; MOVIMIENTO (opcional); CAJERO (opcional)
 *                  + Razón Social de Caja en el formulario.
 *                  Movimiento vacío = todas las transacciones de esa caja/apertura.
 *                  Cajero informado = agrega los asientos de cierre de esa caja.
 *   - Facturación: FOLIO; TIPO DOCUMENTO (opcional) + Subsidiaria obligatoria en el formulario.
 *                  Búsqueda exacta por subsidiaria + folio (+ tipo DTE si se informa).
 *                  Si un folio encuentra más de un documento se informa como ambiguo y no se lista.
 *   - Prefacturas: NÚMERO PREFACTURA (búsqueda exacta).
 * La eliminación la ejecuta customscript_2win_mr_eliminacion.
 */
define(["N/ui/serverWidget", "N/query", "N/log", "N/format", "N/task"], function (
    serverWidget,
    query,
    nLog,
    format,
    task
) {
    const TAMANO_LOTE_IN = 500;

    /**
     * Tipos DTE (valores internos de custbody_2wintipodtesii, según InvoiceDAO / CreditMemoDAO).
     * En el CSV el usuario puede escribir el código SII o el nombre del documento.
     */
    const TIPOS_DTE = [
        { id: 11, codigoSii: "39", nombre: "Boleta", alias: ["boleta", "boleta electronica", "boleta afecta", "boleta afecta electronica"] },
        { id: 13, codigoSii: "41", nombre: "Boleta Exenta", alias: ["boleta exenta", "boleta exenta electronica"] },
        { id: 1, codigoSii: "33", nombre: "Factura", alias: ["factura", "factura afecta", "factura electronica", "factura afecta electronica"] },
        { id: 2, codigoSii: "34", nombre: "Factura Exenta", alias: ["factura exenta", "factura exenta electronica"] },
        { id: 4, codigoSii: "61", nombre: "Nota de Crédito", alias: ["nota de credito", "nota credito", "nc", "nota de credito electronica"] },
        { id: 5, codigoSii: "56", nombre: "Nota de Débito", alias: ["nota de debito", "nota debito", "nd", "nota de debito electronica"] }
    ];

    /* ------------------------------------------------------------------ */
    /* Utilidades                                                          */
    /* ------------------------------------------------------------------ */

    function normalizarTexto(valor) {
        return String(valor || "")
            .normalize("NFD")
            .replace(/[̀-ͯ]/g, "")
            .toLowerCase()
            .replace(/\s+/g, " ")
            .trim();
    }

    function normalizarRut(valor) {
        return String(valor || "")
            .replace(/[\s.\-]/g, "")
            .toUpperCase();
    }

    function resolverTipoDte(valor) {
        const texto = normalizarTexto(valor);
        if (!texto) return null;
        const tipo = TIPOS_DTE.find((t) => t.codigoSii === texto || t.alias.indexOf(texto) !== -1);
        return tipo || undefined; // undefined = informado pero no reconocido
    }

    function nombreTipoDte(id) {
        const tipo = TIPOS_DTE.find((t) => String(t.id) === String(id));
        return tipo ? `${tipo.nombre} (${tipo.codigoSii})` : "";
    }

    function escaparHtml(valor) {
        return String(valor === null || valor === undefined ? "" : valor)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;");
    }

    function enLotes(lista, tamano) {
        const lotes = [];
        for (let i = 0; i < lista.length; i += tamano) {
            lotes.push(lista.slice(i, i + tamano));
        }
        return lotes;
    }

    function ejecutarQueryPaginada(sql, params) {
        const resultados = [];
        const pagedData = query.runSuiteQLPaged({ query: sql, params: params, pageSize: 5000 });
        pagedData.pageRanges.forEach(function (pageRange) {
            const page = pagedData.fetch({ index: pageRange.index });
            resultados.push(...page.data.asMappedResults());
        });
        return resultados;
    }

    /**
     * Separa el CSV en líneas y columnas detectando el delimitador (coma, punto y coma o tab)
     */
    function leerCSV(csvContent) {
        const lineas = String(csvContent || "")
            .replace(/^﻿/, "")
            .split(/\r?\n/)
            .filter((linea) => linea.trim() !== "");

        if (lineas.length === 0) return { filas: [] };

        let delimitador = ",";
        if (lineas[0].indexOf(";") !== -1) {
            delimitador = ";";
        } else if (lineas[0].indexOf("\t") !== -1) {
            delimitador = "\t";
        }

        return {
            filas: lineas.map((linea) => linea.split(delimitador).map((c) => c.trim().replace(/^"|"$/g, "").trim()))
        };
    }

    function parsearFecha(fechaStr) {
        if (/^\d{4}-\d{2}-\d{2}$/.test(fechaStr)) return fechaStr;
        if (/^\d{2}\/\d{2}\/\d{4}$/.test(fechaStr)) {
            const partes = fechaStr.split("/");
            return `${partes[2]}-${partes[1]}-${partes[0]}`;
        }
        const dateObj = format.parse({ value: fechaStr, type: "date" });
        if (!(dateObj instanceof Date) || isNaN(dateObj.getTime())) throw new Error("fecha inválida");
        const dia = dateObj.getDate().toString().padStart(2, "0");
        const mes = (dateObj.getMonth() + 1).toString().padStart(2, "0");
        return `${dateObj.getFullYear()}-${mes}-${dia}`;
    }

    function rangoMes(mesKey) {
        const [anio, mesNum] = mesKey.split("-").map(Number);
        const ultimoDia = String(new Date(anio, mesNum, 0).getDate()).padStart(2, "0");
        const mesStr = String(mesNum).padStart(2, "0");
        return { inicio: `01/${mesStr}/${anio}`, fin: `${ultimoDia}/${mesStr}/${anio}` };
    }

    /* ------------------------------------------------------------------ */
    /* Flujo CAJA                                                           */
    /* ------------------------------------------------------------------ */

    /**
     * Parsea el CSV de Caja: FECHA; UNIDAD; APERTURA; MOVIMIENTO (opcional); CAJERO (opcional)
     */
    function parseCSVCaja(csvContent) {
        const { filas: lineas } = leerCSV(csvContent);
        if (lineas.length === 0) return { filas: [], errores: ["El archivo está vacío."] };

        let inicioDatos = 0;
        const primeraColumna = normalizarTexto(lineas[0][0]);
        if (["fecha", "date", "unidad", "apertura", "movimiento"].some((p) => primeraColumna.indexOf(p) !== -1)) {
            inicioDatos = 1;
        }

        const filas = [];
        const errores = [];

        for (let i = inicioDatos; i < lineas.length; i++) {
            const columnas = lineas[i];

            if (columnas.length < 3) {
                errores.push(`Fila ${i + 1}: debe tener al menos FECHA, UNIDAD y APERTURA (${columnas.length}/3)`);
                continue;
            }

            let fecha;
            try {
                fecha = parsearFecha(columnas[0]);
            } catch (e) {
                errores.push(`Fila ${i + 1}: fecha inválida "${columnas[0]}"`);
                continue;
            }

            const unidad = parseInt(columnas[1], 10);
            const apertura = parseInt(columnas[2], 10);
            const movimientoStr = columnas[3] || "";
            const movimiento = movimientoStr === "" ? null : parseInt(movimientoStr, 10);
            const cajero = normalizarRut(columnas[4] || "");

            if (isNaN(unidad) || isNaN(apertura) || (movimiento !== null && isNaN(movimiento))) {
                errores.push(`Fila ${i + 1}: valores numéricos inválidos`);
                continue;
            }

            filas.push({ fecha, unidad, apertura, movimiento, cajero });
        }

        return { filas, errores };
    }

    /**
     * Busca transacciones de un mes completo para la razón social (se filtran luego en memoria)
     */
    function buscarTransaccionesPorMes(mes, razonSocial) {
        const rango = rangoMes(mes);
        try {
            const transacciones = ejecutarQueryPaginada(
                `
                SELECT DISTINCT
                    transaction.tranid,
                    transaction.id,
                    transaction.recordtype,
                    transaction.memo,
                    BUILTIN.DF(transaction.status) as status,
                    transaction.tranDate,
                    transaction.custbody_2wintipodtesii,
                    transaction.custbody_2winfolioacepta,
                    transaction.custbodynumeromovimiento as numeromovimiento,
                    CASE
                        WHEN transaction.type = 'Journal' OR transaction.recordtype = 'advintercompanyjournalentry'
                        THEN BUILTIN.DF(transactionLine.entity)
                        ELSE BUILTIN.DF(transaction.entity)
                    END as entidadnombre,
                    NVL(transaction.foreignAmountUnpaid + transaction.foreignAmountPaid, 0) as amount,
                    custbodyunidadcaja as unidadcaja,
                    TO_CHAR(custbodyfechacaja, 'YYYY-MM-DD') as fechacaja,
                    custbodyaperturacaja as aperturacaja
                FROM
                    transaction
                    INNER JOIN transactionLine ON transactionLine.transaction = transaction.id AND transactionLine.mainLine = 'T'
                WHERE
                    transaction.custbody_2win_created_from_income_flow = 'T'
                    AND custbodyrazonsocialcaja = ?
                    AND custbodyfechacaja BETWEEN TO_DATE(?, 'DD/MM/YYYY') AND TO_DATE(?, 'DD/MM/YYYY')
                ORDER BY
                    transaction.id DESC
            `,
                [razonSocial, rango.inicio, rango.fin]
            );
            nLog.audit("buscarTransaccionesPorMes", `Mes: ${mes}, Total: ${transacciones.length}`);
            return transacciones;
        } catch (e) {
            nLog.error("Error en buscarTransaccionesPorMes", e);
            return [];
        }
    }

    /**
     * Busca los asientos de cierre de caja de un mes (mismo criterio que searchCierreCaja del DAO)
     */
    function buscarCierresPorMes(mes, razonSocial) {
        const rango = rangoMes(mes);
        try {
            return ejecutarQueryPaginada(
                `
                SELECT DISTINCT
                    T.id,
                    T.tranid,
                    T.memo,
                    T.trandate,
                    Customer.custentity_2wrut as rut,
                    BUILTIN.DF(tl.entity) as entidadnombre,
                    T.custbodyunidadcaja as unidadcaja,
                    TO_CHAR(T.custbodyfechacaja, 'YYYY-MM-DD') as fechacaja,
                    T.custbodyaperturacaja as aperturacaja
                FROM
                    Transaction AS T
                    INNER JOIN transactionline tl ON tl.transaction = T.id
                    INNER JOIN Customer ON Customer.id = tl.entity
                WHERE
                    T.memo LIKE 'Cierre Caja General%'
                    AND T.type = 'Journal'
                    AND T.custbodyrazonsocialcaja = ?
                    AND T.custbodyfechacaja BETWEEN TO_DATE(?, 'DD/MM/YYYY') AND TO_DATE(?, 'DD/MM/YYYY')
            `,
                [razonSocial, rango.inicio, rango.fin]
            );
        } catch (e) {
            nLog.error("Error en buscarCierresPorMes", e);
            return [];
        }
    }

    /**
     * Busca todas las transacciones del CSV de Caja (1 query por mes, filtro en memoria)
     */
    function buscarFlujoCaja(filas, razonSocial) {
        const clavesMovimiento = {}; // "fecha|unidad|apertura|movimiento" o "fecha|unidad|apertura|*"
        const clavesCierre = {}; // "fecha|unidad|apertura|rut"
        const meses = {};
        const gruposUnicos = {};

        filas.forEach(function (f) {
            const grupo = `${f.fecha}|${f.unidad}|${f.apertura}`;
            gruposUnicos[grupo] = true;
            clavesMovimiento[`${grupo}|${f.movimiento === null ? "*" : f.movimiento}`] = true;
            if (f.cajero) clavesCierre[`${grupo}|${f.cajero}`] = true;
            meses[f.fecha.substring(0, 7)] = true;
        });

        const encontradas = [];
        const movimientosEncontrados = {};
        const cierresEncontrados = {};
        const hayCierres = Object.keys(clavesCierre).length > 0;

        Object.keys(meses).forEach(function (mes) {
            buscarTransaccionesPorMes(mes, razonSocial).forEach(function (t) {
                const unidad = t.unidadcaja !== null && t.unidadcaja !== undefined ? parseInt(t.unidadcaja, 10) : null;
                const apertura = t.aperturacaja !== null && t.aperturacaja !== undefined ? parseInt(t.aperturacaja, 10) : null;
                if (!t.fechacaja || unidad === null || apertura === null) return;

                const grupo = `${t.fechacaja}|${unidad}|${apertura}`;
                const movimiento =
                    t.numeromovimiento !== null && t.numeromovimiento !== undefined && t.numeromovimiento !== "" ? parseInt(t.numeromovimiento, 10) : null;
                const claveExacta = movimiento !== null ? `${grupo}|${movimiento}` : null;
                const claveCaja = `${grupo}|*`;

                let coincide = false;
                if (claveExacta && clavesMovimiento[claveExacta]) {
                    movimientosEncontrados[claveExacta] = true;
                    coincide = true;
                }
                if (clavesMovimiento[claveCaja]) {
                    movimientosEncontrados[claveCaja] = true;
                    coincide = true;
                }
                if (coincide) encontradas.push(t);
            });

            if (hayCierres) {
                buscarCierresPorMes(mes, razonSocial).forEach(function (c) {
                    const clave = `${c.fechacaja}|${parseInt(c.unidadcaja, 10)}|${parseInt(c.aperturacaja, 10)}|${normalizarRut(c.rut)}`;
                    if (clavesCierre[clave]) {
                        cierresEncontrados[clave] = true;
                        encontradas.push({
                            tranid: c.tranid,
                            id: c.id,
                            recordtype: "journalentry",
                            memo: c.memo,
                            status: "Cierre Caja",
                            entidadnombre: c.entidadnombre,
                            tranDate: c.trandate,
                            numeromovimiento: "0",
                            amount: 0
                        });
                    }
                });
            }
        });

        // Deduplicar por ID
        const vistos = {};
        const registros = encontradas.filter((t) => {
            if (vistos[t.id]) return false;
            vistos[t.id] = true;
            return true;
        });

        const sinResultados = Object.keys(clavesMovimiento)
            .filter((k) => !movimientosEncontrados[k])
            .map((k) => {
                const p = k.split("|");
                return [p[0], p[1], p[2], p[3] === "*" ? "(toda la caja)" : p[3]];
            });

        const cierresSinResultados = Object.keys(clavesCierre)
            .filter((k) => !cierresEncontrados[k])
            .map((k) => k.split("|"));

        const resumen = [
            ["Filas en CSV", filas.length],
            ["Grupos únicos (Fecha/Unidad/Apertura)", Object.keys(gruposUnicos).length],
            ["Movimientos / cajas buscados", Object.keys(clavesMovimiento).length],
            ["Movimientos / cajas con resultados", Object.keys(movimientosEncontrados).length],
            ["Movimientos / cajas sin resultados", sinResultados.length]
        ];
        if (hayCierres) {
            resumen.push(["Cierres de caja buscados", Object.keys(clavesCierre).length]);
            resumen.push(["Cierres de caja encontrados", Object.keys(cierresEncontrados).length]);
        }
        resumen.push(["Total transacciones encontradas", registros.length]);

        const avisos = [
            {
                titulo: "Movimientos Sin Resultados",
                columnas: ["Fecha", "Unidad", "Apertura", "Movimiento"],
                filas: sinResultados
            },
            {
                titulo: "Cierres de Caja Sin Resultados",
                columnas: ["Fecha", "Unidad", "Apertura", "Cajero"],
                filas: cierresSinResultados
            }
        ];

        return { registros, resumen, avisos };
    }

    /* ------------------------------------------------------------------ */
    /* Flujo FACTURACIÓN                                                    */
    /* ------------------------------------------------------------------ */

    /**
     * Parsea el CSV de Facturación: FOLIO; TIPO DOCUMENTO (opcional).
     * Si la primera fila es encabezado, las columnas se ubican por nombre.
     */
    function parseCSVFacturacion(csvContent) {
        const { filas: lineas } = leerCSV(csvContent);
        if (lineas.length === 0) return { filas: [], errores: ["El archivo está vacío."] };

        let inicioDatos = 0;
        let idxFolio = 0;
        let idxTipo = 1;
        const encabezado = lineas[0].map(normalizarTexto);
        if (encabezado.some((c) => c.indexOf("folio") !== -1 || c.indexOf("tipo") !== -1)) {
            inicioDatos = 1;
            const posFolio = encabezado.findIndex((c) => c.indexOf("folio") !== -1);
            const posTipo = encabezado.findIndex((c) => c.indexOf("tipo") !== -1);
            if (posFolio !== -1) idxFolio = posFolio;
            idxTipo = posTipo;
        }

        const filas = [];
        const errores = [];
        const vistos = {};

        for (let i = inicioDatos; i < lineas.length; i++) {
            const columnas = lineas[i];
            const folioStr = String(columnas[idxFolio] || "").replace(/\s/g, "");

            if (!/^\d+$/.test(folioStr)) {
                errores.push(`Fila ${i + 1}: folio inválido "${columnas[idxFolio] || ""}"`);
                continue;
            }
            const folio = String(parseInt(folioStr, 10));

            const tipoTexto = idxTipo !== -1 ? columnas[idxTipo] || "" : "";
            const tipo = resolverTipoDte(tipoTexto);
            if (tipo === undefined) {
                errores.push(
                    `Fila ${i + 1}: tipo de documento no reconocido "${tipoTexto}". Use el código SII (39, 41, 33, 34, 61, 56) o el nombre (Boleta, Factura, Nota de Crédito...)`
                );
                continue;
            }

            const clave = `${folio}|${tipo ? tipo.id : ""}`;
            if (vistos[clave]) continue;
            vistos[clave] = true;

            filas.push({ fila: i + 1, folio, tipoId: tipo ? tipo.id : null, tipoTexto: tipo ? `${tipo.nombre} (${tipo.codigoSii})` : "" });
        }

        return { filas, errores };
    }

    /**
     * Busca los documentos de Facturación: subsidiaria + folio exacto (+ tipo DTE si se informa)
     */
    function buscarFlujoFacturacion(filas, subsidiaria) {
        const folios = Object.keys(
            filas.reduce((acc, f) => {
                acc[f.folio] = true;
                return acc;
            }, {})
        );

        const candidatos = [];
        enLotes(folios, TAMANO_LOTE_IN).forEach(function (lote) {
            const marcadores = lote.map(() => "?").join(",");
            candidatos.push(
                ...ejecutarQueryPaginada(
                    `
                    SELECT DISTINCT
                        transaction.tranid,
                        transaction.id,
                        transaction.recordtype,
                        transaction.memo,
                        BUILTIN.DF(transaction.status) as status,
                        transaction.tranDate,
                        transaction.custbody_2wintipodtesii as tipodte,
                        transaction.custbody_2winfolioacepta as folio,
                        CASE
                            WHEN transaction.type = 'Journal' OR transaction.recordtype = 'advintercompanyjournalentry'
                            THEN BUILTIN.DF(transactionLine.entity)
                            ELSE BUILTIN.DF(transaction.entity)
                        END as entidadnombre,
                        BUILTIN.DF(transactionLine.subsidiary) as subsidiarianombre,
                        NVL(transaction.foreignAmountUnpaid + transaction.foreignAmountPaid, 0) as amount
                    FROM
                        transaction
                        INNER JOIN transactionLine ON transactionLine.transaction = transaction.id AND transactionLine.mainLine = 'T'
                    WHERE
                        -- TEMPORAL (17/11/2026, solicitado por el usuario): se deshabilita el filtro de
                        -- transacciones creadas por la interfaz.
                        -- transaction.custbody_2win_created_from_income_flow = 'T' AND
                        transactionLine.subsidiary = ?
                        AND transaction.recordtype IN ('invoice', 'creditmemo')
                        AND transaction.custbody_2winfolioacepta IN (${marcadores})
                `,
                    [subsidiaria].concat(lote)
                )
            );
        });

        // Una transacción puede venir repetida (ej. asientos: una fila por línea principal)
        const idsCandidatos = {};
        const candidatosUnicos = candidatos.filter((c) => {
            if (idsCandidatos[c.id]) return false;
            idsCandidatos[c.id] = true;
            return true;
        });

        const registros = [];
        const vistos = {};
        const sinResultados = [];
        const ambiguos = [];

        filas.forEach(function (f) {
            const coincidencias = candidatosUnicos.filter(
                (c) => String(parseInt(c.folio, 10)) === f.folio && (f.tipoId === null || String(c.tipodte) === String(f.tipoId))
            );

            if (coincidencias.length === 0) {
                sinResultados.push([f.fila, f.folio, f.tipoTexto || "(sin tipo)"]);
            } else if (coincidencias.length > 1) {
                ambiguos.push([
                    f.fila,
                    f.folio,
                    f.tipoTexto || "(sin tipo)",
                    coincidencias.map((c) => `${c.tranid} - ${nombreTipoDte(c.tipodte) || c.recordtype}`).join(" / ")
                ]);
            } else {
                const t = coincidencias[0];
                if (!vistos[t.id]) {
                    vistos[t.id] = true;
                    registros.push(t);
                }
            }
        });

        // Transacciones relacionadas a cada documento encontrado (columna informativa)
        const relacionadas = buscarRelacionadas(registros.map((r) => r.id));
        registros.forEach((r) => {
            r.relacionadas = relacionadas[String(r.id)] || "";
        });

        const resumen = [
            ["Filas válidas en CSV", filas.length],
            ["Documentos encontrados", registros.length],
            ["Folios sin resultados", sinResultados.length],
            ["Folios ambiguos (no listados)", ambiguos.length]
        ];

        const avisos = [
            {
                titulo: "Folios Ambiguos - no se listan (agregue el TIPO DOCUMENTO en el CSV)",
                columnas: ["Fila CSV", "Folio", "Tipo", "Documentos encontrados"],
                filas: ambiguos
            },
            {
                titulo: "Folios Sin Resultados en la subsidiaria seleccionada",
                columnas: ["Fila CSV", "Folio", "Tipo"],
                filas: sinResultados
            }
        ];

        return { registros, resumen, avisos };
    }

    const NOMBRE_TIPO = {
        CustPymt: "Pago",
        CustCred: "NC",
        CustInvc: "Factura",
        DepAppl: "Aplicación de depósito",
        CustDep: "Depósito",
        Journal: "Asiento",
        SalesOrd: "Orden de venta",
        RtnAuth: "Devolución",
        CustRfnd: "Reembolso"
    };

    /**
     * Arma, para cada transacción de la lista, el texto de sus transacciones relacionadas:
     * vínculos de NetSuite (ambas direcciones), NC creadas desde ella y asientos aplicados en sus pagos.
     * @returns {Object} id -> texto
     */
    function buscarRelacionadas(ids) {
        const relacionadas = {}; // id base -> { idRelacionada: texto }
        // prioritario = true para etiquetas más específicas ("NC creada desde", "Asiento vía pago")
        const agregar = (base, id, texto, prioritario) => {
            const clave = String(base);
            if (String(id) === clave) return;
            relacionadas[clave] = relacionadas[clave] || {};
            if (!relacionadas[clave][id] || prioritario) relacionadas[clave][id] = texto;
        };
        const etiqueta = (f, extra) =>
            `${f.tranid || f.id} (${extra || NOMBRE_TIPO[f.type] || tipoTransaccion(f)})`;
        const pagosPorBase = {}; // idPago -> [ids base]

        try {
            enLotes(ids.map(String), TAMANO_LOTE_IN).forEach(function (lote) {
                const marcadores = lote.map(() => "?").join(",");

                // Transacciones siguientes (pagos, aplicaciones de depósito, NC aplicadas, ...)
                ejecutarQueryPaginada(
                    `SELECT l.previousdoc AS base, t.id, t.tranid, t.type, t.recordtype
                       FROM NextTransactionLink l
                      INNER JOIN transaction t ON t.id = l.nextdoc
                      WHERE l.previousdoc IN (${marcadores})`,
                    lote
                ).forEach((f) => {
                    agregar(f.base, f.id, etiqueta(f));
                    if (f.type === "CustPymt") (pagosPorBase[f.id] = pagosPorBase[f.id] || []).push(f.base);
                });

                // Transacciones anteriores (orden de venta, etc.)
                ejecutarQueryPaginada(
                    `SELECT l.nextdoc AS base, t.id, t.tranid, t.type, t.recordtype
                       FROM NextTransactionLink l
                      INNER JOIN transaction t ON t.id = l.previousdoc
                      WHERE l.nextdoc IN (${marcadores})`,
                    lote
                ).forEach((f) => agregar(f.base, f.id, etiqueta(f)));

                // NC creadas desde la factura (campo "Creado desde")
                ejecutarQueryPaginada(
                    `SELECT DISTINCT tl.createdfrom AS base, t.id, t.tranid, t.type, t.recordtype
                       FROM transaction t
                      INNER JOIN transactionline tl ON tl.transaction = t.id
                      WHERE t.type = 'CustCred' AND tl.createdfrom IN (${marcadores})`,
                    lote
                ).forEach((f) => agregar(f.base, f.id, etiqueta(f, "NC creada desde"), true));
            });

            // Asientos cuyo crédito está aplicado en los pagos de la factura
            const pagos = Object.keys(pagosPorBase);
            enLotes(pagos, TAMANO_LOTE_IN).forEach(function (lote) {
                const marcadores = lote.map(() => "?").join(",");
                ejecutarQueryPaginada(
                    `SELECT l.nextdoc AS pago, t.id, t.tranid, t.type, t.recordtype
                       FROM NextTransactionLink l
                      INNER JOIN transaction t ON t.id = l.previousdoc
                      WHERE l.nextdoc IN (${marcadores})
                        AND t.recordtype IN ('journalentry', 'advintercompanyjournalentry')`,
                    lote
                ).forEach((f) => {
                    (pagosPorBase[f.pago] || []).forEach((base) => agregar(base, f.id, etiqueta(f, "Asiento vía pago"), true));
                });
            });
        } catch (e) {
            nLog.error("buscarRelacionadas - error", e);
        }

        const resultado = {};
        Object.keys(relacionadas).forEach((base) => {
            resultado[base] = Object.keys(relacionadas[base])
                .map((k) => relacionadas[base][k])
                .join(" · ");
        });
        return resultado;
    }

    function tipoTransaccion(f) {
        return f.recordtype || f.type || "";
    }

    /* ------------------------------------------------------------------ */
    /* Flujo PREFACTURAS                                                    */
    /* ------------------------------------------------------------------ */

    function parseCSVPrefacturas(csvContent) {
        const { filas: lineas } = leerCSV(csvContent);
        if (lineas.length === 0) return { filas: [], errores: ["El archivo está vacío."] };

        let inicioDatos = 0;
        const primera = normalizarTexto(lineas[0][0]);
        if (primera.indexOf("prefactura") !== -1 || primera.indexOf("numero") !== -1) inicioDatos = 1;

        const filas = [];
        const errores = [];
        const vistos = {};

        for (let i = inicioDatos; i < lineas.length; i++) {
            const numero = String(lineas[i][0] || "").trim();
            if (!numero) {
                errores.push(`Fila ${i + 1}: número de prefactura vacío`);
                continue;
            }
            if (vistos[numero]) continue;
            vistos[numero] = true;
            filas.push({ fila: i + 1, numero });
        }

        return { filas, errores };
    }

    function buscarFlujoPrefacturas(filas) {
        const numeros = filas.map((f) => f.numero);
        const encontradas = [];

        enLotes(numeros, TAMANO_LOTE_IN).forEach(function (lote) {
            const marcadores = lote.map(() => "?").join(",");
            encontradas.push(
                ...ejecutarQueryPaginada(
                    `
                    SELECT
                        id,
                        name,
                        custrecord_2w_as_pf_paciente as paciente,
                        custrecord_2w_as_pf_ficha as ficha,
                        custrecord_2w_as_pf_ingreso as ingreso,
                        custrecord_2w_as_pf_fecha as fecha,
                        custrecord_2w_as_pf_montototal as montototal,
                        custrecord_2w_as_pf_estado as estado
                    FROM
                        customrecord_2w_as_prefactura
                    WHERE
                        name IN (${marcadores})
                    ORDER BY
                        name ASC
                `,
                    lote
                )
            );
        });

        const nombresEncontrados = {};
        encontradas.forEach((p) => {
            nombresEncontrados[String(p.name)] = true;
        });
        const sinResultados = filas.filter((f) => !nombresEncontrados[f.numero]).map((f) => [f.fila, f.numero]);

        return {
            registros: encontradas,
            resumen: [
                ["Prefacturas en CSV", filas.length],
                ["Prefacturas encontradas", encontradas.length],
                ["Prefacturas sin resultados", sinResultados.length]
            ],
            avisos: [
                {
                    titulo: "Prefacturas Sin Resultados",
                    columnas: ["Fila CSV", "Número"],
                    filas: sinResultados
                }
            ]
        };
    }

    /* ------------------------------------------------------------------ */
    /* Formulario                                                           */
    /* ------------------------------------------------------------------ */

    const CONFIG_FLUJO = {
        caja: {
            titulo: "Eliminación Masiva de Transacciones de Caja",
            instrucciones: `El archivo debe tener las columnas: <strong>FECHA CAJA, UNIDAD CAJA, APERTURA CAJA, MOVIMIENTO CAJA (opcional), CAJERO (opcional)</strong>.<br>
                Si MOVIMIENTO se deja vacío se buscan <strong>todas</strong> las transacciones de esa caja y apertura.
                Si se informa CAJERO (RUT) se agregan los <strong>asientos de cierre</strong> de esa caja.`
        },
        facturacion: {
            titulo: "Eliminación Masiva de Transacciones de Facturación",
            instrucciones: `El archivo debe tener las columnas: <strong>FOLIO, TIPO DOCUMENTO (opcional)</strong>.<br>
                Tipo documento: código SII (39 Boleta, 41 Boleta Exenta, 33 Factura, 34 Factura Exenta, 61 Nota de Crédito, 56 Nota de Débito) o su nombre.<br>
                La búsqueda es exacta y solo en la <strong>Subsidiaria</strong> seleccionada. Si un folio coincide con más de un documento,
                no se lista y se informa como ambiguo: agregue el tipo de documento para identificarlo.`
        },
        prefactura: {
            titulo: "Eliminación Masiva de Prefacturas",
            instrucciones: "El archivo debe tener una columna: <strong>NÚMERO PREFACTURA</strong> (búsqueda exacta)."
        }
    };

    /**
     * Crea el formulario base del Suitelet
     * @param {boolean} [archivoObligatorio=true] - Si true, el campo CSV es obligatorio.
     *   Pasar false cuando el formulario se reutiliza para mostrar resultados o confirmar eliminación.
     * @param {string} [flujo="caja"] - caja | facturacion | prefactura
     */
    function crearFormularioCarga(archivoObligatorio, flujo) {
        if (archivoObligatorio === undefined) archivoObligatorio = true;
        if (!CONFIG_FLUJO[flujo]) flujo = "caja";

        const form = serverWidget.createForm({ title: CONFIG_FLUJO[flujo].titulo });

        form.addFieldGroup({ id: "custpage_filters", label: "Carga de Archivo CSV" });

        // Selector de flujo (el client script recarga la página al cambiarlo)
        const flujoField = form.addField({
            id: "custpage_flujo",
            type: serverWidget.FieldType.SELECT,
            label: "Flujo",
            container: "custpage_filters"
        });
        flujoField.addSelectOption({ value: "caja", text: "Caja", isSelected: flujo === "caja" });
        flujoField.addSelectOption({ value: "facturacion", text: "Facturación", isSelected: flujo === "facturacion" });
        flujoField.addSelectOption({ value: "prefactura", text: "Prefacturas", isSelected: flujo === "prefactura" });

        // Campo de archivo CSV (NO puede tener container - restricción de NetSuite para campos FILE)
        const archivoField = form.addField({
            id: "custpage_archivo_csv",
            type: serverWidget.FieldType.FILE,
            label: "Archivo CSV"
        });
        archivoField.isMandatory = archivoObligatorio;

        form.addField({
            id: "custpage_instrucciones",
            type: serverWidget.FieldType.INLINEHTML,
            label: "Instrucciones",
            container: "custpage_filters"
        }).defaultValue = `
            <div style="padding: 10px; background-color: #d9edf7; border-radius: 4px; border: 1px solid #bce8f1; margin-bottom: 10px;">
                <strong>Instrucciones:</strong> Exporte el archivo Excel como CSV (valores separados por comas o punto y coma).
                La primera fila puede ser encabezado.<br>${CONFIG_FLUJO[flujo].instrucciones}
            </div>
        `;

        if (flujo === "caja") {
            const fieldRazonSocial = form.addField({
                id: "custpage_razon_social_caja",
                type: serverWidget.FieldType.TEXT,
                label: "Razón Social de Caja",
                container: "custpage_filters"
            });
            fieldRazonSocial.isMandatory = true;
            fieldRazonSocial.helpText = "Ingrese la Razón Social de Caja que aplica a todos los registros del archivo.";
        } else if (flujo === "facturacion") {
            const fieldSubsidiaria = form.addField({
                id: "custpage_subsidiaria",
                type: serverWidget.FieldType.SELECT,
                label: "Subsidiaria",
                source: "subsidiary",
                container: "custpage_filters"
            });
            fieldSubsidiaria.isMandatory = true;
            fieldSubsidiaria.helpText = "Solo se buscarán y eliminarán documentos de esta subsidiaria.";
        }

        form.addSubmitButton({ label: "Cargar y Buscar" });

        // Client script para confirmación, seleccionar todo y cambio de flujo
        form.clientScriptModulePath = "./2win_cs_eliminacion_caja.js";

        return form;
    }

    function agregarHtmlError(form, id, mensaje) {
        form.addField({
            id: id,
            type: serverWidget.FieldType.INLINEHTML,
            label: "Error"
        }).defaultValue = `
            <div style="padding: 10px; background-color: #f2dede; border-radius: 4px; border: 1px solid #a94442; color: #a94442;">
                <strong>Error:</strong> ${mensaje}
            </div>
        `;
    }

    /**
     * Muestra resumen, avisos y la lista de registros con checkbox
     */
    function mostrarResultados(form, flujo, resultado, errores) {
        const { registros, resumen, avisos } = resultado;

        let htmlResumen = `
            <div style="padding: 15px; background-color: #dff0d8; border-radius: 5px; border: 2px solid #3c763d; margin-bottom: 10px;">
                <h3 style="color: #3c763d; margin-top: 0;">Resumen de Búsqueda</h3>
                <table style="font-size: 14px;">`;
        resumen.forEach((fila) => {
            htmlResumen += `<tr><td><strong>${escaparHtml(fila[0])}:</strong></td><td>${escaparHtml(fila[1])}</td></tr>`;
        });
        htmlResumen += "</table></div>";
        form.addField({
            id: "custpage_resumen_busqueda",
            type: serverWidget.FieldType.INLINEHTML,
            label: "Resumen de Búsqueda"
        }).defaultValue = htmlResumen;

        if (errores && errores.length > 0) {
            let htmlErrores = `
                <div style="padding: 15px; background-color: #fcf8e3; border-radius: 5px; border: 2px solid #faebcc; margin-bottom: 10px;">
                    <h3 style="color: #8a6d3b; margin-top: 0;">Advertencias de Lectura del CSV (${errores.length})</h3>
                    <ul style="font-size: 12px; max-height: 150px; overflow-y: auto;">`;
            errores.forEach((err) => {
                htmlErrores += `<li>${escaparHtml(err)}</li>`;
            });
            htmlErrores += "</ul></div>";
            form.addField({
                id: "custpage_errores_parseo",
                type: serverWidget.FieldType.INLINEHTML,
                label: "Advertencias de Parseo"
            }).defaultValue = htmlErrores;
        }

        avisos
            .filter((a) => a.filas.length > 0)
            .forEach((aviso, indice) => {
                let html = `
                    <div style="padding: 15px; background-color: #f2dede; border-radius: 5px; border: 2px solid #a94442; margin-bottom: 10px;">
                        <h3 style="color: #a94442; margin-top: 0;">${escaparHtml(aviso.titulo)} (${aviso.filas.length})</h3>
                        <div style="font-size: 12px; max-height: 200px; overflow-y: auto;">
                            <table style="width: 100%; border-collapse: collapse;"><tr style="background-color: #f5e0e0;">`;
                aviso.columnas.forEach((c) => {
                    html += `<th style="padding: 4px; border: 1px solid #ddd;">${escaparHtml(c)}</th>`;
                });
                html += "</tr>";
                aviso.filas.forEach((fila) => {
                    html += "<tr>";
                    fila.forEach((valor) => {
                        html += `<td style="padding: 4px; border: 1px solid #ddd;">${escaparHtml(valor)}</td>`;
                    });
                    html += "</tr>";
                });
                html += "</table></div></div>";
                form.addField({
                    id: `custpage_aviso_${indice}`,
                    type: serverWidget.FieldType.INLINEHTML,
                    label: aviso.titulo
                }).defaultValue = html;
            });

        if (registros.length === 0) {
            form.addField({
                id: "custpage_mensaje",
                type: serverWidget.FieldType.HELP,
                label: "No se encontraron registros para los datos del archivo CSV."
            });
            return;
        }

        form.addButton({
            id: "custpage_btn_seleccionar_todo",
            label: "Seleccionar Todo",
            functionName: "seleccionarTodos"
        });

        const sublist = form.addSublist({
            id: "custpage_transacciones",
            type: serverWidget.SublistType.LIST,
            label: `${flujo === "prefactura" ? "Prefacturas" : "Transacciones"} Encontradas (${registros.length})`
        });

        sublist.addField({ id: "custpage_select", type: serverWidget.FieldType.CHECKBOX, label: "Eliminar" });
        sublist.addField({ id: "custpage_id", type: serverWidget.FieldType.INTEGER, label: "ID" });

        const setValor = (id, linea, valor) => {
            if (valor !== null && valor !== undefined && valor !== "") {
                sublist.setSublistValue({ id: id, line: linea, value: String(valor).substring(0, 300) });
            }
        };
        const fechaTexto = (valor) => {
            const fecha = new Date(valor);
            return isNaN(fecha.getTime()) ? String(valor) : fecha.toLocaleDateString();
        };

        if (flujo === "prefactura") {
            sublist.addField({ id: "custpage_numero", type: serverWidget.FieldType.TEXT, label: "Número" });
            sublist.addField({ id: "custpage_paciente", type: serverWidget.FieldType.TEXT, label: "Paciente" });
            sublist.addField({ id: "custpage_ficha", type: serverWidget.FieldType.TEXT, label: "Ficha" });
            sublist.addField({ id: "custpage_ingreso", type: serverWidget.FieldType.TEXT, label: "Ingreso" });
            sublist.addField({ id: "custpage_fecha", type: serverWidget.FieldType.TEXT, label: "Fecha" });
            sublist.addField({ id: "custpage_monto", type: serverWidget.FieldType.CURRENCY, label: "Monto Total" });
            sublist.addField({ id: "custpage_estado", type: serverWidget.FieldType.TEXT, label: "Estado" });

            registros.forEach((p, i) => {
                setValor("custpage_id", i, p.id);
                setValor("custpage_numero", i, p.name);
                setValor("custpage_paciente", i, p.paciente);
                setValor("custpage_ficha", i, p.ficha);
                setValor("custpage_ingreso", i, p.ingreso);
                if (p.fecha) setValor("custpage_fecha", i, fechaTexto(p.fecha));
                setValor("custpage_monto", i, p.montototal);
                setValor("custpage_estado", i, p.estado);
            });
        } else {
            sublist.addField({ id: "custpage_tipo", type: serverWidget.FieldType.TEXT, label: "Tipo" });
            sublist.addField({ id: "custpage_tranid", type: serverWidget.FieldType.TEXT, label: "Número" });
            sublist.addField({ id: "custpage_estado", type: serverWidget.FieldType.TEXT, label: "Estado" });
            sublist.addField({ id: "custpage_entidad", type: serverWidget.FieldType.TEXT, label: "Entidad" });
            if (flujo === "facturacion") {
                sublist.addField({ id: "custpage_tipodte", type: serverWidget.FieldType.TEXT, label: "Tipo Documento" });
                sublist.addField({ id: "custpage_folio", type: serverWidget.FieldType.TEXT, label: "Folio" });
                sublist.addField({ id: "custpage_subsidiaria_linea", type: serverWidget.FieldType.TEXT, label: "Subsidiaria" });
                sublist.addField({ id: "custpage_relacionadas", type: serverWidget.FieldType.TEXTAREA, label: "Transacciones relacionadas" });
            }
            sublist.addField({ id: "custpage_memo", type: serverWidget.FieldType.TEXT, label: "Memo" });
            sublist.addField({ id: "custpage_fecha", type: serverWidget.FieldType.TEXT, label: "Fecha" });
            sublist.addField({ id: "custpage_monto", type: serverWidget.FieldType.CURRENCY, label: "Monto" });
            if (flujo === "caja") {
                sublist.addField({ id: "custpage_movimiento", type: serverWidget.FieldType.TEXT, label: "Movimiento" });
            }

            registros.forEach((t, i) => {
                setValor("custpage_id", i, t.id);
                setValor("custpage_tipo", i, t.recordtype);
                setValor("custpage_tranid", i, t.tranid);
                setValor("custpage_estado", i, t.status);
                setValor("custpage_entidad", i, t.entidadnombre);
                if (flujo === "facturacion") {
                    setValor("custpage_tipodte", i, nombreTipoDte(t.tipodte));
                    setValor("custpage_folio", i, t.folio);
                    setValor("custpage_subsidiaria_linea", i, t.subsidiarianombre);
                    if (t.relacionadas) {
                        sublist.setSublistValue({ id: "custpage_relacionadas", line: i, value: String(t.relacionadas).substring(0, 3900) });
                    }
                }
                setValor("custpage_memo", i, t.memo);
                const fecha = t.trandate || t.tranDate;
                if (fecha) setValor("custpage_fecha", i, fechaTexto(fecha));
                setValor("custpage_monto", i, t.amount);
                if (flujo === "caja") setValor("custpage_movimiento", i, t.numeromovimiento);
            });
        }

        form.addButton({
            id: "custpage_btn_eliminar",
            label: "Eliminar Seleccionados",
            functionName: "confirmarEliminacion"
        });

        form.addField({
            id: "custpage_es_eliminacion",
            type: serverWidget.FieldType.TEXT,
            label: "Es Eliminación"
        }).updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN });
    }

    /* ------------------------------------------------------------------ */
    /* Eliminación                                                          */
    /* ------------------------------------------------------------------ */

    /**
     * Devuelve los IDs (de la lista) cuya línea principal no pertenece a la subsidiaria indicada
     */
    function idsFueraDeSubsidiaria(ids, subsidiaria) {
        const fuera = [];
        enLotes(ids, TAMANO_LOTE_IN).forEach(function (lote) {
            const marcadores = lote.map(() => "?").join(",");
            ejecutarQueryPaginada(
                `SELECT DISTINCT tl.transaction AS id, tl.subsidiary AS subsidiaria
                   FROM transactionline tl
                  WHERE tl.mainline = 'T' AND tl.transaction IN (${marcadores})`,
                lote
            ).forEach(function (f) {
                if (String(f.subsidiaria) !== String(subsidiaria)) fuera.push(f.id);
            });
        });
        return fuera;
    }

    /**
     * Procesa la eliminación de los registros seleccionados usando el MapReduce
     */
    function procesarEliminacion(form, request, flujo) {
        const numLineas = request.getLineCount({ group: "custpage_transacciones" });
        const subsidiaria = request.parameters.custpage_subsidiaria || "";
        const registrosAEliminar = [];

        if (flujo === "facturacion" && !subsidiaria) {
            agregarHtmlError(form, "custpage_error_subsidiaria", "Debe seleccionar la Subsidiaria antes de eliminar.");
            return;
        }

        for (let i = 0; i < numLineas; i++) {
            let seleccionada;
            try {
                seleccionada = request.getSublistValue({ group: "custpage_transacciones", name: "custpage_select", line: i });
            } catch (e) {
                continue;
            }

            if (seleccionada === "T" || seleccionada === true) {
                const id = request.getSublistValue({ group: "custpage_transacciones", name: "custpage_id", line: i });

                let tipoRegistro = "prefactura";
                if (flujo !== "prefactura") {
                    try {
                        tipoRegistro = request.getSublistValue({ group: "custpage_transacciones", name: "custpage_tipo", line: i });
                    } catch (e) {
                        tipoRegistro = "unknown";
                    }
                }

                const registro = { id: parseInt(id, 10), tipoRegistro: tipoRegistro, flujo: flujo };
                if (flujo === "facturacion") registro.subsidiaria = subsidiaria;
                registrosAEliminar.push(registro);
            }
        }

        if (registrosAEliminar.length === 0) {
            form.addField({
                id: "custpage_mensaje",
                type: serverWidget.FieldType.HELP,
                label: "No se seleccionaron registros para eliminar."
            });
            return;
        }

        // Control de subsidiaria antes de lanzar el proceso (el MR vuelve a validarlo por registro)
        if (flujo === "facturacion") {
            const fuera = idsFueraDeSubsidiaria(
                registrosAEliminar.map((r) => r.id),
                subsidiaria
            );
            if (fuera.length > 0) {
                agregarHtmlError(
                    form,
                    "custpage_error_subsidiaria",
                    `No se inició la eliminación: ${fuera.length} registro(s) no pertenecen a la subsidiaria seleccionada (ID: ${fuera.slice(0, 50).join(", ")}).`
                );
                return;
            }
        }

        try {
            const jsonStr = JSON.stringify(registrosAEliminar);
            nLog.audit("Eliminación masiva", `Flujo: ${flujo}, Registros: ${registrosAEliminar.length}, Tamaño JSON: ${jsonStr.length}`);

            const mapReduceTask = task.create({
                taskType: task.TaskType.MAP_REDUCE,
                scriptId: "customscript_2win_mr_eliminacion",
                deploymentId: "customdeploy_2win_mr_eliminacion",
                params: {
                    custscript_2w_mr_eliminacion_cache_id: jsonStr
                }
            });

            const taskId = mapReduceTask.submit();
            nLog.audit("MapReduce iniciado", `Task ID: ${taskId}`);

            form.addField({
                id: "custpage_resumen",
                type: serverWidget.FieldType.INLINEHTML,
                label: "Proceso de Eliminación"
            }).defaultValue = `
                <div style="padding: 20px; background-color: #dff0d8; border-radius: 5px; border: 2px solid #3c763d;">
                    <h3 style="color: #3c763d; margin-top: 0;">Proceso de Eliminación Masiva Iniciado</h3>
                    <p style="font-size: 16px;"><strong>Registros seleccionados:</strong> ${registrosAEliminar.length}</p>
                    <p style="font-size: 14px; color: #3c763d;">El proceso de eliminación se está ejecutando en segundo plano (MapReduce).</p>
                    <p style="font-size: 14px; color: #3c763d;"><strong>ID del proceso:</strong> ${taskId}</p>
                    <p style="font-size: 14px; color: #3c763d; margin-top: 10px;">Puede verificar el estado del proceso en la lista de tareas programadas.</p>
                </div>
            `;
        } catch (e) {
            nLog.error("Error al iniciar MapReduce", e);
            form.addField({
                id: "custpage_error",
                type: serverWidget.FieldType.INLINEHTML,
                label: "Error"
            }).defaultValue = `
                <div style="padding: 20px; background-color: #f2dede; border-radius: 5px; border: 2px solid #a94442;">
                    <h3 style="color: #a94442; margin-top: 0;">Error al iniciar el proceso</h3>
                    <p style="font-size: 14px;">${escaparHtml(e.message)}</p>
                </div>
            `;
        }
    }

    /* ------------------------------------------------------------------ */
    /* Entrada                                                              */
    /* ------------------------------------------------------------------ */

    function onRequest(context) {
        const { request, response } = context;

        try {
            nLog.audit("INICIO Suitelet Masivo", "Suitelet de Eliminación Masiva iniciado");
            const flujo = CONFIG_FLUJO[request.parameters.custpage_flujo] ? request.parameters.custpage_flujo : "caja";

            if (request.method === "GET") {
                response.writePage(crearFormularioCarga(true, flujo));
                return;
            }

            // Valores que se conservan entre la búsqueda y la eliminación
            const valores = { custpage_flujo: flujo };
            if (flujo === "caja") valores.custpage_razon_social_caja = request.parameters.custpage_razon_social_caja || "";
            if (flujo === "facturacion") valores.custpage_subsidiaria = request.parameters.custpage_subsidiaria || "";

            if (request.parameters.custpage_es_eliminacion === "T") {
                const form = crearFormularioCarga(false, flujo);
                form.updateDefaultValues(valores);
                procesarEliminacion(form, request, flujo);
                response.writePage(form);
                return;
            }

            // Búsqueda: validar campos del formulario según el flujo
            const razonSocial = request.parameters.custpage_razon_social_caja;
            const subsidiaria = request.parameters.custpage_subsidiaria;

            const devolverError = (id, mensaje) => {
                const form = crearFormularioCarga(true, flujo);
                form.updateDefaultValues(valores);
                agregarHtmlError(form, id, mensaje);
                response.writePage(form);
            };

            if (flujo === "caja" && !razonSocial) {
                devolverError("custpage_error_campo", "Debe ingresar la Razón Social de Caja.");
                return;
            }
            if (flujo === "facturacion" && !subsidiaria) {
                devolverError("custpage_error_campo", "Debe seleccionar la Subsidiaria.");
                return;
            }

            const fileObj = request.files["custpage_archivo_csv"];
            if (!fileObj) {
                devolverError("custpage_error_campo", "Debe seleccionar un archivo CSV.");
                return;
            }

            const csvContent = fileObj.getContents();
            nLog.audit("CSV cargado", `Flujo: ${flujo}, Tamaño: ${csvContent.length} caracteres`);

            let parseResult;
            if (flujo === "caja") parseResult = parseCSVCaja(csvContent);
            else if (flujo === "facturacion") parseResult = parseCSVFacturacion(csvContent);
            else parseResult = parseCSVPrefacturas(csvContent);

            nLog.audit("CSV parseado", `Filas: ${parseResult.filas.length}, Errores: ${parseResult.errores.length}`);

            if (parseResult.filas.length === 0) {
                let errorMsg = "No se encontraron filas válidas en el archivo CSV.";
                if (parseResult.errores.length > 0) {
                    errorMsg += "<br><br>Errores:<br>" + parseResult.errores.map(escaparHtml).join("<br>");
                }
                devolverError("custpage_error_csv", errorMsg);
                return;
            }

            let resultado;
            if (flujo === "caja") resultado = buscarFlujoCaja(parseResult.filas, razonSocial);
            else if (flujo === "facturacion") resultado = buscarFlujoFacturacion(parseResult.filas, subsidiaria);
            else resultado = buscarFlujoPrefacturas(parseResult.filas);

            nLog.audit("Búsqueda completada", `Flujo: ${flujo}, Registros: ${resultado.registros.length}`);

            // archivo no obligatorio: ya fue procesado, no se debe requerir en el submit de eliminación
            const form = crearFormularioCarga(false, flujo);
            form.updateDefaultValues(valores);
            mostrarResultados(form, flujo, resultado, parseResult.errores);
            response.writePage(form);
        } catch (e) {
            nLog.error("Error en Suitelet Masivo", e);
            const form = serverWidget.createForm({ title: "Error" });
            form.addField({
                id: "custpage_error",
                type: serverWidget.FieldType.INLINEHTML,
                label: "Error"
            }).defaultValue = `
                <div style="padding: 20px; background-color: #f2dede; border-radius: 5px; border: 2px solid #a94442;">
                    <h3 style="color: #a94442; margin-top: 0;">Error</h3>
                    <p style="font-size: 14px;">${escaparHtml(e.message)}</p>
                    <pre style="font-size: 12px; overflow: auto; max-height: 200px;">${escaparHtml(e.stack || "")}</pre>
                </div>
            `;
            response.writePage(form);
        }
    }

    return {
        onRequest: onRequest
    };
});
