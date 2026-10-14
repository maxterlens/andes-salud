/**
 * @NApiVersion 2.1
 * @NModuleScope SameAccount
 *
 * @description AS_NSP_031 - Librería propia para crear Ejecuciones de Orden de Artículo
 *              (Item Fulfillment) desde una Orden de Venta, con asignación de inventario
 *              FEFO por lote/estado/bin.
 *
 *              Reglas de negocio:
 *               - Una Ejecución por ubicación (y por fecha de línea, si así se configura).
 *               - Ubicación marcada como autopicking: Ejecución en estado Enviado y con
 *                 el check de auto-selección marcado.
 *               - Se ejecuta lo que el stock permita: si el stock no cubre toda la línea,
 *                 se ejecuta la parte disponible y el resto queda pendiente.
 *               - El consumo de lotes se controla en memoria para que dos líneas o dos
 *                 Ejecuciones de la misma OV no tomen el mismo stock dos veces.
 */
define(["N/record", "N/log", "../constants/AutopickingConstants"], (record, nLog, CONST) => {
    const { REGLAS, CAMPOS } = CONST;
    const EPS = REGLAS.EPSILON;
    const SUBLISTA_ITEM = "item";
    const SUBLISTA_INV = "inventoryassignment";
    const CAMPO_DETALLE = "inventorydetail";

    /**
     * Controla qué cantidad de cada lote/estado/bin ya fue tomada dentro de la OV.
     */
    class AsignadorInventario {
        /** @param {Map<string, Array>} existencias - resultado de InventarioRepository.cargarExistencias */
        constructor(existencias) {
            this.existencias = existencias;
            this.consumo = new Map();
        }

        static claveFila(item, ubicacion, fila) {
            return `${item}|${ubicacion}|${fila.inventoryNumber || ""}|${fila.estado || ""}|${fila.bin || ""}`;
        }

        /** Copia del consumo actual, para revertir si una Ejecución no se guarda. */
        snapshot() {
            return new Map(this.consumo);
        }

        restaurar(snapshot) {
            this.consumo = snapshot;
        }

        /**
         * Reserva hasta `cantidad` unidades del ítem en la ubicación, en orden FEFO.
         * @returns {{ total: number, requiereDetalle: boolean, asignaciones: Array }}
         */
        reservar(item, ubicacion, cantidad) {
            const filas = this.existencias.get(`${item}|${ubicacion}`) || [];
            const requiereDetalle = filas.some((f) => f.inventoryNumber || f.estado || f.bin);
            const asignaciones = [];
            let restante = parseFloat(cantidad) || 0;

            for (const fila of filas) {
                if (restante <= EPS) break;
                const clave = AsignadorInventario.claveFila(item, ubicacion, fila);
                const usado = this.consumo.get(clave) || 0;
                const libre = fila.cantidad - usado;
                if (libre <= EPS) continue;

                const tomar = Math.min(libre, restante);
                this.consumo.set(clave, usado + tomar);
                restante -= tomar;
                asignaciones.push({
                    inventoryNumber: fila.inventoryNumber,
                    lote: fila.lote,
                    estado: fila.estado,
                    bin: fila.bin,
                    cantidad: tomar
                });
            }

            const total = asignaciones.reduce((s, a) => s + a.cantidad, 0);
            return { total, requiereDetalle, asignaciones };
        }
    }

    // ── Helpers de sublista ────────────────────────────────────────────────────

    const quitarDetalle = (ejecucion) => {
        try {
            if (ejecucion.hasCurrentSublistSubrecord({ sublistId: SUBLISTA_ITEM, fieldId: CAMPO_DETALLE })) {
                ejecucion.removeCurrentSublistSubrecord({ sublistId: SUBLISTA_ITEM, fieldId: CAMPO_DETALLE });
            }
        } catch (e) {
            // La línea no admite detalle de inventario: no hay nada que quitar
        }
    };

    const desmarcarLinea = (ejecucion) => {
        quitarDetalle(ejecucion);
        ejecucion.setCurrentSublistValue({ sublistId: SUBLISTA_ITEM, fieldId: "itemreceive", value: false });
        ejecucion.commitLine({ sublistId: SUBLISTA_ITEM });
    };

    const escribirDetalle = (ejecucion, asignaciones) => {
        const detalle = ejecucion.getCurrentSublistSubrecord({ sublistId: SUBLISTA_ITEM, fieldId: CAMPO_DETALLE });
        for (let j = detalle.getLineCount({ sublistId: SUBLISTA_INV }) - 1; j >= 0; j--) {
            detalle.removeLine({ sublistId: SUBLISTA_INV, line: j, ignoreRecalc: true });
        }
        for (const a of asignaciones) {
            detalle.selectNewLine({ sublistId: SUBLISTA_INV });
            if (a.inventoryNumber) detalle.setCurrentSublistValue({ sublistId: SUBLISTA_INV, fieldId: "issueinventorynumber", value: a.inventoryNumber });
            if (a.bin) detalle.setCurrentSublistValue({ sublistId: SUBLISTA_INV, fieldId: "binnumber", value: a.bin });
            if (a.estado) detalle.setCurrentSublistValue({ sublistId: SUBLISTA_INV, fieldId: "inventorystatus", value: a.estado });
            detalle.setCurrentSublistValue({ sublistId: SUBLISTA_INV, fieldId: "quantity", value: a.cantidad });
            detalle.commitLine({ sublistId: SUBLISTA_INV });
        }
    };

    const resumenLotes = (asignaciones) => asignaciones.map((a) => `${a.lote || "sin lote"}:${a.cantidad}`).join(", ");

    /**
     * Calcula, sin crear nada, cuánto se podría ejecutar de cada línea (modo simulación).
     *
     * @param {Array} lineas - líneas pendientes de un mismo grupo
     * @param {AsignadorInventario} asignador
     * @returns {Array} resultado por línea
     */
    function simular(lineas, asignador) {
        return lineas.map((l) => {
            const reserva = asignador.reservar(l.item, l.ubicacion, l.pendiente);
            return {
                lineId: l.lineId,
                asignado: reserva.total,
                lotes: resumenLotes(reserva.asignaciones),
                motivo: reserva.total + EPS < l.pendiente ? "Stock insuficiente" : null
            };
        });
    }

    /**
     * Crea una Ejecución de Orden de Artículo para las líneas indicadas, todas de la misma ubicación.
     *
     * @param {object} p
     * @param {number} p.idOrdenVenta
     * @param {number} p.ubicacion
     * @param {boolean} p.esAutopicking
     * @param {Array}  p.lineas       - líneas pendientes (OrdenVentaRepository.obtenerLineasPendientes)
     * @param {Date|null} p.fecha     - fecha de la Ejecución; null = fecha del día
     * @param {AsignadorInventario} p.asignador
     * @returns {{ idEjecucion: number|null, lineas: Array }}
     * @throws {Error} si NetSuite rechaza el guardado (el consumo reservado se revierte)
     */
    function crearEjecucion({ idOrdenVenta, ubicacion, esAutopicking, lineas, fecha, asignador }) {
        const respaldoConsumo = asignador.snapshot();
        const porLinea = new Map(lineas.map((l) => [String(l.lineId), l]));
        const resultados = [];

        try {
            const ejecucion = record.transform({
                fromType: record.Type.SALES_ORDER,
                fromId: Number(idOrdenVenta),
                toType: record.Type.ITEM_FULFILLMENT,
                isDynamic: true,
                defaultValues: { inventorylocation: Number(ubicacion) }
            });

            if (fecha) ejecucion.setValue({ fieldId: "trandate", value: fecha });
            if (esAutopicking) {
                ejecucion.setValue({ fieldId: "shipstatus", value: CAMPOS.IF_ESTADO_ENVIADO });
                ejecucion.setValue({ fieldId: CAMPOS.IF_AUTO_SELECCION, value: true });
            }

            let lineasMarcadas = 0;
            const totalLineas = ejecucion.getLineCount({ sublistId: SUBLISTA_ITEM }) || 0;

            for (let i = 0; i < totalLineas; i++) {
                ejecucion.selectLine({ sublistId: SUBLISTA_ITEM, line: i });
                const orderLine = String(ejecucion.getCurrentSublistValue({ sublistId: SUBLISTA_ITEM, fieldId: "orderline" }));
                const linea = porLinea.get(orderLine);

                if (!linea) {
                    desmarcarLinea(ejecucion);
                    continue;
                }

                const restanteEjecucion = parseFloat(ejecucion.getCurrentSublistValue({ sublistId: SUBLISTA_ITEM, fieldId: "quantityremaining" }));
                const objetivo = isNaN(restanteEjecucion) ? linea.pendiente : Math.min(linea.pendiente, restanteEjecucion);
                const reserva = asignador.reservar(linea.item, ubicacion, objetivo);

                if (reserva.total <= EPS) {
                    desmarcarLinea(ejecucion);
                    resultados.push({ lineId: linea.lineId, asignado: 0, lotes: "", motivo: "Sin stock disponible" });
                    continue;
                }

                ejecucion.setCurrentSublistValue({ sublistId: SUBLISTA_ITEM, fieldId: "itemreceive", value: true });
                ejecucion.setCurrentSublistValue({ sublistId: SUBLISTA_ITEM, fieldId: "quantity", value: reserva.total });
                if (reserva.requiereDetalle || linea.esLote || linea.esSerie) {
                    escribirDetalle(ejecucion, reserva.asignaciones);
                }
                ejecucion.commitLine({ sublistId: SUBLISTA_ITEM });
                lineasMarcadas++;

                resultados.push({
                    lineId: linea.lineId,
                    asignado: reserva.total,
                    lotes: resumenLotes(reserva.asignaciones),
                    motivo: reserva.total + EPS < objetivo ? "Stock insuficiente (ejecución parcial)" : null
                });
            }

            // Líneas pedidas que no aparecieron en la transformación (ej. ya no pendientes en NetSuite)
            for (const linea of lineas) {
                if (!resultados.some((r) => r.lineId === linea.lineId)) {
                    resultados.push({ lineId: linea.lineId, asignado: 0, lotes: "", motivo: "La línea no está disponible para ejecutar en NetSuite" });
                }
            }

            if (lineasMarcadas === 0) {
                asignador.restaurar(respaldoConsumo);
                return { idEjecucion: null, lineas: resultados };
            }

            const idEjecucion = ejecucion.save({ enableSourcing: true, ignoreMandatoryFields: true });
            nLog.audit({ title: `AS_NSP_031 - Ejecución creada OV ${idOrdenVenta}`, details: `IF ${idEjecucion} | Ubicación ${ubicacion} | Líneas ${lineasMarcadas}` });
            return { idEjecucion, lineas: resultados };
        } catch (e) {
            asignador.restaurar(respaldoConsumo);
            throw e;
        }
    }

    return { AsignadorInventario, crearEjecucion, simular };
});
