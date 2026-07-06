/**
 * @NApiVersion 2.1
 * @NModuleScope SameAccount
 * @file OrdenTrasladoService.js
 * @description Lógica de negocio para la asignación de lotes FEFO en Orden de Traslado.
 *              Orquesta validaciones, cálculo del plan y delegación al OrdenTrasladoRepository.
 *              No accede directamente a N/record ni N/search.
 */
define([
    '../repositories/OrdenTrasladoRepository',
    '../repositories/CRLogAsignacionLoteOTRepository'
], (OrdenTrasladoRepository, CRLogAsignacionLoteOTRepository) => {

    // ─── Estados válidos de la OT ─────────────────────────────────────────────
    const ESTADOS_PERMITIDOS   = ['pendingFulfillment', 'partiallyFulfilled'];

    // ─── Estados de línea ─────────────────────────────────────────────────────
    const ESTADO_COMPLETE = 'COMPLETE';
    const ESTADO_PARTIAL  = 'PARTIAL';
    const ESTADO_NO_STOCK = 'NO_STOCK';
    const ESTADO_SKIPPED  = 'SKIPPED';
    const ESTADO_NO_LOT   = 'NO_LOT';

    // ─── Estados del log ──────────────────────────────────────────────────────
    const LOG_COMPLETE = 'COMPLETE';
    const LOG_PARTIAL  = 'PARTIAL';
    const LOG_NO_STOCK = 'NO_STOCK';
    const LOG_ERROR    = 'ERROR';

    // ─────────────────────────────────────────────────────────────────────────
    // PUNTO DE ENTRADA
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Ejecuta el proceso completo de asignación de lotes FEFO.
     * @param {{ ordenTrasladoId: string|number, userId: string|number }} params
     * @returns {{ ok: boolean, status: string, counters: Object, detalle: string, lineasConProblema: Array, error: string|null }}
     */
    const asignarDetalleInventario = ({ ordenTrasladoId, userId }) => {
        let toRecord;

        try {
            // ── 1. Cargar OT ──────────────────────────────────────────────────
            toRecord = OrdenTrasladoRepository.cargarOrdenTraslado(ordenTrasladoId);

            // ── 2. Validar estado ─────────────────────────────────────────────
            const estado = toRecord.getValue({ fieldId: 'statusRef' });
            if (!ESTADOS_PERMITIDOS.includes(estado)) {
                return _respuestaError(
                    ordenTrasladoId, userId,
                    `Estado de OT no permitido: '${estado}'. Se requiere Pending Fulfillment o Partially Fulfilled.`
                );
            }

            const locationId = toRecord.getValue({ fieldId: 'location' });

            // ── 3. Leer líneas ────────────────────────────────────────────────
            const lineas = OrdenTrasladoRepository.leerLineasOrdenTraslado(toRecord);
            if (!lineas || lineas.length === 0) {
                return _respuestaError(ordenTrasladoId, userId, 'La OT no tiene líneas de ítem.');
            }

            // ── 4. Verificar ítems con control de lote (batch) ────────────────
            const itemIdsUnicos  = [...new Set(lineas.map(l => l.itemId).filter(Boolean))];
            const mapaEsLoteItem = OrdenTrasladoRepository.verificarItemsConLoteEnLote(itemIdsUnicos);

            // ── 5. Obtener lotes disponibles (batch, solo lot-tracked items) ──
            const itemIdsConLote  = itemIdsUnicos.filter(id => mapaEsLoteItem[id]);
            const mapaLotesGlobal = itemIdsConLote.length > 0
                ? OrdenTrasladoRepository.obtenerLotesDisponiblesEnLote(itemIdsConLote, locationId)
                : {};

            // Stock mutable — copia profunda para decrementar conforme se asigna
            const stockDisponible = _copiarStockMapa(mapaLotesGlobal);

            // ── 6. Calcular plan línea por línea ──────────────────────────────
            const planLineas        = [];
            const detalleLineas     = [];
            const lineasConProblema = [];
            const counters          = { total: lineas.length, complete: 0, partial: 0, noStock: 0, skipped: 0 };

            lineas.forEach((linea) => {
                const resultado = _procesarLinea(linea, mapaEsLoteItem, stockDisponible);
                _contarResultado(resultado.estadoLinea, counters);
                detalleLineas.push(_formatearDetalleLinea(linea, resultado));

                if (resultado.estadoLinea === ESTADO_PARTIAL || resultado.estadoLinea === ESTADO_NO_STOCK) {
                    const qtyTotal = linea.qtyPrev + resultado.qtyAsignada;
                    lineasConProblema.push({
                        itemName   : linea.itemName,
                        qtyRequired: linea.qtyRequired,
                        qtyTotal,
                        qtyFaltante: linea.qtyRequired - qtyTotal
                    });
                }

                if (resultado.asignaciones && resultado.asignaciones.length > 0) {
                    planLineas.push({ lineIndex: linea.lineIndex, asignaciones: resultado.asignaciones });
                }
            });

            // ── 7. Aplicar plan ───────────────────────────────────────────────
            if (planLineas.length > 0) {
                OrdenTrasladoRepository.aplicarPlanAsignacion(toRecord, planLineas);
            }

            // ── 8. Estado global y log ────────────────────────────────────────
            const statusLog = _calcularEstadoLog(counters);
            CRLogAsignacionLoteOTRepository.crearLog({
                ordenTrasladoId,
                userId,
                status  : statusLog,
                counters,
                detalle : detalleLineas.join('\n'),
                error   : null
            });

            return { ok: true, status: statusLog, counters, detalle: detalleLineas.join('\n'), lineasConProblema, error: null };

        } catch (e) {
            log.error({ title: 'OrdenTrasladoService.asignarDetalleInventario', details: e.toString() });
            try {
                CRLogAsignacionLoteOTRepository.crearLog({
                    ordenTrasladoId,
                    userId,
                    status  : LOG_ERROR,
                    counters: { total: 0, complete: 0, partial: 0, noStock: 0, skipped: 0 },
                    detalle : null,
                    error   : e.toString()
                });
            } catch (logErr) {
                log.error({ title: 'OrdenTrasladoService — error al crear log', details: logErr.toString() });
            }
            return { ok: false, status: LOG_ERROR, counters: null, detalle: null, lineasConProblema: [], error: e.toString() };
        }
    };

    // ─────────────────────────────────────────────────────────────────────────
    // LÓGICA DE LÍNEA
    // ─────────────────────────────────────────────────────────────────────────

    const _procesarLinea = (linea, mapaEsLoteItem, stockDisponible) => {
        const { itemId, qtyRequired, qtyFulfilled, qtyPrev, asignacionesExistentes } = linea;

        // Línea ya despachada → omitir
        if (qtyFulfilled > 0) {
            return { estadoLinea: ESTADO_SKIPPED, asignaciones: [], qtyAsignada: 0 };
        }

        const qtyNecesaria = qtyRequired - qtyPrev;
        if (qtyNecesaria <= 0) {
            return { estadoLinea: ESTADO_COMPLETE, asignaciones: [], qtyAsignada: 0 };
        }

        // Ítem sin control de lote → solo cantidad
        if (!mapaEsLoteItem[itemId]) {
            return {
                estadoLinea : ESTADO_NO_LOT,
                asignaciones: [{ lotId: null, qty: qtyNecesaria, lineExistente: false, lineExistenteIndex: -1 }],
                qtyAsignada : qtyNecesaria
            };
        }

        // Ítem con lote
        const lotsDisponibles = stockDisponible[itemId] || [];
        const asignaciones    = [];
        let   qtyPendiente    = qtyNecesaria;

        // Paso 1: completar en lotes ya presentes en inventorydetail (prioridad)
        if (asignacionesExistentes && asignacionesExistentes.length > 0) {
            asignacionesExistentes.forEach((existing) => {
                if (qtyPendiente <= 0 || !existing.lotId) return;

                const idxEnStock = lotsDisponibles.findIndex(l => l.lotId === existing.lotId);
                if (idxEnStock === -1) return;

                const qtyAUsar = Math.min(qtyPendiente, lotsDisponibles[idxEnStock].qty);
                if (qtyAUsar <= 0) return;

                asignaciones.push({ lotId: existing.lotId, qty: qtyAUsar, lineExistente: true, lineExistenteIndex: existing.idx });
                lotsDisponibles[idxEnStock].qty -= qtyAUsar;
                qtyPendiente -= qtyAUsar;
            });
        }

        // Paso 2: nuevos lotes en orden FEFO
        for (const lote of lotsDisponibles) {
            if (qtyPendiente <= 0) break;
            if (lote.qty <= 0)     continue;

            const yaEnExistentes = asignacionesExistentes.some(e => e.lotId === lote.lotId);
            if (yaEnExistentes) continue;

            const qtyAUsar = Math.min(qtyPendiente, lote.qty);
            asignaciones.push({ lotId: lote.lotId, qty: qtyAUsar, lineExistente: false, lineExistenteIndex: -1 });
            lote.qty     -= qtyAUsar;
            qtyPendiente -= qtyAUsar;
        }

        const qtyAsignada      = qtyNecesaria - qtyPendiente;
        const qtyTotalCubierta = qtyPrev + qtyAsignada;
        const estadoLinea      = qtyTotalCubierta >= qtyRequired ? ESTADO_COMPLETE
                               : qtyTotalCubierta > 0            ? ESTADO_PARTIAL
                               :                                    ESTADO_NO_STOCK;

        return { estadoLinea, asignaciones, qtyAsignada };
    };

    // ─────────────────────────────────────────────────────────────────────────
    // HELPERS PRIVADOS
    // ─────────────────────────────────────────────────────────────────────────

    const _contarResultado = (estadoLinea, counters) => {
        if (estadoLinea === ESTADO_COMPLETE || estadoLinea === ESTADO_NO_LOT) counters.complete++;
        else if (estadoLinea === ESTADO_PARTIAL)  counters.partial++;
        else if (estadoLinea === ESTADO_NO_STOCK) counters.noStock++;
        else if (estadoLinea === ESTADO_SKIPPED)  counters.skipped++;
    };

    const _calcularEstadoLog = ({ complete, partial, noStock, skipped, total }) => {
        const procesadas = total - skipped;
        if (procesadas === 0)           return LOG_NO_STOCK;
        if (noStock > 0 || partial > 0) return LOG_PARTIAL;
        return LOG_COMPLETE;
    };

    const _copiarStockMapa = (mapaOriginal) => {
        const copia = {};
        Object.keys(mapaOriginal).forEach(id => {
            copia[id] = mapaOriginal[id].map(l => ({ ...l }));
        });
        return copia;
    };

    const _formatearDetalleLinea = (linea, resultado) => {
        const { lineIndex, itemName, qtyRequired, qtyPrev } = linea;
        const { estadoLinea, qtyAsignada }                  = resultado;
        const qtyTotal    = qtyPrev + qtyAsignada;
        const qtyFaltante = Math.max(0, qtyRequired - qtyTotal);
        const faltanteStr = qtyFaltante > 0 ? ` | Faltante: ${qtyFaltante}` : '';
        return `Línea ${lineIndex + 1} | ${itemName} | Req: ${qtyRequired} | Prev: ${qtyPrev} | Asig: ${qtyAsignada} | Total: ${qtyTotal}${faltanteStr} | Estado: ${estadoLinea}`;
    };

    const _respuestaError = (ordenTrasladoId, userId, mensaje) => {
        try {
            CRLogAsignacionLoteOTRepository.crearLog({
                ordenTrasladoId, userId,
                status  : LOG_ERROR,
                counters: { total: 0, complete: 0, partial: 0, noStock: 0, skipped: 0 },
                detalle : null,
                error   : mensaje
            });
        } catch (e) {
            log.error({ title: 'OrdenTrasladoService._respuestaError', details: e.toString() });
        }
        return { ok: false, status: LOG_ERROR, counters: null, detalle: null, lineasConProblema: [], error: mensaje };
    };

    // ─────────────────────────────────────────────────────────────────────────
    // STOCK DISPONIBLE
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Retorna el stock disponible de uno o más ítems en una ubicación.
     * @param {{ itemIds: Array<string|number>, locationId: string|number }} params
     * @returns {{ ok: boolean, stockMap: Object, error: string|null }}
     */
    const obtenerStockDisponibleEnLote = ({ itemIds, locationId }) => {
        if (!itemIds || !itemIds.length || !locationId) {
            return { ok: false, stockMap: {}, error: 'Se requieren los parámetros itemIds y locationId.' };
        }

        try {
            const stockMap = OrdenTrasladoRepository.obtenerStockDisponibleEnLote(itemIds, locationId);
            return { ok: true, stockMap, error: null };
        } catch (e) {
            log.error({ title: 'OrdenTrasladoService.obtenerStockDisponibleEnLote', details: e.toString() });
            return { ok: false, stockMap: {}, error: e.toString() };
        }
    };

    // ─────────────────────────────────────────────────────────────────────────
    // EXPORTS
    // ─────────────────────────────────────────────────────────────────────────

    return { asignarDetalleInventario, obtenerStockDisponibleEnLote };
});