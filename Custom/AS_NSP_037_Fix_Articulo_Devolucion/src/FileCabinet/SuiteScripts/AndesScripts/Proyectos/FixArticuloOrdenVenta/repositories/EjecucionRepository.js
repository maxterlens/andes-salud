/**
 * @NApiVersion 2.1
 * @NModuleScope SameAccount
 *
 * @description AS_NSP_037 - Escritura de Ejecuciones de Orden de Artículo (Item Fulfillment).
 *
 *              Replica, con código propio, la lógica del partner (2WIN_INTEG):
 *               - ItemFulfillmentDao.removeLine: desmarcar la línea por `orderline`, quitar su
 *                 detalle de inventario y eliminar la Ejecución si no le quedan líneas recibidas.
 *              y la creación de Ejecuciones de AS_NSP_031 (EjecucionOrdenService.crearEjecucion).
 *
 *              Reducciones: se baja el detalle de inventario desde el último lote asignado (LIFO),
 *              en proporción a la cantidad de la línea, para no depender de la unidad de medida.
 */
define(["N/record", "N/search", "N/log", "../constants/FixArticuloOrdenVentaConstants", "../utils/SuiteQLUtils"], (record, search, nLog, CONST, sql) => {
    const { REGLAS, CAMPOS } = CONST;
    const EPS = REGLAS.EPSILON;
    const SUBLISTA_ITEM = "item";
    const SUBLISTA_INV = "inventoryassignment";
    const CAMPO_DETALLE = "inventorydetail";

    const redondear = (n) => Math.round(Number(n) * 100000) / 100000;
    const esVerdadero = (v) => v === true || v === "T";

    const quitarDetalle = (ejecucion) => {
        try {
            if (ejecucion.hasCurrentSublistSubrecord({ sublistId: SUBLISTA_ITEM, fieldId: CAMPO_DETALLE })) {
                ejecucion.removeCurrentSublistSubrecord({ sublistId: SUBLISTA_ITEM, fieldId: CAMPO_DETALLE });
            }
        } catch (e) {
            // La línea no admite detalle de inventario
        }
    };

    const tieneDetalle = (ejecucion) => {
        try {
            return ejecucion.hasCurrentSublistSubrecord({ sublistId: SUBLISTA_ITEM, fieldId: CAMPO_DETALLE });
        } catch (e) {
            return false;
        }
    };

    const leerAsignaciones = (detalle) => {
        const filas = [];
        const total = detalle.getLineCount({ sublistId: SUBLISTA_INV });
        for (let j = 0; j < total; j++) {
            filas.push({
                indice: j,
                inventoryNumber: detalle.getSublistValue({ sublistId: SUBLISTA_INV, fieldId: "issueinventorynumber", line: j }),
                lote: detalle.getSublistText({ sublistId: SUBLISTA_INV, fieldId: "issueinventorynumber", line: j }),
                estado: detalle.getSublistValue({ sublistId: SUBLISTA_INV, fieldId: "inventorystatus", line: j }),
                bin: detalle.getSublistValue({ sublistId: SUBLISTA_INV, fieldId: "binnumber", line: j }),
                cantidad: parseFloat(detalle.getSublistValue({ sublistId: SUBLISTA_INV, fieldId: "quantity", line: j }) || 0)
            });
        }
        return filas;
    };

    /**
     * Baja el detalle de inventario de la línea actual en `reduccion` unidades del detalle,
     * desde el último lote hacia el primero (LIFO).
     * @returns {string[]} lotes afectados ("lote:-cantidad")
     */
    const reducirDetalleLifo = (ejecucion, factor) => {
        const detalle = ejecucion.getCurrentSublistSubrecord({ sublistId: SUBLISTA_ITEM, fieldId: CAMPO_DETALLE });
        const filas = leerAsignaciones(detalle);
        const totalDetalle = filas.reduce((s, f) => s + f.cantidad, 0);
        let porReducir = redondear(totalDetalle * factor);
        const afectados = [];

        for (let j = filas.length - 1; j >= 0 && porReducir > EPS; j--) {
            const f = filas[j];
            const tomar = Math.min(f.cantidad, porReducir);
            if (f.cantidad - tomar <= EPS) {
                detalle.removeLine({ sublistId: SUBLISTA_INV, line: j, ignoreRecalc: true });
            } else {
                detalle.selectLine({ sublistId: SUBLISTA_INV, line: j });
                detalle.setCurrentSublistValue({ sublistId: SUBLISTA_INV, fieldId: "quantity", value: redondear(f.cantidad - tomar) });
                detalle.commitLine({ sublistId: SUBLISTA_INV });
            }
            porReducir = redondear(porReducir - tomar);
            afectados.push(`${f.lote || "sin lote"}:-${redondear(tomar)}`);
        }
        return afectados;
    };

    /** Agrega asignaciones al detalle de la línea actual, sumando sobre el mismo lote/estado/bin si ya existe. */
    const agregarDetalle = (ejecucion, asignaciones) => {
        const detalle = ejecucion.getCurrentSublistSubrecord({ sublistId: SUBLISTA_ITEM, fieldId: CAMPO_DETALLE });
        const filas = leerAsignaciones(detalle);
        for (const a of asignaciones) {
            const existente = filas.find(
                (f) => String(f.inventoryNumber || "") === String(a.inventoryNumber || "") && String(f.estado || "") === String(a.estado || "") && String(f.bin || "") === String(a.bin || "")
            );
            if (existente) {
                detalle.selectLine({ sublistId: SUBLISTA_INV, line: existente.indice });
                existente.cantidad = redondear(existente.cantidad + a.cantidad);
                detalle.setCurrentSublistValue({ sublistId: SUBLISTA_INV, fieldId: "quantity", value: existente.cantidad });
            } else {
                detalle.selectNewLine({ sublistId: SUBLISTA_INV });
                if (a.inventoryNumber) detalle.setCurrentSublistValue({ sublistId: SUBLISTA_INV, fieldId: "issueinventorynumber", value: a.inventoryNumber });
                if (a.bin) detalle.setCurrentSublistValue({ sublistId: SUBLISTA_INV, fieldId: "binnumber", value: a.bin });
                if (a.estado) detalle.setCurrentSublistValue({ sublistId: SUBLISTA_INV, fieldId: "inventorystatus", value: a.estado });
                detalle.setCurrentSublistValue({ sublistId: SUBLISTA_INV, fieldId: "quantity", value: redondear(a.cantidad) });
            }
            detalle.commitLine({ sublistId: SUBLISTA_INV });
        }
    };

    const escribirDetalleNuevo = (ejecucion, asignaciones) => {
        const detalle = ejecucion.getCurrentSublistSubrecord({ sublistId: SUBLISTA_ITEM, fieldId: CAMPO_DETALLE });
        for (let j = detalle.getLineCount({ sublistId: SUBLISTA_INV }) - 1; j >= 0; j--) {
            detalle.removeLine({ sublistId: SUBLISTA_INV, line: j, ignoreRecalc: true });
        }
        for (const a of asignaciones) {
            detalle.selectNewLine({ sublistId: SUBLISTA_INV });
            if (a.inventoryNumber) detalle.setCurrentSublistValue({ sublistId: SUBLISTA_INV, fieldId: "issueinventorynumber", value: a.inventoryNumber });
            if (a.bin) detalle.setCurrentSublistValue({ sublistId: SUBLISTA_INV, fieldId: "binnumber", value: a.bin });
            if (a.estado) detalle.setCurrentSublistValue({ sublistId: SUBLISTA_INV, fieldId: "inventorystatus", value: a.estado });
            detalle.setCurrentSublistValue({ sublistId: SUBLISTA_INV, fieldId: "quantity", value: redondear(a.cantidad) });
            detalle.commitLine({ sublistId: SUBLISTA_INV });
        }
    };

    const resumenLotes = (asignaciones) => asignaciones.map((a) => `${a.lote || "sin lote"}:${redondear(a.cantidad)}`).join(", ");

    /**
     * Ajusta líneas de una Ejecución a una nueva cantidad (0 = desmarcar la línea).
     * Si no quedan líneas recibidas, elimina la Ejecución (mismo criterio que removeLine del partner).
     *
     * @param {number} idEjecucion
     * @param {Map<string, number>} cambios - orderline (lineId de la OV) -> nueva cantidad en la Ejecución
     * @returns {{ eliminada: boolean, lineas: Map<string, {antes: number, despues: number, lotes: string[]}> }}
     */
    function ajustarLineas(idEjecucion, cambios) {
        const ejecucion = record.load({ type: record.Type.ITEM_FULFILLMENT, id: Number(idEjecucion), isDynamic: true });
        const total = ejecucion.getLineCount({ sublistId: SUBLISTA_ITEM });
        const resultado = new Map();
        let recibidas = 0;

        for (let i = 0; i < total; i++) {
            ejecucion.selectLine({ sublistId: SUBLISTA_ITEM, line: i });
            const orderLine = String(ejecucion.getCurrentSublistValue({ sublistId: SUBLISTA_ITEM, fieldId: "orderline" }));
            const recibida = esVerdadero(ejecucion.getCurrentSublistValue({ sublistId: SUBLISTA_ITEM, fieldId: "itemreceive" }));

            if (!cambios.has(orderLine)) {
                if (recibida) recibidas++;
                continue;
            }

            const actual = parseFloat(ejecucion.getCurrentSublistValue({ sublistId: SUBLISTA_ITEM, fieldId: "quantity" }) || 0);
            const nueva = Math.max(0, Number(cambios.get(orderLine)));

            if (nueva <= EPS) {
                quitarDetalle(ejecucion);
                ejecucion.setCurrentSublistValue({ sublistId: SUBLISTA_ITEM, fieldId: "itemreceive", value: false });
                ejecucion.commitLine({ sublistId: SUBLISTA_ITEM });
                resultado.set(orderLine, { antes: actual, despues: 0, lotes: [] });
                continue;
            }

            let lotes = [];
            if (nueva + EPS < actual) {
                const factor = (actual - nueva) / actual;
                ejecucion.setCurrentSublistValue({ sublistId: SUBLISTA_ITEM, fieldId: "quantity", value: redondear(nueva) });
                if (tieneDetalle(ejecucion)) lotes = reducirDetalleLifo(ejecucion, factor);
                ejecucion.commitLine({ sublistId: SUBLISTA_ITEM });
            }
            recibidas++;
            resultado.set(orderLine, { antes: actual, despues: nueva, lotes });
        }

        const faltantes = [...cambios.keys()].filter((k) => !resultado.has(k));
        if (faltantes.length) throw new Error(`La Ejecución ${idEjecucion} no tiene las líneas de OV ${faltantes.join(", ")}`);

        if (recibidas === 0) {
            record.delete({ type: record.Type.ITEM_FULFILLMENT, id: Number(idEjecucion) });
            nLog.audit({ title: "AS_NSP_037 - Ejecución eliminada", details: `IF ${idEjecucion}: no quedaron líneas recibidas` });
            return { eliminada: true, lineas: resultado };
        }

        ejecucion.save({ enableSourcing: true, ignoreMandatoryFields: true });
        return { eliminada: false, lineas: resultado };
    }

    /**
     * Sube la cantidad de una línea en una Ejecución existente, agregando los lotes indicados.
     * @param {number} idEjecucion
     * @param {string} orderLine - lineId de la OV
     * @param {number} nuevaCantidad - unidad de la transacción
     * @param {Array} asignaciones - lotes a agregar (AsignadorLotesService), en unidades del detalle
     * @returns {{ antes: number, despues: number, lotes: string }}
     */
    function aumentarLinea(idEjecucion, orderLine, nuevaCantidad, asignaciones) {
        const ejecucion = record.load({ type: record.Type.ITEM_FULFILLMENT, id: Number(idEjecucion), isDynamic: true });
        const total = ejecucion.getLineCount({ sublistId: SUBLISTA_ITEM });

        for (let i = 0; i < total; i++) {
            ejecucion.selectLine({ sublistId: SUBLISTA_ITEM, line: i });
            if (String(ejecucion.getCurrentSublistValue({ sublistId: SUBLISTA_ITEM, fieldId: "orderline" })) !== String(orderLine)) continue;

            const actual = parseFloat(ejecucion.getCurrentSublistValue({ sublistId: SUBLISTA_ITEM, fieldId: "quantity" }) || 0);
            ejecucion.setCurrentSublistValue({ sublistId: SUBLISTA_ITEM, fieldId: "quantity", value: redondear(nuevaCantidad) });
            if (asignaciones && asignaciones.length) agregarDetalle(ejecucion, asignaciones);
            ejecucion.commitLine({ sublistId: SUBLISTA_ITEM });
            ejecucion.save({ enableSourcing: true, ignoreMandatoryFields: true });
            return { antes: actual, despues: nuevaCantidad, lotes: resumenLotes(asignaciones || []) };
        }
        throw new Error(`La Ejecución ${idEjecucion} no tiene la línea de OV ${orderLine}`);
    }

    /**
     * Crea una Ejecución solo para una línea de la OV (réplica de AS_NSP_031 crearEjecucion).
     * @param {object} p
     * @param {number} p.idOrdenVenta
     * @param {string} p.lineId
     * @param {number} p.ubicacion
     * @param {number} p.cantidad - unidad de la transacción
     * @param {Date|null} p.fecha - null = fecha del día
     * @param {boolean} p.esAutopicking
     * @param {boolean} p.requiereDetalle
     * @param {Array} p.asignaciones
     * @returns {{ idEjecucion: number, tranid: string|null, lotes: string }}
     */
    function crearParaLinea({ idOrdenVenta, lineId, ubicacion, cantidad, fecha, esAutopicking, requiereDetalle, asignaciones }) {
        const ejecucion = record.transform({
            fromType: record.Type.SALES_ORDER,
            fromId: Number(idOrdenVenta),
            toType: record.Type.ITEM_FULFILLMENT,
            isDynamic: true,
            defaultValues: ubicacion ? { inventorylocation: Number(ubicacion) } : undefined
        });

        if (fecha) ejecucion.setValue({ fieldId: "trandate", value: fecha });
        if (esAutopicking) {
            ejecucion.setValue({ fieldId: "shipstatus", value: CAMPOS.IF_ESTADO_ENVIADO });
            ejecucion.setValue({ fieldId: CAMPOS.IF_AUTO_SELECCION, value: true });
        }

        let marcada = false;
        const total = ejecucion.getLineCount({ sublistId: SUBLISTA_ITEM }) || 0;
        for (let i = 0; i < total; i++) {
            ejecucion.selectLine({ sublistId: SUBLISTA_ITEM, line: i });
            const orderLine = String(ejecucion.getCurrentSublistValue({ sublistId: SUBLISTA_ITEM, fieldId: "orderline" }));
            if (orderLine !== String(lineId)) {
                quitarDetalle(ejecucion);
                ejecucion.setCurrentSublistValue({ sublistId: SUBLISTA_ITEM, fieldId: "itemreceive", value: false });
                ejecucion.commitLine({ sublistId: SUBLISTA_ITEM });
                continue;
            }
            ejecucion.setCurrentSublistValue({ sublistId: SUBLISTA_ITEM, fieldId: "itemreceive", value: true });
            ejecucion.setCurrentSublistValue({ sublistId: SUBLISTA_ITEM, fieldId: "quantity", value: redondear(cantidad) });
            if (requiereDetalle) escribirDetalleNuevo(ejecucion, asignaciones || []);
            ejecucion.commitLine({ sublistId: SUBLISTA_ITEM });
            marcada = true;
        }

        if (!marcada) throw new Error(`La línea ${lineId} no está disponible para ejecutar en la OV ${idOrdenVenta}`);

        const idEjecucion = ejecucion.save({ enableSourcing: true, ignoreMandatoryFields: true });
        let tranid = null;
        try {
            tranid = search.lookupFields({ type: search.Type.ITEM_FULFILLMENT, id: Number(idEjecucion), columns: ["tranid"] }).tranid || null;
        } catch (e) {
            tranid = null;
        }
        return { idEjecucion: Number(idEjecucion), tranid, lotes: resumenLotes(asignaciones || []) };
    }

    /** Cantidad actual (unidad de la transacción) de una línea de OV en una Ejecución; null si ya no está vinculada. */
    function obtenerCantidadLinea(idEjecucion, idOrdenVenta, lineId) {
        const consulta = `
            SELECT ABS(NVL(fl.quantity, 0)) AS cantidad, NVL(u.conversionrate, 1) AS conversion
            FROM NextTransactionLineLink ntl
            INNER JOIN transactionline fl ON fl.transaction = ntl.nextdoc AND fl.id = ntl.nextline
            LEFT JOIN unitsTypeUom u ON u.internalid = fl.units
            WHERE ntl.nextdoc = ? AND ntl.previousdoc = ? AND ntl.previousline = ?
              AND ntl.linktype = '${REGLAS.TIPO_VINCULO_EJECUCION}'
        `;
        const filas = sql.consultar(consulta, [Number(idEjecucion), Number(idOrdenVenta), Number(lineId)]);
        if (!filas.length) return null;
        return parseFloat(filas[0].cantidad || 0) / (parseFloat(filas[0].conversion) || 1);
    }

    return { ajustarLineas, aumentarLinea, crearParaLinea, obtenerCantidadLinea };
});
