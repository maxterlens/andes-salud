/**
 * @NApiVersion 2.1
 * @NModuleScope SameAccount
 *
 * @description AS_NSP_037 - Acceso a datos de Órdenes de Venta.
 *              Lectura vía SuiteQL y una única escritura por OV (aplicarCambios), que además
 *              limpia el detalle de inventario de las líneas (regla Andes Salud: la OV no debe
 *              tener lotes seleccionados; mismo criterio que quitarDetallesInventario del partner).
 *
 *              La subsidiaria se lee a nivel de línea (transactionline.subsidiary, línea principal).
 *              Las cantidades se devuelven en la unidad de la transacción (cantidad base / factor de conversión),
 *              que es la unidad que usan el CSV y el registro de la OV.
 */
define(["N/record", "N/log", "../constants/FixArticuloOrdenVentaConstants", "../utils/SuiteQLUtils"], (record, nLog, CONST, sql) => {
    const { REGLAS, CAMPOS, COLA_AUTOPICKING } = CONST;
    const EPS = REGLAS.EPSILON;
    const SUBLISTA_ITEM = "item";
    const CAMPO_DETALLE = "inventorydetail";

    const { consultarTodo, consultar, enLotes, listaTexto, numero } = sql;

    /**
     * OV de la subsidiaria para las cuentas indicadas.
     * @param {number} subsidiaria
     * @param {string[]} cuentas
     * @returns {Map<string, Array<{id: number, tranid: string, estado: string, estadoTexto: string}>>} clave = cuenta
     */
    function buscarPorCuentas(subsidiaria, cuentas) {
        const mapa = new Map();
        const unicas = [...new Set(cuentas.map(String))];
        for (const lote of enLotes(unicas)) {
            const consulta = `
                SELECT
                    t.id AS id,
                    t.tranid AS tranid,
                    t.status AS estado,
                    BUILTIN.DF(t.status) AS estadotexto,
                    TO_CHAR(t.${CAMPOS.CUENTA_PACIENTE}) AS cuenta
                FROM transaction t
                INNER JOIN transactionline tlm ON tlm.transaction = t.id AND tlm.mainline = 'T'
                WHERE t.type = 'SalesOrd'
                  AND tlm.subsidiary = ?
                  AND TO_CHAR(t.${CAMPOS.CUENTA_PACIENTE}) IN (${listaTexto(lote)})
                ORDER BY t.id
            `;
            for (const f of consultarTodo(consulta, [Number(subsidiaria)])) {
                if (!mapa.has(f.cuenta)) mapa.set(f.cuenta, []);
                mapa.get(f.cuenta).push({ id: Number(f.id), tranid: f.tranid, estado: f.estado, estadoTexto: f.estadotexto });
            }
        }
        return mapa;
    }

    /**
     * Líneas de OV por par "idOV|CRG_CORREL".
     * @param {string[]} pares - "idOrdenVenta|crgCorrel"
     * @returns {Map<string, Array<object>>} clave = par
     */
    function obtenerLineasPorCrg(pares) {
        const mapa = new Map();
        const unicos = [...new Set(pares)];
        for (const lote of enLotes(unicos)) {
            const consulta = `
                SELECT
                    tl.transaction AS ov,
                    tl.id AS lineid,
                    TO_CHAR(tl.${CAMPOS.IDENTIFICADOR_FILA}) AS crg,
                    tl.item AS item,
                    BUILTIN.DF(tl.item) AS itemnombre,
                    tl.itemtype AS itemtype,
                    NVL(tl.inventorylocation, tl.location) AS ubicacion,
                    NVL(BUILTIN.DF(tl.inventorylocation), BUILTIN.DF(tl.location)) AS ubicacionnombre,
                    ABS(NVL(tl.quantity, 0)) AS cantidad,
                    ABS(NVL(tl.quantityshiprecv, 0)) AS despachada,
                    ABS(NVL(tl.quantitybilled, 0)) AS facturada,
                    ABS(NVL(tl.rate, 0)) AS precio,
                    NVL(tl.isclosed, 'F') AS cerrada,
                    NVL(u.conversionrate, 1) AS conversion,
                    i.islotitem AS eslote,
                    i.isserialitem AS esserie
                FROM transactionline tl
                INNER JOIN item i ON i.id = tl.item
                LEFT JOIN unitsTypeUom u ON u.internalid = tl.units
                WHERE tl.mainline = 'F'
                  AND tl.${CAMPOS.IDENTIFICADOR_FILA} IS NOT NULL
                  AND TO_CHAR(tl.transaction) || '|' || TO_CHAR(tl.${CAMPOS.IDENTIFICADOR_FILA}) IN (${listaTexto(lote)})
            `;
            for (const f of consultarTodo(consulta)) {
                const conversion = numero(f.conversion) || 1;
                const clave = `${f.ov}|${f.crg}`;
                if (!mapa.has(clave)) mapa.set(clave, []);
                mapa.get(clave).push({
                    ovId: Number(f.ov),
                    lineId: String(f.lineid),
                    crg: f.crg,
                    item: Number(f.item),
                    itemNombre: f.itemnombre,
                    itemType: f.itemtype,
                    ubicacion: f.ubicacion ? Number(f.ubicacion) : null,
                    ubicacionNombre: f.ubicacionnombre,
                    conversion,
                    // Cantidades en unidad de la transacción
                    cantidad: numero(f.cantidad) / conversion,
                    despachada: numero(f.despachada) / conversion,
                    facturada: numero(f.facturada) / conversion,
                    precio: numero(f.precio) * conversion,
                    cerrada: f.cerrada === "T",
                    esLote: f.eslote === "T",
                    esSerie: f.esserie === "T"
                });
            }
        }
        return mapa;
    }

    /**
     * Ejecuciones (Item Fulfillment) vinculadas a cada línea de OV.
     * @param {string[]} pares - "idOrdenVenta|lineId"
     * @returns {Map<string, Array<{id: number, tranid: string, fecha: string, lineaEjecucion: string, cantidad: number, periodoCerrado: boolean}>>}
     *          clave = par; ordenadas de la más reciente a la más antigua
     */
    function obtenerEjecucionesPorLinea(pares) {
        const mapa = new Map();
        const unicos = [...new Set(pares)];
        for (const lote of enLotes(unicos)) {
            const consulta = `
                SELECT
                    ntl.previousdoc AS ov,
                    ntl.previousline AS lineid,
                    f.id AS ejecucion,
                    f.tranid AS tranid,
                    TO_CHAR(f.trandate, 'YYYY-MM-DD') AS fecha,
                    ntl.nextline AS lineaejecucion,
                    ABS(NVL(fl.quantity, 0)) AS cantidad,
                    NVL(u.conversionrate, 1) AS conversion,
                    CASE WHEN NVL(ap.closed, 'F') = 'T' OR NVL(ap.alllocked, 'F') = 'T' THEN 'T' ELSE 'F' END AS periodocerrado
                FROM NextTransactionLineLink ntl
                INNER JOIN transaction f ON f.id = ntl.nextdoc
                INNER JOIN transactionline fl ON fl.transaction = ntl.nextdoc AND fl.id = ntl.nextline
                LEFT JOIN unitsTypeUom u ON u.internalid = fl.units
                LEFT JOIN accountingperiod ap ON ap.id = f.postingperiod
                WHERE ntl.linktype = '${REGLAS.TIPO_VINCULO_EJECUCION}'
                  AND f.type = 'ItemShip'
                  AND TO_CHAR(ntl.previousdoc) || '|' || TO_CHAR(ntl.previousline) IN (${listaTexto(lote)})
                ORDER BY f.trandate DESC, f.id DESC
            `;
            for (const f of consultarTodo(consulta)) {
                const clave = `${f.ov}|${f.lineid}`;
                if (!mapa.has(clave)) mapa.set(clave, []);
                mapa.get(clave).push({
                    id: Number(f.ejecucion),
                    tranid: f.tranid,
                    fecha: f.fecha,
                    lineaEjecucion: String(f.lineaejecucion),
                    cantidad: numero(f.cantidad) / (numero(f.conversion) || 1),
                    periodoCerrado: f.periodocerrado === "T"
                });
            }
        }
        return mapa;
    }

    /** true si la OV tiene un registro Pendiente en la cola de autopicking del partner. */
    function tieneAutopickingPendiente(idOrdenVenta) {
        const consulta = `
            SELECT COUNT(*) AS total
            FROM ${COLA_AUTOPICKING.TIPO} q
            WHERE q.${COLA_AUTOPICKING.CAMPO_ORDEN_VENTA} = ?
              AND q.${COLA_AUTOPICKING.CAMPO_ESTADO} = ${Number(COLA_AUTOPICKING.ESTADO_PENDIENTE)}
              AND NVL(q.isinactive, 'F') = 'F'
        `;
        const filas = consultar(consulta, [Number(idOrdenVenta)]);
        return numero(filas[0] && filas[0].total) > 0;
    }

    /**
     * Línea de una OV por CRG_CORREL e ítem (se usa después de guardar para ubicar la línea nueva del reemplazo).
     * @returns {{lineId: string, cantidad: number, despachada: number, pendiente: number}|null}
     */
    function obtenerLineaPorCrgEItem(idOrdenVenta, crg, item) {
        const consulta = `
            SELECT
                tl.id AS lineid,
                ABS(NVL(tl.quantity, 0)) AS cantidad,
                ABS(NVL(tl.quantityshiprecv, 0)) AS despachada,
                NVL(u.conversionrate, 1) AS conversion
            FROM transactionline tl
            LEFT JOIN unitsTypeUom u ON u.internalid = tl.units
            WHERE tl.transaction = ?
              AND tl.mainline = 'F'
              AND tl.item = ?
              AND TO_CHAR(tl.${CAMPOS.IDENTIFICADOR_FILA}) = ?
            ORDER BY tl.id DESC
        `;
        const filas = consultar(consulta, [Number(idOrdenVenta), Number(item), String(crg)]);
        if (!filas.length) return null;
        const conversion = numero(filas[0].conversion) || 1;
        const cantidad = numero(filas[0].cantidad) / conversion;
        const despachada = numero(filas[0].despachada) / conversion;
        return { lineId: String(filas[0].lineid), cantidad, despachada, pendiente: Math.max(0, cantidad - despachada) };
    }

    // ── Escritura ──────────────────────────────────────────────────────────────

    const quitarDetalleLineaActual = (ov) => {
        try {
            if (ov.hasCurrentSublistSubrecord({ sublistId: SUBLISTA_ITEM, fieldId: CAMPO_DETALLE })) {
                ov.removeCurrentSublistSubrecord({ sublistId: SUBLISTA_ITEM, fieldId: CAMPO_DETALLE });
                return true;
            }
        } catch (e) {
            // La línea no admite detalle de inventario
        }
        return false;
    };

    const setSiExiste = (ov, fieldId, value) => {
        if (value === null || value === undefined || value === "") return;
        try {
            ov.setCurrentSublistValue({ sublistId: SUBLISTA_ITEM, fieldId, value });
        } catch (e) {
            nLog.debug({ title: `AS_NSP_037 - Campo de línea no aplicado: ${fieldId}`, details: e.message || e });
        }
    };

    const getSeguro = (ov, fieldId) => {
        try {
            return ov.getCurrentSublistValue({ sublistId: SUBLISTA_ITEM, fieldId });
        } catch (e) {
            return null;
        }
    };

    const fijarPrecio = (ov, precio) => {
        // Nivel de precio "Personalizado" (-1) para que NetSuite respete la tarifa informada
        try {
            ov.setCurrentSublistValue({ sublistId: SUBLISTA_ITEM, fieldId: "price", value: -1 });
        } catch (e) {
            // La cuenta no usa niveles de precio en esta línea
        }
        ov.setCurrentSublistValue({ sublistId: SUBLISTA_ITEM, fieldId: "rate", value: Number(precio) });
    };

    /**
     * Aplica todas las operaciones de una OV y la guarda una sola vez.
     *
     * @param {number} idOrdenVenta
     * @param {Array<object>} operaciones
     *        { tipo: 'QUITAR', lineId }
     *        { tipo: 'MODIFICAR', lineId, cantidad?: number, precio?: number }
     *        { tipo: 'REEMPLAZAR', lineId, nuevo: { item, cantidad, precio, crg } }  (cantidad 0 = solo quitar)
     * @returns {{ idOrdenVenta: number, detallesLimpiados: number }}
     * @throws {Error} si alguna línea no existe o NetSuite rechaza el guardado
     */
    function aplicarCambios(idOrdenVenta, operaciones) {
        const ov = record.load({ type: record.Type.SALES_ORDER, id: Number(idOrdenVenta), isDynamic: true });
        const porLinea = new Map(operaciones.map((op) => [String(op.lineId), op]));
        const aQuitar = new Set();
        const nuevas = [];
        const encontradas = new Set();
        let detallesLimpiados = 0;

        const total = ov.getLineCount({ sublistId: SUBLISTA_ITEM });
        for (let i = 0; i < total; i++) {
            ov.selectLine({ sublistId: SUBLISTA_ITEM, line: i });
            const lineId = String(ov.getCurrentSublistValue({ sublistId: SUBLISTA_ITEM, fieldId: "line" }));
            const op = porLinea.get(lineId);
            let modificada = quitarDetalleLineaActual(ov);
            if (modificada) detallesLimpiados++;

            if (op) {
                encontradas.add(lineId);
                if (op.tipo === "QUITAR") {
                    aQuitar.add(lineId);
                } else if (op.tipo === "REEMPLAZAR") {
                    aQuitar.add(lineId);
                    if (op.nuevo && Number(op.nuevo.cantidad) > EPS) {
                        // Se copian los datos de la línea original antes de quitarla
                        const copia = {};
                        for (const campo of CAMPOS.COPIAR_EN_REEMPLAZO) copia[campo] = getSeguro(ov, campo);
                        copia.location = getSeguro(ov, "location");
                        copia.inventorylocation = getSeguro(ov, "inventorylocation");
                        copia.taxcode = getSeguro(ov, "taxcode");
                        nuevas.push({ ...op.nuevo, copia });
                    }
                } else if (op.tipo === "MODIFICAR") {
                    if (op.cantidad !== undefined && op.cantidad !== null) {
                        ov.setCurrentSublistValue({ sublistId: SUBLISTA_ITEM, fieldId: "quantity", value: Number(op.cantidad) });
                    }
                    if (op.precio !== undefined && op.precio !== null) fijarPrecio(ov, op.precio);
                    modificada = true;
                }
            }
            if (modificada) ov.commitLine({ sublistId: SUBLISTA_ITEM });
        }

        const faltantes = operaciones.filter((op) => !encontradas.has(String(op.lineId)));
        if (faltantes.length) {
            throw new Error(`Líneas no encontradas en la OV: ${faltantes.map((f) => f.lineId).join(", ")}`);
        }

        // Líneas nuevas de los reemplazos (al final, para no desplazar índices)
        for (const n of nuevas) {
            ov.selectNewLine({ sublistId: SUBLISTA_ITEM });
            ov.setCurrentSublistValue({ sublistId: SUBLISTA_ITEM, fieldId: "item", value: Number(n.item) });
            setSiExiste(ov, "location", n.copia.location);
            setSiExiste(ov, "inventorylocation", n.copia.inventorylocation);
            ov.setCurrentSublistValue({ sublistId: SUBLISTA_ITEM, fieldId: "quantity", value: Number(n.cantidad) });
            fijarPrecio(ov, n.precio);
            for (const campo of CAMPOS.COPIAR_EN_REEMPLAZO) setSiExiste(ov, campo, n.copia[campo]);
            setSiExiste(ov, "taxcode", n.copia.taxcode);
            ov.setCurrentSublistValue({ sublistId: SUBLISTA_ITEM, fieldId: CAMPOS.IDENTIFICADOR_FILA, value: String(n.crg) });
            quitarDetalleLineaActual(ov);
            ov.commitLine({ sublistId: SUBLISTA_ITEM });
        }

        // Quitar líneas de abajo hacia arriba
        for (let i = ov.getLineCount({ sublistId: SUBLISTA_ITEM }) - 1; i >= 0; i--) {
            const lineId = String(ov.getSublistValue({ sublistId: SUBLISTA_ITEM, fieldId: "line", line: i }));
            if (aQuitar.has(lineId)) ov.removeLine({ sublistId: SUBLISTA_ITEM, line: i, ignoreRecalc: false });
        }

        ov.save({ enableSourcing: true, ignoreMandatoryFields: true });
        return { idOrdenVenta: Number(idOrdenVenta), detallesLimpiados };
    }

    return { buscarPorCuentas, obtenerLineasPorCrg, obtenerEjecucionesPorLinea, tieneAutopickingPendiente, obtenerLineaPorCrgEItem, aplicarCambios };
});
