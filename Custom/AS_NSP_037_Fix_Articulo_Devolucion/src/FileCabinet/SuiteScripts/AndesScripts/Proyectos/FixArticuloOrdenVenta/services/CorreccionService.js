/**
 * @NApiVersion 2.1
 * @NModuleScope SameAccount
 *
 * @description AS_NSP_037 - Corrección de una Orden de Venta (se ejecuta en el reduce del Map/Reduce).
 *
 *              Orden de los pasos (el User Event del partner manda la OV a la cola de autopicking
 *              cada vez que se guarda con cambios en sus líneas, y ese proceso iguala las Ejecuciones
 *              a la OV reasignando lotes; por eso la Ejecución se deja cuadrada ANTES de que corra):
 *               0. Si la OV tiene autopicking pendiente en la cola, no se toca (se omite).
 *               1. Revalidar con la misma regla de la validación; si algo cambió, se omite la línea.
 *               2. Ejecuciones primero: quitar / reducir (NetSuite no deja bajar la OV bajo lo despachado).
 *               3. OV: quitar líneas, cambiar cantidades y precios, agregar las líneas de reemplazo,
 *                  limpiar el detalle de inventario y guardar una sola vez.
 *               4. Ejecuciones después: aumentar (no se puede ejecutar más de lo que tiene la OV) y
 *                  crear la Ejecución de la línea nueva del reemplazo. Si el autopicking ya lo hizo,
 *                  se registra "Ejecutada por el autopicking" y no se duplica.
 *              Cada corrida recalcula la acción desde el estado real, así que reprocesar es seguro.
 */
