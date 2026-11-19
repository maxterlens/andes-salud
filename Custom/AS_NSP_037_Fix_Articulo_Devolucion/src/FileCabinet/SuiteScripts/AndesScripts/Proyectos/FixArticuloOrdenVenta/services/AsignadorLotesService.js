/**
 * @NApiVersion 2.1
 * @NModuleScope SameAccount
 *
 * @description AS_NSP_037 - Asignación de lotes para aumentos y reemplazos.
 *              AsignadorInventario replica el de AS_NSP_031 (EjecucionOrdenService): reserva
 *              en orden FEFO llevando en memoria lo ya tomado, para que dos líneas no usen el
 *              mismo stock dos veces.
 *
 *              planificarEjecucionReemplazo decide la fecha de la Ejecución nueva:
 *               - La fecha de la Ejecución original, si su período está abierto y en esa fecha
 *                 había stock suficiente del artículo nuevo (saldo por lote a la fecha).
 *               - Si no, la fecha del día con el stock actual.
 */
define(["../constants/FixArticuloOrdenVentaConstants", "../repositories/InventarioRepository"], (CONST, inventarioRepo) => {
    const EPS = CONST.REGLAS.EPSILON;

    class AsignadorInventario {
        /** @param {Map<string, Array>} existencias - InventarioRepository.cargarExistencias */
        constructor(existencias) {
            this.existencias = existencias;
            this.consumo = new Map();
        }

        static claveFila(item, ubicacion, fila) {
            return `${item}|${ubicacion}|${fila.inventoryNumber || ""}|${fila.estado || ""}|${fila.bin || ""}`;
        }

        snapshot() {
            return new Map(this.consumo);
        }

        restaurar(snapshot) {
            this.consumo = snapshot;
        }

        /** Cantidad libre (unidad base) de un ítem en una ubicación. */
        libre(item, ubicacion) {
            const filas = this.existencias.get(`${item}|${ubicacion}`) || [];
            return filas.reduce((s, f) => s + Math.max(0, f.cantidad - (this.consumo.get(AsignadorInventario.claveFila(item, ubicacion, f)) || 0)), 0);
        }

        /**
         * Reserva hasta `cantidad` (unidad base) en orden FEFO.
         * @param {function} [tope] - (fila) => cantidad máxima utilizable de esa fila (p. ej. saldo a una fecha)
         * @returns {{ total: number, requiereDetalle: boolean, asignaciones: Array }}
         */
        reservar(item, ubicacion, cantidad, tope = null) {
            const filas = this.existencias.get(`${item}|${ubicacion}`) || [];
            const requiereDetalle = filas.some((f) => f.inventoryNumber || f.estado || f.bin);
            const asignaciones = [];
            let restante = parseFloat(cantidad) || 0;

            for (const fila of filas) {
                if (restante <= EPS) break;
                const clave = AsignadorInventario.claveFila(item, ubicacion, fila);
                const usado = this.consumo.get(clave) || 0;
                let libre = fila.cantidad - usado;
                if (tope) libre = Math.min(libre, Math.max(0, tope(fila) - usado));
                if (libre <= EPS) continue;

                const tomar = Math.min(libre, restante);
                this.consumo.set(clave, usado + tomar);
                restante -= tomar;
                asignaciones.push({ inventoryNumber: fila.inventoryNumber, lote: fila.lote, estado: fila.estado, bin: fila.bin, cantidad: tomar });
            }

            const total = asignaciones.reduce((s, a) => s + a.cantidad, 0);
            return { total, requiereDetalle, asignaciones };
        }
    }

    /** Crea un asignador con las existencias actuales de los artículos/ubicaciones. */
    function crearAsignador(itemIds, ubicacionIds, idOrdenVenta = 0) {
        return new AsignadorInventario(inventarioRepo.cargarExistencias(itemIds, ubicacionIds, idOrdenVenta));
    }

    const aFecha = (iso) => {
        const [a, m, d] = String(iso).split("-").map(Number);
        return new Date(a, m - 1, d);
    };

    /**
     * Reserva el stock de la línea nueva de un reemplazo y decide la fecha de su Ejecución.
     *
     * @param {object} p
     * @param {AsignadorInventario} p.asignador
     * @param {number} p.item
     * @param {number} p.ubicacion
     * @param {number} p.cantidadBase - unidad base
     * @param {boolean} p.esLote
     * @param {string|null} p.fechaOriginal - YYYY-MM-DD de la Ejecución original (null si no hay)
     * @returns {{ ok: boolean, fecha: Date|null, fechaTexto: string, requiereDetalle: boolean, asignaciones: Array, motivoFecha: string }}
     */
    function planificarEjecucionReemplazo({ asignador, item, ubicacion, cantidadBase, esLote, fechaOriginal }) {
        let motivoFecha = "";

        if (fechaOriginal) {
            if (!inventarioRepo.periodoAbiertoEn(fechaOriginal)) {
                motivoFecha = `período de ${fechaOriginal} cerrado`;
            } else {
                const saldos = inventarioRepo.obtenerSaldosALaFecha(item, ubicacion, fechaOriginal, esLote);
                const respaldo = asignador.snapshot();
                // Sin lote: el tope es el saldo total a la fecha, que se reparte entre las filas en orden
                let saldoSinLote = saldos.get("SIN_LOTE") || 0;
                const tope = esLote
                    ? (fila) => (fila.inventoryNumber ? Math.max(0, saldos.get(String(fila.inventoryNumber)) || 0) : 0)
                    : (fila) => {
                          const t = Math.max(0, saldoSinLote);
                          saldoSinLote -= Math.min(t, fila.cantidad);
                          return t;
                      };
                const reserva = asignador.reservar(item, ubicacion, cantidadBase, tope);
                if (reserva.total + EPS >= cantidadBase) {
                    return { ok: true, fecha: aFecha(fechaOriginal), fechaTexto: fechaOriginal, requiereDetalle: reserva.requiereDetalle, asignaciones: reserva.asignaciones, motivoFecha: "fecha de la Ejecución original" };
                }
                asignador.restaurar(respaldo);
                motivoFecha = `sin stock suficiente al ${fechaOriginal}`;
            }
        } else {
            motivoFecha = "sin Ejecución original";
        }

        const reserva = asignador.reservar(item, ubicacion, cantidadBase);
        if (reserva.total + EPS < cantidadBase) {
            return { ok: false, fecha: null, fechaTexto: "", requiereDetalle: reserva.requiereDetalle, asignaciones: reserva.asignaciones, motivoFecha };
        }
        return { ok: true, fecha: null, fechaTexto: "fecha del día", requiereDetalle: reserva.requiereDetalle, asignaciones: reserva.asignaciones, motivoFecha: `fecha del día (${motivoFecha})` };
    }

    return { AsignadorInventario, crearAsignador, planificarEjecucionReemplazo };
});