define([
    "N/log",
    "../constants/FixArticuloOrdenVentaConstants",
    "../repositories/OrdenVentaRepository",
    "../repositories/EjecucionRepository",
    "../repositories/InventarioRepository",
    "./ValidacionService",
    "./AsignadorLotesService"
], (nLog, CONST, ordenVentaRepo, ejecucionRepo, inventarioRepo, validacionService, asignadorService) => {
    const { ACCIONES_LINEA: ACCIONES, AJUSTES_EJECUCION, ESTADO_LINEA, REGLAS } = CONST;
    // Estado de cada línea = clave de ESTADO_LINEA (PROCESADA, SIN_CAMBIO, OMITIDA, NO_PROCESABLE, ERROR)
    const ESTADOS = Object.keys(ESTADO_LINEA).reduce((m, k) => ({ ...m, [k]: k }), {});
    /** Ejecución afectada: { id, texto, eliminada } (id null si no hay registro que enlazar). */
    const ejec = (id, texto, eliminada = false) => ({ id: eliminada ? null : Number(id) || null, texto, eliminada });
    const textoEjecuciones = (lista) => lista.map((e) => e.texto).join(", ");
    const EPS = REGLAS.EPSILON;

    const r5 = (n) => Math.round(Number(n) * 100000) / 100000;
    const fmt = (n) => String(r5(n));
    const iguales = (a, b) => Math.abs(Number(a || 0) - Number(b || 0)) <= EPS;
    const mensajeError = (e) => (e && (e.message || e.name)) || String(e);

    const describir = (l) => (l ? `${l.accionTexto}; cant. OV ${fmt(l.cantidadOv)}; despachada ${fmt(l.despachada)}` : "sin datos");

    /** Plan de reducción por Ejecución, desde la más reciente (mismo criterio que la validación). */
    function planReduccion(ejecuciones, despachada, objetivo) {
        let porQuitar = r5(despachada - objetivo);
        const plan = [];
        for (const e of ejecuciones) {
            if (porQuitar <= EPS) break;
            const tomar = Math.min(e.cantidad, porQuitar);
            plan.push({ id: e.id, tranid: e.tranid, nuevaCantidad: r5(e.cantidad - tomar) });
            porQuitar = r5(porQuitar - tomar);
        }
        return plan;
    }

    const agregarMensaje = (r, texto) => {
        if (!texto) return;
        r.notas = r.notas || [];
        r.notas.push(texto);
    };

    const cerrar = (r, estado, mensaje) => {
        r.estado = estado;
        if (mensaje !== undefined) r.mensaje = mensaje;
    };

    /**
     * Procesa las líneas de una OV.
     * @param {object} p
     * @param {number} p.idOrdenVenta
     * @param {number} p.subsidiaria
     * @param {Array<object>} p.lineas - líneas validadas (JSON del proceso) de esta OV
     * @returns {Array<object>} líneas con estado, mensaje, cantidadResultante, ejecucionesAfectadas y lotes
     */
    function procesarOrdenVenta({ idOrdenVenta, subsidiaria, lineas }) {
        const resultados = lineas.map((l) => ({ ...l, estado: null, ejecucionesAfectadas: [], lotes: "", cantidadResultante: null, notas: [] }));

        // Líneas que no se ejecutan
        const aEjecutar = [];
        for (const r of resultados) {
            if (!r.procesable) {
                cerrar(r, r.accion === ACCIONES.SIN_CAMBIO.codigo ? ESTADOS.SIN_CAMBIO : ESTADOS.NO_PROCESABLE);
                r.cantidadResultante = r.cantidadOv;
            } else if (r.requiereConfirmacion && !r.confirmado) {
                cerrar(r, ESTADOS.OMITIDA, `Reemplazo no confirmado. ${r.mensaje}`);
                r.cantidadResultante = r.cantidadOv;
            } else {
                aEjecutar.push(r);
            }
        }
        if (!aEjecutar.length || !idOrdenVenta) return finalizar(resultados);

        // 0. Cola de autopicking del partner
        if (ordenVentaRepo.tieneAutopickingPendiente(idOrdenVenta)) {
            aEjecutar.forEach((r) => {
                cerrar(r, ESTADOS.OMITIDA, "La OV tiene autopicking pendiente en la cola; vuelva a validar y procesar cuando termine.");
                r.cantidadResultante = r.cantidadOv;
            });
            return finalizar(resultados);
        }

        // 1. Revalidación
        const fresco = validacionService.validar({ subsidiaria, filas: validacionService.filasDesdeLineas(aEjecutar) });
        const porClave = new Map(fresco.lineas.map((l) => [l.clave, l]));
        const listos = [];
        for (const r of aEjecutar) {
            const f = porClave.get(r.clave);
            const cambio =
                !f ||
                f.accion !== r.accion ||
                Number(f.ovId) !== Number(r.ovId) ||
                String(f.lineId) !== String(r.lineId) ||
                !iguales(f.cantidadOv, r.cantidadOv) ||
                !iguales(f.despachada, r.despachada) ||
                f.ajusteEjecucion !== r.ajusteEjecucion;
            if (cambio) {
                cerrar(r, ESTADOS.OMITIDA, `La línea cambió desde la validación (antes: ${describir(r)}; ahora: ${describir(f)}). ${f ? f.mensaje : ""}`.trim());
                r.cantidadResultante = f ? f.cantidadOv : r.cantidadOv;
                continue;
            }
            r.ejecuciones = f.ejecuciones;
            r.fechaEjecucionOriginal = f.fechaEjecucionOriginal;
            r.precioNuevo = f.precioNuevo;
            r.montoNuevo = f.montoNuevo;
            listos.push(r);
        }
        if (!listos.length) return finalizar(resultados);

        const porLineId = new Map(listos.map((r) => [String(r.lineId), r]));

        // 2. Ejecuciones antes de la OV: quitar / reducir
        const cambiosPorEjecucion = new Map();
        const nombreEjecucion = new Map();
        for (const r of listos) {
            if (![AJUSTES_EJECUCION.QUITAR, AJUSTES_EJECUCION.CREAR, AJUSTES_EJECUCION.REDUCIR].includes(r.ajusteEjecucion)) continue;
            const plan =
                r.ajusteEjecucion === AJUSTES_EJECUCION.REDUCIR
                    ? planReduccion(r.ejecuciones, r.despachada, r.cantidadFinal)
                    : r.ejecuciones.map((e) => ({ id: e.id, tranid: e.tranid, nuevaCantidad: 0 }));
            for (const p of plan) {
                if (!cambiosPorEjecucion.has(p.id)) cambiosPorEjecucion.set(p.id, new Map());
                cambiosPorEjecucion.get(p.id).set(String(r.lineId), p.nuevaCantidad);
                nombreEjecucion.set(p.id, p.tranid || String(p.id));
            }
        }

        const fallidasA = new Set();
        for (const [idEjecucion, cambios] of cambiosPorEjecucion) {
            const nombre = nombreEjecucion.get(idEjecucion);
            try {
                const res = ejecucionRepo.ajustarLineas(idEjecucion, cambios);
                for (const [lineId, detalle] of res.lineas) {
                    const r = porLineId.get(lineId);
                    if (!r) continue;
                    r.ejecucionesAfectadas.push(
                        ejec(idEjecucion, `${nombre}${res.eliminada ? " (eliminada)" : detalle.despues <= EPS ? " (desmarcada)" : ` (${fmt(detalle.antes)}→${fmt(detalle.despues)})`}`, res.eliminada)
                    );
                    if (detalle.lotes && detalle.lotes.length) r.lotes = [r.lotes, detalle.lotes.join(", ")].filter(Boolean).join("; ");
                }
            } catch (e) {
                nLog.error({ title: `AS_NSP_037 - Error ajustando Ejecución ${nombre} (OV ${idOrdenVenta})`, details: mensajeError(e) });
                for (const lineId of cambios.keys()) {
                    const r = porLineId.get(lineId);
                    if (!r) continue;
                    fallidasA.add(r.clave);
                    agregarMensaje(r, `No se pudo ajustar la Ejecución ${nombre}: ${mensajeError(e)}`);
                }
            }
        }
        for (const r of listos) {
            if (!fallidasA.has(r.clave)) continue;
            const yaAjustadas = r.ejecucionesAfectadas.length ? ` Ya se ajustó: ${textoEjecuciones(r.ejecucionesAfectadas)}; vuelva a validar y procesar para completar.` : "";
            cerrar(r, ESTADOS.ERROR, `${r.notas.join(" ")}${yaAjustadas} La OV no se modificó para esta línea.`);
            r.cantidadResultante = r.cantidadOv;
        }

        // 3. OV (una sola vez)
        const paraOv = listos.filter((r) => !fallidasA.has(r.clave));
        if (!paraOv.length) return finalizar(resultados);

        const operaciones = paraOv.map((r) => {
            const cambiaPrecio = r.valorUnitario !== null && r.valorUnitario !== undefined && !iguales(r.valorUnitario, r.precioOv);
            const precio = cambiaPrecio ? Number(r.valorUnitario) : null;
            switch (r.accion) {
                case ACCIONES.ELIMINAR.codigo:
                    return { tipo: "QUITAR", lineId: r.lineId };
                case ACCIONES.REEMPLAZAR.codigo:
                    return { tipo: "REEMPLAZAR", lineId: r.lineId, nuevo: { item: Number(r.idArticuloCsv), cantidad: Number(r.cantidadFinal), precio: Number(r.precioNuevo), crg: r.crg } };
                case ACCIONES.ACTUALIZAR_PRECIO.codigo:
                    return { tipo: "MODIFICAR", lineId: r.lineId, precio };
                default:
                    return { tipo: "MODIFICAR", lineId: r.lineId, cantidad: Number(r.cantidadFinal), precio };
            }
        });

        try {
            const res = ordenVentaRepo.aplicarCambios(idOrdenVenta, operaciones);
            if (res.detallesLimpiados) nLog.audit({ title: `AS_NSP_037 - OV ${idOrdenVenta}`, details: `Detalle de inventario quitado en ${res.detallesLimpiados} línea(s)` });
        } catch (e) {
            nLog.error({ title: `AS_NSP_037 - Error guardando OV ${idOrdenVenta}`, details: mensajeError(e) });
            for (const r of paraOv) {
                const yaAjustadas = r.ejecucionesAfectadas.length ? ` La Ejecución ya se ajustó (${textoEjecuciones(r.ejecucionesAfectadas)}); vuelva a validar y procesar para completar la OV.` : "";
                cerrar(r, ESTADOS.ERROR, `No se pudo guardar la OV: ${mensajeError(e)}.${yaAjustadas}`);
                r.cantidadResultante = r.cantidadOv;
            }
            return finalizar(resultados);
        }

        for (const r of paraOv) {
            r.cantidadResultante = r.accion === ACCIONES.ELIMINAR.codigo ? 0 : r.accion === ACCIONES.ACTUALIZAR_PRECIO.codigo ? r.cantidadOv : Number(r.cantidadFinal);
            r.ovGuardada = true;
            cerrar(r, ESTADOS.PROCESADA);
        }

        // 4. Ejecuciones después de la OV: aumentar / crear
        const aumentos = paraOv.filter((r) => r.ajusteEjecucion === AJUSTES_EJECUCION.AUMENTAR);
        const creaciones = paraOv.filter((r) => r.ajusteEjecucion === AJUSTES_EJECUCION.CREAR && Number(r.cantidadFinal) > EPS);
        if (aumentos.length || creaciones.length) {
            const items = [...aumentos.map((r) => r.articuloOvId), ...creaciones.map((r) => Number(r.idArticuloCsv))];
            const ubicaciones = [...aumentos, ...creaciones].map((r) => r.ubicacion).filter(Boolean);
            const asignador = asignadorService.crearAsignador(items, ubicaciones, idOrdenVenta);
            const autopicking = inventarioRepo.obtenerUbicacionesAutopicking(ubicaciones);

            for (const r of aumentos) aumentarEjecucion(r, idOrdenVenta, asignador);
            for (const r of creaciones) crearEjecucionReemplazo(r, idOrdenVenta, asignador, autopicking);
        }

        return finalizar(resultados);
    }

    function aumentarEjecucion(r, idOrdenVenta, asignador) {
        const ultima = r.ejecuciones[0];
        const objetivo = r5(ultima.cantidad + (Number(r.cantidadFinal) - Number(r.cantidadOv)));
        try {
            const actual = ejecucionRepo.obtenerCantidadLinea(ultima.id, idOrdenVenta, r.lineId);
            if (actual === null) throw new Error(`la Ejecución ${ultima.tranid} ya no tiene la línea`);
            if (actual + EPS >= objetivo) {
                r.ejecucionesAfectadas.push(ejec(ultima.id, `${ultima.tranid} (ya en ${fmt(actual)})`));
                agregarMensaje(r, "La Ejecución ya fue completada por el autopicking.");
                return;
            }
            const incremento = r5(objetivo - actual);
            const reserva = asignador.reservar(r.articuloOvId, r.ubicacion, r5(incremento * (r.conversion || 1)));
            if (reserva.requiereDetalle && reserva.total + EPS < incremento * (r.conversion || 1)) {
                throw new Error(`no hay lotes disponibles suficientes (requiere ${fmt(incremento)}, disponible ${fmt(reserva.total)})`);
            }
            const res = ejecucionRepo.aumentarLinea(ultima.id, r.lineId, objetivo, reserva.requiereDetalle ? reserva.asignaciones : []);
            r.ejecucionesAfectadas.push(ejec(ultima.id, `${ultima.tranid} (${fmt(res.antes)}→${fmt(res.despues)})`));
            if (res.lotes) r.lotes = [r.lotes, res.lotes].filter(Boolean).join("; ");
        } catch (e) {
            nLog.error({ title: `AS_NSP_037 - Error aumentando Ejecución ${ultima.tranid}`, details: mensajeError(e) });
            r.estado = ESTADOS.ERROR;
            agregarMensaje(r, `La OV se actualizó, pero no se pudo aumentar la Ejecución ${ultima.tranid}: ${mensajeError(e)}. La línea quedó con cantidad pendiente de ejecutar.`);
        }
    }

    function crearEjecucionReemplazo(r, idOrdenVenta, asignador, autopicking) {
        try {
            const nueva = ordenVentaRepo.obtenerLineaPorCrgEItem(idOrdenVenta, r.crg, r.idArticuloCsv);
            if (!nueva) throw new Error("no se encontró la línea nueva en la OV");
            if (nueva.pendiente <= EPS) {
                agregarMensaje(r, "La línea nueva ya fue ejecutada por el autopicking.");
                return;
            }
            const plan = asignadorService.planificarEjecucionReemplazo({
                asignador,
                item: Number(r.idArticuloCsv),
                ubicacion: r.ubicacion,
                cantidadBase: nueva.pendiente,
                esLote: !!r.esLoteCsv,
                fechaOriginal: r.fechaEjecucionOriginal
            });
            if (!plan.ok) throw new Error("no hay stock suficiente para ejecutar la línea nueva; quedó pendiente para el autopicking");
            const res = ejecucionRepo.crearParaLinea({
                idOrdenVenta,
                lineId: nueva.lineId,
                ubicacion: r.ubicacion,
                cantidad: nueva.pendiente,
                fecha: plan.fecha,
                esAutopicking: autopicking.has(Number(r.ubicacion)),
                requiereDetalle: plan.requiereDetalle || !!r.esLoteCsv,
                asignaciones: plan.asignaciones
            });
            r.ejecucionesAfectadas.push(ejec(res.idEjecucion, `${res.tranid || res.idEjecucion} nueva (${plan.fechaTexto})`));
            if (res.lotes) r.lotes = [r.lotes, res.lotes].filter(Boolean).join("; ");
            agregarMensaje(r, `Ejecución nueva con ${plan.motivoFecha}.`);
        } catch (e) {
            nLog.error({ title: `AS_NSP_037 - Error creando Ejecución del reemplazo ${r.clave}`, details: mensajeError(e) });
            r.estado = ESTADOS.ERROR;
            agregarMensaje(r, `La OV se actualizó, pero no se pudo crear la Ejecución del artículo nuevo: ${mensajeError(e)}.`);
        }
    }

    /** Completa el mensaje final de las líneas cuya OV se guardó (procesadas o con error en el paso 4). */
    function finalizar(resultados) {
        for (const r of resultados) {
            if (r.ovGuardada) {
                const base = {
                    [ACCIONES.ELIMINAR.codigo]: "Línea quitada de la OV.",
                    [ACCIONES.REDUCIR.codigo]: `Cantidad bajada de ${fmt(r.cantidadOv)} a ${fmt(r.cantidadFinal)}.`,
                    [ACCIONES.AUMENTAR.codigo]: `Cantidad subida de ${fmt(r.cantidadOv)} a ${fmt(r.cantidadFinal)}.`,
                    [ACCIONES.ACTUALIZAR_PRECIO.codigo]: "Cantidad sin cambio.",
                    [ACCIONES.REEMPLAZAR.codigo]:
                        Number(r.cantidadFinal) > EPS ? `Artículo reemplazado por ${r.articuloCsvNombre} con cantidad ${fmt(r.cantidadFinal)}.` : "Línea con artículo distinto quitada (cantidad final 0)."
                }[r.accion] || "";
                const precio = r.valorUnitario !== null && r.valorUnitario !== undefined && !iguales(r.valorUnitario, r.precioOv) ? ` Precio ${fmt(r.precioOv)} → ${fmt(r.precioNuevo)}.` : "";
                const ejecuciones = r.ejecucionesAfectadas.length ? ` Ejecuciones: ${textoEjecuciones(r.ejecucionesAfectadas)}.` : "";
                r.mensaje = `${base}${precio}${ejecuciones} ${(r.notas || []).join(" ")}`.trim();
            }
            delete r.notas;
            delete r.ovGuardada;
        }
        return resultados;
    }

    return { procesarOrdenVenta };
});
